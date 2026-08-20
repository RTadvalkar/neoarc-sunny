import {
  RoomParticipant,
  DeviceAudioMode,
  GroupConversationSession,
  Memory,
  Highlight,
} from '../types';

export type RoomConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ENDED';

export interface RoomEventHandlers {
  onParticipantsChange?: (participants: RoomParticipant[]) => void;
  onActiveSpeakersChange?: (speakers: string[]) => void;
  onSunnyStatusChange?: (status: 'idle' | 'listening' | 'thinking' | 'speaking' | 'reconnecting') => void;
  onSunnyMuteChange?: (isMuted: boolean, mutedBy?: string) => void;
  onTranscript?: (entry: { sender: 'user' | 'sunny' | 'system'; text: string; speakerName?: string; time: string }) => void;
  onMemorySaved?: (memory: Memory) => void;
  onHighlightSaved?: (highlight: Highlight) => void;
  onRemoteStream?: (identity: string, stream: MediaStream) => void;
  onRemoteStreamRemoved?: (identity: string) => void;
  onLocalStream?: (stream: MediaStream) => void;
  onConnectionStateChange?: (state: RoomConnectionState) => void;
  onError?: (error: string) => void;
  onSessionEnded?: (message: string) => void;
}

export class WebRTCRoomService {
  private ws: WebSocket | null = null;
  private connectionState: RoomConnectionState = 'DISCONNECTED';
  private localIdentity: string = '';
  private localUser: { id: string; displayName: string; photoURL?: string } | null = null;
  private sessionId: string = '';
  private groupId: string = '';
  private roomId: string = '';
  private token: string = '';

  private deviceMode: DeviceAudioMode = 'INDIVIDUAL';
  private isMuted: boolean = false;
  private isCameraOn: boolean = false;

  private localMediaStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map(); // remoteIdentity -> RTCPeerConnection
  private remoteStreams: Map<string, MediaStream> = new Map(); // remoteIdentity -> MediaStream
  private participants: Map<string, RoomParticipant> = new Map(); // identity -> RoomParticipant

  // Web Audio Contexts
  private inputAudioCtx: AudioContext | null = null;
  private outputAudioCtx: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private nextStartTime: number = 0;
  private activeSunnySources: AudioBufferSourceNode[] = [];

  // VAD & speaking detection
  private vadInterval: any = null;
  private isCurrentlySpeaking: boolean = false;
  private speakingDebounceTimer: any = null;
  private speakerSpeechStartAt: number = 0;
  private speakerSpeechEndAt: number = 0;
  private firstPcmCapturedAt: number = 0;
  private lastPcmCapturedAt: number = 0;
  private firstPcmSentToServerAt: number = 0;
  private lastPcmSentToServerAt: number = 0;
  private preRollBuffer: string[] = [];

  // Reconnection
  private isIntentionalDisconnect: boolean = false;
  private reconnectTimer: any = null;
  private handlers: RoomEventHandlers = {};

  constructor(handlers: RoomEventHandlers = {}) {
    this.handlers = handlers;
  }

  public setHandlers(handlers: RoomEventHandlers) {
    this.handlers = { ...this.handlers, ...handlers };
  }

  public async join(options: {
    token: string;
    roomId: string;
    sessionId: string;
    groupId: string;
    user: { id: string; displayName: string; photoURL?: string };
    deviceMode?: DeviceAudioMode;
    enableAudio?: boolean;
    enableVideo?: boolean;
  }): Promise<void> {
    this.token = options.token;
    this.roomId = options.roomId;
    this.sessionId = options.sessionId;
    this.groupId = options.groupId;
    this.localUser = options.user;
    this.deviceMode = options.deviceMode || 'INDIVIDUAL';
    this.isMuted = !options.enableAudio;
    this.isCameraOn = Boolean(options.enableVideo);
    this.isIntentionalDisconnect = false;

    this.updateConnectionState('CONNECTING');

    // 1. Initialize local media (mic & optional camera)
    await this.initLocalMedia(options.enableVideo);

    // 2. Initialize output audio context for Sunny audio
    await this.initOutputAudio();

    // 3. Connect to room WebSocket
    await this.connectWebSocket();
  }

