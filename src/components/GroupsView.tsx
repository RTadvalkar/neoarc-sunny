import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Group, GroupMember, GroupInvitation, GroupConversationSession } from '../types';
import { buildGroupCallJoinUrl, copyToClipboard } from '../services/groupCallUrl';
import {
  Users,
  Plus,
  Mail,
  UserPlus,
  Link,
  Check,
  Copy,
  Shield,
  Trash2,
  X,
  MessageCircle,
  AlertCircle,
  ExternalLink,
  Send,
  RefreshCw,
  Sparkles,
  Clock,
  CheckCircle2,
  Ban,
  UserCheck,
  History,
  Radio,
  PhoneCall,
  Link2,
} from 'lucide-react';

interface GroupsViewProps {
  onStartGroupCall?: (groupId: string) => void;
}

export const GroupsView: React.FC<GroupsViewProps> = ({ onStartGroupCall }) => {
  const { currentUser, isAdmin } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeSessions, setActiveSessions] = useState<Record<string, GroupConversationSession>>({});
  const [selectedGroup, setSelectedGroup] = useState<(Group & { members?: GroupMember[] }) | null>(null);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [copiedSessionId, setCopiedSessionId] = useState<string | null>(null);

  // Helper to ensure public accessible origin (replaces private ais-dev- with shared ais-pre-)
  const getPublicOrigin = () => {
    let origin = window.location.origin;
    if (origin.includes('ais-dev-')) {
      origin = origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin.replace(/\/$/, '');
  };

  const getPublicInviteUrl = (token: string) => {
    return `${getPublicOrigin()}/?invite=${token}`;
  };

  // SMTP Status
  const [smtpStatus, setSmtpStatus] = useState<{
    configured: boolean;
    message: string;
    host?: string;
    from?: string;
  } | null>(null);

  // Modal / Form state
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [newGroupEmails, setNewGroupEmails] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmittingGroup, setIsSubmittingGroup] = useState(false);

  const [isInviting, setIsInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFeedback, setInviteFeedback] = useState<{ text: string; type: 'success' | 'warning' | 'error'; url?: string; gmailUrl?: string } | null>(null);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Direct Email Sending state
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [emailModalData, setEmailModalData] = useState<{
    email: string;
    token: string;
    inviteUrl: string;
    gmailUrl: string;
    smtpConfigured: boolean;
    message: string;
    type: 'success' | 'warning' | 'error';
  } | null>(null);

  // Manual Invite token accept
  const [acceptTokenInput, setAcceptTokenInput] = useState('');
  const [acceptMessage, setAcceptMessage] = useState<string | null>(null);

  const fetchSmtpStatus = async () => {
    try {
      const res = await fetch('/api/smtp/status');
      if (res.ok) {
        setSmtpStatus(await res.json());
      }
    } catch (e) {
      console.error('Error fetching SMTP status:', e);
    }
  };

  const fetchGroups = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [grpRes, sessRes] = await Promise.all([
        fetch(`/api/groups?userId=${currentUser.id}`),
        fetch('/api/groups/active-sessions'),
      ]);
      if (grpRes.ok) {
        const data: Group[] = await grpRes.json();
        setGroups(data);
        if (data.length > 0 && !selectedGroup) {
          fetchGroupDetails(data[0].id);
        }
      }
      if (sessRes.ok) {
        const sessData = await sessRes.json();
        const map: Record<string, GroupConversationSession> = {};
        if (Array.isArray(sessData.sessions)) {
          sessData.sessions.forEach((s: GroupConversationSession) => {
            map[s.groupId] = s;
          });
        }
        setActiveSessions(map);
      }
    } catch (e) {
      console.error('Error fetching groups or active sessions:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroupDetails = async (groupId: string, silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const [grpRes, invRes] = await Promise.all([
        fetch(`/api/groups/${groupId}`),
        fetch(`/api/groups/${groupId}/invitations`),
      ]);
      if (grpRes.ok) {
        setSelectedGroup(await grpRes.json());
      }
      if (invRes.ok) {
        setInvitations(await invRes.json());
      }
    } catch (e) {
      console.error('Error fetching group details:', e);
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchGroups();
    fetchSmtpStatus();
  }, [currentUser?.id]);

  // Live polling for member status and invitations every 5 seconds
  useEffect(() => {
    if (!selectedGroup) return;
    const interval = setInterval(() => {
      fetchGroupDetails(selectedGroup.id, true);
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedGroup?.id]);

  const handleRevokeInvitation = async (invId: string) => {
    if (!selectedGroup) return;
    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}/invitations/${invId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setInvitations((prev) => prev.filter((i) => i.id !== invId));
      }
    } catch (e) {
      console.error('Error revoking invitation:', e);
    }
  };

  const handleTriggerEmail = async (inv: GroupInvitation) => {
    if (!selectedGroup) return;

    // Check if user has already accepted or is already an active member
    const isAlreadyActive = selectedGroup.members?.some(
      (m) => m.status === 'ACTIVE' && m.user?.email && m.user.email.toLowerCase().trim() === inv.invitedEmail.toLowerCase().trim()
    );

    if (inv.status === 'ACCEPTED' || isAlreadyActive) {
      setEmailModalData({
        email: inv.invitedEmail,
        token: inv.token,
        inviteUrl: getPublicInviteUrl(inv.token),
        gmailUrl: '',
        smtpConfigured: false,
        message: `ℹ️ Member (${inv.invitedEmail}) is already an active member of "${selectedGroup.name}". Resending invitations is not allowed.`,
        type: 'warning',
      });
      fetchGroupDetails(selectedGroup.id);
      return;
    }

    setResendingId(inv.id);
    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}/invitations/${inv.id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appUrl: getPublicOrigin(),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setEmailModalData({
          email: inv.invitedEmail,
          token: inv.token,
          inviteUrl: getPublicInviteUrl(inv.token),
          gmailUrl: '',
          smtpConfigured: false,
          message: data.error || 'Failed to resend invitation.',
          type: 'error',
        });
        fetchGroupDetails(selectedGroup.id);
        return;
      }

      const inviteUrl = data.inviteUrl || getPublicInviteUrl(inv.token);
      const gmailUrl =
        data.gmailComposeUrl ||
        `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
          inv.invitedEmail
        )}&su=${encodeURIComponent(
          `[Invitation] Join "${selectedGroup.name}" on Marathwada Katta`
        )}&body=${encodeURIComponent(
          `नमस्कार!\n\nमी तुम्हाला "${selectedGroup.name}" Marathwada Katta ग्रुपवर आमंत्रित केले आहे.\n\nसामील होण्यासाठी खालील लिंकवर क्लिक करा:\n${inviteUrl}\n\nसन्नी (Sunny) AI Voice Companion`
        )}`;

      if (data.success) {
        setEmailModalData({
          email: inv.invitedEmail,
          token: inv.token,
          inviteUrl,
          gmailUrl,
          smtpConfigured: true,
          message: `✅ Invitation email successfully sent to ${inv.invitedEmail} directly via SMTP!`,
          type: 'success',
        });
      } else {
        setEmailModalData({
          email: inv.invitedEmail,
          token: inv.token,
          inviteUrl,
          gmailUrl,
          smtpConfigured: data.smtpConfigured || false,
          message: data.smtpConfigured
            ? `⚠️ SMTP delivery error: ${data.error || 'Check SMTP credentials'}`
            : `ℹ️ Outbound SMTP is not configured in environment variables yet. You can open Gmail directly in your browser or copy the direct invitation link.`,
          type: 'warning',
        });
      }
    } catch (err: any) {
      const fallbackInviteUrl = getPublicInviteUrl(inv.token);
      setEmailModalData({
        email: inv.invitedEmail,
        token: inv.token,
        inviteUrl: fallbackInviteUrl,
        gmailUrl: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
          inv.invitedEmail
        )}&su=${encodeURIComponent(
          `[Invitation] Join "${selectedGroup.name}" on Marathwada Katta`
        )}&body=${encodeURIComponent(
          `नमस्कार!\n\nमी तुम्हाला "${selectedGroup.name}" Marathwada Katta ग्रुपवर आमंत्रित केले आहे.\n\nसामील होण्यासाठी खालील लिंकवर क्लिक करा:\n${fallbackInviteUrl}\n\nसन्नी (Sunny) AI Voice Companion`
        )}`,
        smtpConfigured: false,
        message: `Failed to connect to email service: ${err?.message}`,
        type: 'error',
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !newGroupName.trim()) return;
    setIsSubmittingGroup(true);
    setCreateError(null);
    try {
      const inviteEmails = newGroupEmails
        .split(/[\s,]+/)
        .map((em) => em.trim())
        .filter((em) => em && em.includes('@'));

      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          ownerUserId: currentUser.id,
          ownerUser: currentUser,
          inviteEmails,
          appUrl: getPublicOrigin(),
        }),
      });

      if (res.ok) {
        const created: Group & { members?: GroupMember[] } = await res.json();
        setGroups((prev) => {
          const exists = prev.some((g) => g.id === created.id);
          return exists ? prev : [created, ...prev];
        });
        setSelectedGroup(created);
        setIsCreatingGroup(false);
        setNewGroupName('');
        setNewGroupDesc('');
        setNewGroupEmails('');
        fetchGroupDetails(created.id);
      } else {
        const err = await res.json();
        setCreateError(err.error || 'Failed to create group');
      }
    } catch (e: any) {
      console.error('Error creating group:', e);
      setCreateError(e?.message || 'Network error creating group');
    } finally {
      setIsSubmittingGroup(false);
    }
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedGroup || !inviteEmail.trim()) return;

    const cleanInputEmail = inviteEmail.trim().toLowerCase();
    const isAlreadyActive = selectedGroup.members?.some(
      (m) => m.status === 'ACTIVE' && m.user?.email && m.user.email.toLowerCase().trim() === cleanInputEmail
    );

    if (isAlreadyActive) {
      setInviteFeedback({
        text: `⚠️ Member (${inviteEmail.trim()}) is already an active member of "${selectedGroup.name}". Resending or re-inviting is not allowed.`,
        type: 'warning',
      });
      return;
    }

    setIsSendingInvite(true);
    setInviteFeedback(null);
    try {
      const res = await fetch(`/api/groups/${selectedGroup.id}/invitations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          invitedByUserId: currentUser.id,
          appUrl: getPublicOrigin(),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const first = Array.isArray(data) ? data[0] : data;
        setInviteEmail('');
        fetchGroupDetails(selectedGroup.id);

        const inviteUrl = getPublicInviteUrl(first?.token);
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
          first?.invitedEmail || ''
        )}&su=${encodeURIComponent(
          `[Invitation] Join "${selectedGroup.name}" on Marathwada Katta`
        )}&body=${encodeURIComponent(
          `नमस्कार!\n\nमी तुम्हाला "${selectedGroup.name}" Marathwada Katta ग्रुपवर आमंत्रित केले आहे.\n\nसामील होण्यासाठी खालील लिंकवर क्लिक करा:\n${inviteUrl}\n\nसन्नी (Sunny) AI Voice Companion`
        )}`;

        if (first?.emailSent) {
          setInviteFeedback({
            text: `✅ Invitation email dispatched to ${first.invitedEmail} directly via SMTP!`,
            type: 'success',
            url: inviteUrl,
            gmailUrl,
          });
        } else {
          setInviteFeedback({
            text: `📋 Invitation created for ${first?.invitedEmail}! Note: Outbound SMTP is not configured in server environment, so no automated email was sent. You can open Gmail in browser with 1-click or copy the invite link below.`,
            type: 'warning',
            url: inviteUrl,
            gmailUrl,
          });
        }
      } else {
        const err = await res.json();
        setInviteFeedback({
          text: err.error || 'Failed to send invitation',
          type: 'error',
        });
      }
    } catch (e: any) {
      console.error('Error inviting member:', e);
      setInviteFeedback({
        text: e?.message || 'Error inviting member',
        type: 'error',
      });
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!window.confirm('Are you sure you want to delete this circle?')) return;
    try {
      const res = await fetch(`/api/groups/${groupId}`, { method: 'DELETE' });
      if (res.ok) {
        setGroups((prev) => prev.filter((g) => g.id !== groupId));
        if (selectedGroup?.id === groupId) {
          setSelectedGroup(null);
        }
      }
    } catch (e) {
      console.error('Error deleting group:', e);
    }
  };

  const handleRemoveMember = async (groupId: string, userId: string) => {
    if (!window.confirm('Remove this member from the circle?')) return;
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchGroupDetails(groupId);
      }
    } catch (e) {
      console.error('Error removing member:', e);
    }
  };

  const handleCopyLink = (token: string) => {
    const inviteUrl = getPublicInviteUrl(token);
    navigator.clipboard.writeText(inviteUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 3000);
  };

  const handleAcceptToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !acceptTokenInput.trim()) return;
    try {
      const res = await fetch(`/api/invitations/${acceptTokenInput.trim()}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setAcceptMessage(`Successfully joined ${data.group.name}!`);
        setAcceptTokenInput('');
        fetchGroups();
      } else {
        setAcceptMessage('Invalid or expired invitation token.');
      }
    } catch (e) {
      setAcceptMessage('Error accepting invitation token.');
    }
  };

  if (!currentUser) return null;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              Groups & Membership (मित्र मंडळ आणि कट्टे)
            </h1>
            {smtpStatus && (
              <span
                className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center space-x-1 ${
                  smtpStatus.configured
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                }`}
                title={smtpStatus.message}
              >
                <Mail className="w-3 h-3" />
                <span>{smtpStatus.configured ? 'SMTP Active' : 'Direct Link Mode (SMTP Pending)'}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Manage your friendship circles, invite friends, and share Sunny in group discussions
          </p>
        </div>

        {isAdmin ? (
          <button
            onClick={() => setIsCreatingGroup(true)}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition shadow"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Group</span>
          </button>
        ) : (
          <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 text-xs">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Admin Managed Circles</span>
          </div>
        )}
      </div>

      {/* SMTP Notice Banner if not configured */}
      {smtpStatus && !smtpStatus.configured && (
        <div className="bg-zinc-900/90 border border-amber-500/30 rounded-2xl p-4 flex items-start space-x-3 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-zinc-300 leading-relaxed">
            <p className="font-semibold text-amber-200">
              Note on Email Delivery (ईमेल आमंत्रण बाबत माहिती):
            </p>
            <p className="text-[11px] text-zinc-400">
              Outbound SMTP credentials (e.g. Gmail App Password or SMTP server) are not yet configured in environment variables. 
              <strong> You can still easily invite friends:</strong> copy their unique <strong>Invitation Link</strong> below to send via WhatsApp/Email, or have them simply sign in with their Gmail ID and they will automatically join your circle!
            </p>
            <p className="text-[10px] text-zinc-500 font-mono">
              To enable automatic email delivery, configure: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env
            </p>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left: Groups List & Accept Invite box */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
              My Groups ({groups.length})
            </label>
            {loading ? (
              <div className="text-center py-6 text-zinc-500 text-xs">Loading groups...</div>
            ) : groups.length === 0 ? (
              <div className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl text-center text-zinc-500 text-xs">
                You haven't joined any groups yet.
              </div>
            ) : (
              groups.map((group) => {
                const isSelected = selectedGroup?.id === group.id;
                const activeSession = activeSessions[group.id];
                return (
                  <button
                    key={group.id}
                    onClick={() => fetchGroupDetails(group.id)}
                    className={`w-full text-left p-4 rounded-2xl border transition relative ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/60 text-amber-200 shadow-md'
                        : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-xs text-zinc-100">{group.name}</h3>
                      {activeSession && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 animate-pulse">
                          <Radio className="w-3 h-3 text-emerald-400" />
                          Live Call
                        </span>
                      )}
                    </div>
                    {group.description && (
                      <p className="text-[11px] text-zinc-400 mt-1 line-clamp-1">
                        {group.description}
                      </p>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Join Group with Invitation Token */}
          <div className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-4 space-y-2.5">
            <h3 className="text-xs font-bold text-zinc-200 flex items-center gap-1.5">
              <Link className="w-3.5 h-3.5 text-amber-400" />
              Join Group with Invite Token
            </h3>
            <form onSubmit={handleAcceptToken} className="space-y-2">
              <input
                type="text"
                placeholder="Paste invite token here..."
                value={acceptTokenInput}
                onChange={(e) => setAcceptTokenInput(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 text-xs px-3 py-1.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="w-full py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 text-xs font-bold rounded-xl transition"
              >
                Join Circle
              </button>
            </form>
            {acceptMessage && (
              <p className="text-[11px] text-amber-300 italic">{acceptMessage}</p>
            )}
          </div>
        </div>

        {/* Right: Selected Group Members & Invitations */}
        <div className="md:col-span-2 space-y-6">
          {!selectedGroup ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-500 text-xs">
              Select or create a group to view members and invite friends.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-zinc-100">{selectedGroup.name}</h2>
                    {selectedGroup.ownerUserId === currentUser.id && (
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                        Your Circle (Admin/Owner)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{selectedGroup.description || 'Friendship discussion circle'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {onStartGroupCall && (
                    <button
                      onClick={() => onStartGroupCall(selectedGroup.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold flex items-center space-x-1.5 transition shadow-sm ${
                        activeSessions[selectedGroup.id]
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 ring-2 ring-emerald-400/50 animate-pulse'
                          : 'bg-[#F27D26] hover:bg-[#ff8a38] text-slate-950'
                      }`}
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>
                        {activeSessions[selectedGroup.id]
                          ? `Join Live Call (${activeSessions[selectedGroup.id].activeParticipantsCount || 1} in Room)`
                          : 'Start Call with Sunny'}
                      </span>
                    </button>
                  )}
                  {activeSessions[selectedGroup.id] && (
                    <button
                      onClick={async () => {
                        const sess = activeSessions[selectedGroup.id];
                        const url = buildGroupCallJoinUrl(selectedGroup.id, sess.id);
                        const success = await copyToClipboard(url);
                        if (success) {
                          setCopiedSessionId(sess.id);
                          setTimeout(() => setCopiedSessionId(null), 3000);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold flex items-center space-x-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 transition"
                      title="Copy Call Join Link"
                    >
                      {copiedSessionId === activeSessions[selectedGroup.id].id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Copy Call Link</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => fetchGroupDetails(selectedGroup.id)}
                    disabled={isRefreshing}
                    className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl transition"
                    title="Refresh Members & Status"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => setIsInviting(true)}
                      className="px-3.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Invite via Email</span>
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => handleDeleteGroup(selectedGroup.id)}
                      className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-xl transition"
                      title="Delete Circle"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Members List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Active Circle Members ({selectedGroup.members?.length || 0})</span>
                  </h3>
                  <span className="text-[10px] text-zinc-500">
                    Live synced
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {selectedGroup.members?.map((member) => {
                    const isOwnerOrAdmin = currentUser.role === 'ADMIN' || selectedGroup.ownerUserId === currentUser.id;
                    const canRemove = isOwnerOrAdmin && member.userId !== selectedGroup.ownerUserId;
                    return (
                      <div
                        key={member.userId}
                        className="bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3.5 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={
                              member.user?.photoURL ||
                              `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
                                member.user?.displayName || member.userId
                              )}`
                            }
                            alt={member.user?.displayName}
                            className="w-9 h-9 rounded-full bg-zinc-800 border border-white/10"
                          />
                          <div>
                            <p className="font-bold text-xs text-zinc-100 flex items-center gap-1">
                              <span>{member.user?.displayName || member.userId}</span>
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                            </p>
                            <p className="text-[10px] text-zinc-500">{member.user?.email || 'No email recorded'}</p>
                          </div>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              member.role === 'OWNER'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            }`}
                          >
                            {member.role}
                          </span>
                          {canRemove && (
                            <button
                              onClick={() => handleRemoveMember(selectedGroup.id, member.userId)}
                              className="text-zinc-600 hover:text-rose-400 p-1 transition"
                              title="Remove member"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Pending Invitations Section (Admin Only) */}
              {isAdmin && (() => {
                const pendingInvitations = invitations.filter((i) => i.status === 'PENDING');
                const historyInvitations = invitations.filter((i) => i.status !== 'PENDING');

                return (
                  <div className="space-y-4 pt-4 border-t border-zinc-800">
                    {/* Active Pending Invitations */}
                    {pendingInvitations.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 animate-pulse" />
                            <span>Pending Email Invitations ({pendingInvitations.length})</span>
                          </h3>
                          <span className="text-[10px] text-zinc-500">
                            Auto-joins when user accepts or signs in
                          </span>
                        </div>
                        <div className="space-y-2">
                          {pendingInvitations.map((inv) => {
                            const inviteLink = getPublicInviteUrl(inv.token);
                            const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                              inv.invitedEmail
                            )}&su=${encodeURIComponent(
                              `[Invitation] Join "${selectedGroup.name}" on Marathwada Katta`
                            )}&body=${encodeURIComponent(
                              `नमस्कार!\n\nमी तुम्हाला "${selectedGroup.name}" Marathwada Katta ग्रुपवर आमंत्रित केले आहे.\n\nसामील होण्यासाठी खालील लिंकवर क्लिक करा:\n${inviteLink}\n\nसन्नी (Sunny) AI Voice Companion`
                            )}`;

                            const isThisResending = resendingId === inv.id;

                            return (
                              <div
                                key={inv.id}
                                className="bg-zinc-950/70 border border-amber-500/20 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                              >
                                <div className="space-y-0.5 min-w-0">
                                  <p className="font-semibold text-zinc-200 flex items-center gap-1.5 truncate">
                                    <Mail className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                    <span className="truncate">{inv.invitedEmail}</span>
                                  </p>
                                  <p className="text-[10px] text-zinc-500">
                                    Status:{' '}
                                    <span className="text-amber-400 uppercase font-semibold">
                                      {inv.status}
                                    </span>{' '}
                                    • Invited by: {inv.invitedByUserName || 'Admin'}
                                  </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 shrink-0">
                                  {/* Direct SMTP Server Trigger Button */}
                                  <button
                                    onClick={() => handleTriggerEmail(inv)}
                                    disabled={isThisResending}
                                    className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50"
                                    title="Trigger server SMTP to send invitation email directly"
                                  >
                                    {isThisResending ? (
                                      <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                                    ) : (
                                      <Send className="w-3 h-3 text-amber-400" />
                                    )}
                                    <span>{isThisResending ? 'Sending...' : 'Send SMTP'}</span>
                                  </button>

                                  {/* Direct Gmail Web Composer Button */}
                                  <a
                                    href={gmailComposeUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center space-x-1 transition"
                                    title="Open Gmail directly in a browser tab"
                                  >
                                    <ExternalLink className="w-3 h-3 text-blue-400" />
                                    <span>Gmail Web</span>
                                  </a>

                                  {/* Copy Link Button */}
                                  <button
                                    onClick={() => handleCopyLink(inv.token)}
                                    className="px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 rounded-lg text-xs flex items-center space-x-1.5 transition"
                                  >
                                    {copiedToken === inv.token ? (
                                      <>
                                        <Check className="w-3 h-3 text-emerald-400" />
                                        <span className="text-emerald-400 font-semibold">Copied!</span>
                                      </>
                                    ) : (
                                      <>
                                        <Copy className="w-3 h-3" />
                                        <span>Copy Link</span>
                                      </>
                                    )}
                                  </button>

                                  {/* Revoke / Cancel Button */}
                                  <button
                                    onClick={() => handleRevokeInvitation(inv.id)}
                                    className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                                    title="Cancel / Revoke Invitation"
                                  >
                                    <Ban className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Past / Completed Invitations (Accepted / Declined) */}
                    {historyInvitations.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <button
                          onClick={() => setShowHistory(!showHistory)}
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 transition"
                        >
                          <History className="w-3 h-3" />
                          <span>
                            Invitation Activity History ({historyInvitations.length})
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {showHistory ? '▲ Hide' : '▼ Show'}
                          </span>
                        </button>

                        {showHistory && (
                          <div className="space-y-1.5 animate-fadeIn">
                            {historyInvitations.map((inv) => (
                              <div
                                key={inv.id}
                                className="bg-zinc-950/40 border border-zinc-800/60 rounded-xl px-3 py-2 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Mail className="w-3 h-3 text-zinc-500 shrink-0" />
                                  <span className="text-zinc-300 truncate">{inv.invitedEmail}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {inv.status === 'ACCEPTED' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-full flex items-center gap-1">
                                      <CheckCircle2 className="w-2.5 h-2.5" />
                                      Accepted
                                    </span>
                                  )}
                                  {inv.status === 'REJECTED' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 rounded-full flex items-center gap-1">
                                      <Ban className="w-2.5 h-2.5" />
                                      Declined
                                    </span>
                                  )}
                                  {inv.status === 'REVOKED' && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">
                                      Revoked
                                    </span>
                                  )}
                                  <span className="text-[10px] text-zinc-500">
                                    {inv.acceptedAt
                                      ? new Date(inv.acceptedAt).toLocaleDateString()
                                      : inv.rejectedAt
                                      ? new Date(inv.rejectedAt).toLocaleDateString()
                                      : ''}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {isCreatingGroup && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-amber-400" />
                Create New Circle (नवीन कट्टा तयार करा)
              </h3>
              <button
                onClick={() => setIsCreatingGroup(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {createError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-xs">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateGroup} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Group / Circle Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Pune Tech Gang or Nanded College Katta"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Description (Optional)</label>
                <textarea
                  placeholder="e.g. Weekend discussion circle for friends..."
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500 h-16"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">
                  Invite Members via Email (Optional, comma-separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. friend1@gmail.com, friend2@gmail.com"
                  value={newGroupEmails}
                  onChange={(e) => setNewGroupEmails(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Friends will be invited by email and added to this circle upon sign in.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingGroup(false)}
                  className="px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGroup}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold rounded-xl flex items-center gap-1.5"
                >
                  {isSubmittingGroup ? 'Creating...' : 'Create Circle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      {isInviting && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-zinc-100 flex items-center gap-2">
                <Mail className="w-4 h-4 text-amber-400" />
                Invite Member to {selectedGroup?.name}
              </h3>
              <button
                onClick={() => setIsInviting(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {inviteFeedback && (
              <div
                className={`p-3.5 rounded-2xl border text-xs space-y-2.5 ${
                  inviteFeedback.type === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : inviteFeedback.type === 'error'
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                }`}
              >
                <p className="leading-relaxed">{inviteFeedback.text}</p>
                {inviteFeedback.url && (
                  <div className="pt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (inviteFeedback.url) {
                          navigator.clipboard.writeText(inviteFeedback.url);
                          setCopiedToken('feedback-modal');
                          setTimeout(() => setCopiedToken(null), 3000);
                        }
                      }}
                      className="px-3 py-1 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg text-[11px] font-semibold flex items-center space-x-1.5 transition"
                    >
                      {copiedToken === 'feedback-modal' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied Link!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3 text-amber-400" />
                          <span>Copy Direct Invite Link</span>
                        </>
                      )}
                    </button>

                    {/* Direct Gmail Web Link (No OS Mailto Popup) */}
                    <a
                      href={
                        inviteFeedback.gmailUrl ||
                        `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
                          inviteEmail || ''
                        )}&su=${encodeURIComponent(
                          `[Invitation] Join "${selectedGroup?.name}" on Marathwada Katta`
                        )}&body=${encodeURIComponent(
                          `नमस्कार!\n\nमी तुम्हाला "${selectedGroup?.name}" Marathwada Katta ग्रुपवर आमंत्रित केले आहे.\n\nसामील होण्यासाठी खालील लिंकवर क्लिक करा:\n${inviteFeedback.url}\n\nसन्नी (Sunny) AI Voice Companion`
                        )}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-700 text-zinc-200 rounded-lg text-[11px] font-semibold flex items-center space-x-1.5 transition"
                    >
                      <ExternalLink className="w-3 h-3 text-blue-400" />
                      <span>Open in Gmail (Web)</span>
                    </a>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSendInvite} className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Friend's Email ID(s) *</label>
                <input
                  type="text"
                  placeholder="e.g. friend@gmail.com or multiple emails"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                  required
                  autoFocus
                />
                <p className="text-[10px] text-zinc-500 mt-1">
                  Invited members will automatically join when they log in with this email ID.
                </p>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsInviting(false)}
                  className="px-3 py-1.5 text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingInvite}
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold rounded-xl flex items-center gap-1.5"
                >
                  {isSendingInvite ? 'Sending...' : 'Invite Member by Email'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Status & Delivery Modal */}
      {emailModalData && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold text-zinc-100">
                  Email Dispatch (ईमेल पाठवणे)
                </h3>
              </div>
              <button
                onClick={() => setEmailModalData(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div
              className={`p-3.5 rounded-2xl border text-xs leading-relaxed ${
                emailModalData.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : emailModalData.type === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}
            >
              {emailModalData.message}
            </div>

            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                <span>Recipient:</span>
                <span className="font-semibold text-zinc-200">{emailModalData.email}</span>
              </div>
              <div className="flex items-center justify-between text-zinc-400 text-[11px]">
                <span>SMTP Server:</span>
                <span className={emailModalData.smtpConfigured ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {emailModalData.smtpConfigured ? 'Configured & Active' : 'Not Configured (Pending .env)'}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <p className="text-[11px] font-medium text-zinc-400">
                Instant delivery options for your friend:
              </p>
              
              <div className="grid grid-cols-1 gap-2">
                {/* 1-Click Gmail Web */}
                <a
                  href={emailModalData.gmailUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full py-2 px-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-100 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  <span>Open in Gmail (Web Browser)</span>
                </a>

                {/* 1-Click Copy Link */}
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(emailModalData.inviteUrl);
                    setCopiedToken('email-modal');
                    setTimeout(() => setCopiedToken(null), 3000);
                  }}
                  className="w-full py-2 px-3 bg-amber-500 hover:bg-amber-400 text-zinc-950 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition"
                >
                  {copiedToken === 'email-modal' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-zinc-950" />
                      <span>Invitation Link Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-zinc-950" />
                      <span>Copy Invitation Link</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setEmailModalData(null)}
                className="text-xs text-zinc-400 hover:text-zinc-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
