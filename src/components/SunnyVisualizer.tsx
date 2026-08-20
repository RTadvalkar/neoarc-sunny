import React from 'react';
import { motion } from 'motion/react';
import { Mic, Volume2, Sparkles, AlertCircle, ShieldAlert, ShieldCheck, User, Users, RefreshCw } from 'lucide-react';
import { ConversationMode } from '../types';

interface SunnyVisualizerProps {
  status: 'idle' | 'listening' | 'thinking' | 'speaking';
  isMuted: boolean;
  mode: ConversationMode;
  userName?: string;
  activeMembers: string[];
  isReconnecting?: boolean;
  errorMessage?: string;
}

export const SunnyVisualizer: React.FC<SunnyVisualizerProps> = ({
  status,
  isMuted,
  mode,
  userName = 'Friend',
  activeMembers,
  isReconnecting,
  errorMessage,
}) => {
  const getMarathiStatus = () => {
    if (isReconnecting) return 'पुन्हा जोडत आहे...';
    if (status === 'speaking') return 'सन्नी बोलतोय...';
    if (status === 'thinking') return 'विचार करतोय...';
    if (status === 'listening') return isMuted ? 'माईक बंद आहे' : 'ऐकतोय...';
    return 'तयार आहे';
  };

  const getEnglishStatus = () => {
    if (isReconnecting) return 'Reconnecting Session...';
    if (status === 'speaking') return 'Sunny is Speaking';
    if (status === 'thinking') return 'Sunny is Processing';
    if (status === 'listening') return isMuted ? 'Microphone Muted' : 'Sunny is Listening';
    return 'Sunny is Ready';
  };

  return (
    <div className="flex flex-col items-center justify-center py-4 w-full max-w-xl mx-auto relative z-10">
      {/* Background Glow */}
      <div className="absolute w-[450px] h-[450px] bg-[#F27D26] rounded-full blur-[140px] opacity-20 pointer-events-none -z-10" />

      {/* Mode & Speaker Attribution Safety Pill */}
      <div className="flex items-center space-x-2 mb-3">
        <div
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
            mode === 'SOLO'
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
          }`}
        >
          {mode === 'SOLO' ? <User className="w-3.5 h-3.5" /> : <Users className="w-3.5 h-3.5" />}
          <span>{mode === 'SOLO' ? `Solo Mode (1-on-1 with ${userName})` : 'Group Mode (Circle)'}</span>
        </div>

        {mode === 'GROUP' && (
          <div
            className="flex items-center space-x-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 border border-amber-500/30 text-amber-300"
            title="Speaker identity treated strictly as KNOWN/UNKNOWN. Sunny stays silent unless addressed and never guesses names."
          >
            <ShieldCheck className="w-3 h-3" />
            <span>Attribution Safe</span>
          </div>
        )}
      </div>

      {/* Sunny's Core Glowing Voice Orb */}
      <div className="relative flex items-center justify-center w-60 h-60 my-2">
        {/* Animated Rings for Speaking / Thinking / Listening */}
        {status === 'speaking' && (
          <motion.div
            className="absolute inset-0 rounded-full bg-[#F27D26]/30 blur-2xl"
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.3, 0.8, 0.3],
            }}
            transition={{
              duration: 1.8,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {status === 'listening' && !isMuted && (
          <motion.div
            className="absolute inset-0 rounded-full bg-[#FF9D52]/20 blur-xl"
            animate={{
              scale: [1, 1.15, 1],
              opacity: [0.2, 0.6, 0.2],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />
        )}

        {/* Main Outer Visualizer Sphere */}
        <motion.div
          className={`w-60 h-60 rounded-full bg-gradient-to-br from-[#FF9D52] to-[#F27D26] flex items-center justify-center shadow-[0_0_80px_rgba(242,125,38,0.45)] transition-transform duration-500 ${
            status === 'speaking' ? 'scale-105' : 'scale-100'
          }`}
          animate={{
            scale: status === 'speaking' ? [1, 1.06, 1] : status === 'thinking' ? [0.98, 1.02, 0.98] : 1,
          }}
          transition={{
            duration: 1.2,
            repeat: status !== 'idle' ? Infinity : 0,
            ease: 'easeInOut',
          }}
        >
          <div className="w-52 h-52 rounded-full border-4 border-black/20 flex items-center justify-center">
            <div className="w-44 h-44 rounded-full border-2 border-white/30 flex items-center justify-center flex-col text-center p-2 bg-black/10 backdrop-blur-xs">
              <span className="text-3xl font-black tracking-tight text-white drop-shadow-md">
                Sunny
              </span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-100/90 mt-0.5">
                {mode === 'SOLO' ? 'मित्र' : 'मराठवाडा मित्र'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Main Status Text */}
      <div className="mt-4 text-center space-y-1">
        <h2 className="text-3xl font-light tracking-tight text-white flex items-center justify-center gap-2">
          {isReconnecting && <RefreshCw className="w-5 h-5 animate-spin text-amber-400" />}
          {getMarathiStatus()}
        </h2>
        <p className="text-[#F27D26] font-medium tracking-[0.2em] uppercase text-xs opacity-90">
          {getEnglishStatus()}
        </p>
      </div>

      {/* Marathi Flavor Subtitle Quote Banner */}
      <div className="mt-4 bg-white/5 px-6 py-2 rounded-2xl border border-white/10 shadow-sm backdrop-blur-sm">
        <p className="text-xs italic text-white/80">
          {mode === 'SOLO' ? `"काय ${userName}, काय चाललंय आज?"` : `"काय राव, आज काय विषय?"`}
        </p>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mt-3 flex items-center space-x-2 bg-rose-500/10 text-rose-300 border border-rose-500/30 px-4 py-2 rounded-xl text-xs max-w-md">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Active Speaker Indicators in Group Mode */}
      {mode === 'GROUP' && (
        <div className="mt-6 w-full px-4 flex flex-col items-center space-y-2.5">
          <span className="text-[10px] uppercase font-bold tracking-widest text-white/40">
            Friends in Circle ({activeMembers.length + 1})
          </span>
          <div className="flex flex-wrap justify-center gap-3">
            {/* Sunny Badge */}
            <div className="flex flex-col items-center gap-1">
              <div className="w-9 h-9 rounded-full bg-[#F27D26]/20 border border-[#F27D26] flex items-center justify-center text-xs font-bold text-[#F27D26] shadow-[0_0_15px_rgba(242,125,38,0.25)]">
                S
              </div>
              <span className="text-[9px] uppercase font-bold text-[#F27D26]">Sunny</span>
            </div>

            {/* Member Badges */}
            {activeMembers.map((member) => (
              <div key={member} className="flex flex-col items-center gap-1">
                <div className="w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-xs font-bold text-white/90">
                  {member.charAt(0)}
                </div>
                <span className="text-[9px] uppercase font-bold text-white/60">{member}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
