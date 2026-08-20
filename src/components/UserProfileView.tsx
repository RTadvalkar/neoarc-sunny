import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ProfileTemplate, UserProfileValue } from '../types';
import {
  User,
  ShieldCheck,
  Award,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  Edit3,
  Save,
  X,
  MessageSquareQuote,
  TrendingUp,
} from 'lucide-react';

export const UserProfileView: React.FC = () => {
  const { currentUser } = useAuth();
  const [template, setTemplate] = useState<ProfileTemplate | null>(null);
  const [profileValues, setProfileValues] = useState<Record<string, UserProfileValue>>({});
  const [loading, setLoading] = useState(true);
  const [editingFieldKey, setEditingFieldKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchProfileData = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const [tplRes, valRes] = await Promise.all([
        fetch('/api/templates/published'),
        fetch(`/api/profiles/${currentUser.id}`),
      ]);
      if (tplRes.ok) setTemplate(await tplRes.json());
      if (valRes.ok) setProfileValues(await valRes.json());
    } catch (e) {
      console.error('Error fetching profile data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfileData();
  }, [currentUser?.id]);

  const handleSaveField = async (fieldKey: string) => {
    if (!currentUser || !editValue.trim()) return;
    try {
      const res = await fetch(`/api/profiles/${currentUser.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fieldKey,
          value: editValue.trim(),
          source: 'MANUAL',
          confidence: 'high',
        }),
      });
      if (res.ok) {
        const saved: UserProfileValue = await res.json();
        setProfileValues((prev) => ({ ...prev, [fieldKey]: saved }));
        setEditingFieldKey(null);
        setEditValue('');
      }
    } catch (e) {
      console.error('Error saving field:', e);
    }
  };

  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto my-12 p-8 bg-zinc-900/80 border border-zinc-800 rounded-3xl text-center space-y-4 shadow-xl animate-fadeIn">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <User className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-white">Profile Login Required</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Sign in to view your Marathwada profile attributes, learning completion stats, and customized facts recorded by Sunny.
        </p>
      </div>
    );
  }

  const fields = template?.fields.filter((f) => f.active) || [];
  const totalFields = fields.length;
  const collectedFieldsCount = fields.filter((f) => !!profileValues[f.fieldKey]?.value).length;
  const completionPercentage = totalFields > 0 ? Math.round((collectedFieldsCount / totalFields) * 100) : 0;

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 pb-12 animate-fadeIn">
      {/* Profile Header Hero */}
      <div className="bg-gradient-to-br from-zinc-900 via-zinc-900/90 to-zinc-950 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center space-x-5">
            <div className="relative">
              <img
                src={currentUser.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.displayName}`}
                alt={currentUser.displayName}
                className="w-20 h-20 rounded-2xl bg-zinc-800 border-2 border-amber-500/30 object-cover shadow-lg"
              />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-zinc-900 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex items-center space-x-2.5">
                <h1 className="text-2xl font-black text-zinc-100 tracking-tight">
                  {currentUser.displayName}
                </h1>
                {currentUser.role === 'ADMIN' && (
                  <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Admin
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 font-mono">{currentUser.email}</p>
              <p className="text-[11px] text-zinc-500 flex items-center gap-1 pt-0.5">
                <span>Google Auth Identity</span> • <span>UID: {currentUser.id}</span>
              </p>
            </div>
          </div>

          {/* Progressive Profile Completion Badge */}
          <div className="w-full sm:w-auto bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 min-w-[220px]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-400" />
                Sunny's Profile Memory
              </span>
              <span className="text-xs font-black text-amber-400 font-mono">
                {completionPercentage}%
              </span>
            </div>
            <div className="w-full h-2.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-700"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500 mt-2">
              {collectedFieldsCount} of {totalFields} details shared with Sunny
            </p>
          </div>
        </div>
      </div>

      {/* Profile Companion Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start space-x-3">
        <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs">
          <p className="font-bold text-amber-300">
            Natural Friendship & Conversations (संभाषणातून ओळख)
          </p>
          <p className="text-zinc-300 leading-relaxed">
            In <strong>Solo Mode</strong>, Sunny naturally gets to know your career, hometown, goals, and passions
            over time as a close friend during conversations. You can also view or update your details manually below.
          </p>
        </div>
      </div>

      {/* Progressive Fields Breakdown */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-lg space-y-5">
        <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-zinc-100">
              Profile Attributes ({template?.name || 'Onboarding Template'})
            </h2>
            <p className="text-xs text-zinc-400">
              Version {template?.version || '1.0'} • Managed by Sunny Admin
            </p>
          </div>
          <span className="text-xs font-semibold px-3 py-1 bg-zinc-800 text-zinc-300 rounded-full border border-zinc-700">
            {collectedFieldsCount}/{totalFields} Completed
          </span>
        </div>

        {loading ? (
          <div className="text-center py-12 text-zinc-500 text-sm">
            Loading profile attributes...
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => {
              const valObj = profileValues[field.fieldKey];
              const isCollected = !!valObj?.value;
              const isEditing = editingFieldKey === field.fieldKey;

              return (
                <div
                  key={field.id}
                  className={`p-4 rounded-2xl border transition relative group ${
                    isCollected
                      ? 'bg-zinc-950/80 border-zinc-800 hover:border-amber-500/40'
                      : 'bg-zinc-950/30 border-dashed border-zinc-800/70'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-zinc-100">{field.label}</span>
                        <span
                          className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            field.collectionPriority === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              : field.collectionPriority === 'MEDIUM'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {field.collectionPriority} Priority
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400">{field.description}</p>
                    </div>

                    <div className="flex items-center space-x-1 pl-2">
                      {isCollected ? (
                        <div className="flex items-center text-emerald-400" title="Learned by Sunny">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="flex items-center text-zinc-600" title="Not collected yet">
                          <HelpCircle className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Value / Edit input */}
                  <div className="mt-3 pt-2.5 border-t border-zinc-800/60">
                    {isEditing ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder={`Enter your ${field.label.toLowerCase()}...`}
                          className="w-full bg-zinc-900 border border-amber-500 text-xs px-3 py-1.5 rounded-xl text-zinc-100 focus:outline-none"
                          autoFocus
                        />
                        <div className="flex justify-end space-x-2">
                          <button
                            onClick={() => setEditingFieldKey(null)}
                            className="px-2.5 py-1 text-zinc-400 hover:text-zinc-200 text-xs"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveField(field.fieldKey)}
                            className="px-3 py-1 bg-amber-500 text-zinc-950 font-bold text-xs rounded-lg flex items-center space-x-1"
                          >
                            <Save className="w-3 h-3" />
                            <span>Save</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        {isCollected ? (
                          <div className="space-y-1">
                            <p className="text-xs font-semibold text-amber-200 leading-relaxed">
                              {typeof valObj.value === 'object'
                                ? JSON.stringify(valObj.value)
                                : String(valObj.value)}
                            </p>
                            <div className="flex items-center space-x-2 text-[10px] text-zinc-500">
                              <span>Source: {valObj.source}</span>
                              <span>•</span>
                              <span className="capitalize">Confidence: {valObj.confidence}</span>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <p className="text-xs text-zinc-500 italic">
                              Sunny's Marathi prompt: "{field.initialPrompt}"
                            </p>
                          </div>
                        )}

                        <button
                          onClick={() => {
                            setEditingFieldKey(field.fieldKey);
                            setEditValue(valObj?.value ? String(valObj.value) : '');
                          }}
                          className="p-1 text-zinc-500 hover:text-amber-400 transition"
                          title="Edit Value"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
