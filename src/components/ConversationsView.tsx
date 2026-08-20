import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Conversation, Utterance, Highlight } from '../types';
import {
  MessageSquare,
  Users,
  User,
  Sparkles,
  Calendar,
  Clock,
  ChevronRight,
  Search,
  CheckCircle,
  Lightbulb,
  CheckSquare,
  Bookmark,
  Volume2,
} from 'lucide-react';

export const ConversationsView: React.FC = () => {
  const { currentUser } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<(Conversation & { utterances?: Utterance[]; highlights?: Highlight[] }) | null>(null);
  const [modeFilter, setModeFilter] = useState<'ALL' | 'SOLO' | 'GROUP'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchConversations = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/conversations?userId=${currentUser.id}`);
      if (res.ok) {
        const data: Conversation[] = await res.json();
        setConversations(data);
        if (data.length > 0 && !selectedConvId) {
          setSelectedConvId(data[0].id);
        }
      }
    } catch (e) {
      console.error('Error loading conversations:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchConversationDetails = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        setSelectedConv(await res.json());
      }
    } catch (e) {
      console.error('Error loading conversation details:', e);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchConversations();
  }, [currentUser?.id]);

  useEffect(() => {
    if (selectedConvId) {
      fetchConversationDetails(selectedConvId);
    }
  }, [selectedConvId]);

  const filtered = conversations.filter((c) => {
    const matchesMode = modeFilter === 'ALL' || c.mode === modeFilter;
    const matchesSearch =
      c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.groupName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.summary?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesMode && matchesSearch;
  });

  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto my-12 p-8 bg-zinc-900/80 border border-zinc-800 rounded-3xl text-center space-y-4 shadow-xl animate-fadeIn">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <MessageSquare className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-white">Login to View Conversations</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Sign in to view your past conversations with Sunny, Marathi transcripts, summaries, and action highlights.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12 animate-fadeIn">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-amber-400" />
            Conversations & Highlights (संभाषण इतिहास)
          </h1>
          <p className="text-xs text-zinc-400">
            Past live voice chats with Sunny, transcript utterances, and key highlights
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="flex p-1 bg-zinc-900 rounded-xl border border-zinc-800">
            <button
              onClick={() => setModeFilter('ALL')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                modeFilter === 'ALL' ? 'bg-amber-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setModeFilter('SOLO')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                modeFilter === 'SOLO' ? 'bg-amber-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Solo
            </button>
            <button
              onClick={() => setModeFilter('GROUP')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
                modeFilter === 'GROUP' ? 'bg-amber-500 text-zinc-950 shadow' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Group
            </button>
          </div>

          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 text-zinc-200 text-xs pl-8 pr-3 py-1.5 rounded-xl focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Main Grid: Left List, Right Detail */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Conversations List */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              Loading conversation history...
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-6 text-center text-zinc-500 text-xs">
              No conversations recorded yet. Start a session with Sunny in Solo or Group mode!
            </div>
          ) : (
            filtered.map((conv) => {
              const isSelected = selectedConvId === conv.id;
              const dateStr = new Date(conv.startedAt).toLocaleDateString([], {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <button
                  key={conv.id}
                  onClick={() => setSelectedConvId(conv.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/60 shadow-lg text-amber-200'
                      : 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase flex items-center gap-1 ${
                        conv.mode === 'SOLO'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {conv.mode === 'SOLO' ? <User className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                      {conv.mode}
                    </span>
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {dateStr}
                    </span>
                  </div>

                  <h3 className="font-bold text-xs text-zinc-100 line-clamp-1">{conv.title}</h3>
                  {conv.summary && (
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-2">{conv.summary}</p>
                  )}

                  <div className="flex items-center space-x-3 text-[10px] text-zinc-500 mt-2.5 pt-2 border-t border-zinc-800/60">
                    <span>{conv.utterancesCount || 0} Utterances</span>
                    <span>•</span>
                    <span className="text-amber-400/80 font-medium">
                      {conv.highlightsCount || 0} Highlights
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Right Column: Selected Conversation Details */}
        <div className="md:col-span-2 space-y-6">
          {detailLoading ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-500 text-xs">
              Loading conversation transcript...
            </div>
          ) : !selectedConv ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-12 text-center text-zinc-500 text-xs">
              Select a conversation to view utterances and discussion highlights.
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-6">
              {/* Top Banner */}
              <div className="border-b border-zinc-800 pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-bold text-zinc-100">{selectedConv.title}</h2>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        selectedConv.mode === 'SOLO'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {selectedConv.mode} Session
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Started on {new Date(selectedConv.startedAt).toLocaleString()}
                  </p>
                </div>
              </div>

              {/* Discussion Highlights (Decisions, Action Items, Insights) */}
              {selectedConv.highlights && selectedConv.highlights.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Key Highlights & Decisions ({selectedConv.highlights.length})
                  </h3>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {selectedConv.highlights.map((hl) => (
                      <div
                        key={hl.id}
                        className="bg-zinc-950 border border-amber-500/20 rounded-2xl p-3.5 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              hl.type === 'DECISION'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : hl.type === 'ACTION_ITEM'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {hl.type}
                          </span>
                          <span className="text-[10px] text-zinc-500">{hl.importance}</span>
                        </div>
                        <p className="text-xs text-zinc-200 font-medium leading-relaxed">
                          {hl.text}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Utterance Transcript Log */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-zinc-400" />
                  Live Spoken Utterances ({selectedConv.utterances?.length || 0})
                </h3>

                <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-2xl p-4 max-h-[420px] overflow-y-auto space-y-3">
                  {!selectedConv.utterances || selectedConv.utterances.length === 0 ? (
                    <p className="text-zinc-500 text-xs text-center py-6">
                      No utterances logged for this session yet.
                    </p>
                  ) : (
                    selectedConv.utterances.map((utt) => (
                      <div
                        key={utt.id}
                        className={`p-3 rounded-xl border text-xs space-y-1 ${
                          utt.speakerType === 'sunny'
                            ? 'bg-amber-500/5 border-amber-500/20 text-zinc-200'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={`font-bold ${
                              utt.speakerType === 'sunny' ? 'text-amber-400' : 'text-zinc-100'
                            }`}
                          >
                            {utt.speakerName || (utt.speakerType === 'sunny' ? 'Sunny (सन्नी)' : 'Friend')}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {new Date(utt.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="pl-1 leading-relaxed">{utt.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
