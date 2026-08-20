import React, { useState, useEffect } from 'react';
import { Group, GroupMember } from '../types';
import { Users, Check, UserCheck, Shield, ChevronRight, UserPlus, Sparkles } from 'lucide-react';

interface GroupSelectorProps {
  groups: Group[];
  selectedGroupId: string;
  onSelectGroup: (groupId: string) => void;
  selectedMembers: string[];
  onChangeSelectedMembers: (members: string[]) => void;
  onNavigateToCircles?: () => void;
}

export const GroupSelector: React.FC<GroupSelectorProps> = ({
  groups,
  selectedGroupId,
  onSelectGroup,
  selectedMembers,
  onChangeSelectedMembers,
  onNavigateToCircles,
}) => {
  const [currentGroupDetails, setCurrentGroupDetails] = useState<(Group & { members?: GroupMember[] }) | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);

  useEffect(() => {
    if (groups.length > 0) {
      if (!selectedGroupId || !groups.some((g) => g.id === selectedGroupId)) {
        onSelectGroup(groups[0].id);
      }
    }
  }, [groups, selectedGroupId, onSelectGroup]);

  useEffect(() => {
    if (selectedGroupId && groups.some((g) => g.id === selectedGroupId)) {
      setLoadingMembers(true);
      fetch(`/api/groups/${selectedGroupId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Group not found');
          return res.json();
        })
        .then((data) => {
          if (data && data.id) {
            setCurrentGroupDetails(data);
            // If selected members is currently empty or contains stale members, default select all members of the group
            if (Array.isArray(data.members) && data.members.length > 0) {
              const groupMemberNames = data.members
                .map((m: GroupMember) => m.user?.displayName || m.userId)
                .filter(Boolean);
              if (selectedMembers.length === 0) {
                onChangeSelectedMembers(groupMemberNames);
              }
            }
          }
        })
        .catch((err) => {
          console.warn('Could not load group details:', err);
          if (groups.length > 0) {
            onSelectGroup(groups[0].id);
          }
        })
        .finally(() => setLoadingMembers(false));
    }
  }, [selectedGroupId, groups]);

  const activeMembersList = currentGroupDetails?.members || [];

  const toggleMember = (name: string) => {
    if (selectedMembers.includes(name)) {
      onChangeSelectedMembers(selectedMembers.filter((m) => m !== name));
    } else {
      onChangeSelectedMembers([...selectedMembers, name]);
    }
  };

  const handleSelectAll = () => {
    const allNames = activeMembersList
      .map((m) => m.user?.displayName || m.userId)
      .filter(Boolean);
    onChangeSelectedMembers(allNames);
  };

  const handleClearAll = () => {
    onChangeSelectedMembers([]);
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || currentGroupDetails;

  return (
    <div className="w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-xl space-y-5 text-left">
      {/* Circle Selection Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-400" />
            1. Select Friendship Circle (कट्टा निवडा)
          </label>
          {onNavigateToCircles && (
            <button
              type="button"
              onClick={onNavigateToCircles}
              className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
            >
              <span>Manage Circles</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {groups.length > 1 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {groups.map((grp) => {
              const isSelected = grp.id === selectedGroupId;
              return (
                <button
                  key={grp.id}
                  type="button"
                  onClick={() => onSelectGroup(grp.id)}
                  className={`p-3 rounded-2xl border text-left transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-amber-500/15 border-amber-500/60 text-amber-200 shadow-sm'
                      : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700 text-zinc-300'
                  }`}
                >
                  <div className="truncate">
                    <p className="font-bold text-xs text-zinc-100 truncate">{grp.name}</p>
                    {grp.description && (
                      <p className="text-[10px] text-zinc-400 truncate mt-0.5">{grp.description}</p>
                    )}
                  </div>
                  {isSelected && (
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 ml-2" />
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-zinc-950 p-3 rounded-2xl border border-zinc-800 flex items-center justify-between">
            <div>
              <p className="font-bold text-xs text-zinc-100">{selectedGroup?.name || 'Marathwada Katta'}</p>
              <p className="text-[10px] text-zinc-400">{selectedGroup?.description || 'Active Discussion Circle'}</p>
            </div>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-bold">
              Active
            </span>
          </div>
        )}
      </div>

      {/* Member Attendance Selection Section */}
      <div className="space-y-3 pt-2 border-t border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-zinc-100">
              2. Who's in today? (आज कोण कोण उपस्थित आहे?)
            </h3>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-[11px] text-zinc-400 hover:text-amber-300 font-medium px-2 py-0.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 transition"
            >
              All Present
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-[11px] text-zinc-500 hover:text-zinc-300 font-medium px-2 py-0.5 rounded-lg bg-zinc-800/40 hover:bg-zinc-800 transition"
            >
              Clear
            </button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-400">
          Tap members who are sitting in the room or on the call right now:
        </p>

        {loadingMembers ? (
          <div className="py-6 text-center text-zinc-500 text-xs">Loading circle members...</div>
        ) : activeMembersList.length === 0 ? (
          <div className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl text-center space-y-2">
            <p className="text-xs text-zinc-400">No members found in this circle yet.</p>
            {onNavigateToCircles && (
              <button
                type="button"
                onClick={onNavigateToCircles}
                className="px-3 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite Friends in Circles</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {activeMembersList.map((member) => {
              const displayName = member.user?.displayName || member.userId;
              const isSelected = selectedMembers.includes(displayName);
              return (
                <button
                  key={member.userId}
                  type="button"
                  onClick={() => toggleMember(displayName)}
                  className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/60 text-emerald-100 shadow-sm'
                      : 'bg-zinc-950 border-zinc-800/80 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center space-x-3 truncate">
                    <img
                      src={
                        member.user?.photoURL ||
                        `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(displayName)}`
                      }
                      alt={displayName}
                      className="w-8 h-8 rounded-full bg-zinc-800 border border-white/10 shrink-0"
                    />
                    <div className="truncate">
                      <p className="font-bold text-xs text-zinc-100 truncate">{displayName}</p>
                      <span className="text-[9px] uppercase font-semibold text-zinc-500">
                        {member.role === 'OWNER' ? 'Admin / Host' : 'Member'}
                      </span>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center transition shrink-0 ml-2 ${
                      isSelected
                        ? 'bg-emerald-500 border-emerald-400 text-zinc-950 font-bold'
                        : 'border-zinc-700 bg-zinc-900 text-transparent'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Selected Count Indicator */}
        <div className="pt-2 flex items-center justify-between text-xs text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>
              <strong>{selectedMembers.length}</strong> of {activeMembersList.length} members present today
            </span>
          </span>
          {onNavigateToCircles && (
            <button
              type="button"
              onClick={onNavigateToCircles}
              className="text-amber-400 hover:underline text-[11px]"
            >
              + Add / Invite More
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
