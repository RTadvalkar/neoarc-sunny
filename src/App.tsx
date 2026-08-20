import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header, NavTab } from './components/Header';
import { SunnyVisualizer } from './components/SunnyVisualizer';
import { UserProfileView } from './components/UserProfileView';
import { ConversationsView } from './components/ConversationsView';
import { GroupsView } from './components/GroupsView';
import { MemoryManager } from './components/MemoryManager';
import { AdminStudioView } from './components/AdminStudioView';
import { AuthModal } from './components/AuthModal';
import { GroupSelector } from './components/GroupSelector';
import { GroupRoomView } from './components/GroupRoomView';
import { AudioController } from './services/audio';
import { WSMessage, ConversationMode, Group, ProfileTemplate, UserProfileValue, GroupConversationSession } from './types';
import {
  Mic,
  MicOff,
  PhoneOff,
  MessageSquare,
  Brain,
  Users,
  Sparkles,
  User,
  ShieldCheck,
  Award,
  RefreshCw,
  LogIn,
  CheckCircle2,
  Clock,
  PhoneCall,
  Video,
  Radio,
  AlertCircle,
  Ban,
  Link2,
} from 'lucide-react';

function SunnyApp() {
  const { currentUser, isAdmin, loginUser } = useAuth();
  const [activeTab, setActiveTab] = useState<NavTab>('voice');

  // Realtime Remote Group Call state (WebRTC Room with Sunny as AI participant)
  const [activeGroupRoom, setActiveGroupRoom] = useState<{
    session: GroupConversationSession;
    group: Group;
    token: string;
  } | null>(null);

  // If user loses admin or is not admin, redirect away from admin tab
  useEffect(() => {
    if (activeTab === 'admin' && !isAdmin) {
      setActiveTab('voice');
    }
  }, [activeTab, isAdmin]);

  // Mode Selection: SOLO vs GROUP
  const [mode, setMode] = useState<ConversationMode>('GROUP');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [groups, setGroups] = useState<Group[]>([]);

  // Group Members (dynamic based on active circle and user)
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  // Live Session state
  const [sessionActive, setSessionActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // User Profile & Onboarding State
  const [template, setTemplate] = useState<ProfileTemplate | null>(null);
  const [profileValues, setProfileValues] = useState<Record<string, UserProfileValue>>({});

  // Invitation State (from URL ?invite=... or /invite/:token)
  const [pendingInvite, setPendingInvite] = useState<{
    token: string;
    groupName: string;
    groupId: string;
    invitedEmail: string;
    invitedByName: string;
  } | null>(null);
  const [inviteSuccessBanner, setInviteSuccessBanner] = useState<string | null>(null);

  // Group Call Deep-Link State (e.g. from /groups/:groupId/call/:sessionId)
  const [pendingGroupCall, setPendingGroupCall] = useState<{
    groupId: string;
    sessionId: string;
  } | null>(null);

  const [groupCallVerification, setGroupCallVerification] = useState<{
    loading: boolean;
    error: string | null;
    group: { id: string; name: string; description?: string } | null;
    session: GroupConversationSession | null;
    isMember: boolean;
    activeParticipants: string[];
  } | null>(null);

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Detect and load invitation or group call from URL params or path on initial mount
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(window.location.search);

      // 1. Check for Group Call Deep-Link: query params (?groupId=...&callSession=...) or path (/groups/:groupId/call/:sessionId)
      const callSessionParam = urlParams.get('callSession') || urlParams.get('call') || urlParams.get('sessionId') || urlParams.get('session');
      const groupIdParam = urlParams.get('groupId') || urlParams.get('group');
      const pathMatchesCall = window.location.pathname.match(/^\/groups\/([^/]+)\/call\/([^/]+)/);

      if (groupIdParam && callSessionParam) {
        setPendingGroupCall({
          groupId: groupIdParam,
          sessionId: callSessionParam,
        });
        setActiveTab('voice');
        return;
      } else if (pathMatchesCall) {
        setPendingGroupCall({
          groupId: pathMatchesCall[1],
          sessionId: pathMatchesCall[2],
        });
        setActiveTab('voice');
        return;
      }

      // 2. Check for Group Invitation: ?invite=... or /invite/:token
      const inviteParam = urlParams.get('invite');
      const pathMatchesInvite = window.location.pathname.match(/^\/(?:invite|join)\/([^/]+)/);
      const token = inviteParam || (pathMatchesInvite ? pathMatchesInvite[1] : null);

      if (token) {
        fetch(`/api/invitations/${token}`)
          .then((res) => {
            if (!res.ok) throw new Error('Invitation not found');
            return res.json();
          })
          .then((inv) => {
            if (inv && inv.token) {
              setPendingInvite({
                token: inv.token,
                groupName: inv.groupName || inv.group?.name || 'Marathwada Katta',
                groupId: inv.groupId,
                invitedEmail: inv.invitedEmail,
                invitedByName: inv.invitedByUserName || 'A Friend',
              });
            }
          })
          .catch((err) => {
            console.warn('Could not load invitation details:', err);
          });
      }
    } catch (e) {
      console.error('Error parsing invitation/call URL:', e);
    }
  }, []);

  // Verify group call session whenever pendingGroupCall or currentUser changes
  useEffect(() => {
    if (!pendingGroupCall) {
      setGroupCallVerification(null);
      return;
    }

    let isCancelled = false;
    setGroupCallVerification((prev) => ({
      loading: true,
      error: null,
      group: prev?.group || null,
      session: prev?.session || null,
      isMember: prev?.isMember || false,
      activeParticipants: prev?.activeParticipants || [],
    }));

    const query = currentUser?.id ? `?userId=${currentUser.id}` : '';
    fetch(`/api/groups/${pendingGroupCall.groupId}/sessions/${pendingGroupCall.sessionId}${query}`)
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'This call is unavailable.');
        }
        return res.json();
      })
      .then((data) => {
        if (isCancelled) return;
        setGroupCallVerification({
          loading: false,
          error: null,
          group: data.group || null,
          session: data.session || null,
          isMember: !!data.isMember,
          activeParticipants: Array.isArray(data.activeParticipants) ? data.activeParticipants : [],
        });
      })
      .catch((err) => {
        if (isCancelled) return;
        setGroupCallVerification({
          loading: false,
          error: err.message || 'This call is unavailable.',
          group: null,
          session: null,
          isMember: false,
          activeParticipants: [],
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [pendingGroupCall, currentUser?.id]);

  const [isAcceptingDirect, setIsAcceptingDirect] = useState(false);

  // Direct 1-click accept handler
  const handleDirectAcceptInvite = async () => {
    if (!pendingInvite) return;
    setIsAcceptingDirect(true);
    try {
      const res = await fetch(`/api/invitations/${pendingInvite.token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingInvite.invitedEmail,
          displayName: pendingInvite.invitedEmail.split('@')[0].replace(/[._-]/g, ' '),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          await loginUser(data.user.email, data.user.displayName);
        }
        setInviteSuccessBanner(`🎉 You have successfully joined "${pendingInvite.groupName}"!`);
        setSelectedGroupId(pendingInvite.groupId);
        setMode('GROUP');
        setActiveTab('voice');
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        setPendingInvite(null);
        setTimeout(() => setInviteSuccessBanner(null), 8000);
      }
    } catch (e) {
      console.error('Error accepting invitation directly:', e);
    } finally {
      setIsAcceptingDirect(false);
    }
  };

  // Reject invitation handler
  const handleRejectInvite = async () => {
    if (!pendingInvite) return;
    try {
      await fetch(`/api/invitations/${pendingInvite.token}/reject`, {
        method: 'POST',
      });
    } catch (e) {
      console.error('Error rejecting invitation:', e);
    }
    setPendingInvite(null);
    setInviteSuccessBanner('Invitation declined.');
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    setTimeout(() => setInviteSuccessBanner(null), 4000);
  };

  // Auto-accept invitation when user is authenticated
  useEffect(() => {
    if (currentUser && pendingInvite) {
      fetch(`/api/invitations/${pendingInvite.token}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      })
        .then((res) => res.json())
        .then(() => {
          setInviteSuccessBanner(`🎉 You have successfully joined "${pendingInvite.groupName}"!`);
          setSelectedGroupId(pendingInvite.groupId);
          setMode('GROUP');
          // Refresh groups list
          fetch(`/api/groups?userId=${currentUser.id}`)
            .then((r) => r.json())
            .then((g) => {
              if (Array.isArray(g)) setGroups(g);
            });
          // Clean up URL without reloading
          const cleanUrl = window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
          setPendingInvite(null);
          setTimeout(() => setInviteSuccessBanner(null), 8000);
        })
        .catch((err) => {
          console.error('Error auto-accepting invitation:', err);
        });
    }
  }, [currentUser?.id, pendingInvite?.token]);

  // Auto-close Auth Modal when user successfully signs in
  const prevUserRef = useRef(currentUser);
  useEffect(() => {
    if (!prevUserRef.current && currentUser) {
      setIsAuthModalOpen(false);
      // Initialize selected members with current user's name if empty
      if (selectedMembers.length === 0) {
        setSelectedMembers([currentUser.displayName.split(' ')[0]]);
      }
    }
    prevUserRef.current = currentUser;
  }, [currentUser]);

  // Fetch template and user profile values for onboarding status
  const fetchProfileAndTemplate = async () => {
    if (!currentUser) return;
    try {
      const [tplRes, valRes] = await Promise.all([
        fetch('/api/templates/published'),
        fetch(`/api/profiles/${currentUser.id}`),
      ]);
      if (tplRes.ok) setTemplate(await tplRes.json());
      if (valRes.ok) setProfileValues(await valRes.json());
    } catch (err) {
      console.error('Error loading profile/template in App:', err);
    }
  };

  useEffect(() => {
    fetchProfileAndTemplate();
  }, [currentUser?.id]);

  // Live notifications (Memories, Highlights, Profile fields)
  const [notification, setNotification] = useState<{ text: string; type: 'memory' | 'profile' | 'highlight' } | null>(null);

  // Transcripts
  const [transcripts, setTranscripts] = useState<
    { sender: 'user' | 'sunny' | 'system'; text: string; time: string }[]
  >([]);

  // Refs for Audio & WebSocket
  const audioControllerRef = useRef<AudioController | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);

  // Fetch groups
  useEffect(() => {
    if (currentUser) {
      fetch(`/api/groups?userId=${currentUser.id}`)
        .then((res) => res.json())
        .then((data: Group[]) => {
          if (Array.isArray(data)) {
            setGroups(data);
            if (data.length > 0) {
              setSelectedGroupId((prev) => (prev && data.some((g) => g.id === prev) ? prev : data[0].id));
            }
          }
        })
        .catch(console.error);
    }
  }, [currentUser?.id]);

  // Start or Join a Realtime Remote Group Call (WebRTC room where Sunny is an AI Participant)
  const startOrJoinGroupRoom = async (groupId?: string, specificSessionId?: string) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    setIsConnecting(true);
    setErrorMessage(undefined);
    try {
      // 1. Resolve valid target group ID
      let targetGroupId = (groupId || selectedGroupId || '').trim();
      let currentGroups = groups;

      // If no valid group in state, fetch the latest user groups
      if (!targetGroupId || !currentGroups.some((g) => g.id === targetGroupId)) {
        try {
          const res = await fetch(`/api/groups?userId=${currentUser.id}`);
          if (res.ok) {
            const data: Group[] = await res.json();
            if (Array.isArray(data) && data.length > 0) {
              currentGroups = data;
              setGroups(data);
              if (!targetGroupId || !data.some((g) => g.id === targetGroupId)) {
                targetGroupId = data[0].id;
                setSelectedGroupId(targetGroupId);
              }
            }
          }
        } catch (fetchErr) {
          console.warn('Could not refresh groups list:', fetchErr);
        }
      }

      if (!targetGroupId) {
        setActiveTab('groups');
        throw new Error('Please select or create a Circle (कट्टा / मंडळ) first to start a group call with Sunny.');
      }

      let session: GroupConversationSession;

      if (specificSessionId) {
        // Fetch specific session details
        const sessRes = await fetch(`/api/groups/${targetGroupId}/sessions/${specificSessionId}?userId=${currentUser.id}`);
        if (!sessRes.ok) {
          const err = await sessRes.json().catch(() => ({}));
          throw new Error(err.error || 'This call is unavailable.');
        }
        const sessData = await sessRes.json();
        if (!sessData.isMember) {
          throw new Error('You are not a member of this group. Only accepted group members can join this call.');
        }
        if (sessData.session.status !== 'LIVE' && sessData.session.status !== 'STARTING') {
          throw new Error('This call has ended.');
        }
        session = sessData.session;
      } else {
        // Start or get active session
        const startRes = await fetch(`/api/groups/${targetGroupId}/sessions/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id }),
        });
        if (!startRes.ok) {
          const err = await startRes.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to start group call session');
        }
        const startData = await startRes.json();
        session = startData.session;
      }

      // Fetch participant join token
      const tokenRes = await fetch(`/api/groups/${targetGroupId}/sessions/${session.id}/join-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to obtain group join token');
      }
      const tokenData = await tokenRes.json();

      const targetGroup = currentGroups.find((g) => g.id === targetGroupId) || {
        id: targetGroupId,
        name: session.groupName || 'Friend Circle',
        createdAt: '',
        updatedAt: '',
        ownerUserId: '',
      };

      setActiveGroupRoom({
        session,
        group: targetGroup,
        token: tokenData.token,
      });
      setActiveTab('voice');
      setPendingGroupCall(null);
      setGroupCallVerification(null);
      // Clean URL back to root
      window.history.replaceState({}, document.title, '/');
    } catch (err: any) {
      console.error('Error joining group room:', err);
      setErrorMessage(err.message || 'Could not connect to group room.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDismissGroupCallLobby = () => {
    setPendingGroupCall(null);
    setGroupCallVerification(null);
    window.history.replaceState({}, document.title, '/');
  };

  const handleOpenGroupFromEndedCall = (groupId: string) => {
    setSelectedGroupId(groupId);
    setActiveTab('groups');
    handleDismissGroupCallLobby();
  };

  const handleJoinFromCallLobby = () => {
    if (!pendingGroupCall) return;
    startOrJoinGroupRoom(pendingGroupCall.groupId, pendingGroupCall.sessionId);
  };

  // Fetch active circle members dynamically
  useEffect(() => {
    if (selectedGroupId) {
      fetch(`/api/groups/${selectedGroupId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data && Array.isArray(data.members) && data.members.length > 0) {
            const memberNames = data.members.map((m: any) => m.displayName || m.name || m.user?.displayName).filter(Boolean);
            if (memberNames.length > 0) {
              setSelectedMembers(memberNames);
            }
          }
        })
        .catch(console.error);
    }
  }, [selectedGroupId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      endSession();
    };
  }, []);

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (audioControllerRef.current) {
      audioControllerRef.current.setMuted(nextMuted);
    }
  };

  const showNotificationToast = (text: string, type: 'memory' | 'profile' | 'highlight') => {
    setNotification({ text, type });
    setTimeout(() => setNotification(null), 6000);
  };

  // Start Live Voice Session
  const startSession = async () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    setIsConnecting(true);
    setErrorMessage(undefined);
    setTranscripts([]);

    try {
      // 1. Audio Controller
      const controller = new AudioController((base64Pcm) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'audio', audio: base64Pcm }));
        }
      });
      audioControllerRef.current = controller;

      await controller.initOutputAudio();
      await controller.startMicrophone();

      // 2. Connect WebSocket with Mode & Authentication parameters
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const userId = currentUser?.id || 'user-rushi';
      const userName = currentUser?.displayName || 'Friend';
      const userEmail = currentUser?.email || '';

      const queryParams = new URLSearchParams({
        mode,
        userId,
        userName,
        userEmail,
        ...(mode === 'GROUP' ? { groupId: selectedGroupId, members: selectedMembers.join(',') } : {}),
      });

      const wsUrl = `${protocol}//${window.location.host}/live?${queryParams.toString()}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Connected to Sunny Live WS');
        setIsConnecting(false);
        setIsReconnecting(false);
        setSessionActive(true);
        setStatus('listening');
        reconnectAttempts.current = 0;
        addTranscript(
          'system',
          mode === 'SOLO'
            ? `Sunny joined 1-on-1 friendly session with ${userName}.`
            : `Sunny joined circle conversation with friends (सन्नी मित्र मंडळात आला).`
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);

          if (msg.type === 'audio' && msg.audio) {
            setStatus('speaking');
            controller.playAudioChunk(msg.audio);
          } else if (msg.type === 'interrupted') {
            controller.stopPlayback();
            setStatus('listening');
          } else if (msg.type === 'turnComplete') {
            setStatus('listening');
          } else if (msg.type === 'text' && msg.text) {
            addTranscript('sunny', msg.text);
          } else if (msg.type === 'memory_saved' && msg.memory) {
            const memText = `Saved Memory: [${msg.memory.personName || 'Group'}] ${msg.memory.fact}`;
            addTranscript('system', `💡 ${memText}`);
            showNotificationToast(memText, 'memory');
          } else if (msg.type === 'profile_field_saved' && msg.profileValue) {
            const profText = `Learned Profile: ${msg.profileValue.fieldKey} = "${msg.profileValue.value}"`;
            addTranscript('system', `✨ ${profText}`);
            showNotificationToast(profText, 'profile');
            setProfileValues((prev) => ({
              ...prev,
              [msg.profileValue.fieldKey]: msg.profileValue,
            }));
          } else if (msg.type === 'highlight_saved' && msg.highlight) {
            const hlText = `Recorded ${msg.highlight.type}: ${msg.highlight.text}`;
            addTranscript('system', `📌 ${hlText}`);
            showNotificationToast(hlText, 'highlight');
          } else if (msg.type === 'error') {
            setErrorMessage(msg.message);
            setStatus('idle');
          }
        } catch (e) {
          console.error('Error handling WS message:', e);
        }
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setErrorMessage('Voice connection error. Please check mic permissions or Gemini API key.');
        setIsConnecting(false);
      };

      ws.onclose = () => {
        console.log('WebSocket connection closed');
        if (sessionActive && reconnectAttempts.current < 3) {
          // Attempt automatic graceful reconnect
          reconnectAttempts.current += 1;
          setIsReconnecting(true);
          setTimeout(() => {
            if (sessionActive) startSession();
          }, 2000);
        } else {
          setSessionActive(false);
          setStatus('idle');
          setIsReconnecting(false);
        }
      };
    } catch (err: any) {
      console.error('Failed to start live session:', err);
      setErrorMessage(err.message || 'Microphone access denied or audio device error.');
      setIsConnecting(false);
      endSession();
    }
  };

  const endSession = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (audioControllerRef.current) {
      audioControllerRef.current.stopAll();
      audioControllerRef.current = null;
    }
    setSessionActive(false);
    setStatus('idle');
    setIsMuted(false);
    setIsReconnecting(false);
  };

  const addTranscript = (sender: 'user' | 'sunny' | 'system', text: string) => {
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setTranscripts((prev) => [...prev, { sender, text, time: timeStr }]);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#F5F5F5] flex flex-col font-sans selection:bg-[#F27D26] selection:text-black">
      {/* Header */}
      <Header
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        isLiveActive={sessionActive}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        {/* Invitation Success Toast Banner */}
        {inviteSuccessBanner && (
          <div className="fixed top-20 z-50 left-1/2 transform -translate-x-1/2 w-full max-w-md px-4 animate-bounce">
            <div className="bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 px-4 py-3 rounded-2xl text-xs font-bold text-center shadow-2xl flex items-center justify-center space-x-2 backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{inviteSuccessBanner}</span>
            </div>
          </div>
        )}

        {/* Pending Invitation Welcome Card (When unauthenticated) */}
        {pendingInvite && !currentUser && (
          <div className="w-full max-w-lg mb-6 bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-zinc-900 border border-amber-500/40 rounded-3xl p-5 text-left space-y-4 shadow-2xl animate-fadeIn relative z-20">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                  Group Invitation (कट्टा आमंत्रण)
                </p>
                <h3 className="text-sm font-bold text-zinc-100 truncate">
                  Join "{pendingInvite.groupName}"
                </h3>
              </div>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              <strong>{pendingInvite.invitedByName}</strong> has invited <strong>{pendingInvite.invitedEmail}</strong> to hang out in their friendship circle on Sunny!
            </p>
            <div className="pt-1 flex flex-col sm:flex-row items-center gap-2">
              <button
                onClick={handleDirectAcceptInvite}
                disabled={isAcceptingDirect}
                className="w-full sm:flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold text-xs rounded-xl shadow transition flex items-center justify-center space-x-2"
              >
                {isAcceptingDirect ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-zinc-950" />
                )}
                <span>{isAcceptingDirect ? 'Joining...' : 'Accept Invitation & Join'}</span>
              </button>
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="w-full sm:w-auto px-3 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs rounded-xl transition flex items-center justify-center space-x-1.5"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Sign In</span>
              </button>
              <button
                onClick={handleRejectInvite}
                className="w-full sm:w-auto px-3 py-2.5 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-semibold text-xs rounded-xl transition"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Active Floating Banner if user is in a group call but navigating other tabs */}
        {activeGroupRoom && activeTab !== 'voice' && (
          <div className="w-full max-w-5xl mx-auto mb-4 p-3 bg-emerald-950/80 border border-emerald-500/40 rounded-2xl flex items-center justify-between shadow-lg animate-fadeIn">
            <div className="flex items-center space-x-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-emerald-200">
                Live Group Call in Progress: <strong>{activeGroupRoom.group.name}</strong> (Sunny is in room)
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setActiveTab('voice')}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold rounded-xl transition"
              >
                Return to Call
              </button>
              <button
                onClick={() => setActiveGroupRoom(null)}
                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition"
              >
                Leave
              </button>
            </div>
          </div>
        )}

        {activeTab === 'profile' && <UserProfileView />}
        {activeTab === 'conversations' && <ConversationsView />}
        {activeTab === 'groups' && <GroupsView onStartGroupCall={startOrJoinGroupRoom} />}
        {activeTab === 'memory' && <MemoryManager standalone />}
        {activeTab === 'admin' && isAdmin && <AdminStudioView />}

        {/* Live Voice Studio Tab */}
        {activeTab === 'voice' && (
          <div className="w-full flex-1 flex flex-col items-center justify-center">
            {activeGroupRoom && currentUser ? (
              <GroupRoomView
                currentUser={currentUser}
                group={activeGroupRoom.group}
                session={activeGroupRoom.session}
                token={activeGroupRoom.token}
                onLeave={() => setActiveGroupRoom(null)}
                onSessionEnded={() => setActiveGroupRoom(null)}
              />
            ) : pendingGroupCall ? (
              /* Group Call Deep-Link Join Lobby */
              <div className="w-full max-w-lg flex flex-col items-center space-y-6 text-center py-6 relative z-10 animate-fadeIn">
                {/* Glow */}
                <div className="absolute w-[420px] h-[420px] bg-[#F27D26] rounded-full blur-[140px] opacity-15 pointer-events-none -z-10" />

                {/* Header */}
                <div className="space-y-2">
                  <div className="w-18 h-18 mx-auto rounded-3xl bg-gradient-to-br from-[#FF9D52] to-[#F27D26] flex items-center justify-center text-zinc-950 text-3xl font-black shadow-[0_0_50px_rgba(242,125,38,0.4)] border border-white/20">
                    S
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    Sunny (सन्नी)
                  </h2>
                  <p className="text-xs text-amber-400 font-bold flex items-center justify-center gap-1.5">
                    <PhoneCall className="w-3.5 h-3.5" /> Group Call Lobby
                  </p>
                </div>

                {!currentUser ? (
                  /* Unauthenticated Member Prompt */
                  <div className="w-full bg-zinc-900/90 p-6 rounded-3xl border border-zinc-800 text-left space-y-4 shadow-xl">
                    <div className="flex items-center space-x-2 text-xs font-bold text-amber-400">
                      <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                      <span>Sign In Required to Join Call</span>
                    </div>
                    <p className="text-xs text-zinc-300 leading-relaxed">
                      You opened a direct join link for a Sunny group call. Sign in with Google or Email to verify your group membership and join the conversation.
                    </p>
                    <div className="space-y-2 pt-2">
                      <button
                        onClick={() => setIsAuthModalOpen(true)}
                        className="w-full py-3.5 bg-[#F27D26] hover:bg-[#ff8a38] text-slate-950 font-black text-sm rounded-2xl transition-all shadow-lg flex items-center justify-center space-x-2"
                      >
                        <LogIn className="w-4 h-4" />
                        <span>Continue with Google (लॉग इन करा)</span>
                      </button>
                      <button
                        onClick={handleDismissGroupCallLobby}
                        className="w-full py-2.5 bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 font-semibold text-xs rounded-xl transition"
                      >
                        Cancel and go to Home
                      </button>
                    </div>
                  </div>
                ) : groupCallVerification?.loading ? (
                  /* Verification Loading */
                  <div className="w-full bg-zinc-900/90 p-8 rounded-3xl border border-zinc-800 text-center space-y-4 shadow-xl">
                    <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
                    <h3 className="text-sm font-bold text-zinc-100">Verifying Group Call Session...</h3>
                    <p className="text-xs text-zinc-400">Checking group membership and active room status.</p>
                  </div>
                ) : groupCallVerification?.error ? (
                  /* Invalid Session or Tampering */
                  <div className="w-full bg-zinc-900/90 p-6 rounded-3xl border border-zinc-800 text-center space-y-4 shadow-xl">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-white">This call is unavailable.</h3>
                      <p className="text-xs text-zinc-400">The call link may have expired or is invalid.</p>
                    </div>
                    <button
                      onClick={handleDismissGroupCallLobby}
                      className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl transition"
                    >
                      Go to Sunny Home
                    </button>
                  </div>
                ) : groupCallVerification && !groupCallVerification.isMember ? (
                  /* Not an Active Group Member */
                  <div className="w-full bg-zinc-900/90 p-6 rounded-3xl border border-zinc-800 text-center space-y-4 shadow-xl">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
                      <Ban className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-bold text-white">You are not a member of this group.</h3>
                      <p className="text-xs text-zinc-300">
                        Only accepted group members can join this call{groupCallVerification.group?.name ? ` for "${groupCallVerification.group.name}"` : ''}.
                      </p>
                    </div>
                    <button
                      onClick={handleDismissGroupCallLobby}
                      className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold text-xs rounded-xl transition"
                    >
                      Go Back
                    </button>
                  </div>
                ) : groupCallVerification && groupCallVerification.session?.status !== 'LIVE' && groupCallVerification.session?.status !== 'STARTING' ? (
                  /* Call Has Ended */
                  <div className="w-full bg-zinc-900/90 p-6 rounded-3xl border border-zinc-800 text-center space-y-4 shadow-xl">
                    <div className="w-12 h-12 rounded-2xl bg-zinc-800 text-zinc-400 flex items-center justify-center mx-auto border border-zinc-700">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div className="space-y-1.5">
                      <h3 className="text-base font-bold text-white">This call has ended.</h3>
                      <p className="text-xs text-zinc-400">
                        The live call for "{groupCallVerification.group?.name || 'Circle'}" is no longer active.
                      </p>
                    </div>
                    <div className="space-y-2 pt-2">
                      {groupCallVerification.group && (
                        <button
                          onClick={() => handleOpenGroupFromEndedCall(groupCallVerification.group!.id)}
                          className="w-full py-3 bg-[#F27D26] hover:bg-[#ff8a38] text-slate-950 font-bold text-xs rounded-xl transition shadow-md"
                        >
                          Open {groupCallVerification.group.name}
                        </button>
                      )}
                      <button
                        onClick={handleDismissGroupCallLobby}
                        className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs rounded-xl transition"
                      >
                        Back to Home
                      </button>
                    </div>
                  </div>
                ) : groupCallVerification && groupCallVerification.isMember && (groupCallVerification.session?.status === 'LIVE' || groupCallVerification.session?.status === 'STARTING') ? (
                  /* Valid Active Member & Live Call */
                  <div className="w-full bg-zinc-900/90 border border-emerald-500/40 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl animate-fadeIn relative z-10">
                    <div className="flex items-center justify-center gap-2">
                      <span className="flex h-3 w-3 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                      </span>
                      <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Live Call in Progress</span>
                    </div>

                    <div className="space-y-2">
                      <h2 className="text-2xl font-black text-white">{groupCallVerification.group?.name || 'Weekend Gang'}</h2>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {groupCallVerification.activeParticipants.length > 0
                          ? `${groupCallVerification.activeParticipants.join(', ')} and Sunny are in the call.`
                          : 'Sunny is waiting in the room for the circle!'}
                      </p>
                    </div>

                    <div className="space-y-3 pt-2">
                      <button
                        onClick={handleJoinFromCallLobby}
                        disabled={isConnecting}
                        className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-base rounded-2xl shadow-[0_0_30px_rgba(16,185,129,0.35)] transition-all transform active:scale-[0.98] flex items-center justify-center space-x-2 disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <>
                            <RefreshCw className="w-5 h-5 animate-spin text-slate-950" />
                            <span>Connecting to Room...</span>
                          </>
                        ) : activeGroupRoom?.session.id === groupCallVerification.session?.id ? (
                          <>
                            <PhoneCall className="w-5 h-5 text-slate-950" />
                            <span>Return to Call</span>
                          </>
                        ) : (
                          <>
                            <PhoneCall className="w-5 h-5 text-slate-950" />
                            <span>Join Call (कट्ट्यावर सामील व्हा)</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleDismissGroupCallLobby}
                        className="text-xs text-zinc-400 hover:text-zinc-200 transition font-medium"
                      >
                        Cancel and return to Home
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : !currentUser ? (
              /* Auth Required Landing Card (Start Voice Session is hidden until signed in) */
              <div className="w-full max-w-lg flex flex-col items-center space-y-6 text-center py-6 relative z-10 animate-fadeIn">
                {/* Glow */}
                <div className="absolute w-[420px] h-[420px] bg-[#F27D26] rounded-full blur-[140px] opacity-15 pointer-events-none -z-10" />

                {/* Hero Title */}
                <div className="space-y-2">
                  <div className="w-18 h-18 mx-auto rounded-3xl bg-gradient-to-br from-[#FF9D52] to-[#F27D26] flex items-center justify-center text-zinc-950 text-3xl font-black shadow-[0_0_50px_rgba(242,125,38,0.4)] border border-white/20">
                    S
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    Sunny (सन्नी)
                  </h2>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    Marathwada Companion • Speaks authentic Marathi with Marathwada dialect
                  </p>
                </div>

                {/* Authentication Requirement Box */}
                <div className="w-full bg-zinc-900/80 p-5 rounded-3xl border border-zinc-800 text-left space-y-4 shadow-xl">
                  <div className="flex items-center space-x-2 text-xs font-bold text-amber-400">
                    <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Sign In Required to Start Voice Session</span>
                  </div>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    Sunny is your friendly companion who speaks authentic Marathwada Marathi, remembers personal moments, and hangs out with your circle. Sign in to start talking.
                  </p>
                  <div className="grid grid-cols-1 gap-2 pt-1">
                    <div className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-300">
                      <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <span><strong>Solo Mode:</strong> 1-on-1 friendly conversation in authentic Marathwada Marathi.</span>
                    </div>
                    <div className="flex items-start space-x-2.5 p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-[11px] text-zinc-300">
                      <Users className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span><strong>Friend in Circle:</strong> Actively listens and speaks warmly only when called with <em>"Sunny"</em> or <em>"सन्नी"</em>.</span>
                    </div>
                  </div>
                </div>

                {/* Primary Action to Sign In */}
                <div className="w-full space-y-3 pt-1">
                  <button
                    onClick={() => setIsAuthModalOpen(true)}
                    className="w-full py-4 bg-[#F27D26] hover:bg-[#ff8a38] text-black font-extrabold text-base rounded-2xl shadow-[0_0_30px_rgba(242,125,38,0.35)] transition-all transform active:scale-[0.98] flex items-center justify-center space-x-2.5"
                  >
                    <LogIn className="w-5 h-5 text-black" />
                    <span>Sign In to Start Voice Session (लॉग इन करा)</span>
                  </button>
                  <p className="text-[11px] text-white/40">
                    Sign in with Google OAuth or Email account to unlock voice sessions
                  </p>
                </div>
              </div>
            ) : !sessionActive ? (
              /* Idle / Mode Setup Card (For Authenticated Users) */
              <div className="w-full max-w-lg flex flex-col items-center space-y-6 text-center py-6 relative z-10 animate-fadeIn">
                {/* Glow */}
                <div className="absolute w-[420px] h-[420px] bg-[#F27D26] rounded-full blur-[140px] opacity-15 pointer-events-none -z-10" />

                {/* Hero Title */}
                <div className="space-y-2">
                  <div className="w-18 h-18 mx-auto rounded-3xl bg-gradient-to-br from-[#FF9D52] to-[#F27D26] flex items-center justify-center text-zinc-950 text-3xl font-black shadow-[0_0_50px_rgba(242,125,38,0.4)] border border-white/20">
                    S
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-white">
                    Sunny (सन्नी)
                  </h2>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                    Marathwada Companion • Speaks authentic Marathi with Marathwada dialect
                  </p>
                </div>

                {/* Mode Selector Pill: Solo vs Group */}
                <div className="w-full bg-zinc-900/80 p-1.5 rounded-2xl border border-zinc-800 flex items-center">
                  <button
                    onClick={() => setMode('SOLO')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition ${
                      mode === 'SOLO'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <User className="w-4 h-4" />
                    <span>Solo Mode (1-on-1 गप्पा)</span>
                  </button>
                  <button
                    onClick={() => setMode('GROUP')}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition ${
                      mode === 'GROUP'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>Group Mode (मित्र मंडळ)</span>
                  </button>
                </div>

                {/* Mode Explanation & Onboarding Checklist */}
                {mode === 'SOLO' ? (
                  <div className="w-full space-y-3">
                    <div className="w-full p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-left space-y-1.5">
                      <p className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                        Friendly 1-on-1 Conversation (एकास एक संवाद)
                      </p>
                      <p className="text-[11px] text-zinc-300 leading-relaxed">
                        Sunny will talk with <strong>{currentUser?.displayName || 'you'}</strong> as a close friend in authentic Marathwada Marathi, asking your background and remembering shared moments.
                      </p>
                    </div>

                    {/* Live Onboarding Checklist Card */}
                    <div className="w-full p-4 rounded-2xl bg-zinc-900/90 border border-zinc-800 text-left space-y-3 shadow-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Brain className="w-4 h-4 text-amber-400" />
                          <span className="text-xs font-bold text-zinc-100">
                            Sunny's Background Onboarding (ओळख व पार्श्वभूमी)
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                            template && template.fields.filter(f => f.active).every(f => !!profileValues[f.fieldKey]?.value)
                              ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          {template
                            ? `${template.fields.filter(f => f.active && !!profileValues[f.fieldKey]?.value).length}/${template.fields.filter(f => f.active).length} Ticked`
                            : 'Loading...'}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2 pt-0.5">
                        {template?.fields.filter(f => f.active).map((field) => {
                          const val = profileValues[field.fieldKey]?.value;
                          const isAnswered = !!val;
                          return (
                            <div
                              key={field.id}
                              className={`p-2.5 rounded-xl border flex items-start space-x-2.5 text-xs transition-all ${
                                isAnswered
                                  ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                                  : 'bg-zinc-950/50 border-zinc-800 text-zinc-400'
                              }`}
                            >
                              <div className="mt-0.5 shrink-0">
                                {isAnswered ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Clock className="w-4 h-4 text-amber-400/70" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`font-semibold text-xs ${isAnswered ? 'text-zinc-100' : 'text-zinc-300'}`}>
                                    {field.label}
                                  </span>
                                  <span
                                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border shrink-0 ${
                                      isAnswered
                                        ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
                                        : 'text-amber-300 bg-amber-500/10 border-amber-500/30'
                                    }`}
                                  >
                                    {isAnswered ? 'Ticked ✅' : 'Required'}
                                  </span>
                                </div>
                                <p className="text-[11px] truncate text-zinc-400 mt-0.5">
                                  {isAnswered ? `"${val}"` : field.initialPrompt}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {template && !template.fields.filter(f => f.active).every(f => !!profileValues[f.fieldKey]?.value) ? (
                        <p className="text-[10px] text-amber-300/80 italic leading-relaxed pt-0.5">
                          🔒 Sunny asks these quick questions on first call and ticks them off without grilling. Full chat unlocks once answered.
                        </p>
                      ) : (
                        <p className="text-[10px] text-emerald-300/80 italic leading-relaxed pt-0.5">
                          ✨ All onboarding questions answered! Sunny remembers your background and profile.
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="w-full space-y-4">
                    {/* Select Group & Select Members in Today */}
                    <GroupSelector
                      groups={groups}
                      selectedGroupId={selectedGroupId}
                      onSelectGroup={(id) => setSelectedGroupId(id)}
                      selectedMembers={selectedMembers}
                      onChangeSelectedMembers={setSelectedMembers}
                      onNavigateToCircles={() => setActiveTab('groups')}
                    />

                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-left text-[11px] text-zinc-300">
                      🛡️ <strong>Safety Rule:</strong> Sunny will actively listen and capture notes/highlights, but will <strong>NEVER speak</strong> unless someone calls out <em>"Sunny"</em> or <em>"सन्नी"</em>.
                    </div>
                  </div>
                )}

                {/* Start Session Buttons */}
                <div className="w-full space-y-3 pt-2">
                  {mode === 'GROUP' ? (
                    <div className="space-y-2.5">
                      <button
                        onClick={() => startOrJoinGroupRoom(selectedGroupId)}
                        disabled={isConnecting}
                        className="w-full py-4 bg-[#F27D26] hover:bg-[#ff8a38] text-black font-black text-sm sm:text-base rounded-2xl shadow-[0_0_30px_rgba(242,125,38,0.35)] transition-all transform active:scale-[0.98] flex items-center justify-center space-x-2 disabled:opacity-50"
                      >
                        {isConnecting ? (
                          <>
                            <Sparkles className="w-5 h-5 animate-spin text-black" />
                            <span>Connecting Group Room...</span>
                          </>
                        ) : (
                          <>
                            <PhoneCall className="w-5 h-5 text-black" />
                            <span>Join Remote Group Call (WebRTC Call with Sunny)</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={startSession}
                        disabled={isConnecting}
                        className="w-full py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-bold text-xs rounded-xl transition flex items-center justify-center space-x-2 disabled:opacity-50"
                      >
                        <Mic className="w-4 h-4 text-emerald-400" />
                        <span>In-Person Single Device Table Mode (एकत्रित टेबल संवाद)</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={startSession}
                      disabled={isConnecting}
                      className="w-full py-4 bg-[#F27D26] hover:bg-[#ff8a38] text-black font-extrabold text-base rounded-2xl shadow-[0_0_30px_rgba(242,125,38,0.35)] transition-all transform active:scale-[0.98] flex items-center justify-center space-x-2 disabled:opacity-50"
                    >
                      {isConnecting ? (
                        <>
                          <Sparkles className="w-5 h-5 animate-spin text-black" />
                          <span>Connecting Live Session...</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-5 h-5 text-black" />
                          <span>Start Voice Session (बोलणं सुरू करा)</span>
                        </>
                      )}
                    </button>
                  )}

                  <p className="text-[11px] text-white/40 italic">
                    {mode === 'SOLO'
                      ? `"काय ${currentUser?.displayName || 'मित्रा'}, काय चाललंय आज?"`
                      : `"काय मंडळी, काय चाललंय? Sunny तुमच्या गप्पांमध्ये सहभागी होण्यास तयार आहे!"`}
                  </p>
                </div>
              </div>
            ) : (
              /* Active Live Conversation View */
              <div className="w-full max-w-lg flex flex-col items-center justify-between flex-1 py-4 space-y-6 animate-fadeIn">
                {/* Sunny Orb Visualizer */}
                <SunnyVisualizer
                  status={status}
                  isMuted={isMuted}
                  mode={mode}
                  userName={currentUser?.displayName}
                  activeMembers={selectedMembers}
                  isReconnecting={isReconnecting}
                  errorMessage={errorMessage}
                />

                {/* Live Toast Notifications & Onboarding Live Badges */}
                <div className="w-full max-w-md space-y-2 text-center">
                  {notification && (
                    <div
                      className={`px-4 py-2 rounded-2xl text-xs font-semibold shadow-lg animate-bounce flex items-center justify-center space-x-2 border ${
                        notification.type === 'profile'
                          ? 'bg-blue-500/20 border-blue-500/50 text-blue-300'
                          : notification.type === 'highlight'
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-[#F27D26]/20 border-[#F27D26]/50 text-[#F27D26]'
                      }`}
                    >
                      {notification.type === 'profile' ? (
                        <Award className="w-4 h-4 shrink-0" />
                      ) : notification.type === 'highlight' ? (
                        <Sparkles className="w-4 h-4 shrink-0" />
                      ) : (
                        <Brain className="w-4 h-4 shrink-0" />
                      )}
                      <span>{notification.text}</span>
                    </div>
                  )}

                  {/* Solo Live Onboarding Badges */}
                  {mode === 'SOLO' && template && (
                    <div className="flex flex-wrap items-center justify-center gap-1.5 pt-1">
                      {template.fields.filter(f => f.active).map(f => {
                        const isDone = !!profileValues[f.fieldKey]?.value;
                        return (
                          <div
                            key={f.id}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center space-x-1 border transition-all ${
                              isDone
                                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                                : 'bg-zinc-900 border-zinc-800 text-zinc-500'
                            }`}
                          >
                            {isDone ? (
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Clock className="w-3 h-3 text-amber-500/60" />
                            )}
                            <span>{f.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="bg-white/5 border border-white/10 px-3.5 py-1.5 rounded-full text-[11px] text-white/70 inline-flex items-center space-x-2">
                    <span className="w-2 h-2 rounded-full bg-[#F27D26] animate-ping" />
                    <span>
                      {mode === 'SOLO'
                        ? '1-on-1 Conversation with Sunny'
                        : 'Active Listening: Call "Sunny" or "सन्नी" to speak'}
                    </span>
                  </div>
                </div>

                {/* Bottom Live Controls */}
                <footer className="w-full max-w-md px-6 py-4 flex justify-center items-center gap-8 relative z-20">
                  {/* Mute Button */}
                  <button
                    onClick={toggleMute}
                    className="group flex flex-col items-center gap-2 transition-all transform active:scale-95 cursor-pointer"
                  >
                    <div
                      className={`w-18 h-18 rounded-full flex items-center justify-center transition-all ${
                        isMuted
                          ? 'bg-rose-500/20 border border-rose-500/50 shadow-[0_0_20px_rgba(244,63,94,0.2)]'
                          : 'bg-[#F27D26] shadow-[0_0_30px_rgba(242,125,38,0.4)] group-hover:bg-[#ff8a38]'
                      }`}
                    >
                      {isMuted ? (
                        <MicOff className="w-7 h-7 text-rose-400" />
                      ) : (
                        <Mic className="w-7 h-7 text-black" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        isMuted ? 'text-rose-400' : 'text-[#F27D26]'
                      }`}
                    >
                      {isMuted ? 'Muted' : 'Unmuted'}
                    </span>
                  </button>

                  {/* End Session Button */}
                  <button
                    onClick={endSession}
                    className="group flex flex-col items-center gap-2 transition-all transform active:scale-95 cursor-pointer"
                  >
                    <div className="w-18 h-18 rounded-full bg-white/5 border border-white/20 flex items-center justify-center group-hover:bg-red-500/20 group-hover:border-red-500/50 transition-colors">
                      <PhoneOff className="w-7 h-7 text-white/70 group-hover:text-red-500 transition-colors" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 group-hover:text-red-500 transition-colors">
                      End Call
                    </span>
                  </button>

                  {/* Live Logs Toggle */}
                  <button
                    onClick={() => setShowTranscript(!showTranscript)}
                    className="group flex flex-col items-center gap-2 transition-all transform active:scale-95 cursor-pointer"
                  >
                    <div
                      className={`w-18 h-18 rounded-full flex items-center justify-center transition-colors border ${
                        showTranscript
                          ? 'bg-[#F27D26]/20 border-[#F27D26] text-[#F27D26]'
                          : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <MessageSquare className="w-7 h-7" />
                    </div>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-widest ${
                        showTranscript ? 'text-[#F27D26]' : 'text-white/40'
                      }`}
                    >
                      Logs
                    </span>
                  </button>
                </footer>
              </div>
            )}

            {/* Live Transcript Drawer */}
            {showTranscript && sessionActive && (
              <div className="w-full max-w-lg mt-4 bg-zinc-900/95 border border-zinc-800 rounded-2xl p-4 shadow-xl max-h-48 overflow-y-auto space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                  <span className="font-bold text-zinc-300 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-400" />
                    Live Utterance Logs
                  </span>
                  <button
                    onClick={() => setShowTranscript(false)}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    Close
                  </button>
                </div>
                {transcripts.length === 0 ? (
                  <p className="text-zinc-500 text-center py-4 italic">
                    Listening as conversation happens...
                  </p>
                ) : (
                  transcripts.map((t, idx) => (
                    <div key={idx} className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span
                          className={`font-bold ${
                            t.sender === 'sunny'
                              ? 'text-amber-400'
                              : t.sender === 'system'
                              ? 'text-indigo-400'
                              : 'text-emerald-400'
                          }`}
                        >
                          {t.sender === 'sunny'
                            ? 'Sunny (सन्नी)'
                            : t.sender === 'system'
                            ? 'System'
                            : 'Friend'}
                        </span>
                        <span className="text-[10px] text-zinc-500">{t.time}</span>
                      </div>
                      <p className="text-zinc-200 pl-2 border-l border-zinc-800">
                        {t.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Auth / Account Switch Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Group Selector Modal */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <GroupSelector
            selectedMembers={selectedMembers}
            onChangeSelectedMembers={setSelectedMembers}
            onClose={() => setIsGroupModalOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SunnyApp />
    </AuthProvider>
  );
}
