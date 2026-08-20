import React, { useState, useEffect } from 'react';
import { Memory } from '../types';
import { useAuth } from '../context/AuthContext';
import { Brain, Trash2, Edit2, Plus, X, Search, Check, AlertCircle, User, Users, Sparkles } from 'lucide-react';

interface MemoryManagerProps {
  isOpen?: boolean;
  onClose?: () => void;
  standalone?: boolean;
}

export const MemoryManager: React.FC<MemoryManagerProps> = ({
  isOpen = true,
  onClose,
  standalone = false,
}) => {
  const { currentUser } = useAuth();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [filterType, setFilterType] = useState<'USER' | 'GROUP' | 'ALL'>('USER');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit / Add Modal state
  const [editingMemory, setEditingMemory] = useState<Partial<Memory> | null>(null);

  useEffect(() => {
    if (currentUser) {
      fetchMemories();
    }
  }, [currentUser?.id, currentUser?.displayName]);

  const fetchMemories = async () => {
    if (!currentUser) return;
    setLoading(true);
    setError(null);
    try {
      const userParam = encodeURIComponent(currentUser.displayName.split(' ')[0]);
      const res = await fetch(`/api/memories?userId=${encodeURIComponent(currentUser.id)}&personName=${userParam}`);
      if (res.ok) {
        setMemories(await res.json());
      } else {
        setError('Failed to load memories');
      }
    } catch (err) {
      console.error(err);
      setError('Could not connect to memory server');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMemory = async () => {
    if (!editingMemory?.fact || !currentUser) return;
    try {
      if (editingMemory.id) {
        // Update
        const res = await fetch(`/api/memories/${editingMemory.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(editingMemory),
        });
        if (res.ok) {
          const updated: Memory = await res.json();
          setMemories((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      } else {
        // Create
        const isGroupMode = filterType === 'GROUP' || editingMemory.personName === 'Group';
        const res = await fetch('/api/memories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...editingMemory,
            userId: isGroupMode ? undefined : currentUser.id,
            personName: isGroupMode ? 'Group' : (editingMemory.personName || currentUser.displayName.split(' ')[0]),
          }),
        });
        if (res.ok) {
          const created: Memory = await res.json();
          setMemories((prev) => [created, ...prev]);
        }
      }
      setEditingMemory(null);
    } catch (err) {
      console.error('Error saving memory:', err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this memory?')) return;
    try {
      const res = await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMemories((prev) => prev.filter((m) => m.id !== id));
      }
    } catch (err) {
      console.error('Error deleting memory:', err);
    }
  };

  if (!isOpen && !standalone) return null;

  if (!currentUser) {
    return (
      <div className="w-full max-w-md mx-auto my-12 p-8 bg-zinc-900/80 border border-zinc-800 rounded-3xl text-center space-y-4 shadow-xl animate-fadeIn">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
          <Brain className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-black text-white">Memory Login Required</h2>
        <p className="text-xs text-zinc-400 leading-relaxed">
          Sign in to view your personal memories, saved conversation notes, and circle discussion moments with Sunny.
        </p>
      </div>
    );
  }

  const currentFirst = currentUser.displayName.split(' ')[0].toLowerCase();
  const currentFull = currentUser.displayName.toLowerCase();

  // Strictly enforce user-specific and group-only visibility
  const accessibleMemories = memories.filter((m) => {
    const pName = (m.personName || '').toLowerCase();
    const isMyMem = m.userId === currentUser.id || pName === currentFirst || pName === currentFull;
    const isGroupMem = pName === 'group' || !!m.groupId || (!m.userId && (pName === 'group' || !m.personName));
    return isMyMem || isGroupMem;
  });

  const filteredMemories = accessibleMemories.filter((m) => {
    const pName = (m.personName || '').toLowerCase();
    const isMyMem = m.userId === currentUser.id || pName === currentFirst || pName === currentFull;
    const isGroupMem = pName === 'group' || !!m.groupId || (!m.userId && (pName === 'group' || !m.personName));

    const matchesFilter =
      (filterType === 'USER' && isMyMem) ||
      (filterType === 'GROUP' && isGroupMem) ||
      (filterType === 'ALL' && (isMyMem || isGroupMem));

    const matchesSearch =
      m.fact.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.personName || '').toLowerCase().includes(searchQuery.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const myMemoriesCount = accessibleMemories.filter((m) => {
    const pName = (m.personName || '').toLowerCase();
    return m.userId === currentUser.id || pName === currentFirst || pName === currentFull;
  }).length;

  const groupMemoriesCount = accessibleMemories.filter((m) => {
    const pName = (m.personName || '').toLowerCase();
    return pName === 'group' || !!m.groupId;
  }).length;

  const content = (
    <div className="space-y-4">
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
        <div className="flex p-1 bg-zinc-950 rounded-xl border border-zinc-800">
          <button
            onClick={() => setFilterType('USER')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              filterType === 'USER' ? 'bg-amber-500 text-zinc-950 shadow font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>My Memories ({myMemoriesCount})</span>
          </button>
          <button
            onClick={() => setFilterType('GROUP')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1.5 ${
              filterType === 'GROUP' ? 'bg-amber-500 text-zinc-950 shadow font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Group Circle ({groupMemoriesCount})</span>
          </button>
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1 text-xs font-semibold rounded-lg transition ${
              filterType === 'ALL' ? 'bg-amber-500 text-zinc-950 shadow font-bold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            All ({accessibleMemories.length})
          </button>
        </div>

        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search moments & facts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 text-zinc-200 text-xs pl-8 pr-3 py-1.5 rounded-xl focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            onClick={() =>
              setEditingMemory({
                personName: filterType === 'GROUP' ? 'Group' : currentUser.displayName.split(' ')[0],
                subject: '',
                fact: '',
                context: 'Personal note',
                confidence: 'high',
              })
            }
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center space-x-1 shrink-0 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Memory</span>
          </button>
        </div>
      </div>

      {/* Memories Grid */}
      {loading ? (
        <div className="text-center py-12 text-zinc-500 text-xs">Loading memory notes...</div>
      ) : error ? (
        <div className="p-3 bg-rose-500/10 text-rose-300 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      ) : filteredMemories.length === 0 ? (
        <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-3xl text-center text-zinc-500 text-xs">
          No memories recorded under this filter. Sunny naturally remembers key notes and moments from your friendly conversations!
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filteredMemories.map((mem) => (
            <div
              key={mem.id}
              className="p-4 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl space-y-2 relative group hover:border-zinc-700 transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold px-2 py-0.5 bg-zinc-950 text-amber-300 rounded-md border border-zinc-800">
                    {mem.personName || 'Group'}
                  </span>
                  <span className="text-xs text-zinc-300 font-semibold">{mem.subject}</span>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => setEditingMemory(mem)}
                    className="p-1 text-zinc-500 hover:text-amber-400 rounded transition"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteMemory(mem.id)}
                    className="p-1 text-zinc-500 hover:text-rose-400 rounded transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-zinc-100 font-medium leading-relaxed">{mem.fact}</p>

              <div className="flex items-center justify-between text-[10px] text-zinc-500 pt-1 border-t border-zinc-800/50">
                <span>{mem.context || 'Voice session'}</span>
                <span>{mem.date}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Submodal for Editing Memory */}
      {editingMemory && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 p-6 rounded-3xl w-full max-w-md space-y-4">
            <h3 className="text-sm font-bold text-zinc-100">
              {editingMemory.id ? 'Edit Memory Note' : 'Add Memory Note'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Subject / Topic</label>
                <input
                  type="text"
                  value={editingMemory.subject || ''}
                  onChange={(e) => setEditingMemory({ ...editingMemory, subject: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                  placeholder="e.g. Goa Trip or Career Update"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Person / Circle</label>
                <input
                  type="text"
                  value={editingMemory.personName || ''}
                  onChange={(e) => setEditingMemory({ ...editingMemory, personName: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                  placeholder={`e.g. ${currentUser.displayName.split(' ')[0]} or Group`}
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Fact / Note</label>
                <textarea
                  value={editingMemory.fact || ''}
                  onChange={(e) => setEditingMemory({ ...editingMemory, fact: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500 h-20"
                  placeholder="e.g. Discussion notes or plans shared with Sunny..."
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setEditingMemory(null)}
                className="px-3 py-1.5 bg-zinc-800 text-zinc-300 rounded-xl text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMemory}
                className="px-4 py-1.5 bg-amber-500 text-zinc-950 font-bold rounded-xl text-xs"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (standalone) {
    return (
      <div className="w-full max-w-5xl mx-auto space-y-6 pb-12 animate-fadeIn">
        <div className="border-b border-zinc-800 pb-4">
          <h1 className="text-xl font-bold text-zinc-100 flex items-center gap-2">
            <Brain className="w-5 h-5 text-amber-400" />
            Sunny's Memory Bank (सन्नीची आठवण)
          </h1>
          <p className="text-xs text-zinc-400">
            Personal moments and shared group circle notes remembered by your friend Sunny
          </p>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center space-x-3">
            <Brain className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-base font-bold text-zinc-100">Sunny's Memory Bank</h2>
              <p className="text-xs text-zinc-400">Personal moments and shared circle notes</p>
            </div>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white rounded-xl">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <div className="p-6 overflow-y-auto flex-1">{content}</div>
      </div>
    </div>
  );
};
