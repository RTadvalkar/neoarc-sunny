import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Users,
  Sparkles,
  Volume2,
  VolumeX,
  MessageSquare,
  Bookmark,
  Radio,
  Settings,
  HelpCircle,
  CheckCircle,
  AlertTriangle,
  Send,
  X,
  Shield,
  Layers,
  Smartphone,
  User,
  Link2,
  Check,
} from 'lucide-react';
import {
  SunnyUser,
  Group,
  GroupConversationSession,
  RoomParticipant,
  DeviceAudioMode,
  Memory,
  Highlight,
} from '../types';
import { WebRTCRoomService, RoomConnectionState } from '../services/realtimeRoom';
import { buildGroupCallJoinUrl, copyToClipboard } from '../services/groupCallUrl';

interface GroupRoomViewProps {
  currentUser: SunnyUser;
  group: Group;
  session: GroupConversationSession;
  token: string;
  onLeave: () => void;
  onSessionEnded: () => void;
}

export const GroupRoomView: React.FC<GroupRoomViewProps> = ({
  currentUser,
  group,
  session,
  token,
  onLeave,
  onSessionEnded,
}) => {
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [activeSpeakers, setActiveSpeakers] = useState<string[]>([]);
  const [sunnyStatus, setSunnyStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking' | 'reconnecting'>('listening');
  const [connectionState, setConnectionState] = useState<RoomConnectionState>('CONNECTING');
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [deviceMode, setDeviceMode] = useState<DeviceAudioMode>('INDIVIDUAL');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Drawer / Side panels
  const [activeTab, setActiveTab] = useState<'none' | 'transcript' | 'memories' | 'settings'>('none');
  const [transcriptEntries, setTranscriptEntries] = useState<
    Array<{ id: string; sender: 'user' | 'sunny' | 'system'; text: string; speakerName?: string; time: string }>
  >([]);
  const [savedMemories, setSavedMemories] = useState<Memory[]>([]);
  const [savedHighlights, setSavedHighlights] = useState<Highlight[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [showEndModal, setShowEndModal] = useState(false);
  const [showEchoTip, setShowEchoTip] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Media streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const roomServiceRef = useRef<WebRTCRoomService | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const service = new WebRTCRoomService({
      onParticipantsChange: (updated) => {
        setParticipants([...updated]);
      },
      onActiveSpeakersChange: (speakers) => {
        setActiveSpeakers([...speakers]);
      },
      onSunnyStatusChange: (status) => {
        setSunnyStatus(status);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
      onTranscript: (entry) => {
        setTranscriptEntries((prev) => [
          ...prev,
          { ...entry, id: `t_${Date.now()}_${Math.random().toString(36).substring(2, 5)}` },
        ]);
      },
      onMemorySaved: (memory) => {
        setSavedMemories((prev) => [memory, ...prev]);
      },
      onHighlightSaved: (highlight) => {
        setSavedHighlights((prev) => [highlight, ...prev]);
      },
      onLocalStream: (stream) => {
        setLocalStream(stream);
      },
      onRemoteStream: (identity, stream) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(identity, stream);
          return next;
        });
      },
      onRemoteStreamRemoved: (identity) => {
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.delete(identity);
          return next;
        });
      },
      onError: (err) => {
        setErrorMessage(err);
      },
      onSessionEnded: (msg) => {
        alert(msg || 'The call session has ended.');
        onSessionEnded();
      },
    });

    roomServiceRef.current = service;

    // Join room
    service.join({
      token,
      roomId: session.roomId,
      sessionId: session.id,
      groupId: group.id,
      user: {
        id: currentUser.id,
        displayName: currentUser.displayName,
        photoURL: currentUser.photoURL,
      },
      deviceMode: 'INDIVIDUAL',
      enableAudio: true,
      enableVideo: false,
    });

    return () => {
      service.leave();
      roomServiceRef.current = null;
    };
  }, [session.id, token]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptEntries]);

  const handleToggleMute = () => {
    if (!roomServiceRef.current) return;
    const next = !isMuted;
    setIsMuted(next);
    roomServiceRef.current.setMicrophoneEnabled(!next);
  };

  const handleToggleCamera = async () => {
    if (!roomServiceRef.current) return;
    const next = !isCameraOn;
    setIsCameraOn(next);
    await roomServiceRef.current.setCameraEnabled(next);
  };

  const handleSwitchDeviceMode = (mode: DeviceAudioMode) => {
    setDeviceMode(mode);
    roomServiceRef.current?.setDeviceMode(mode);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !roomServiceRef.current) return;
    roomServiceRef.current.sendChatMessage(chatInput.trim());
    setChatInput('');
  };

  const handleCopyJoinLink = async () => {
    const url = buildGroupCallJoinUrl(group.id, session.id);
    const success = await copyToClipboard(url);
    if (success) {
      setCopiedLink(true);
      setToastMessage('Join link copied! Only accepted group members can join.');
      setTimeout(() => setCopiedLink(false), 3000);
      setTimeout(() => setToastMessage(null), 4500);
    }
  };

  const handleEndCallForEveryone = async () => {
    try {
      await fetch(`/api/groups/${group.id}/sessions/${session.id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      setShowEndModal(false);
      onSessionEnded();
    } catch (e) {
      console.error('Error ending call for all:', e);
    }
  };

  const isHost = session.startedByUserId === currentUser.id || currentUser.role === 'ADMIN';
  const humanParticipants = participants.filter((p) => !p.isAI);
  const sunnyParticipant = participants.find((p) => p.isAI) || {
    identity: 'sunny-agent',
    displayName: 'Sunny (सन्नी)',
    isAI: true,
    isSpeaking: sunnyStatus === 'speaking',
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* --- Top Status & Navigation Bar --- */}
      <header className="flex items-center justify-between px-5 py-3.5 bg-slate-900/90 border-b border-slate-800/80 backdrop-blur shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <h1 className="text-base font-bold text-white tracking-tight">{group.name}</h1>
          </div>
          <span className="hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            Realtime Group Call
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            {humanParticipants.length} friends + Sunny
          </span>
        </div>

        {/* Sunny Status Pill */}
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              sunnyStatus === 'speaking'
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm shadow-amber-500/20'
                : sunnyStatus === 'thinking'
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                : sunnyStatus === 'reconnecting'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            }`}
          >
            <Sparkles
              className={`w-3.5 h-3.5 ${
                sunnyStatus === 'speaking'
                  ? 'text-amber-400 animate-spin'
                  : sunnyStatus === 'thinking'
                  ? 'text-purple-400 animate-pulse'
                  : 'text-emerald-400'
              }`}
            />
            <span>
              {sunnyStatus === 'speaking'
                ? 'Sunny speaking...'
                : sunnyStatus === 'thinking'
                ? 'Sunny thinking...'
                : sunnyStatus === 'reconnecting'
                ? 'Sunny reconnecting...'
                : 'Sunny listening'}
            </span>
          </div>

          {/* Side Drawer Toggles */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab(activeTab === 'transcript' ? 'none' : 'transcript')}
              className={`p-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'transcript'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Live Discussion & Transcript"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <button
              onClick={() => setActiveTab(activeTab === 'memories' ? 'none' : 'memories')}
              className={`p-2 rounded-lg text-xs font-medium transition-colors relative ${
                activeTab === 'memories'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Saved Memories & Highlights"
            >
              <Bookmark className="w-4 h-4" />
              {savedMemories.length + savedHighlights.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-slate-950">
                  {savedMemories.length + savedHighlights.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab(activeTab === 'settings' ? 'none' : 'settings')}
              className={`p-2 rounded-lg text-xs font-medium transition-colors ${
                activeTab === 'settings'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              title="Audio & Device Mode Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* --- Copy Join Link Toast Notification --- */}
      {toastMessage && (
        <div className="bg-emerald-900/90 border-b border-emerald-600 px-4 py-2.5 text-xs text-emerald-100 flex items-center justify-between shadow-md animate-fadeIn z-20">
          <div className="flex items-center gap-2 font-medium">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-emerald-300 hover:text-white ml-3">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* --- Reconnecting or Error Banner --- */}
      {connectionState === 'RECONNECTING' && (
        <div className="bg-amber-500/90 text-slate-950 px-4 py-2 text-xs font-semibold flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>Reconnecting to group call... Your media will resume automatically.</span>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-900/80 border-b border-rose-700 px-4 py-2 text-xs text-rose-200 flex items-center justify-between">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="text-rose-300 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* --- Acoustic / Same Location Echo Tip Banner --- */}
      {showEchoTip && (
        <div className="bg-slate-900/95 border-b border-slate-800 px-4 py-2 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-indigo-400 shrink-0" />
            <span>
              <strong>Tip for best call quality:</strong> Wear headphones to prevent acoustic echo. If friends are sitting together in the same physical room, choose <strong>Shared Device Mode</strong> in Settings.
            </span>
          </div>
          <button
            onClick={() => setShowEchoTip(false)}
            className="text-slate-400 hover:text-slate-200 ml-3"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* --- Main Call Stage Grid & Side Drawer --- */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Left / Center Grid Area */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto flex flex-col justify-center">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl mx-auto w-full">
            {/* 🌟 SUNNY AI PARTICIPANT TILE */}
            <div
              className={`relative rounded-2xl bg-gradient-to-b from-slate-900 to-slate-900/90 border transition-all duration-300 overflow-hidden flex flex-col items-center justify-center p-6 min-h-[220px] aspect-video sm:aspect-square ${
                sunnyStatus === 'speaking'
                  ? 'border-amber-400 shadow-lg shadow-amber-500/20 ring-2 ring-amber-400/40'
                  : 'border-slate-800 hover:border-slate-700'
              }`}
            >
              {/* AI Badge */}
              <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-semibold">
                <Sparkles className="w-3 h-3 text-amber-400" />
                <span>AI Participant</span>
              </div>

              {/* Dialect / Persona Badge */}
              <div className="absolute top-3 right-3 text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700">
                Marathwada Companion
              </div>

              {/* Sunny Avatar & Speaking Equalizer */}
              <div className="relative my-auto flex flex-col items-center">
                <div
                  className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center relative transition-transform ${
                    sunnyStatus === 'speaking' ? 'scale-105' : ''
                  }`}
                >
                  {/* Glowing rings when speaking */}
                  {sunnyStatus === 'speaking' && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-amber-500/20 animate-ping"></div>
                      <div className="absolute -inset-2 rounded-full border-2 border-amber-400/60 animate-pulse"></div>
                    </>
                  )}

                  <div className="w-full h-full rounded-full bg-gradient-to-tr from-amber-500 via-orange-500 to-yellow-400 p-1 shadow-md">
                    <div className="w-full h-full rounded-full bg-slate-900 flex items-center justify-center text-3xl">
                      🌟
                    </div>
                  </div>
                </div>

                <h3 className="mt-3 text-base font-bold text-white tracking-tight flex items-center gap-1.5">
                  Sunny (सन्नी)
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {sunnyStatus === 'speaking' ? (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Volume2 className="w-3.5 h-3.5 animate-bounce" /> Speaking in Marathi...
                    </span>
                  ) : sunnyStatus === 'thinking' ? (
                    <span className="text-purple-400">Reflecting...</span>
                  ) : (
                    'Listening actively'
                  )}
                </p>
              </div>

              {/* Audio Waveform Indicator */}
              <div className="absolute bottom-3 left-0 right-0 px-4 flex items-center justify-center gap-1">
                <div
                  className={`w-1 h-3 rounded-full transition-all duration-150 ${
                    sunnyStatus === 'speaking' ? 'bg-amber-400 h-6 animate-pulse' : 'bg-slate-700'
                  }`}
                />
                <div
                  className={`w-1 h-4 rounded-full transition-all duration-150 ${
                    sunnyStatus === 'speaking' ? 'bg-amber-400 h-8 animate-pulse delay-75' : 'bg-slate-700'
                  }`}
                />
                <div
                  className={`w-1 h-2 rounded-full transition-all duration-150 ${
                    sunnyStatus === 'speaking' ? 'bg-amber-400 h-5 animate-pulse delay-150' : 'bg-slate-700'
                  }`}
                />
                <div
                  className={`w-1 h-5 rounded-full transition-all duration-150 ${
                    sunnyStatus === 'speaking' ? 'bg-amber-400 h-7 animate-pulse delay-100' : 'bg-slate-700'
                  }`}
                />
                <div
                  className={`w-1 h-3 rounded-full transition-all duration-150 ${
                    sunnyStatus === 'speaking' ? 'bg-amber-400 h-4 animate-pulse' : 'bg-slate-700'
                  }`}
                />
              </div>
            </div>

            {/* 👤 HUMAN PARTICIPANT TILES */}
            {humanParticipants.map((p) => {
              const isSpeaking = p.isSpeaking || activeSpeakers.includes(p.identity);
              const stream = p.isLocal ? localStream : remoteStreams.get(p.identity);
              const hasVideo = stream && stream.getVideoTracks().some((t) => t.enabled);

              return (
                <ParticipantTile
                  key={p.identity}
                  participant={p}
                  isSpeaking={isSpeaking}
                  stream={stream || null}
                  hasVideo={Boolean(hasVideo)}
                  isLocal={Boolean(p.isLocal)}
                />
              );
            })}
          </div>
        </div>

        {/* --- Side Drawer (Transcript / Memories / Settings) --- */}
        {activeTab !== 'none' && (
          <aside className="w-80 md:w-96 border-l border-slate-800 bg-slate-900/95 flex flex-col z-20 shrink-0">
            {/* Drawer Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {activeTab === 'transcript' && <MessageSquare className="w-4 h-4 text-indigo-400" />}
                {activeTab === 'memories' && <Bookmark className="w-4 h-4 text-amber-400" />}
                {activeTab === 'settings' && <Settings className="w-4 h-4 text-slate-400" />}
                <h2 className="text-sm font-semibold text-white">
                  {activeTab === 'transcript'
                    ? 'Live Discussion & Chat'
                    : activeTab === 'memories'
                    ? 'Circle Memories & Decisions'
                    : 'Call & Device Settings'}
                </h2>
              </div>
              <button
                onClick={() => setActiveTab('none')}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Tab 1: Live Discussion & Transcript */}
              {activeTab === 'transcript' && (
                <div className="flex flex-col h-full">
                  <div className="flex-1 space-y-3 overflow-y-auto pr-1">
                    {transcriptEntries.length === 0 ? (
                      <div className="text-center py-10 text-slate-500 text-xs">
                        <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p>Realtime spoken transcript and chat will appear here.</p>
                      </div>
                    ) : (
                      transcriptEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className={`p-3 rounded-xl text-xs space-y-1 ${
                            entry.sender === 'sunny'
                              ? 'bg-amber-500/10 border border-amber-500/20 text-slate-200'
                              : entry.sender === 'system'
                              ? 'bg-slate-800/50 text-slate-400 text-[11px] text-center italic'
                              : 'bg-slate-800/90 text-slate-100 border border-slate-700/60'
                          }`}
                        >
                          {entry.sender !== 'system' && (
                            <div className="flex items-center justify-between font-semibold">
                              <span
                                className={
                                  entry.sender === 'sunny' ? 'text-amber-400 flex items-center gap-1' : 'text-indigo-300'
                                }
                              >
                                {entry.sender === 'sunny' && <Sparkles className="w-3 h-3" />}
                                {entry.speakerName || 'Friend'}
                              </span>
                              <span className="text-[10px] text-slate-400 font-normal">{entry.time}</span>
                            </div>
                          )}
                          <p className="leading-relaxed">{entry.text}</p>
                        </div>
                      ))
                    )}
                    <div ref={transcriptEndRef} />
                  </div>

                  {/* Chat Input */}
                  <form onSubmit={handleSendMessage} className="mt-3 flex gap-2 pt-2 border-t border-slate-800">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message or nudge Sunny..."
                      className="flex-1 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim()}
                      className="p-2 rounded-xl bg-indigo-600 text-white disabled:opacity-40 hover:bg-indigo-500 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </form>
                </div>
              )}

              {/* Tab 2: Saved Memories & Highlights */}
              {activeTab === 'memories' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200">
                    <p className="font-semibold flex items-center gap-1 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Sunny Long-term Memory
                    </p>
                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Sunny captures key facts, personal updates, and group decisions made during this call with speaker attribution.
                    </p>
                  </div>

                  {/* Highlights section */}
                  {savedHighlights.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Call Decisions & Action Items
                      </h4>
                      {savedHighlights.map((h) => (
                        <div
                          key={h.id}
                          className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700 text-xs space-y-1"
                        >
                          <div className="flex items-center gap-1.5 font-semibold text-emerald-400 text-[11px]">
                            <CheckCircle className="w-3 h-3" />
                            <span>{h.type}</span>
                          </div>
                          <p className="text-slate-200">{h.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Memories section */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Learned Facts & Preferences ({savedMemories.length})
                    </h4>
                    {savedMemories.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No memories recorded yet in this call.</p>
                    ) : (
                      savedMemories.map((m) => (
                        <div
                          key={m.id}
                          className="p-3 rounded-xl bg-slate-800/90 border border-slate-700/80 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-300">{m.subject}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">
                              {m.personName || 'Group'}
                            </span>
                          </div>
                          <p className="text-slate-200">{m.fact}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Tab 3: Audio & Device Mode Settings */}
              {activeTab === 'settings' && (
                <div className="space-y-5 text-xs">
                  <div>
                    <h4 className="font-semibold text-slate-200 mb-2 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-400" /> Device & Audio Mode Setup
                    </h4>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleSwitchDeviceMode('INDIVIDUAL')}
                        className={`w-full p-3 rounded-xl text-left border transition-all ${
                          deviceMode === 'INDIVIDUAL'
                            ? 'bg-indigo-600/20 border-indigo-500 text-white'
                            : 'bg-slate-800/60 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold mb-1">
                          <span className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-indigo-400" /> Individual Device Mode
                          </span>
                          {deviceMode === 'INDIVIDUAL' && <CheckCircle className="w-4 h-4 text-indigo-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          You are on your own phone/laptop. Sunny attributes your spoken words and saves memories directly under your name (<strong>{currentUser.displayName}</strong>).
                        </p>
                      </button>

                      <button
                        onClick={() => handleSwitchDeviceMode('SHARED_DEVICE')}
                        className={`w-full p-3 rounded-xl text-left border transition-all ${
                          deviceMode === 'SHARED_DEVICE'
                            ? 'bg-amber-600/20 border-amber-500 text-white'
                            : 'bg-slate-800/60 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold mb-1">
                          <span className="flex items-center gap-1.5">
                            <Smartphone className="w-3.5 h-3.5 text-amber-400" /> Shared Physical Device Mode
                          </span>
                          {deviceMode === 'SHARED_DEVICE' && <CheckCircle className="w-4 h-4 text-amber-400" />}
                        </div>
                        <p className="text-[11px] text-slate-400 leading-relaxed">
                          Multiple friends are speaking into this one device together. Sunny will treat speakers as anonymous circle members and never guess identities from voice.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Audio Feedback & Tips */}
                  <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700 space-y-2">
                    <h5 className="font-semibold text-slate-300">Acoustic Echo Prevention</h5>
                    <ul className="text-[11px] text-slate-400 space-y-1 list-disc list-inside">
                      <li>Use headphones whenever possible.</li>
                      <li>Mute when not speaking in noisy rooms.</li>
                      <li>Sunny immediately pauses audio when you speak.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* --- Bottom Controls Bar --- */}
      <footer className="px-6 py-4 bg-slate-900 border-t border-slate-800/90 flex items-center justify-between shrink-0 z-10">
        {/* Left: Device Mode Indicator */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
          <span className="font-medium text-slate-300">Device Mode:</span>
          <button
            onClick={() => handleSwitchDeviceMode(deviceMode === 'INDIVIDUAL' ? 'SHARED_DEVICE' : 'INDIVIDUAL')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] transition-colors"
          >
            {deviceMode === 'INDIVIDUAL' ? (
              <>
                <User className="w-3 h-3 text-indigo-400" /> Individual Device
              </>
            ) : (
              <>
                <Smartphone className="w-3 h-3 text-amber-400" /> Shared Device
              </>
            )}
          </button>
        </div>

        {/* Center: Main AV Controls */}
        <div className="flex items-center gap-3 mx-auto sm:mx-0">
          {/* Mute Button */}
          <button
            onClick={handleToggleMute}
            className={`flex items-center justify-center w-12 h-12 rounded-2xl transition-all shadow-md ${
              isMuted
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-700'
            }`}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Camera Button */}
          <button
            onClick={handleToggleCamera}
            className={`flex items-center justify-center w-12 h-12 rounded-2xl transition-all shadow-md ${
              !isCameraOn
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
            title={isCameraOn ? 'Turn Camera Off' : 'Turn Camera On'}
          >
            {!isCameraOn ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
          </button>

          {/* Copy Join Link Button */}
          <button
            onClick={handleCopyJoinLink}
            className={`flex items-center gap-1.5 px-4 h-12 rounded-2xl font-semibold text-xs transition-all shadow-md active:scale-95 border ${
              copiedLink
                ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="Copy Group Call Join Link"
          >
            {copiedLink ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-300 font-bold">Link Copied!</span>
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4 text-indigo-400" />
                <span className="hidden sm:inline">Copy Join Link</span>
                <span className="sm:hidden">Share</span>
              </>
            )}
          </button>

          {/* Leave Call */}
          <button
            onClick={onLeave}
            className="flex items-center gap-2 px-5 h-12 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all shadow-md ml-1 sm:ml-2"
            title="Leave Call"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Leave</span>
          </button>

          {/* Admin End Call For All */}
          {isHost && (
            <button
              onClick={() => setShowEndModal(true)}
              className="hidden md:flex items-center gap-1.5 px-3 h-12 rounded-2xl bg-slate-800 hover:bg-slate-700 text-rose-400 hover:text-rose-300 border border-slate-700 text-xs font-medium transition-colors"
              title="End Call For Everyone"
            >
              <Shield className="w-4 h-4" />
              <span>End Call</span>
            </button>
          )}
        </div>

        {/* Right: Circle Name / Memory Counter */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
          <span className="flex items-center gap-1 text-[11px] bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            Live WebRTC
          </span>
        </div>
      </footer>

      {/* --- End Call Modal (Admin) --- */}
      {showEndModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-rose-500" /> End Group Call for Everyone?
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              This will disconnect all members from the call and generate final conversation highlights and circle memories with Sunny.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowEndModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleEndCallForEveryone}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white hover:bg-rose-500 text-xs font-semibold"
              >
                End Call for All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Sub-component: Individual Participant Video/Audio Tile ---

interface ParticipantTileProps {
  participant: RoomParticipant;
  isSpeaking: boolean;
  stream: MediaStream | null;
  hasVideo: boolean;
  isLocal: boolean;
}

const ParticipantTile: React.FC<ParticipantTileProps> = ({
  participant,
  isSpeaking,
  stream,
  hasVideo,
  isLocal,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (videoRef.current && stream && hasVideo) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, hasVideo]);

  useEffect(() => {
    if (audioRef.current && stream && !isLocal) {
      audioRef.current.srcObject = stream;
      audioRef.current.play().catch((err) => console.warn('Could not auto-play remote peer audio:', err));
    }
  }, [stream, isLocal]);

  return (
    <div
      className={`relative rounded-2xl bg-slate-900 border transition-all duration-200 overflow-hidden flex flex-col items-center justify-center min-h-[220px] aspect-video sm:aspect-square ${
        isSpeaking
          ? 'border-emerald-400 ring-2 ring-emerald-400/40 shadow-lg shadow-emerald-500/10'
          : 'border-slate-800'
      }`}
    >
      {/* Remote Peer Audio Player */}
      {!isLocal && stream && (
        <audio ref={audioRef} autoPlay playsInline />
      )}

      {/* Video Track Display (if camera active) */}
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        /* Avatar Placeholder */
        <div className="flex flex-col items-center justify-center p-6 text-center">
          <div
            className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full flex items-center justify-center relative ${
              isSpeaking ? 'ring-4 ring-emerald-400' : 'ring-2 ring-slate-700'
            }`}
          >
            {participant.profilePhoto ? (
              <img
                src={participant.profilePhoto}
                alt={participant.displayName}
                referrerPolicy="no-referrer"
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-slate-800 flex items-center justify-center text-2xl font-bold text-slate-300">
                {participant.displayName.charAt(0).toUpperCase()}
              </div>
            )}

            {/* Speaking Wave Ping */}
            {isSpeaking && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 items-center justify-center text-[9px] text-white">
                  🎙
                </span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Top Left: Local Badge & Device Mode */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5">
        {isLocal && (
          <span className="px-2 py-0.5 rounded-md bg-indigo-600/80 text-white font-bold text-[10px] uppercase tracking-wider backdrop-blur-sm">
            YOU
          </span>
        )}
        {participant.deviceMode === 'SHARED_DEVICE' && (
          <span className="px-2 py-0.5 rounded-md bg-amber-500/80 text-slate-950 font-bold text-[10px] flex items-center gap-1 backdrop-blur-sm">
            <Smartphone className="w-2.5 h-2.5" /> Shared Mic
          </span>
        )}
      </div>

      {/* Top Right: Status indicators */}
      <div className="absolute top-3 right-3 flex items-center gap-1">
        {participant.isMuted && (
          <span className="p-1.5 rounded-full bg-rose-600/90 text-white backdrop-blur-sm" title="Muted">
            <MicOff className="w-3 h-3" />
          </span>
        )}
      </div>

      {/* Bottom Name Overlay */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-slate-950/70 backdrop-blur-md border border-slate-800/80">
        <span className="text-xs font-semibold text-white truncate">{participant.displayName}</span>
        {isSpeaking && (
          <span className="text-[10px] font-medium text-emerald-400 flex items-center gap-1 shrink-0">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Speaking
          </span>
        )}
      </div>
    </div>
  );
};
