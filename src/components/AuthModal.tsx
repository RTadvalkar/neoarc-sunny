import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, LogIn, UserPlus, Mail, User, AlertCircle, Copy, Check, ExternalLink, Settings2, LogOut, CheckCircle2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { currentUser, allUsers, switchUser, signIn, signUp, loginWithGoogle, logout, googleConfig } = useAuth();
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showGoogleConfigModal, setShowGoogleConfigModal] = useState(false);
  const [customClientId, setCustomClientId] = useState('');
  const [copiedDev, setCopiedDev] = useState(false);
  const [copiedPre, setCopiedPre] = useState(false);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await loginWithGoogle(customClientId.trim() || undefined);
      if (result.requiresConfig) {
        setShowGoogleConfigModal(true);
      } else if (!result.success && result.error) {
        setError(result.error);
      } else if (result.success) {
        // Window opened; when postMessage receives user, it will auto close
      }
    } catch (e: any) {
      setError(e.message || 'Google Sign-In failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (authMode === 'signup') {
        if (!email.trim() || !displayName.trim()) {
          setError('Please provide your name and email address.');
          setIsLoading(false);
          return;
        }
        await signUp(email.trim(), displayName.trim());
      } else {
        if (!email.trim()) {
          setError('Please enter your email address.');
          setIsLoading(false);
          return;
        }
        await signIn(email.trim());
      }
      setEmail('');
      setDisplayName('');
      onClose();
    } catch (e: any) {
      setError(e.message || `Failed to ${authMode === 'signup' ? 'sign up' : 'sign in'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const currentOrigin = window.location.origin;
  const devCallbackUrl = googleConfig?.devCallbackUrl || `${window.location.origin}/auth/callback`;
  const sharedCallbackUrl = googleConfig?.sharedCallbackUrl || 'https://ais-pre-qdpb2el4fke3xc6he2fbsw-971083840159.asia-southeast1.run.app/auth/callback';
  const sharedOrigin = 'https://ais-pre-qdpb2el4fke3xc6he2fbsw-971083840159.asia-southeast1.run.app';

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    if (key === 'devOrigin') {
      setCopiedDev(true);
      setTimeout(() => setCopiedDev(false), 2000);
    } else {
      setCopiedPre(true);
      setTimeout(() => setCopiedPre(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-5 relative">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-[#F27D26]/10 border border-[#F27D26]/30 flex items-center justify-center text-[#F27D26]">
              {currentUser ? <User className="w-5 h-5" /> : authMode === 'signup' ? <UserPlus className="w-5 h-5" /> : <LogIn className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-100">
                {currentUser ? 'User Account & Profile' : authMode === 'signup' ? 'Create Your Account' : 'Welcome Back'}
              </h2>
              <p className="text-xs text-zinc-400">
                {currentUser ? currentUser.email : authMode === 'signup' ? 'Sign up to chat with Sunny' : 'Sign in to access your circles & memories'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Logged In Banner (if any) */}
        {currentUser ? (
          <div className="space-y-4">
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-2xl flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <img
                  src={currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.displayName}`}
                  alt={currentUser.displayName}
                  className="w-10 h-10 rounded-full border border-white/10"
                />
                <div>
                  <div className="flex items-center space-x-2">
                    <p className="text-xs font-bold text-zinc-100">{currentUser.displayName}</p>
                    {currentUser.role === 'ADMIN' && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-[#F27D26]/20 text-[#F27D26] border border-[#F27D26]/30">
                        ADMIN
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400">{currentUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  logout();
                }}
                className="px-3 py-1.5 bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/30 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold text-xs rounded-xl transition"
            >
              Continue to Sunny (पुढे जा)
            </button>
          </div>
        ) : (
          <>
            {/* Tab Switcher: Sign In vs Sign Up */}
            <div className="grid grid-cols-2 p-1 bg-zinc-950 rounded-2xl border border-zinc-800">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setError(null);
                }}
                className={`py-2 text-xs font-bold rounded-xl transition ${
                  authMode === 'signin'
                    ? 'bg-zinc-800 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Sign In (लॉग इन)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setError(null);
                }}
                className={`py-2 text-xs font-bold rounded-xl transition ${
                  authMode === 'signup'
                    ? 'bg-zinc-800 text-white shadow'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Sign Up (साइन अप)
              </button>
            </div>

            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center space-x-2 text-xs text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Real Google OAuth Button */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isLoading}
                className="w-full py-3 px-4 bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs rounded-2xl flex items-center justify-center space-x-3 transition shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-50"
              >
                {/* Genuine Google G Icon */}
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>
                  {authMode === 'signup' ? 'Sign up with Google' : 'Continue with Google'}
                </span>
              </button>

              <div className="flex items-center space-x-3 text-zinc-600">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                  or use email
                </span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>
            </div>

            {/* Email & Name Form */}
            <form onSubmit={handleEmailAuth} className="space-y-3">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    Full Name (तुमचे नाव)
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      placeholder="e.g. Rushi Tadwalkar"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs pl-9 pr-3 py-2.5 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#F27D26] transition"
                      required={authMode === 'signup'}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                  Email Address (ईमेल पत्ता)
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="email"
                    placeholder="e.g. rushikesh.tadwalkar@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs pl-9 pr-3 py-2.5 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#F27D26] transition"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 bg-[#F27D26] hover:bg-[#ff8a38] text-black font-bold text-xs rounded-xl transition shadow-lg shadow-[#F27D26]/20 disabled:opacity-50 mt-1"
              >
                {isLoading
                  ? 'Authenticating...'
                  : authMode === 'signup'
                  ? 'Create Account & Sign In'
                  : 'Sign In'}
              </button>
            </form>
          </>
        )}

        {/* Existing User Profiles Switcher (if multiple users have signed in on device) */}
        {allUsers.length > 1 && (
          <div className="pt-3 border-t border-zinc-800/80 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Switch Saved Account ({allUsers.length})
            </p>
            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
              {allUsers.map((u) => {
                const isSelected = currentUser?.id === u.id;
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      switchUser(u);
                      onClose();
                    }}
                    className={`w-full p-2 rounded-xl border text-left flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-[#F27D26]/10 border-[#F27D26]/40 text-[#F27D26]'
                        : 'bg-zinc-950/60 border-zinc-800/80 hover:border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <img
                        src={u.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.displayName}`}
                        alt={u.displayName}
                        className="w-6 h-6 rounded-full border border-white/10"
                      />
                      <span className="text-xs font-medium text-zinc-200">{u.displayName}</span>
                      <span className="text-[10px] text-zinc-500 truncate max-w-[140px]">({u.email})</span>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#F27D26]" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Google OAuth Setup Details Modal */}
        {showGoogleConfigModal && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-3xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
                <div className="flex items-center space-x-2 text-zinc-100 font-bold text-sm">
                  <Settings2 className="w-4 h-4 text-[#F27D26]" />
                  <span>Google OAuth Configuration</span>
                </div>
                <button
                  onClick={() => setShowGoogleConfigModal(false)}
                  className="p-1.5 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed">
                To connect real Google accounts via Google Cloud OAuth, configure your credentials in the Google Cloud Console:
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-400 mb-1 flex items-center justify-between">
                    <span>1. Authorized JavaScript Origins (Crucial to fix "no registered origin"):</span>
                  </label>
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                      <input
                        type="text"
                        readOnly
                        value={currentOrigin}
                        className="bg-transparent text-[11px] text-zinc-300 font-mono flex-1 outline-none truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(currentOrigin, 'devOrigin')}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[10px] flex items-center gap-1"
                      >
                        {copiedDev ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDev ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="flex items-center space-x-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                      <input
                        type="text"
                        readOnly
                        value={sharedOrigin}
                        className="bg-transparent text-[11px] text-zinc-300 font-mono flex-1 outline-none truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(sharedOrigin, 'sharedOrigin')}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[10px] flex items-center gap-1"
                      >
                        {copiedPre ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedPre ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-400 mb-1">
                    2. Authorized Redirect URIs:
                  </label>
                  <div className="space-y-1.5">
                    <div className="flex items-center space-x-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                      <input
                        type="text"
                        readOnly
                        value={devCallbackUrl}
                        className="bg-transparent text-[11px] text-zinc-300 font-mono flex-1 outline-none truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(devCallbackUrl, 'devOrigin')}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[10px] flex items-center gap-1"
                      >
                        {copiedDev ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDev ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                    <div className="flex items-center space-x-2 bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                      <input
                        type="text"
                        readOnly
                        value={sharedCallbackUrl}
                        className="bg-transparent text-[11px] text-zinc-300 font-mono flex-1 outline-none truncate"
                      />
                      <button
                        onClick={() => copyToClipboard(sharedCallbackUrl, 'sharedOrigin')}
                        className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-[10px] flex items-center gap-1"
                      >
                        {copiedPre ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedPre ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="block text-[11px] font-semibold text-zinc-300 mb-1">
                    Paste Google Client ID to connect:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 123456789-abcdef.apps.googleusercontent.com"
                    value={customClientId}
                    onChange={(e) => setCustomClientId(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 text-xs px-3 py-2 rounded-xl text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#F27D26]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-zinc-800">
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-[#F27D26] hover:underline flex items-center gap-1"
                >
                  <span>Google Cloud Credentials</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowGoogleConfigModal(false)}
                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setShowGoogleConfigModal(false);
                      handleGoogleLogin();
                    }}
                    className="px-4 py-1.5 bg-[#F27D26] hover:bg-[#ff8a38] text-black font-bold rounded-xl text-xs"
                  >
                    Connect with Client ID
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
