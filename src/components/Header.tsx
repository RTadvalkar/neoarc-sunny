import React from 'react';
import { useAuth } from '../context/AuthContext';
import {
  Mic,
  Brain,
  Users,
  MessageSquare,
  User,
  ShieldCheck,
  Sliders,
  LogIn,
  LogOut,
} from 'lucide-react';

export type NavTab = 'voice' | 'profile' | 'conversations' | 'groups' | 'memory' | 'admin';

interface HeaderProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenAuthModal: () => void;
  isLiveActive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onSelectTab,
  onOpenAuthModal,
  isLiveActive,
}) => {
  const { currentUser, isAdmin, logout } = useAuth();

  return (
    <header className="w-full px-4 sm:px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-40 bg-[#0A0A0A]/95 backdrop-blur-md border-b border-white/10">
      {/* Brand Title */}
      <div className="flex items-center space-x-3 w-full md:w-auto justify-between md:justify-start">
        <div
          onClick={() => onSelectTab('voice')}
          className="flex items-center space-x-2 cursor-pointer group"
        >
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#FF9D52] to-[#F27D26] flex items-center justify-center text-zinc-950 font-black text-lg shadow-md group-hover:scale-105 transition">
            S
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[#F27D26] font-extrabold text-xl tracking-tight">SUNNY</span>
              <span className="text-[10px] bg-[#F27D26]/15 text-[#F27D26] border border-[#F27D26]/30 px-2 py-0.2 rounded-full font-bold">
                आपला मित्र
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-widest text-white/40 font-medium block">
              Marathwada Companion
            </span>
          </div>
        </div>

        {/* Mobile Auth Button */}
        <div className="flex md:hidden items-center space-x-2">
          {currentUser ? (
            <div className="flex items-center space-x-1.5">
              <button
                onClick={onOpenAuthModal}
                className="flex items-center space-x-1.5 p-1 px-2 rounded-full bg-zinc-900 border border-zinc-800"
              >
                <img
                  src={currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.displayName}`}
                  alt={currentUser.displayName}
                  className="w-5 h-5 rounded-full bg-zinc-800"
                />
                <span className="text-xs font-medium text-zinc-200 truncate max-w-[80px]">{currentUser.displayName.split(' ')[0]}</span>
              </button>
              <button
                onClick={logout}
                title="Log Out (साइन ऑफ)"
                className="p-1.5 rounded-full bg-zinc-900 hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300 border border-zinc-800"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuthModal}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-xl bg-amber-500 text-zinc-950 font-bold text-xs"
            >
              <LogIn className="w-3 h-3" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="flex items-center overflow-x-auto max-w-full p-1 bg-zinc-950/80 rounded-2xl border border-zinc-800 text-xs font-semibold scrollbar-none">
        <button
          onClick={() => onSelectTab('voice')}
          className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition whitespace-nowrap ${
            activeTab === 'voice'
              ? 'bg-[#F27D26] text-black font-bold shadow'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Mic className="w-3.5 h-3.5" />
          <span>Live Voice</span>
          {isLiveActive && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
          )}
        </button>

        <button
          onClick={() => onSelectTab('profile')}
          className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition whitespace-nowrap ${
            activeTab === 'profile'
              ? 'bg-[#F27D26] text-black font-bold shadow'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>My Profile</span>
        </button>

        <button
          onClick={() => onSelectTab('conversations')}
          className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition whitespace-nowrap ${
            activeTab === 'conversations'
              ? 'bg-[#F27D26] text-black font-bold shadow'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Conversations</span>
        </button>

        <button
          onClick={() => onSelectTab('groups')}
          className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition whitespace-nowrap ${
            activeTab === 'groups'
              ? 'bg-[#F27D26] text-black font-bold shadow'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Circles</span>
        </button>

        <button
          onClick={() => onSelectTab('memory')}
          className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition whitespace-nowrap ${
            activeTab === 'memory'
              ? 'bg-[#F27D26] text-black font-bold shadow'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Brain className="w-3.5 h-3.5" />
          <span>Memories</span>
        </button>

        {isAdmin && (
          <button
            onClick={() => onSelectTab('admin')}
            className={`px-3 py-1.5 rounded-xl flex items-center space-x-1.5 transition whitespace-nowrap ${
              activeTab === 'admin'
                ? 'bg-[#F27D26] text-black font-bold shadow'
                : 'text-amber-400 hover:text-amber-300'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Admin Studio</span>
          </button>
        )}
      </nav>

      {/* User Identity & Log Out Controls */}
      <div className="hidden md:flex items-center space-x-2">
        {currentUser ? (
          <div className="flex items-center space-x-2">
            <button
              onClick={onOpenAuthModal}
              title="Account & Profile Settings"
              className="flex items-center space-x-2.5 px-3 py-1.5 rounded-2xl bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition"
            >
              <img
                src={currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.displayName}`}
                alt={currentUser.displayName}
                className="w-6 h-6 rounded-full bg-zinc-800 border border-white/10"
              />
              <div className="text-left">
                <div className="flex items-center space-x-1">
                  <span className="text-xs font-bold text-zinc-100 max-w-[130px] truncate">{currentUser.displayName}</span>
                  {currentUser.role === 'ADMIN' && (
                    <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                </div>
                <span className="text-[9px] text-zinc-500 font-mono block -mt-0.5 max-w-[130px] truncate">{currentUser.email}</span>
              </div>
            </button>

            <button
              onClick={logout}
              title="Sign Off / Log Out (साइन ऑफ करा)"
              className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-300 border border-zinc-800 hover:border-rose-500/30 text-xs font-semibold transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuthModal}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-[#F27D26] hover:bg-[#ff8a38] text-black font-bold text-xs shadow-md hover:shadow-lg transition active:scale-[0.98]"
          >
            <LogIn className="w-3.5 h-3.5 text-black" />
            <span>Sign In</span>
          </button>
        )}
      </div>
    </header>
  );
};
