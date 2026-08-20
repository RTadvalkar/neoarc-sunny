import fs from 'fs';
import path from 'path';
import {
  SunnyUser,
  ProfileTemplate,
  ProfileField,
  UserProfileValue,
  Group,
  GroupMember,
  GroupInvitation,
  GroupConversationSession,
  Conversation,
  Utterance,
  Highlight,
  Memory,
  UserRole
} from '../../src/types';
import {
  IUserRepository,
  IProfileRepository,
  ITemplateRepository,
  IConversationRepository,
  IGroupRepository,
  IGroupSessionRepository,
  IMemoryRepository
} from './types';

const STORE_PATH = path.join(process.cwd(), 'sunny_firestore_store.json');

// Admin email allowlist configuration (as requested in Section 6.1)
export const ADMIN_EMAIL_ALLOWLIST = [
  'rushikesh.tadwalkar@gmail.com',
  'admin@sunny.app',
];

interface DatastoreSchema {
  users: Record<string, SunnyUser>;
  templates: Record<string, ProfileTemplate>;
  userProfileValues: Record<string, Record<string, UserProfileValue>>; // userId -> fieldKey -> value
  groups: Record<string, Group>;
  groupMembers: Record<string, Record<string, GroupMember>>; // groupId -> userId -> GroupMember
  groupInvitations: Record<string, GroupInvitation>;
  conversations: Record<string, Conversation>;
  groupSessions: Record<string, GroupConversationSession>;
  utterances: Record<string, Utterance[]>; // conversationId -> Utterance[]
  highlights: Record<string, Highlight[]>; // conversationId -> Highlight[]
  memories: Record<string, Memory>;
}

// Initial Default Template (Admin Configurable Profile Collection)
const DEFAULT_PROFILE_TEMPLATE: ProfileTemplate = {
  id: 'template_v1',
  name: 'Sunny Marathi Friend & Background Onboarding',
  description: 'Standard progressive conversational profile template for new and existing friends.',
  version: '1.0.0',
  status: 'PUBLISHED',
  publishedAt: '2026-08-08T00:00:00.000Z',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  createdBy: 'system_admin',
  fields: [
    {
      id: 'f_profession',
      fieldKey: 'profession',
      label: 'Profession / Work Area',
      description: 'Current job, profession, or core career domain',
      dataType: 'STRING',
      required: true,
      active: true,
      displayOrder: 1,
      collectionPriority: 'HIGH',
      askNaturally: true,
      initialPrompt: 'सध्या तू नेमकं काय करतोस? Software, business की अजून काही?',
      clarificationPrompt: 'कोणत्या कंपनीत किंवा काय role आहे तुझा?',
      visibility: 'PUBLIC',
      sensitivity: 'LOW',
      contextUsage: 'Used to provide relevant career advice and authentic conversational rapport',
      collectionStrategy: 'CONVERSATIONAL'
    },
    {
      id: 'f_hometown',
      fieldKey: 'hometown',
      label: 'Hometown / Location in Maharashtra',
      description: 'Native place, hometown, or current city (e.g. Pune, Sambhajinagar/Aurangabad, Nanded, Mumbai)',
      dataType: 'STRING',
      required: false,
      active: true,
      displayOrder: 2,
      collectionPriority: 'HIGH',
      askNaturally: true,
      initialPrompt: 'मूळ कुठला आहेस तू? पुण्यातच असतोस की मराठवाड्यात?',
      visibility: 'PUBLIC',
      sensitivity: 'LOW',
      contextUsage: 'Authentic regional Marathwada dialect nuances and local references',
      collectionStrategy: 'CONVERSATIONAL'
    },
    {
      id: 'f_current_goals',
      fieldKey: 'currentGoals',
      label: 'Current 6-Month Goals / Venture',
      description: 'Main personal or professional focus (e.g. Building startup, exam, fitness, investments)',
      dataType: 'STRING',
      required: false,
      active: true,
      displayOrder: 3,
      collectionPriority: 'MEDIUM',
      askNaturally: true,
      initialPrompt: 'सध्या सगळ्यात मोठा focus काय आहे तुझा? काही नवीन plan चाललाय का?',
      visibility: 'GROUP',
      sensitivity: 'MEDIUM',
      contextUsage: 'Helps Sunny follow up on previous plans and hold the user accountable like a true friend',
      collectionStrategy: 'CONVERSATIONAL'
    },
    {
      id: 'f_hobbies',
      fieldKey: 'hobbies',
      label: 'Interests & Passions',
      description: 'Sports, movies, trekking, cricket, tech gadgets, reading',
      dataType: 'ARRAY',
      required: false,
      active: true,
      displayOrder: 4,
      collectionPriority: 'MEDIUM',
      askNaturally: true,
      initialPrompt: 'रिकाम्या वेळात काय करायला आवडतं तुला? Cricket, trekking, की web series?',
      visibility: 'PUBLIC',
      sensitivity: 'LOW',
      contextUsage: 'Casual banter and relatable weekend conversation starters',
      collectionStrategy: 'CONVERSATIONAL'
    },
    {
      id: 'f_favorite_food',
      fieldKey: 'foodPreference',
      label: 'Food & Regional Cuisine Preference',
      description: 'Favorite food, street food, misal, Marathwada spice preferences',
      dataType: 'STRING',
      required: false,
      active: true,
      displayOrder: 5,
      collectionPriority: 'LOW',
      askNaturally: true,
      initialPrompt: 'जेवणात काय आवडतं? अस्सल मराठवाडी तिखट की साधी चव?',
      visibility: 'PUBLIC',
      sensitivity: 'LOW',
      contextUsage: 'Adding warmth and authentic Marathi social banter',
      collectionStrategy: 'CONVERSATIONAL'
    }
  ]
};

