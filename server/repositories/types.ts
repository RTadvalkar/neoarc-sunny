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

export interface IUserRepository {
  getById(id: string): Promise<SunnyUser | null>;
  getByEmail(email: string): Promise<SunnyUser | null>;
  createOrUpdate(user: Partial<SunnyUser> & { email: string; displayName: string }): Promise<SunnyUser>;
  setRole(userId: string, role: UserRole): Promise<SunnyUser | null>;
  getAll(): Promise<SunnyUser[]>;
  count(): Promise<number>;
}

export interface IProfileRepository {
  getProfileValues(userId: string): Promise<Record<string, UserProfileValue>>;
  setProfileValue(userId: string, value: UserProfileValue): Promise<UserProfileValue>;
  deleteProfileValue(userId: string, fieldKey: string): Promise<boolean>;
  getAllUserProfiles(): Promise<Record<string, Record<string, UserProfileValue>>>;
}

export interface ITemplateRepository {
  getPublishedTemplate(): Promise<ProfileTemplate | null>;
  getAllTemplates(): Promise<ProfileTemplate[]>;
  getTemplateById(id: string): Promise<ProfileTemplate | null>;
  createTemplate(template: Omit<ProfileTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<ProfileTemplate>;
  updateTemplate(id: string, updates: Partial<ProfileTemplate>): Promise<ProfileTemplate | null>;
  publishTemplate(id: string): Promise<ProfileTemplate | null>;
  addField(templateId: string, field: Omit<ProfileField, 'id'>): Promise<ProfileField | null>;
  updateField(templateId: string, fieldId: string, updates: Partial<ProfileField>): Promise<ProfileField | null>;
  deleteField(templateId: string, fieldId: string): Promise<boolean>;
  reorderFields(templateId: string, orderedFieldIds: string[]): Promise<ProfileField[] | null>;
}

export interface IConversationRepository {
  create(conversation: Omit<Conversation, 'id' | 'startedAt'>): Promise<Conversation>;
  getById(id: string): Promise<Conversation | null>;
  getUserConversations(userId: string): Promise<Conversation[]>;
  getGroupConversations(groupId: string): Promise<Conversation[]>;
  update(id: string, updates: Partial<Conversation>): Promise<Conversation | null>;
  addUtterance(conversationId: string, utterance: Omit<Utterance, 'id' | 'startedAt'>): Promise<Utterance>;
  getUtterances(conversationId: string): Promise<Utterance[]>;
  addHighlight(conversationId: string, highlight: Omit<Highlight, 'id' | 'createdAt' | 'conversationId'>): Promise<Highlight>;
  getHighlights(conversationId: string): Promise<Highlight[]>;
}

export interface IGroupRepository {
  create(group: Omit<Group, 'id' | 'createdAt' | 'updatedAt'>, ownerUser: SunnyUser): Promise<Group>;
  getById(id: string): Promise<Group | null>;
  getAllGroups(): Promise<Group[]>;
  getUserGroups(userId: string): Promise<Group[]>;
  getMembers(groupId: string): Promise<GroupMember[]>;
  addMember(groupId: string, userId: string, role: 'ADMIN' | 'MEMBER'): Promise<GroupMember>;
  updateMember(groupId: string, userId: string, updates: Partial<GroupMember>): Promise<GroupMember | null>;
  removeMember(groupId: string, userId: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  createInvitation(groupId: string, invitedEmail: string, invitedByUserId: string): Promise<GroupInvitation>;
  getInvitationByToken(token: string): Promise<GroupInvitation | null>;
  getGroupInvitations(groupId: string): Promise<GroupInvitation[]>;
  getUserInvitations(email: string): Promise<GroupInvitation[]>;
  acceptInvitation(token: string, user: SunnyUser): Promise<{ group: Group; member: GroupMember } | null>;
  rejectInvitation(token: string): Promise<GroupInvitation | null>;
  revokeInvitation(invitationId: string): Promise<boolean>;
  autoAcceptPendingInvitationsForEmail(email: string, user: SunnyUser): Promise<number>;
}

export interface IGroupSessionRepository {
  create(session: Omit<GroupConversationSession, 'id' | 'createdAt' | 'updatedAt'>): Promise<GroupConversationSession>;
  getById(id: string): Promise<GroupConversationSession | null>;
  getActiveByGroupId(groupId: string): Promise<GroupConversationSession | null>;
  getAllActive(): Promise<GroupConversationSession[]>;
  update(id: string, updates: Partial<GroupConversationSession>): Promise<GroupConversationSession | null>;
  endSession(id: string): Promise<GroupConversationSession | null>;
}

export interface IMemoryRepository {
  addMemory(memory: Omit<Memory, 'id' | 'date'>): Promise<Memory>;
  getById(id: string): Promise<Memory | null>;
  getUserMemories(userId: string): Promise<Memory[]>;
  getGroupMemories(groupId: string): Promise<Memory[]>;
  getAllMemories(): Promise<Memory[]>;
  updateMemory(id: string, updates: Partial<Memory>): Promise<Memory | null>;
  deleteMemory(id: string): Promise<boolean>;
}
