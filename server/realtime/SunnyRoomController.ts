import { GoogleGenAI, Modality, Type } from '@google/genai';
import {
  GroupConversationSession,
  RoomParticipant,
  Memory,
  Highlight,
  Utterance,
  SunnyUser,
  ConversationMode,
} from '../../src/types';
import {
  memoryRepo,
  conversationRepo,
  groupRepo,
  userRepo,
} from '../repositories';

// AI Tool definitions for Sunny in Group Room
const sunnyGroupTools = [
  {
    functionDeclarations: [
      {
        name: 'save_memory',
        description:
          'Save a key fact, decision, plan, preference, update, or personal memory to long-term storage. In Group mode, set personName to the authenticated speaker displayName if known, or "Group" if speaker identity is unknown.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            personName: {
              type: Type.STRING,
              description: 'Name of the member if known from authenticated track, or "Group"',
            },
            subject: {
              type: Type.STRING,
              description: 'Short topic or subject (e.g., Goa Trip, Startup Idea, Work Transition)',
            },
            fact: {
              type: Type.STRING,
              description: 'The specific fact, plan, or preference learned from the conversation',
            },
            context: {
              type: Type.STRING,
              description: 'Brief context of when/how it was discussed',
            },
            memoryType: {
              type: Type.STRING,
              enum: ['PREFERENCE', 'PLAN', 'FACT', 'RELATIONSHIP', 'BACKGROUND'],
              description: 'Categorization of this memory',
            },
          },
          required: ['subject', 'fact'],
        },
      },
      {
        name: 'save_highlight',
        description:
          'Capture an important discussion highlight, major group decision, or key action item from the active group call.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              enum: ['DECISION', 'ACTION_ITEM', 'INSIGHT', 'TOPIC', 'NOTE'],
              description: 'Type of highlight',
            },
            text: {
              type: Type.STRING,
              description: 'Concise summary of the highlight or decision in Marathi / English',
            },
            importance: {
              type: Type.STRING,
              enum: ['HIGH', 'MEDIUM', 'LOW'],
              description: 'Importance level',
            },
          },
          required: ['type', 'text'],
        },
      },
    ],
  },
];

export type ConversationalState =
  | 'NO_HUMAN_SPEAKING'
  | 'ONE_HUMAN_SPEAKING'
  | 'MULTIPLE_HUMANS_SPEAKING'
  | 'SUNNY_SPEAKING';

export type GeminiTurnState =
  | 'IDLE'
  | 'HUMAN_SPEAKING'
  | 'FINALIZING_HUMAN_TURN'
  | 'WAITING_FOR_GEMINI'
  | 'SUNNY_SPEAKING'
  | 'INTERRUPTED';

export interface RoomBroadcastCallbacks {
  broadcastSunnyAudio: (pcmBase64: string) => void;
  broadcastSunnyStatus: (status: 'idle' | 'listening' | 'thinking' | 'speaking' | 'reconnecting') => void;
  broadcastSunnyTranscript: (text: string, sender: 'sunny' | 'system') => void;
  broadcastMemorySaved: (memory: Memory) => void;
  broadcastHighlightSaved: (highlight: Highlight) => void;
  broadcastInterruption: () => void;
}

export class SunnyRoomController {
  public readonly sessionId: string;
  public readonly groupId: string;
  public readonly conversationId: string;

  private ai: GoogleGenAI;
  private geminiSession: any = null;
  private isConnecting: boolean = false;
  private isDestroyed: boolean = false;
  private currentStatus: 'idle' | 'listening' | 'thinking' | 'speaking' | 'reconnecting' = 'listening';

  // State Machine & Single Active Speaker Gate
  private turnState: GeminiTurnState = 'IDLE';
  private activeGeminiSpeakerIdentity: string | null = null;
  private currentSpeakerName: string = '';
  private isSpeakerContextSentForCurrentTurn: boolean = false;

  private activeSpeakers: Set<string> = new Set();
  private recentSpeakerIdentity: { userId?: string; displayName?: string; identitySource: 'RTC_PARTICIPANT' | 'SHARED_MIC' } | null = null;
  private conversationalState: ConversationalState = 'NO_HUMAN_SPEAKING';