// Initial Core Friends Data - Clean start (empty)
const INITIAL_USERS: Record<string, SunnyUser> = {};
const INITIAL_GROUPS: Record<string, Group> = {};
const INITIAL_MEMBERS: Record<string, Record<string, GroupMember>> = {};
const INITIAL_PROFILE_VALUES: Record<string, Record<string, UserProfileValue>> = {};
const INITIAL_MEMORIES: Record<string, Memory> = {};

class DatastoreManager {
  private static instance: DatastoreManager;
  private data: DatastoreSchema;

  private constructor() {
    this.data = this.load();
  }

  public static getInstance(): DatastoreManager {
    if (!DatastoreManager.instance) {
      DatastoreManager.instance = new DatastoreManager();
    }
    return DatastoreManager.instance;
  }

  private load(): DatastoreSchema {
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          users: parsed.users || INITIAL_USERS,
          templates: parsed.templates || { [DEFAULT_PROFILE_TEMPLATE.id]: DEFAULT_PROFILE_TEMPLATE },
          userProfileValues: parsed.userProfileValues || INITIAL_PROFILE_VALUES,
          groups: parsed.groups || INITIAL_GROUPS,
          groupMembers: parsed.groupMembers || INITIAL_MEMBERS,
          groupInvitations: parsed.groupInvitations || {},
          conversations: parsed.conversations || {},
          groupSessions: parsed.groupSessions || {},
          utterances: parsed.utterances || {},
          highlights: parsed.highlights || {},
          memories: parsed.memories || INITIAL_MEMORIES,
        };
      }
    } catch (e) {
      console.error('Error loading store, initializing defaults:', e);
    }

    const defaultData: DatastoreSchema = {
      users: { ...INITIAL_USERS },
      templates: { [DEFAULT_PROFILE_TEMPLATE.id]: DEFAULT_PROFILE_TEMPLATE },
      userProfileValues: { ...INITIAL_PROFILE_VALUES },
      groups: { ...INITIAL_GROUPS },
      groupMembers: { ...INITIAL_MEMBERS },
      groupInvitations: {},
      conversations: {},
      groupSessions: {},
      utterances: {},
      highlights: {},
      memories: { ...INITIAL_MEMORIES },
    };
    this.saveDirect(defaultData);
    return defaultData;
  }

  private saveDirect(data: DatastoreSchema) {
    try {
      fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error saving store:', e);
    }
  }

  public save() {
    this.saveDirect(this.data);
  }

  public getData(): DatastoreSchema {
    return this.data;
  }
}