  private async initLocalMedia(enableVideo?: boolean) {
    try {
      this.localMediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: enableVideo
          ? {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user',
            }
          : false,
      });

      // Apply initial mute state
      this.localMediaStream.getAudioTracks().forEach((t) => (t.enabled = !this.isMuted));
      this.localMediaStream.getVideoTracks().forEach((t) => (t.enabled = this.isCameraOn));

      if (this.handlers.onLocalStream) {
        this.handlers.onLocalStream(this.localMediaStream);
      }

      // Setup audio processing for VAD and Sunny AI stream tap
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.inputAudioCtx = new AudioCtxClass({ sampleRate: 16000 });
      if (this.inputAudioCtx.state === 'suspended') {
        await this.inputAudioCtx.resume();
      }

      this.mediaSource = this.inputAudioCtx.createMediaStreamSource(this.localMediaStream);
      this.analyserNode = this.inputAudioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.4;

      // 512 samples @ 16kHz = exactly 32ms chunk duration (1024 bytes PCM)
      this.scriptProcessor = this.inputAudioCtx.createScriptProcessor(512, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (this.isMuted || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16Base64 = this.float32ToInt16Base64(inputData);
        if (!pcm16Base64) return;

        const now = Date.now();
        this.lastPcmCapturedAt = now;

        // Check WebSocket backpressure (shed stale frames if network buffer exceeds ~300ms / 32KB)
        if (this.ws.bufferedAmount > 32768) {
          console.warn(`[VAD/Realtime] WebSocket backpressure high (${this.ws.bufferedAmount} bytes). Dropping PCM frame to preserve realtime latency.`);
          return;
        }

        // Only transmit audio to Sunny when the user is speaking (No continuous silence transmission!)
        if (this.isCurrentlySpeaking) {
          // Flush pre-roll chunks captured just before VAD threshold triggered
          if (this.preRollBuffer.length > 0) {
            for (const preChunk of this.preRollBuffer) {
              this.ws.send(
                JSON.stringify({
                  type: 'audio_human',
                  audio: preChunk,
                  capturedAt: now - 32,
                  sentAt: now,
                  chunkDurationMs: 32,
                  chunkBytes: 1024,
                })
              );
            }
            this.preRollBuffer = [];
          }

          if (!this.firstPcmCapturedAt) this.firstPcmCapturedAt = now;
          if (!this.firstPcmSentToServerAt) this.firstPcmSentToServerAt = now;
          this.lastPcmSentToServerAt = now;

          this.ws.send(
            JSON.stringify({
              type: 'audio_human',
              audio: pcm16Base64,
              capturedAt: now,
              sentAt: now,
              chunkDurationMs: 32,
              chunkBytes: 1024,
            })
          );
        } else {
          // Maintain a 2-chunk (~64ms) pre-roll buffer to preserve the first spoken syllable
          this.preRollBuffer.push(pcm16Base64);
          if (this.preRollBuffer.length > 2) {
            this.preRollBuffer.shift();
          }
        }
      };

      this.mediaSource.connect(this.analyserNode);
      this.analyserNode.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.inputAudioCtx.destination);