  private participants: Map<string, RoomParticipant> = new Map();
  private callbacks: RoomBroadcastCallbacks;
  private utteranceSeq: number = 0;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // Turn Latency Metrics & Watchdog
  private turnMetrics: {
    speaker: string;
    speakerIdentity: string;
    speakerSpeechStartAt: number;
    speakerSpeechEndAt: number;
    firstPcmCapturedAt: number;
    lastPcmCapturedAt: number;
    firstPcmSentToServerAt: number;
    lastPcmSentToServerAt: number;
    firstPcmReceivedBySunnyControllerAt: number;
    lastPcmReceivedBySunnyControllerAt: number;
    audioStreamEndSentAt: number;
    geminiFirstAudioSentAt: number;
    geminiLastAudioSentAt: number;
    geminiResponseStartedAt: number;
    geminiFirstResponseAudioAt: number;
    pcmChunksForwarded: number;
    pcmBytesForwarded: number;
  } | null = null;
  private latencyWatchdogTimer: NodeJS.Timeout | null = null;

  constructor(
    session: GroupConversationSession,
    aiClient: GoogleGenAI,
    callbacks: RoomBroadcastCallbacks
  ) {
    this.sessionId = session.id;
    this.groupId = session.groupId;
    this.conversationId = session.conversationId;
    this.ai = aiClient;
    this.callbacks = callbacks;
  }

  public async start() {
    await this.connectToGemini();
  }