export const dbStore = DatastoreManager.getInstance();

// --- Repositories ---

export class UserRepository implements IUserRepository {
  async getById(id: string): Promise<SunnyUser | null> {
    return dbStore.getData().users[id] || null;
  }

  async getByEmail(email: string): Promise<SunnyUser | null> {
    const users = Object.values(dbStore.getData().users);
    return users.find((u) => u.email.toLowerCase() === email.toLowerCase()) || null;
  }

  async createOrUpdate(user: Partial<SunnyUser> & { email: string; displayName: string }): Promise<SunnyUser> {
    const existing = await this.getByEmail(user.email);
    const users = dbStore.getData().users;
    const now = new Date().toISOString();

    const cleanEmail = user.email.toLowerCase().trim();
    const isAdminByAllowlist = ADMIN_EMAIL_ALLOWLIST.map(e => e.toLowerCase().trim()).includes(cleanEmail);

    let savedUser: SunnyUser;
    if (existing) {
      const updated: SunnyUser = {
        ...existing,
        ...user,
        email: cleanEmail,
        role: (existing.role === 'ADMIN' || isAdminByAllowlist) ? 'ADMIN' : (user.role || existing.role),
        updatedAt: now,
        lastLoginAt: now,
      };
      users[existing.id] = updated;
      savedUser = updated;
    } else {
      // Role assignment rules:
      // 1. Allowlist check (Method B)
      // 2. First user bootstrap (Method C)
      const count = Object.keys(users).length;
      const role: UserRole = user.role || (isAdminByAllowlist || count === 0 ? 'ADMIN' : 'USER');

      const id = user.id || `u_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newUser: SunnyUser = {
        id,
        authProvider: 'google',
        providerSubject: user.providerSubject || `google_${id}`,
        email: cleanEmail,
        displayName: user.displayName.trim(),
        photoURL: user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.displayName.trim())}`,
        role,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
        status: 'active',
      };

      users[id] = newUser;
      savedUser = newUser;
    }

    dbStore.save();

    // Auto-accept any pending invitations for this user's email across all groups
    const groupRepoInstance = new GroupRepository();
    await groupRepoInstance.autoAcceptPendingInvitationsForEmail(cleanEmail, savedUser);

    return savedUser;
  }

  async setRole(userId: string, role: UserRole): Promise<SunnyUser | null> {
    const user = dbStore.getData().users[userId];
    if (!user) return null;
    user.role = role;
    user.updatedAt = new Date().toISOString();
    dbStore.save();
    return user;
  }

  async getAll(): Promise<SunnyUser[]> {
    return Object.values(dbStore.getData().users);
  }

  async count(): Promise<number> {
    return Object.keys(dbStore.getData().users).length;
  }
}

export class ProfileRepository implements IProfileRepository {
  async getProfileValues(userId: string): Promise<Record<string, UserProfileValue>> {
    return dbStore.getData().userProfileValues[userId] || {};
  }

  async setProfileValue(userId: string, value: UserProfileValue): Promise<UserProfileValue> {
    if (!dbStore.getData().userProfileValues[userId]) {
      dbStore.getData().userProfileValues[userId] = {};
    }
    const store = dbStore.getData().userProfileValues[userId];
    const now = new Date().toISOString();
    const updated: UserProfileValue = {
      ...value,
      updatedAt: now,
      collectedAt: value.collectedAt || now,
    };
    store[value.fieldKey] = updated;
    dbStore.save();
    return updated;
  }

