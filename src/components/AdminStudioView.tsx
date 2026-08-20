import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { ProfileTemplate, ProfileField, SunnyUser, UserRole } from '../types';
import {
  ShieldAlert,
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  Check,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Sliders,
  Users,
  Activity,
  X,
  Save,
  CheckCircle,
} from 'lucide-react';

export const AdminStudioView: React.FC = () => {
  const { currentUser, allUsers, toggleRole, refreshUsers, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<'templates' | 'users' | 'system'>('templates');

  // Template State
  const [templates, setTemplates] = useState<ProfileTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<ProfileTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  // Field Edit / Add Modal
  const [editingField, setEditingField] = useState<Partial<ProfileField> | null>(null);
  const [isAddingField, setIsAddingField] = useState(false);

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        const data: ProfileTemplate[] = await res.json();
        setTemplates(data);
        const pub = data.find((t) => t.status === 'PUBLISHED') || data[0];
        setSelectedTemplate(pub || null);
      }
    } catch (e) {
      console.error('Error loading templates:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  if (!isAdmin) {
    return (
      <div className="w-full max-w-xl mx-auto p-12 bg-zinc-900 border border-zinc-800 rounded-3xl text-center space-y-4">
        <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
        <h2 className="text-lg font-bold text-zinc-100">Admin Access Required</h2>
        <p className="text-xs text-zinc-400">
          You are currently signed in as <strong>{currentUser?.displayName}</strong> ({currentUser?.role}).
          To access the Admin Studio, switch to an Admin account or update user roles.
        </p>
      </div>
    );
  }

  // --- Field Operations ---
  const handleSaveField = async () => {
    if (!selectedTemplate || !editingField?.fieldKey || !editingField?.label) return;
    try {
      if (editingField.id) {
        // Update
        const res = await fetch(
          `/api/templates/${selectedTemplate.id}/fields/${editingField.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(editingField),
          }
        );
        if (res.ok) {
          await fetchTemplates();
        }
      } else {
        // Add
        const res = await fetch(`/api/templates/${selectedTemplate.id}/fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...editingField,
            active: true,
            displayOrder: selectedTemplate.fields.length + 1,
            dataType: editingField.dataType || 'STRING',
            collectionPriority: editingField.collectionPriority || 'HIGH',
            collectionStrategy: editingField.collectionStrategy || 'CONVERSATIONAL',
            visibility: editingField.visibility || 'PUBLIC',
            sensitivity: editingField.sensitivity || 'LOW',
            askNaturally: true,
            initialPrompt: editingField.initialPrompt || 'काय चाललंय?',
            contextUsage: editingField.contextUsage || 'Authentic background rapport',
          }),
        });
        if (res.ok) {
          await fetchTemplates();
        }
      }
      setEditingField(null);
      setIsAddingField(false);
    } catch (e) {
      console.error('Error saving field:', e);
    }
  };

  const handleDeleteField = async (fieldId: string) => {
    if (!selectedTemplate || !confirm('Are you sure you want to delete this profile attribute?')) return;
    try {
      const res = await fetch(`/api/templates/${selectedTemplate.id}/fields/${fieldId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchTemplates();
      }
    } catch (e) {
      console.error('Error deleting field:', e);
    }
  };

  const handleToggleFieldActive = async (field: ProfileField) => {
    if (!selectedTemplate) return;
    try {
      await fetch(`/api/templates/${selectedTemplate.id}/fields/${field.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !field.active }),
      });
      await fetchTemplates();
    } catch (e) {
      console.error(e);
    }
  };

  const handleMoveField = async (fieldIndex: number, direction: 'UP' | 'DOWN') => {
    if (!selectedTemplate) return;
    const fields = [...selectedTemplate.fields];
    const targetIndex = direction === 'UP' ? fieldIndex - 1 : fieldIndex + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;

    // Swap
    const temp = fields[fieldIndex];
    fields[fieldIndex] = fields[targetIndex];
    fields[targetIndex] = temp;

    const orderedIds = fields.map((f) => f.id);
    try {
      await fetch(`/api/templates/${selectedTemplate.id}/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedFieldIds: orderedIds }),
      });
      await fetchTemplates();
    } catch (e) {
      console.error('Error reordering fields:', e);
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 pb-12 animate-fadeIn">
      {/* Top Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl font-black text-zinc-100">Sunny Admin Studio</span>
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded-full font-bold">
              Admin Mode
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Build conversational profile templates, configure field prompts, and manage user roles
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex p-1 bg-zinc-950 rounded-2xl border border-zinc-800">
          <button
            onClick={() => setActiveTab('templates')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
              activeTab === 'templates'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Profile Templates</span>
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition ${
              activeTab === 'users'
                ? 'bg-amber-500 text-zinc-950 shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>User Roles</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Profile Templates Builder */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {loading || !selectedTemplate ? (
            <div className="text-center py-12 text-zinc-500 text-xs">
              Loading templates...
            </div>
          ) : (
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-6">
              {/* Template Info Bar */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center space-x-2.5">
                    <h2 className="text-lg font-bold text-zinc-100">{selectedTemplate.name}</h2>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                      {selectedTemplate.status}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      v{selectedTemplate.version}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{selectedTemplate.description}</p>
                </div>

                <button
                  onClick={() => {
                    setIsAddingField(true);
                    setEditingField({
                      fieldKey: '',
                      label: '',
                      description: '',
                      dataType: 'STRING',
                      collectionPriority: 'HIGH',
                      collectionStrategy: 'CONVERSATIONAL',
                      initialPrompt: '',
                      contextUsage: '',
                      active: true,
                    });
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl flex items-center space-x-1.5 transition shadow"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Profile Field</span>
                </button>
              </div>

              {/* Template Fields List */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Configured Attributes & Prompts ({selectedTemplate.fields.length})
                </h3>

                <div className="space-y-3">
                  {selectedTemplate.fields.map((field, idx) => (
                    <div
                      key={field.id}
                      className={`p-4 rounded-2xl border transition ${
                        field.active
                          ? 'bg-zinc-950 border-zinc-800'
                          : 'bg-zinc-950/40 border-zinc-900 opacity-60'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center space-x-2.5">
                            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                              #{field.displayOrder} {field.fieldKey}
                            </span>
                            <span className="text-sm font-bold text-zinc-100">{field.label}</span>
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase ${
                                field.collectionPriority === 'HIGH'
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : field.collectionPriority === 'MEDIUM'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {field.collectionPriority} Priority
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              ({field.dataType})
                            </span>
                          </div>

                          <p className="text-xs text-zinc-400">{field.description}</p>

                          {field.initialPrompt && (
                            <div className="text-[11px] text-amber-300/90 italic bg-zinc-900/80 px-3 py-1.5 rounded-xl border border-zinc-800 inline-block mt-1">
                              💬 Marathi Question: "{field.initialPrompt}"
                            </div>
                          )}
                        </div>

                        {/* Actions: Move Up, Move Down, Edit, Toggle, Delete */}
                        <div className="flex items-center space-x-2 shrink-0">
                          <button
                            onClick={() => handleMoveField(idx, 'UP')}
                            disabled={idx === 0}
                            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg disabled:opacity-30"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleMoveField(idx, 'DOWN')}
                            disabled={idx === selectedTemplate.fields.length - 1}
                            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg disabled:opacity-30"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleToggleFieldActive(field)}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition ${
                              field.active
                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                            }`}
                          >
                            {field.active ? 'Active' : 'Disabled'}
                          </button>

                          <button
                            onClick={() => {
                              setEditingField(field);
                              setIsAddingField(false);
                            }}
                            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-amber-400 rounded-lg"
                            title="Edit Field"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteField(field.id)}
                            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-rose-400 rounded-lg"
                            title="Delete Field"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: User Roles Manager */}
      {activeTab === 'users' && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-xl space-y-4">
          <div className="border-b border-zinc-800 pb-4">
            <h2 className="text-base font-bold text-zinc-100">Registered Users & Role Management</h2>
            <p className="text-xs text-zinc-400">
              Users on the admin allowlist are automatically granted ADMIN privileges
            </p>
          </div>

          <div className="space-y-3">
            {allUsers.map((u) => (
              <div
                key={u.id}
                className="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={u.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.displayName}`}
                    alt={u.displayName}
                    className="w-10 h-10 rounded-full bg-zinc-800 border border-white/10"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <p className="font-bold text-xs text-zinc-100">{u.displayName}</p>
                      {u.role === 'ADMIN' && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.2 rounded-full font-bold">
                          Admin
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-400">{u.email}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleRole(u.id, u.role === 'ADMIN' ? 'USER' : 'ADMIN')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition ${
                      u.role === 'ADMIN'
                        ? 'bg-amber-500 text-zinc-950 border-amber-400'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    Role: {u.role} (Click to toggle)
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Field Editor Submodal */}
      {editingField && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <h3 className="text-sm font-bold text-zinc-100">
                {editingField.id ? 'Edit Attribute & Prompt' : 'Add New Attribute'}
              </h3>
              <button
                onClick={() => setEditingField(null)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Field Key</label>
                  <input
                    type="text"
                    placeholder="e.g. hometown"
                    value={editingField.fieldKey || ''}
                    onChange={(e) =>
                      setEditingField({ ...editingField, fieldKey: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
                    disabled={!!editingField.id}
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Display Label</label>
                  <input
                    type="text"
                    placeholder="e.g. Hometown / City"
                    value={editingField.label || ''}
                    onChange={(e) =>
                      setEditingField({ ...editingField, label: e.target.value })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Description</label>
                <input
                  type="text"
                  placeholder="e.g. Native place or current city in Maharashtra"
                  value={editingField.description || ''}
                  onChange={(e) =>
                    setEditingField({ ...editingField, description: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-400 mb-1">Collection Priority</label>
                  <select
                    value={editingField.collectionPriority || 'HIGH'}
                    onChange={(e) =>
                      setEditingField({
                        ...editingField,
                        collectionPriority: e.target.value as any,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="HIGH">HIGH Priority</option>
                    <option value="MEDIUM">MEDIUM Priority</option>
                    <option value="LOW">LOW Priority</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Data Type</label>
                  <select
                    value={editingField.dataType || 'STRING'}
                    onChange={(e) =>
                      setEditingField({
                        ...editingField,
                        dataType: e.target.value as any,
                      })
                    }
                    className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    <option value="STRING">STRING</option>
                    <option value="NUMBER">NUMBER</option>
                    <option value="ARRAY">ARRAY (List)</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">
                  Sunny's Marathi Conversational Question (Initial Prompt)
                </label>
                <textarea
                  placeholder="e.g. मूळ कुठला आहेस तू? पुण्यातच असतोस की मराठवाड्यात?"
                  value={editingField.initialPrompt || ''}
                  onChange={(e) =>
                    setEditingField({ ...editingField, initialPrompt: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500 h-20"
                />
              </div>

              <div>
                <label className="block text-zinc-400 mb-1">Context Usage for Sunny</label>
                <input
                  type="text"
                  placeholder="e.g. Used for regional references and dialect rapport"
                  value={editingField.contextUsage || ''}
                  onChange={(e) =>
                    setEditingField({ ...editingField, contextUsage: e.target.value })
                  }
                  className="w-full bg-zinc-950 border border-zinc-800 p-2.5 rounded-xl text-zinc-100 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setEditingField(null)}
                className="px-3 py-1.5 text-zinc-400 hover:text-zinc-200 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveField}
                className="px-4 py-1.5 bg-amber-500 text-zinc-950 font-bold text-xs rounded-xl"
              >
                Save Attribute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