  public async destroy() {
    this.isDestroyed = true;
    this.clearLatencyWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.geminiSession) {
      try {
        await this.geminiSession.close?.();
      } catch {}
      this.geminiSession = null;
    }
  }

  private async buildSystemInstruction(): Promise<string> {
    const group = await groupRepo.getById(this.groupId);
    const groupName = group ? group.name : 'Marathwada Katta Circle';
    const groupMemories = await memoryRepo.getGroupMemories(this.groupId);
    const allMemories = (await memoryRepo.getAllMemories()).slice(0, 15);

    const participantNames = Array.from(this.participants.values())
      .filter((p) => !p.isAI)
      .map((p) => p.displayName);

    const groupMemoriesStr = [...groupMemories, ...allMemories]
      .slice(0, 15)
      .map((m) => `- [${m.personName || 'Group'}] (${m.subject}): ${m.fact}`)
      .join('\n') || '- No prior group memories recorded yet.';

    return `
*** SUNNY (सन्नी) - REMOTE REALTIME GROUP CALL AI PARTICIPANT ***
You are Sunny (सन्नी), the authentic, witty, warm Marathi companion from Marathwada joining a live multi-user audio/video call with friends in circle: "${groupName}".

ROLE IN THIS REALTIME CALL:
You are ONE additional participant hanging out in the same room. You are NOT a facilitator, bot, or moderator. You behave like a genuine Marathwada buddy in a conference call.

AUTHENTIC MARATHWADA MARATHI DIALECT:
- Natural phrasing: "काय राव", "भावा", "एक नंबर", "अरे वा", "काय चाललंय", "मस्त विषय काढला", "खरंय तुझं".
- Concise, conversational spoken rhythm (1 to 3 short sentences per turn). Avoid robotic monologues.

*** MANDATORY RULE 1: GROUP ROOM SILENCE & RESPECTING CONVERSATIONS ***
- By default, human friends talk directly to each other.
- When humans are conversing amongst themselves WITHOUT addressing you or asking for your thoughts:
  * STAY 100% SILENT.
  * Do NOT interrupt or inject empty fillers ("हं", "हो", "okay").
  * Listen actively and call \`save_memory\` or \`save_highlight\` when decisions, plans, or key preferences are discussed.
- SPEAK ONLY WHEN:
  1. Your name is called ("Sunny", "सन्नी", "Sunya", "सन्न्या", "सन्नी काय वाटतं", "Sunny तू सांग").
  2. Or when you are explicitly asked a question by a participant.

*** MANDATORY RULE 2: AUTHORITATIVE SPEAKER IDENTITY (NO VOICE GUESSING) ***
- The realtime application provides speaker attribution via context tags:
  * If context contains: [CURRENT_SPEAKER: "Nakul" (RTC_PARTICIPANT)] -> You KNOW with 100% certainty that Nakul is speaking! You may address him by name (e.g. "हो Nakul, पण मला वाटतं...").
  * If context contains: [CURRENT_SPEAKER: UNKNOWN_GROUP_MEMBER (SHARED_MIC)] -> You DO NOT know who is speaking. NEVER guess or assume a name based on voice! Respond politely without naming the person (e.g. "हं, हा मुद्दा बरोबर आहे...").
  * When saving memories:
    - If speaker was an authenticated RTC_PARTICIPANT (e.g. Nakul), set personName = "Nakul".
    - If speaker was SHARED_MIC or UNKNOWN, set personName = "Group".

HUMAN PARTICIPANTS PRESENT IN THIS CALL:
${participantNames.length > 0 ? participantNames.join(', ') : 'Waiting for members to join...'}

RELEVANT CIRCLE MEMORIES & CONTEXT:
${groupMemoriesStr}
`;
  }

  private async connectToGemini() {
    if (this.isDestroyed || this.isConnecting) return;
    this.isConnecting = true;
    this.updateStatus('reconnecting');

    try {
      const systemInstruction = await this.buildSystemInstruction();

      this.geminiSession = await this.ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Puck' }, // Male voice for Sunny
            },
          },
          systemInstruction,
          tools: sunnyGroupTools,
        },
        callbacks: {
          onmessage: async (message: any) => {
            if (this.isDestroyed) return;

            // Handle tool calls (save_memory, save_highlight)
            if (message.toolCall) {
              const responses: any[] = [];
              for (const call of message.toolCall.functionCalls) {
                if (call.name === 'save_memory') {
                  const args = call.args as any;
                  const personName =
                    args.personName && args.personName !== 'Group'
                      ? args.personName
                      : this.recentSpeakerIdentity?.displayName || 'Group';

                  const saved = await memoryRepo.addMemory({
                    groupId: this.groupId,
                    userId: this.recentSpeakerIdentity?.userId,
                    personName,
                    type: args.memoryType || 'FACT',
                    subject: args.subject || 'Group Call Discussion',
                    fact: args.fact || '',
                    context: args.context || 'Captured from live group call',
                    confidence: this.recentSpeakerIdentity?.identitySource === 'RTC_PARTICIPANT' ? 'high' : 'medium',
                    sourceConversationId: this.conversationId,
                  });

                  this.callbacks.broadcastMemorySaved(saved);
                  responses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: 'Memory saved successfully in storage' },
                  });
                } else if (call.name === 'save_highlight') {
                  const args = call.args as any;
                  const saved = await conversationRepo.addHighlight(this.conversationId, {
                    type: args.type || 'NOTE',
                    text: args.text || '',
                    importance: args.importance || 'MEDIUM',
                  });

                  this.callbacks.broadcastHighlightSaved(saved);
                  responses.push({
                    id: call.id,
                    name: call.name,
                    response: { result: 'Highlight captured successfully' },
                  });
                }
              }

              if (responses.length > 0 && this.geminiSession) {
                try {
                  this.geminiSession.sendToolResponse({
                    functionResponses: responses,
                  });
                } catch (e) {
                  console.error('Error sending toolResponse:', e);
                }
              }
            }

            // Handle audio output from Sunny
            if (message.serverContent) {
              const now = Date.now();
              const modelTurn = message.serverContent.modelTurn;
              if (modelTurn && modelTurn.parts) {
                for (const part of modelTurn.parts) {
                  if (part.inlineData && part.inlineData.data) {
                    // Turn state transition to SUNNY_SPEAKING
                    if (this.turnState !== 'SUNNY_SPEAKING') {
                      this.turnState = 'SUNNY_SPEAKING';
                      this.clearLatencyWatchdog();

                      if (this.turnMetrics && !this.turnMetrics.geminiFirstResponseAudioAt) {
                        this.turnMetrics.geminiResponseStartedAt = now;
                        this.turnMetrics.geminiFirstResponseAudioAt = now;

                        // Calculate detailed end-to-end latency breakdown
                        const speechEnd = this.turnMetrics.speakerSpeechEndAt || this.turnMetrics.lastPcmCapturedAt;
                        const captureLatency = Math.max(0, this.turnMetrics.firstPcmSentToServerAt - this.turnMetrics.firstPcmCapturedAt);
                        const networkLatency = Math.max(0, this.turnMetrics.firstPcmReceivedBySunnyControllerAt - this.turnMetrics.firstPcmSentToServerAt);
                        const geminiResponseLatency = Math.max(0, now - (this.turnMetrics.audioStreamEndSentAt || speechEnd));
                        const totalEndToEndLatency = Math.max(0, now - speechEnd);

                        console.log(`\n==================================================`);
                        console.log(`[SUNNY_TURN_LATENCY_METRICS] Spoken Turn Completed`);
                        console.log(`Speaker:                     ${this.turnMetrics.speaker}`);
                        console.log(`Speech Duration:             ${Math.max(0, this.turnMetrics.speakerSpeechEndAt - this.turnMetrics.speakerSpeechStartAt)}ms`);
                        console.log(`Chunks Forwarded:            ${this.turnMetrics.pcmChunksForwarded} (~32ms/chunk, ${Math.round(this.turnMetrics.pcmBytesForwarded)} bytes)`);
                        console.log(`Capture Latency:             ${captureLatency}ms`);
                        console.log(`Network Ingress Latency:     ${networkLatency}ms`);
                        console.log(`Gemini Live Response Delay:  ${geminiResponseLatency}ms`);
                        console.log(`TOTAL End-to-End Latency:    ${totalEndToEndLatency}ms (${(totalEndToEndLatency / 1000).toFixed(2)}s)`);
                        console.log(`==================================================\n`);
                      }
                    }

                    // Check if interrupted by human speech
                    if (this.conversationalState === 'ONE_HUMAN_SPEAKING' || this.conversationalState === 'MULTIPLE_HUMANS_SPEAKING') {
                      console.log('[Sunny/Turn] Human spoke while Sunny producing audio -> Interrupted');
                      this.interruptSunny();
                      return;
                    }

                    this.updateStatus('speaking');
                    this.callbacks.broadcastSunnyAudio(part.inlineData.data);
                  }
                  if (part.text) {
                    this.callbacks.broadcastSunnyTranscript(part.text, 'sunny');
                    // Persist utterance
                    await conversationRepo.addUtterance(this.conversationId, {
                      conversationId: this.conversationId,
                      speakerType: 'sunny',
                      speakerName: 'Sunny (सन्नी)',
                      text: part.text,
                      sequenceNumber: ++this.utteranceSeq,
                      identityConfidence: 'KNOWN',
                    });
                  }
                }
              }

              if (message.serverContent.turnComplete) {
                this.turnState = 'IDLE';
                this.updateStatus('listening');
                this.conversationalState = 'NO_HUMAN_SPEAKING';
                this.clearLatencyWatchdog();
              }
            }
          },
          onerror: (err: any) => {
            console.warn('Gemini Live session error in group room:', err?.message || err);
            this.handleGeminiDisconnect();
          },
          onclose: () => {
            console.log('Gemini Live session closed in group room');
            this.handleGeminiDisconnect();
          },
        },
      });

      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.turnState = 'IDLE';
      this.updateStatus('listening');
      console.log(`Sunny joined group room session ${this.sessionId}`);

      // Announce initial presence to Gemini
      try {
        this.geminiSession.sendRealtimeInput({
          text: `[SYSTEM_EVENT: Sunny joined the room. Human members present: ${Array.from(this.participants.values()).map((p) => p.displayName).join(', ')}. Remember to remain completely silent until called upon.]`,
        });
      } catch (e) {
        console.warn('Error announcing initial presence to Gemini:', e);
      }
    } catch (err: any) {
      console.error('Failed to connect Sunny to Gemini Live for group room:', err?.message || err);
      this.isConnecting = false;
      this.handleGeminiDisconnect();
    }
  }

  private handleGeminiDisconnect() {
    if (this.isDestroyed) return;
    this.geminiSession = null;
    this.clearLatencyWatchdog();
    this.updateStatus('reconnecting');

    // Exponential backoff reconnect
    if (!this.reconnectTimer) {
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      this.reconnectAttempts++;
      console.log(`Scheduling Sunny Gemini reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
      this.reconnectTimer = setTimeout(() => {
        this.reconnectTimer = null;
        this.connectToGemini();
      }, delay);
    }
  }

  private updateStatus(status: 'idle' | 'listening' | 'thinking' | 'speaking' | 'reconnecting') {
    this.currentStatus = status;
    this.callbacks.broadcastSunnyStatus(status);
  }

  public onParticipantJoined(participant: RoomParticipant) {
    this.participants.set(participant.identity, participant);
    if (!participant.isAI && this.geminiSession) {
      try {
        this.geminiSession.sendRealtimeInput({
          text: `[EVENT: PARTICIPANT_JOINED: ${participant.displayName} (Device: ${participant.deviceMode})]`,
        });
      } catch (e) {
        console.warn('Could not send join event to Gemini:', e);
      }
    }
  }

  public onParticipantLeft(identity: string) {
    const p = this.participants.get(identity);
    this.participants.delete(identity);
    this.activeSpeakers.delete(identity);

    if (this.activeGeminiSpeakerIdentity === identity) {
      this.handleAudioStreamEnd(identity);
    }

    if (p && !p.isAI && this.geminiSession) {
      try {
        this.geminiSession.sendRealtimeInput({
          text: `[EVENT: PARTICIPANT_LEFT: ${p.displayName}]`,
        });
      } catch (e) {
        console.warn('Could not send leave event to Gemini:', e);
      }
    }
  }

  public onParticipantSpeakingChanged(
    identity: string,
    isSpeaking: boolean,
    speechStartAt?: number,
    speechEndAt?: number
  ) {
    if (isSpeaking) {
      this.activeSpeakers.add(identity);
    } else {
      this.activeSpeakers.delete(identity);
    }

    const humanSpeakingCount = Array.from(this.activeSpeakers).filter((id) => id !== 'sunny-agent').length;

    if (humanSpeakingCount === 0) {
      // If the active speaker stopped speaking, finalize turn
      if (this.activeGeminiSpeakerIdentity === identity || this.turnState === 'HUMAN_SPEAKING') {
        this.handleAudioStreamEnd(identity, {
          speakerSpeechStartAt: speechStartAt,
          speakerSpeechEndAt: speechEndAt || Date.now(),
        });
      }

      if (this.turnState !== 'SUNNY_SPEAKING' && this.turnState !== 'WAITING_FOR_GEMINI' && this.turnState !== 'FINALIZING_HUMAN_TURN') {
        this.conversationalState = 'NO_HUMAN_SPEAKING';
        this.updateStatus('listening');
      }
    } else if (humanSpeakingCount === 1) {
      if (this.turnState === 'SUNNY_SPEAKING') {
        this.interruptSunny();
      }
      this.conversationalState = 'ONE_HUMAN_SPEAKING';
      this.updateStatus('listening');
    } else {
      // Multiple humans speaking -> Overlapping speech -> Sunny stays silent
      if (this.turnState === 'SUNNY_SPEAKING') {
        this.interruptSunny();
      }
      this.conversationalState = 'MULTIPLE_HUMANS_SPEAKING';
      this.updateStatus('listening');
    }
  }

  public interruptSunny() {
    this.turnState = 'INTERRUPTED';
    this.clearLatencyWatchdog();
    this.conversationalState = 'ONE_HUMAN_SPEAKING';
    this.updateStatus('listening');
    this.callbacks.broadcastInterruption();

    // Notify Gemini of interruption
    if (this.geminiSession) {
      try {
        this.geminiSession.sendRealtimeInput({
          text: '[INTERRUPTED: Human is speaking now. Stop previous turn.]',
        });
      } catch (e) {
        console.warn('Could not send interruption to Gemini:', e);
      }
    }
  }

  // Handle single-active speaker gated audio forwarding to Gemini Live
  public async handleHumanAudio(
    speakerIdentity: string,
    pcmBase64: string,
    deviceMode: 'INDIVIDUAL' | 'SHARED_DEVICE',
    clientCapturedAt?: number,
    clientSentAt?: number
  ) {
    if (!this.geminiSession || this.isDestroyed) return;

    const now = Date.now();

    // 1. Single Active Speaker Gate Check
    if (this.activeGeminiSpeakerIdentity === null) {
      // First speaker acquires active gate
      this.activeGeminiSpeakerIdentity = speakerIdentity;
      this.turnState = 'HUMAN_SPEAKING';
      this.isSpeakerContextSentForCurrentTurn = false;

      const participant = this.participants.get(speakerIdentity);
      this.currentSpeakerName = participant?.displayName || 'Friend';

      // Initialize turn metrics
      this.turnMetrics = {
        speaker: this.currentSpeakerName,
        speakerIdentity,
        speakerSpeechStartAt: clientSentAt || now,
        speakerSpeechEndAt: 0,
        firstPcmCapturedAt: clientCapturedAt || now,
        lastPcmCapturedAt: clientCapturedAt || now,
        firstPcmSentToServerAt: clientSentAt || now,
        lastPcmSentToServerAt: clientSentAt || now,
        firstPcmReceivedBySunnyControllerAt: now,
        lastPcmReceivedBySunnyControllerAt: now,
        audioStreamEndSentAt: 0,
        geminiFirstAudioSentAt: 0,
        geminiLastAudioSentAt: 0,
        geminiResponseStartedAt: 0,
        geminiFirstResponseAudioAt: 0,
        pcmChunksForwarded: 0,
        pcmBytesForwarded: 0,
      };

      console.log(`[Sunny/Gate] Speaker gate ACQUIRED by "${this.currentSpeakerName}" (${speakerIdentity})`);
    } else if (this.activeGeminiSpeakerIdentity !== speakerIdentity) {
      // Another human is speaking while the active speaker is still talking
      // Preserve human-to-human WebRTC audio, but do NOT mix their PCM into Gemini!
      if (this.conversationalState !== 'MULTIPLE_HUMANS_SPEAKING') {
        this.conversationalState = 'MULTIPLE_HUMANS_SPEAKING';
        console.log(`[Sunny/Gate] Overlapping speech detected from "${this.participants.get(speakerIdentity)?.displayName || speakerIdentity}". Maintaining gate with "${this.currentSpeakerName}".`);
      }
      return;
    }

    // Update timestamps for active speaker
    if (this.turnMetrics) {
      this.turnMetrics.lastPcmCapturedAt = clientCapturedAt || now;
      this.turnMetrics.lastPcmSentToServerAt = clientSentAt || now;
      this.turnMetrics.lastPcmReceivedBySunnyControllerAt = now;
      this.turnMetrics.pcmChunksForwarded++;
      this.turnMetrics.pcmBytesForwarded += pcmBase64.length * 0.75;
    }

    // 2. Send Speaker Context ONCE per turn before audio starts
    if (!this.isSpeakerContextSentForCurrentTurn) {
      this.isSpeakerContextSentForCurrentTurn = true;
      const participant = this.participants.get(speakerIdentity);
      let speakerTag = '';
      if (deviceMode === 'INDIVIDUAL' && participant?.sunnyUserId) {
        speakerTag = `[CURRENT_SPEAKER: "${participant.displayName}" (RTC_PARTICIPANT)]`;
        this.recentSpeakerIdentity = {
          userId: participant.sunnyUserId,
          displayName: participant.displayName,
          identitySource: 'RTC_PARTICIPANT',
        };
      } else {
        speakerTag = `[CURRENT_SPEAKER: UNKNOWN_GROUP_MEMBER (SHARED_MIC)]`;
        this.recentSpeakerIdentity = {
          displayName: 'Group',
          identitySource: 'SHARED_MIC',
        };
      }

      try {
        this.geminiSession.sendRealtimeInput({
          text: speakerTag,
        });
      } catch (e) {
        console.warn('Error setting speaker context for turn:', e);
      }
    }

    // 3. Forward PCM chunk to Gemini Live (bounded, non-blocking)
    if (!this.turnMetrics?.geminiFirstAudioSentAt) {
      this.turnMetrics!.geminiFirstAudioSentAt = now;
    }
    this.turnMetrics!.geminiLastAudioSentAt = now;

    try {
      this.geminiSession.sendRealtimeInput({
        audio: {
          mimeType: 'audio/pcm;rate=16000',
          data: pcmBase64,
        },
      });
    } catch (err) {
      console.warn('Error forwarding PCM chunk to Gemini:', err);
    }
  }

  // Explicit End-of-Speech Finalization
  public async handleAudioStreamEnd(
    speakerIdentity: string,
    timestamps?: {
      speakerSpeechStartAt?: number;
      speakerSpeechEndAt?: number;
      firstPcmCapturedAt?: number;
      lastPcmCapturedAt?: number;
      firstPcmSentToServerAt?: number;
      lastPcmSentToServerAt?: number;
    }
  ) {
    if (!this.geminiSession || this.isDestroyed) return;
    if (this.activeGeminiSpeakerIdentity !== speakerIdentity && this.activeGeminiSpeakerIdentity !== null) {
      return;
    }

    const now = Date.now();
    console.log(`[Sunny/Turn] Finalizing human turn for speaker "${this.currentSpeakerName || speakerIdentity}". Sending audioStreamEnd to Gemini Live.`);

    this.turnState = 'FINALIZING_HUMAN_TURN';

    if (this.turnMetrics) {
      if (timestamps?.speakerSpeechEndAt) {
        this.turnMetrics.speakerSpeechEndAt = timestamps.speakerSpeechEndAt;
      } else if (!this.turnMetrics.speakerSpeechEndAt) {
        this.turnMetrics.speakerSpeechEndAt = now;
      }
      this.turnMetrics.audioStreamEndSentAt = now;
    }

    // 1. Explicitly inform Gemini that the human audio stream / turn has ended
    try {
      this.geminiSession.sendRealtimeInput({
        audioStreamEnd: true,
      });
    } catch (err) {
      console.warn('Error sending audioStreamEnd to Gemini:', err);
    }

    this.turnState = 'WAITING_FOR_GEMINI';
    this.updateStatus('thinking');

    // 2. Start 5-second Latency Watchdog
    this.startLatencyWatchdog();

    // 3. Clear active speaker gate so next speaker or Sunny can speak
    this.activeGeminiSpeakerIdentity = null;
    this.isSpeakerContextSentForCurrentTurn = false;
  }

  private startLatencyWatchdog() {
    this.clearLatencyWatchdog();

    const speechEnd = this.turnMetrics?.speakerSpeechEndAt || Date.now();
    const speaker = this.currentSpeakerName;

    this.latencyWatchdogTimer = setTimeout(() => {
      const durationSinceSpeechEnd = Date.now() - speechEnd;
      if (this.turnState === 'WAITING_FOR_GEMINI' || this.turnState === 'FINALIZING_HUMAN_TURN') {
        console.warn(`\n⚠️ [SUNNY_LATENCY_WARNING] No Gemini response after ${durationSinceSpeechEnd}ms! Diagnostics:`, {
          speaker,
          turnState: this.turnState,
          currentStatus: this.currentStatus,
          conversationalState: this.conversationalState,
          turnMetrics: this.turnMetrics,
        });
      }
    }, 5000);
  }

  private clearLatencyWatchdog() {
    if (this.latencyWatchdogTimer) {
      clearTimeout(this.latencyWatchdogTimer);
      this.latencyWatchdogTimer = null;
    }
  }

  // Handle text input (e.g. direct Marathi prompt or nudge from in-room chat)
  public async handleTextInput(text: string, senderName: string) {
    if (!this.geminiSession || this.isDestroyed) return;

    this.updateStatus('thinking');
    try {
      this.geminiSession.sendRealtimeInput({
        text: `[FROM ${senderName}]: ${text}`,
      });
    } catch (e) {
      console.error('Error sending text to Gemini in group room:', e);
      this.updateStatus('listening');
    }
  }

  public getStatus() {
    return this.currentStatus;
  }
}