  async deleteProfileValue(userId: string, fieldKey: string): Promise<boolean> {
    const store = dbStore.getData().userProfileValues[userId];
    if (store && store[fieldKey]) {
      delete store[fieldKey];
      dbStore.save();
      return true;
    }
    return false;
  }

  async getAllUserProfiles(): Promise<Record<string, Record<string, UserProfileValue>>> {
    return dbStore.getData().userProfileValues;
  }
}

export class TemplateRepository implements ITemplateRepository {
  async getPublishedTemplate(): Promise<ProfileTemplate | null> {
    const templates = Object.values(dbStore.getData().templates);
    return templates.find((t) => t.status === 'PUBLISHED') || templates[0] || null;
  }

  async getAllTemplates(): Promise<ProfileTemplate[]> {
    return Object.values(dbStore.getData().templates);
  }

  async getTemplateById(id: string): Promise<ProfileTemplate | null> {
    return dbStore.getData().templates[id] || null;
  }

  async createTemplate(template: Omit<ProfileTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProfileTemplate> {
    const id = `template_${Date.now()}`;
    const now = new Date().toISOString();
    const newTpl: ProfileTemplate = {
      ...template,
      id,
      createdAt: now,
      updatedAt: now,
      fields: template.fields || [],
    };
    dbStore.getData().templates[id] = newTpl;
    dbStore.save();
    return newTpl;
  }

  async updateTemplate(id: string, updates: Partial<ProfileTemplate>): Promise<ProfileTemplate | null> {
    const tpl = dbStore.getData().templates[id];
    if (!tpl) return null;
    const updated = {
      ...tpl,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    dbStore.getData().templates[id] = updated;
    dbStore.save();
    return updated;
  }

  async publishTemplate(id: string): Promise<ProfileTemplate | null> {
    const templates = dbStore.getData().templates;
    const target = templates[id];
    if (!target) return null;

    // Set all others to DRAFT or ARCHIVED
    Object.values(templates).forEach((t) => {
      if (t.id !== id && t.status === 'PUBLISHED') {
        t.status = 'ARCHIVED';
        t.updatedAt = new Date().toISOString();
      }
    });

    target.status = 'PUBLISHED';
    target.publishedAt = new Date().toISOString();
    target.updatedAt = new Date().toISOString();
    dbStore.save();
    return target;
  }

  async addField(templateId: string, field: Omit<ProfileField, 'id'>): Promise<ProfileField | null> {
    const tpl = dbStore.getData().templates[templateId];
    if (!tpl) return null;
    const fieldId = `f_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newField: ProfileField = {
      ...field,
      id: fieldId,
      displayOrder: field.displayOrder || tpl.fields.length + 1,
    };
    tpl.fields.push(newField);
    tpl.updatedAt = new Date().toISOString();
    dbStore.save();
    return newField;
  }

  async updateField(templateId: string, fieldId: string, updates: Partial<ProfileField>): Promise<ProfileField | null> {
    const tpl = dbStore.getData().templates[templateId];
    if (!tpl) return null;
    const index = tpl.fields.findIndex((f) => f.id === fieldId);
    if (index === -1) return null;
    tpl.fields[index] = { ...tpl.fields[index], ...updates };
    tpl.updatedAt = new Date().toISOString();
    dbStore.save();
    return tpl.fields[index];
  }

  async deleteField(templateId: string, fieldId: string): Promise<boolean> {
    const tpl = dbStore.getData().templates[templateId];
    if (!tpl) return false;
    tpl.fields = tpl.fields.filter((f) => f.id !== fieldId);
    tpl.updatedAt = new Date().toISOString();
    dbStore.save();
    return true;
  }

  async reorderFields(templateId: string, orderedFieldIds: string[]): Promise<ProfileField[] | null> {
    const tpl = dbStore.getData().templates[templateId];
    if (!tpl) return null;
    const fieldMap = new Map(tpl.fields.map((f) => [f.id, f]));
    const reordered: ProfileField[] = [];
    orderedFieldIds.forEach((id, idx) => {
      const f = fieldMap.get(id);
      if (f) {
        f.displayOrder = idx + 1;
        reordered.push(f);
      }
    });
    // Add any missing fields at the end
    tpl.fields.forEach((f) => {
      if (!orderedFieldIds.includes(f.id)) {
        f.displayOrder = reordered.length + 1;
        reordered.push(f);
      }
    });
    tpl.fields = reordered;
    tpl.updatedAt = new Date().toISOString();
    dbStore.save();
    return tpl.fields;
  }
}

export class ConversationRepository implements IConversationRepository {
  async create(conversation: Omit<Conversation, 'id' | 'startedAt'>): Promise<Conversation> {
    const id = `conv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const startedAt = new Date().toISOString();
    const newConv: Conversation = {
      ...conversation,
      id,
      startedAt,
      status: 'ACTIVE',
      highlightsCount: 0,
      utterancesCount: 0,
    };
    dbStore.getData().conversations[id] = newConv;
    dbStore.getData().utterances[id] = [];
    dbStore.getData().highlights[id] = [];
    dbStore.save();
    return newConv;
  }

  async getById(id: string): Promise<Conversation | null> {
    return dbStore.getData().conversations[id] || null;
  }

  async getUserConversations(userId: string): Promise<Conversation[]> {
    return Object.values(dbStore.getData().conversations)
      .filter((c) => c.ownerUserId === userId || (c.groupId && this.isUserInGroup(userId, c.groupId)))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  async getGroupConversations(groupId: string): Promise<Conversation[]> {
    return Object.values(dbStore.getData().conversations)
      .filter((c) => c.groupId === groupId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  private isUserInGroup(userId: string, groupId: string): boolean {
    const groupMembers = dbStore.getData().groupMembers[groupId];
    return !!(groupMembers && groupMembers[userId] && groupMembers[userId].status === 'ACTIVE');
  }

  async update(id: string, updates: Partial<Conversation>): Promise<Conversation | null> {
    const conv = dbStore.getData().conversations[id];
    if (!conv) return null;
    const updated = { ...conv, ...updates };
    dbStore.getData().conversations[id] = updated;
    dbStore.save();
    return updated;
  }

  async addUtterance(conversationId: string, utterance: Omit<Utterance, 'id' | 'startedAt'>): Promise<Utterance> {
    const utterances = dbStore.getData().utterances[conversationId] || [];
    const id = `utt_${Date.now()}_${utterances.length + 1}`;
    const startedAt = new Date().toISOString();
    const newUtt: Utterance = {
      ...utterance,
      id,
      conversationId,
      startedAt,
      sequenceNumber: utterances.length + 1,
    };
    utterances.push(newUtt);
    dbStore.getData().utterances[conversationId] = utterances;

    if (dbStore.getData().conversations[conversationId]) {
      dbStore.getData().conversations[conversationId].utterancesCount = utterances.length;
    }
    dbStore.save();
    return newUtt;
  }

  async getUtterances(conversationId: string): Promise<Utterance[]> {
    return dbStore.getData().utterances[conversationId] || [];
  }

  async addHighlight(conversationId: string, highlight: Omit<Highlight, 'id' | 'createdAt' | 'conversationId'>): Promise<Highlight> {
    const highlights = dbStore.getData().highlights[conversationId] || [];
    const id = `hl_${Date.now()}_${highlights.length + 1}`;
    const newHl: Highlight = {
      ...highlight,
      id,
      conversationId,
      createdAt: new Date().toISOString(),
    };
    highlights.push(newHl);
    dbStore.getData().highlights[conversationId] = highlights;

    if (dbStore.getData().conversations[conversationId]) {
      dbStore.getData().conversations[conversationId].highlightsCount = highlights.length;
    }
    dbStore.save();
    return newHl;
  }

  async getHighlights(conversationId: string): Promise<Highlight[]> {
    return dbStore.getData().highlights[conversationId] || [];
  }
}

export class GroupRepository implements IGroupRepository {
  async create(group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>, ownerUser: SunnyUser): Promise<Group> {
    const id = `g_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newGroup: Group = {
      ...group,
      id,
      ownerUserId: ownerUser.id,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };

    dbStore.getData().groups[id] = newGroup;
    if (!dbStore.getData().groupMembers[id]) {
      dbStore.getData().groupMembers[id] = {};
    }
    dbStore.getData().groupMembers[id][ownerUser.id] = {
      groupId: id,
      userId: ownerUser.id,
      role: 'OWNER',
      status: 'ACTIVE',
      joinedAt: now,
      user: ownerUser,
    };
    dbStore.save();
    return newGroup;
  }

  async getById(id: string): Promise<Group | null> {
    return dbStore.getData().groups[id] || null;
  }

  async getAllGroups(): Promise<Group[]> {
    return Object.values(dbStore.getData().groups);
  }

  async getUserGroups(userId: string): Promise<Group[]> {
    const allGroups = dbStore.getData().groups;
    const memberMap = dbStore.getData().groupMembers;
    const userGroups: Group[] = [];

    for (const [groupId, members] of Object.entries(memberMap)) {
      if (members[userId] && members[userId].status === 'ACTIVE' && allGroups[groupId]) {
        userGroups.push(allGroups[groupId]);
      }
    }
    // Also include if group.ownerUserId === userId
    for (const group of Object.values(allGroups)) {
      if (group.ownerUserId === userId && !userGroups.some((g) => g.id === group.id)) {
        userGroups.push(group);
      }
    }
    return userGroups;
  }

  async getMembers(groupId: string): Promise<GroupMember[]> {
    const membersMap = dbStore.getData().groupMembers[groupId] || {};
    const users = dbStore.getData().users;
    return Object.values(membersMap).map((m) => ({
      ...m,
      user: users[m.userId] || m.user,
    }));
  }

  async addMember(groupId: string, userId: string, role: 'ADMIN' | 'MEMBER'): Promise<GroupMember> {
    if (!dbStore.getData().groupMembers[groupId]) {
      dbStore.getData().groupMembers[groupId] = {};
    }
    const user = dbStore.getData().users[userId];
    const member: GroupMember = {
      groupId,
      userId,
      role,
      status: 'ACTIVE',
      joinedAt: new Date().toISOString(),
      user,
    };
    dbStore.getData().groupMembers[groupId][userId] = member;
    dbStore.save();
    return member;
  }

  async updateMember(groupId: string, userId: string, updates: Partial<GroupMember>): Promise<GroupMember | null> {
    const members = dbStore.getData().groupMembers[groupId];
    if (!members || !members[userId]) return null;
    members[userId] = { ...members[userId], ...updates };
    dbStore.save();
    return members[userId];
  }

  async removeMember(groupId: string, userId: string): Promise<boolean> {
    const members = dbStore.getData().groupMembers[groupId];
    if (!members || !members[userId]) return false;
    delete members[userId];
    dbStore.save();
    return true;
  }

  async delete(id: string): Promise<boolean> {
    if (!dbStore.getData().groups[id]) return false;
    delete dbStore.getData().groups[id];
    delete dbStore.getData().groupMembers[id];
    dbStore.save();
    return true;
  }

  async createInvitation(groupId: string, invitedEmail: string, invitedByUserId: string): Promise<GroupInvitation> {
    const group = dbStore.getData().groups[groupId];
    const inviter = dbStore.getData().users[invitedByUserId];
    const cleanEmail = invitedEmail.toLowerCase().trim();

    // Check if user with this email is already an active member of this circle
    const members = await this.getMembers(groupId);
    const alreadyMember = members.some(
      (m) => m.status === 'ACTIVE' && m.user?.email && m.user.email.toLowerCase().trim() === cleanEmail
    );
    if (alreadyMember) {
      throw new Error(`Member (${cleanEmail}) is already an active member of this circle. Resending or re-inviting is not allowed.`);
    }

    // Check if there is already a pending invitation for this email in this group
    const existingPending = Object.values(dbStore.getData().groupInvitations).find(
      (i) => i.groupId === groupId && i.invitedEmail.toLowerCase().trim() === cleanEmail && i.status === 'PENDING'
    );
    if (existingPending) {
      return existingPending;
    }

    const id = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const token = `tok_${Math.random().toString(36).substring(2, 10)}_${Date.now().toString(36)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const invitation: GroupInvitation = {
      id,
      groupId,
      groupName: group?.name || 'Sunny Group',
      invitedEmail: cleanEmail,
      invitedByUserId,
      invitedByUserName: inviter?.displayName || 'Friend',
      token,
      status: 'PENDING',
      createdAt: now.toISOString(),
      expiresAt,
    };

    dbStore.getData().groupInvitations[id] = invitation;
    dbStore.save();
    return invitation;
  }

  async getInvitationByToken(token: string): Promise<GroupInvitation | null> {
    const invitations = Object.values(dbStore.getData().groupInvitations);
    return invitations.find((i) => i.token === token) || null;
  }

  async getGroupInvitations(groupId: string): Promise<GroupInvitation[]> {
    const members = await this.getMembers(groupId);
    const activeEmails = new Set(
      members
        .filter((m) => m.status === 'ACTIVE' && m.user?.email)
        .map((m) => m.user!.email.toLowerCase().trim())
    );

    const invitations = Object.values(dbStore.getData().groupInvitations).filter((i) => i.groupId === groupId);
    let updated = false;
    for (const inv of invitations) {
      if (inv.status === 'PENDING' && activeEmails.has(inv.invitedEmail.toLowerCase().trim())) {
        inv.status = 'ACCEPTED';
        inv.acceptedAt = inv.acceptedAt || new Date().toISOString();
        updated = true;
      }
    }
    if (updated) {
      dbStore.save();
    }
    return invitations;
  }

  async getUserInvitations(email: string): Promise<GroupInvitation[]> {
    return Object.values(dbStore.getData().groupInvitations).filter(
      (i) => i.invitedEmail.toLowerCase() === email.toLowerCase() && i.status === 'PENDING'
    );
  }

  async acceptInvitation(token: string, user: SunnyUser): Promise<{ group: Group; member: GroupMember } | null> {
    const inv = await this.getInvitationByToken(token);
    if (!inv) return null;

    const group = dbStore.getData().groups[inv.groupId];
    if (!group) return null;

    inv.status = 'ACCEPTED';
    inv.acceptedAt = new Date().toISOString();

    const member = await this.addMember(inv.groupId, user.id, 'MEMBER');
    dbStore.save();
    return { group, member };
  }

  async rejectInvitation(token: string): Promise<GroupInvitation | null> {
    const inv = await this.getInvitationByToken(token);
    if (!inv) return null;

    inv.status = 'REJECTED';
    inv.rejectedAt = new Date().toISOString();
    dbStore.save();
    return inv;
  }

  async revokeInvitation(invitationId: string): Promise<boolean> {
    const inv = dbStore.getData().groupInvitations[invitationId];
    if (!inv) return false;

    inv.status = 'REVOKED';
    dbStore.save();
    return true;
  }

  async autoAcceptPendingInvitationsForEmail(email: string, user: SunnyUser): Promise<number> {
    const cleanEmail = email.toLowerCase().trim();
    const invitations = Object.values(dbStore.getData().groupInvitations);
    const pending = invitations.filter(
      (i) => i.invitedEmail.toLowerCase().trim() === cleanEmail && i.status === 'PENDING'
    );

    const now = new Date().toISOString();
    for (const inv of pending) {
      inv.status = 'ACCEPTED';
      inv.acceptedAt = now;
      if (!dbStore.getData().groupMembers[inv.groupId]) {
        dbStore.getData().groupMembers[inv.groupId] = {};
      }
      dbStore.getData().groupMembers[inv.groupId][user.id] = {
        groupId: inv.groupId,
        userId: user.id,
        role: 'MEMBER',
        status: 'ACTIVE',
        joinedAt: now,
        user,
      };
    }

    if (pending.length > 0) {
      dbStore.save();
    }
    return pending.length;
  }
}

export class MemoryRepository implements IMemoryRepository {
  async addMemory(memory: Omit<Memory, 'id' | 'date'>): Promise<Memory> {
    const id = `m_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const date = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();
    const newMemory: Memory = {
      ...memory,
      id,
      date,
      createdAt: now,
      updatedAt: now,
      confidence: memory.confidence || 'high',
    };
    dbStore.getData().memories[id] = newMemory;
    dbStore.save();
    return newMemory;
  }

  async getById(id: string): Promise<Memory | null> {
    return dbStore.getData().memories[id] || null;
  }

  async getUserMemories(userId: string): Promise<Memory[]> {
    return Object.values(dbStore.getData().memories).filter((m) => m.userId === userId);
  }

  async getGroupMemories(groupId: string): Promise<Memory[]> {
    return Object.values(dbStore.getData().memories).filter((m) => m.groupId === groupId);
  }

  async getAllMemories(): Promise<Memory[]> {
    return Object.values(dbStore.getData().memories).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  async updateMemory(id: string, updates: Partial<Memory>): Promise<Memory | null> {
    const memory = dbStore.getData().memories[id];
    if (!memory) return null;
    const updated = {
      ...memory,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    dbStore.getData().memories[id] = updated;
    dbStore.save();
    return updated;
  }

  async deleteMemory(id: string): Promise<boolean> {
    const memory = dbStore.getData().memories[id];
    if (!memory) return false;
    delete dbStore.getData().memories[id];
    dbStore.save();
    return true;
  }
}

export class GroupSessionRepository implements IGroupSessionRepository {
  async create(sessionData: Omit<GroupConversationSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<GroupConversationSession> {
    const id = `gsess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();
    const session: GroupConversationSession = {
      ...sessionData,
      id,
      status: sessionData.status || 'STARTING',
      createdAt: now,
      updatedAt: now,
    };
    dbStore.getData().groupSessions[id] = session;
    dbStore.save();
    return session;
  }

  async getById(id: string): Promise<GroupConversationSession | null> {
    return dbStore.getData().groupSessions[id] || null;
  }

  async getActiveByGroupId(groupId: string): Promise<GroupConversationSession | null> {
    const sessions = Object.values(dbStore.getData().groupSessions);
    return sessions.find((s) => s.groupId === groupId && (s.status === 'LIVE' || s.status === 'STARTING')) || null;
  }

  async getAllActive(): Promise<GroupConversationSession[]> {
    return Object.values(dbStore.getData().groupSessions).filter(
      (s) => s.status === 'LIVE' || s.status === 'STARTING'
    );
  }

  async update(id: string, updates: Partial<GroupConversationSession>): Promise<GroupConversationSession | null> {
    const session = dbStore.getData().groupSessions[id];
    if (!session) return null;
    const updated: GroupConversationSession = {
      ...session,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    dbStore.getData().groupSessions[id] = updated;
    dbStore.save();
    return updated;
  }

  async endSession(id: string): Promise<GroupConversationSession | null> {
    const session = dbStore.getData().groupSessions[id];
    if (!session) return null;
    const now = new Date().toISOString();
    const updated: GroupConversationSession = {
      ...session,
      status: 'ENDED',
      endedAt: now,
      updatedAt: now,
    };
    dbStore.getData().groupSessions[id] = updated;
    dbStore.save();
    return updated;
  }
}