      // Start VAD Loop to detect speaking energy
      this.startVADLoop();
    } catch (err: any) {
      console.warn('Could not acquire audio/video stream:', err);
      // Fallback to empty stream if permissions blocked
      this.localMediaStream = new MediaStream();
      this.handlers.onError?.(`Microphone permission required for call: ${err.message}`);
    }
  }

  private startVADLoop() {
    if (this.vadInterval) clearInterval(this.vadInterval);

    const buffer = new Uint8Array(this.analyserNode ? this.analyserNode.frequencyBinCount : 256);

    this.vadInterval = setInterval(() => {
      if (!this.analyserNode || this.isMuted) {
        if (this.isCurrentlySpeaking) {
          this.setIsSpeaking(false);
        }
        return;
      }

      this.analyserNode.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i];
      }
      const average = sum / buffer.length;

      // Threshold for human voice energy
      const threshold = 18;
      const isSpeakingNow = average > threshold;

      if (isSpeakingNow && !this.isCurrentlySpeaking) {
        if (this.speakingDebounceTimer) clearTimeout(this.speakingDebounceTimer);
        this.setIsSpeaking(true);
      } else if (!isSpeakingNow && this.isCurrentlySpeaking) {
        if (!this.speakingDebounceTimer) {
          this.speakingDebounceTimer = setTimeout(() => {
            this.setIsSpeaking(false);
            this.speakingDebounceTimer = null;
          }, 350); // 350ms end-of-speech debounce
        }
      }
    }, 50); // 50ms polling for responsive speech boundaries
  }

  private setIsSpeaking(isSpeaking: boolean) {
    const now = Date.now();
    if (isSpeaking && !this.isCurrentlySpeaking) {
      this.isCurrentlySpeaking = true;
      this.speakerSpeechStartAt = now;
      this.firstPcmCapturedAt = 0;
      this.firstPcmSentToServerAt = 0;
      console.log(`[VAD] Speech STARTED at ${new Date(now).toISOString()}`);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'speaking',
            isSpeaking: true,
            speakerSpeechStartAt: now,
          })
        );
      }
    } else if (!isSpeaking && this.isCurrentlySpeaking) {
      this.isCurrentlySpeaking = false;
      this.speakerSpeechEndAt = now;
      this.preRollBuffer = [];
      const speechDuration = now - this.speakerSpeechStartAt;
      console.log(`[VAD] Speech ENDED at ${new Date(now).toISOString()} (Duration: ${speechDuration}ms). Sending audio_stream_end to server.`);

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send speaking false indicator
        this.ws.send(
          JSON.stringify({
            type: 'speaking',
            isSpeaking: false,
            speakerSpeechEndAt: now,
          })
        );

        // Send explicit audio_stream_end for Gemini Live turn finalization
        this.ws.send(
          JSON.stringify({
            type: 'audio_stream_end',
            timestamps: {
              speakerSpeechStartAt: this.speakerSpeechStartAt,
              speakerSpeechEndAt: now,
              firstPcmCapturedAt: this.firstPcmCapturedAt,
              lastPcmCapturedAt: this.lastPcmCapturedAt,
              firstPcmSentToServerAt: this.firstPcmSentToServerAt,
              lastPcmSentToServerAt: this.lastPcmSentToServerAt,
            },
          })
        );
      }
    }

    // Update local participant state in UI
    const local = this.participants.get(this.localIdentity);
    if (local) {
      local.isSpeaking = isSpeaking;
      this.notifyParticipantsChange();
    }
  }

  private async initOutputAudio() {
    if (!this.outputAudioCtx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.outputAudioCtx = new AudioCtxClass({ sampleRate: 24000 });
    }
    if (this.outputAudioCtx.state === 'suspended') {
      await this.outputAudioCtx.resume();
    }
    this.nextStartTime = this.outputAudioCtx.currentTime;
  }

  private async connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/room-ws?userId=${encodeURIComponent(
      this.localUser?.id || ''
    )}&groupId=${encodeURIComponent(this.groupId)}&sessionId=${encodeURIComponent(
      this.sessionId
    )}&roomId=${encodeURIComponent(this.roomId)}&deviceMode=${encodeURIComponent(
      this.deviceMode
    )}&token=${encodeURIComponent(this.token)}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('Connected to Realtime Group Call WebSocket');
      this.updateConnectionState('CONNECTED');
    };

    this.ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        await this.handleWSMessage(msg);
      } catch (e) {
        console.error('Error handling room ws message:', e);
      }
    };

    this.ws.onerror = (err) => {
      console.warn('Room WebSocket error:', err);
      if (!this.isIntentionalDisconnect) {
        this.updateConnectionState('RECONNECTING');
      }
    };

    this.ws.onclose = () => {
      console.log('Room WebSocket closed');
      if (!this.isIntentionalDisconnect) {
        this.updateConnectionState('RECONNECTING');
        this.scheduleReconnect();
      } else {
        this.updateConnectionState('DISCONNECTED');
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.isIntentionalDisconnect) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.isIntentionalDisconnect && this.connectionState === 'RECONNECTING') {
        console.log('Attempting to reconnect to group room...');
        try {
          await this.connectWebSocket();
        } catch (e) {
          console.error('Reconnect failed, retrying in 3s:', e);
          this.scheduleReconnect();
        }
      }
    }, 2500);
  }

  private async handleWSMessage(msg: any) {
    switch (msg.type) {
      case 'room_joined': {
        this.localIdentity = msg.localIdentity;
        this.participants.clear();

        for (const p of msg.participants) {
          this.participants.set(p.identity, {
            ...p,
            isLocal: p.identity === this.localIdentity,
          });
        }
        this.notifyParticipantsChange();

        if (msg.sunnyStatus && this.handlers.onSunnyStatusChange) {
          this.handlers.onSunnyStatusChange(msg.sunnyStatus);
        }

        // Establish WebRTC mesh connections with existing human peers
        for (const p of msg.participants) {
          if (!p.isAI && p.identity !== this.localIdentity) {
            // Deterministic initiator: lexicographically smaller identity creates offer
            const shouldInitiate = this.localIdentity < p.identity;
            this.setupPeerConnection(p.identity, shouldInitiate);
          }
        }
        break;
      }

      case 'participant_joined': {
        const p = msg.participant;
        this.participants.set(p.identity, {
          ...p,
          isLocal: p.identity === this.localIdentity,
        });
        this.notifyParticipantsChange();

        this.handlers.onTranscript?.({
          sender: 'system',
          text: `${p.displayName} joined the call`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });

        // If human, initiate WebRTC connection if we are initiator
        if (!p.isAI && p.identity !== this.localIdentity) {
          const shouldInitiate = this.localIdentity < p.identity;
          this.setupPeerConnection(p.identity, shouldInitiate);
        }
        break;
      }

      case 'participant_left': {
        this.participants.delete(msg.identity);
        this.closePeerConnection(msg.identity);
        this.notifyParticipantsChange();

        this.handlers.onTranscript?.({
          sender: 'system',
          text: `${msg.displayName || 'A participant'} left the call`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        break;
      }

      case 'participant_speaking': {
        const p = this.participants.get(msg.identity);
        if (p) {
          p.isSpeaking = Boolean(msg.isSpeaking);
          this.notifyParticipantsChange();
        }
        break;
      }

      case 'participant_updated': {
        const p = this.participants.get(msg.identity);
        if (p && msg.updates) {
          Object.assign(p, msg.updates);
          this.notifyParticipantsChange();
        }
        break;
      }

      case 'signal': {
        const { fromParticipantIdentity, signalData } = msg;
        if (fromParticipantIdentity && signalData) {
          await this.handlePeerSignal(fromParticipantIdentity, signalData);
        }
        break;
      }

      case 'audio_sunny': {
        if (msg.audio) {
          this.playSunnyAudioChunk(msg.audio);
        }
        break;
      }

      case 'audio_peer': {
        if (msg.audio && msg.fromParticipantIdentity !== this.localIdentity) {
          // Play remote human peer audio directly via Web Audio if P2P stream is not active
          const hasDirectMediaStream = this.remoteStreams.has(msg.fromParticipantIdentity);
          if (!hasDirectMediaStream) {
            this.playPeerAudioChunk(msg.audio);
          }
        }
        break;
      }

      case 'sunny_status': {
        const sunny = this.participants.get('sunny-agent');
        if (sunny) {
          sunny.isSpeaking = msg.status === 'speaking';
          this.notifyParticipantsChange();
        }
        if (this.handlers.onSunnyStatusChange) {
          this.handlers.onSunnyStatusChange(msg.status);
        }
        break;
      }

      case 'transcript': {
        this.handlers.onTranscript?.({
          sender: msg.sender,
          text: msg.text,
          speakerName: msg.speakerName,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
        break;
      }

      case 'memory_saved': {
        if (msg.memory && this.handlers.onMemorySaved) {
          this.handlers.onMemorySaved(msg.memory);
        }
        break;
      }

      case 'highlight_saved': {
        if (msg.highlight && this.handlers.onHighlightSaved) {
          this.handlers.onHighlightSaved(msg.highlight);
        }
        break;
      }

      case 'interrupted': {
        this.stopSunnyPlayback();
        break;
      }

      case 'sunny_mute_changed': {
        const sunny = this.participants.get('sunny-agent');
        if (sunny) {
          sunny.isMuted = Boolean(msg.isMuted);
          if (msg.isMuted) {
            sunny.isSpeaking = false;
          }
          this.notifyParticipantsChange();
        }
        if (msg.isMuted) {
          this.stopSunnyPlayback();
        }
        if (this.handlers.onSunnyMuteChange) {
          this.handlers.onSunnyMuteChange(Boolean(msg.isMuted), msg.mutedBy);
        }
        break;
      }

      case 'session_ended': {
        this.updateConnectionState('ENDED');
        this.handlers.onSessionEnded?.(msg.message || 'Call has ended.');
        this.cleanup();
        break;
      }

      case 'error': {
        this.handlers.onError?.(msg.message);
        break;
      }
    }
  }

  // --- WebRTC Peer-to-Peer Mesh Setup (Direct Human-to-Human Audio/Video) ---

  private async setupPeerConnection(remoteIdentity: string, isInitiator: boolean) {
    if (this.peerConnections.has(remoteIdentity)) return;

    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };

    const pc = new RTCPeerConnection(config);
    this.peerConnections.set(remoteIdentity, pc);

    // Add local tracks to peer connection
    if (this.localMediaStream) {
      this.localMediaStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localMediaStream!);
      });
    }

    // Handle remote track arrivals
    pc.ontrack = (event) => {
      console.log(`Received remote track from ${remoteIdentity}:`, event.track.kind);
      let remoteStream = this.remoteStreams.get(remoteIdentity);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.remoteStreams.set(remoteIdentity, remoteStream);
      }
      remoteStream.addTrack(event.track);

      if (this.handlers.onRemoteStream) {
        this.handlers.onRemoteStream(remoteIdentity, remoteStream);
      }
    };

    // Forward ICE candidates via room WebSocket
    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({
            type: 'signal',
            toParticipantIdentity: remoteIdentity,
            signalData: {
              type: 'candidate',
              candidate: event.candidate,
            },
          })
        );
      }
    };

    if (isInitiator) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'signal',
              toParticipantIdentity: remoteIdentity,
              signalData: {
                type: 'offer',
                sdp: pc.localDescription,
              },
            })
          );
        }
      } catch (err) {
        console.error('Error creating WebRTC offer:', err);
      }
    }
  }

  private async handlePeerSignal(remoteIdentity: string, signalData: any) {
    let pc = this.peerConnections.get(remoteIdentity);
    if (!pc) {
      await this.setupPeerConnection(remoteIdentity, false);
      pc = this.peerConnections.get(remoteIdentity);
    }
    if (!pc) return;

    try {
      if (signalData.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'signal',
              toParticipantIdentity: remoteIdentity,
              signalData: {
                type: 'answer',
                sdp: pc.localDescription,
              },
            })
          );
        }
      } else if (signalData.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData.sdp));
      } else if (signalData.type === 'candidate' && signalData.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signalData.candidate));
      }
    } catch (err) {
      console.warn('Error handling WebRTC signal:', err);
    }
  }

  private closePeerConnection(remoteIdentity: string) {
    const pc = this.peerConnections.get(remoteIdentity);
    if (pc) {
      pc.close();
      this.peerConnections.delete(remoteIdentity);
    }
    this.remoteStreams.delete(remoteIdentity);
    if (this.handlers.onRemoteStreamRemoved) {
      this.handlers.onRemoteStreamRemoved(remoteIdentity);
    }
  }

  // --- Controls & Toggles ---

  public setMicrophoneEnabled(enabled: boolean) {
    this.isMuted = !enabled;
    if (this.localMediaStream) {
      this.localMediaStream.getAudioTracks().forEach((t) => (t.enabled = enabled));
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'update_state',
          isMuted: this.isMuted,
        })
      );
    }
    const local = this.participants.get(this.localIdentity);
    if (local) {
      local.isMuted = this.isMuted;
      this.notifyParticipantsChange();
    }
  }

  public async setCameraEnabled(enabled: boolean): Promise<void> {
    this.isCameraOn = enabled;

    if (enabled) {
      try {
        // If local stream already has video track, enable it
        const videoTracks = this.localMediaStream?.getVideoTracks() || [];
        if (videoTracks.length > 0) {
          videoTracks.forEach((t) => (t.enabled = true));
        } else {
          // Acquire video track
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          });
          const newVideoTrack = videoStream.getVideoTracks()[0];
          if (this.localMediaStream && newVideoTrack) {
            this.localMediaStream.addTrack(newVideoTrack);

            // Add track to all peer connections
            for (const pc of this.peerConnections.values()) {
              pc.addTrack(newVideoTrack, this.localMediaStream);
            }
          }
        }
      } catch (err: any) {
        console.warn('Camera acquisition failed:', err);
        this.isCameraOn = false;
        this.handlers.onError?.(`Camera unavailable: ${err.message}`);
      }
    } else {
      if (this.localMediaStream) {
        this.localMediaStream.getVideoTracks().forEach((t) => {
          t.enabled = false;
        });
      }
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'update_state',
          isCameraOn: this.isCameraOn,
        })
      );
    }

    const local = this.participants.get(this.localIdentity);
    if (local) {
      local.isCameraOn = this.isCameraOn;
      this.notifyParticipantsChange();
    }

    if (this.handlers.onLocalStream && this.localMediaStream) {
      this.handlers.onLocalStream(this.localMediaStream);
    }
  }

  public setDeviceMode(mode: DeviceAudioMode) {
    this.deviceMode = mode;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'update_state',
          deviceMode: this.deviceMode,
        })
      );
    }
    const local = this.participants.get(this.localIdentity);
    if (local) {
      local.deviceMode = this.deviceMode;
      this.notifyParticipantsChange();
    }
  }

  public sendChatMessage(text: string) {
    if (!text.trim() || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(
      JSON.stringify({
        type: 'chat_message',
        text: text.trim(),
      })
    );
  }

  public async leave(): Promise<void> {
    this.isIntentionalDisconnect = true;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'leave' }));
    }
    this.cleanup();
    this.updateConnectionState('DISCONNECTED');
  }

  // --- Sunny Audio Playback via Web Audio API ---

  private playSunnyAudioChunk(base64Pcm: string) {
    if (!this.outputAudioCtx) return;

    try {
      const now = Date.now();
      if (this.activeSunnySources.length === 0) {
        console.log(`[Sunny/Audio] Sunny audible playback STARTED at ${new Date(now).toISOString()}`);
      }

      const float32Array = this.base64PcmToFloat32(base64Pcm);
      const audioBuffer = this.outputAudioCtx.createBuffer(1, float32Array.length, 24000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioCtx.destination);

      const currentTime = this.outputAudioCtx.currentTime;
      const startTime = Math.max(currentTime, this.nextStartTime);
      source.start(startTime);
      this.nextStartTime = startTime + audioBuffer.duration;

      this.activeSunnySources.push(source);
      source.onended = () => {
        const idx = this.activeSunnySources.indexOf(source);
        if (idx > -1) {
          this.activeSunnySources.splice(idx, 1);
        }
      };
    } catch (err) {
      console.error('Error playing Sunny audio chunk:', err);
    }
  }

  private playPeerAudioChunk(base64Pcm: string) {
    if (!this.outputAudioCtx) return;
    try {
      const float32Array = this.base64PcmToFloat32(base64Pcm);
      const audioBuffer = this.outputAudioCtx.createBuffer(1, float32Array.length, 16000);
      audioBuffer.getChannelData(0).set(float32Array);

      const source = this.outputAudioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioCtx.destination);
      source.start();
    } catch (err) {
      console.error('Error playing peer audio chunk:', err);
    }
  }

  private stopSunnyPlayback() {
    this.activeSunnySources.forEach((src) => {
      try {
        src.stop();
        src.disconnect();
      } catch {}
    });
    this.activeSunnySources = [];
    if (this.outputAudioCtx) {
      this.nextStartTime = this.outputAudioCtx.currentTime;
    }
  }

  private cleanup() {
    if (this.vadInterval) {
      clearInterval(this.vadInterval);
      this.vadInterval = null;
    }
    if (this.speakingDebounceTimer) {
      clearTimeout(this.speakingDebounceTimer);
      this.speakingDebounceTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopSunnyPlayback();

    // Close WebRTC peer connections
    for (const pc of this.peerConnections.values()) {
      pc.close();
    }
    this.peerConnections.clear();
    this.remoteStreams.clear();

    // Stop local media tracks
    if (this.localMediaStream) {
      this.localMediaStream.getTracks().forEach((track) => track.stop());
      this.localMediaStream = null;
    }

    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    if (this.mediaSource) {
      this.mediaSource.disconnect();
      this.mediaSource = null;
    }
    if (this.analyserNode) {
      this.analyserNode.disconnect();
      this.analyserNode = null;
    }

    if (this.inputAudioCtx) {
      this.inputAudioCtx.close();
      this.inputAudioCtx = null;
    }
    if (this.outputAudioCtx) {
      this.outputAudioCtx.close();
      this.outputAudioCtx = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    this.participants.clear();
  }

  private updateConnectionState(state: RoomConnectionState) {
    this.connectionState = state;
    this.handlers.onConnectionStateChange?.(state);
  }

  private notifyParticipantsChange() {
    const list = Array.from(this.participants.values());
    this.handlers.onParticipantsChange?.(list);

    const activeSpeakers = list.filter((p) => p.isSpeaking).map((p) => p.identity);
    this.handlers.onActiveSpeakersChange?.(activeSpeakers);
  }

  // --- Helpers ---

  private float32ToInt16Base64(float32Array: Float32Array): string {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    const uint8Array = new Uint8Array(int16Array.buffer);
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }

  private base64PcmToFloat32(base64: string): Float32Array {
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const int16View = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16View.length);
    for (let i = 0; i < int16View.length; i++) {
      float32Array[i] = int16View[i] / 32768.0;
    }
    return float32Array;
  }

  public getParticipants(): RoomParticipant[] {
    return Array.from(this.participants.values());
  }

  public getRemoteStream(identity: string): MediaStream | undefined {
    return this.remoteStreams.get(identity);
  }

  public getLocalStream(): MediaStream | null {
    return this.localMediaStream;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsCameraOn(): boolean {
    return this.isCameraOn;
  }

  public getDeviceMode(): DeviceAudioMode {
    return this.deviceMode;
  }

  public setSunnyMute(isMuted: boolean): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'set_sunny_mute', isMuted }));
    }
  }
}
