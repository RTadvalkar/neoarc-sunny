export type UserRole = 'ADMIN' | 'USER';

export interface Person {
  id: string;
  name: string;
  nicknames?: string[];
  profession?: string;
  interests?: string[];
  style?: string;
  keyFacts?: string[];
  isDefaultGroupMember?: boolean;
}

export interface SunnyUser {
  id: string; // Firebase UID / Stable User ID
  authProvider: 'google';
  providerSubject: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string;
  status: 'active' | 'suspended';
}

export type FieldDataType = 'STRING' | 'NUMBER' | 'BOOLEAN' | 'ARRAY' | 'SELECT';
export type CollectionPriority = 'HIGH' | 'MEDIUM' | 'LOW';
export type CollectionStrategy = 'CONVERSATIONAL' | 'DIRECT_QUESTION' | 'PASSIVE_LISTENING';

export interface ProfileField {
  id: string;
  fieldKey: string;
  label: string;
  description: string;
  dataType: FieldDataType;
  required: boolean;
  active: boolean;
  displayOrder: number;
  collectionPriority: CollectionPriority;
  askNaturally: boolean;
  initialPrompt: string;
  clarificationPrompt?: string;
  allowedValues?: string[];
  visibility: 'PUBLIC' | 'GROUP' | 'PRIVATE';
  sensitivity: 'LOW' | 'MEDIUM' | 'HIGH';
  contextUsage: string;
  collectionStrategy: CollectionStrategy;
}

export interface ProfileTemplate {
  id: string;
  name: string;
  description: string;
  version: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  fields: ProfileField[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  createdBy: string;
}

export interface UserProfileValue {
  fieldKey: string;
  value: any;
  source: 'CONVERSATION' | 'MANUAL' | 'INFERRED';
  confidence: 'high' | 'medium' | 'low';
  collectedAt: string;
  lastConfirmedAt?: string;
  updatedAt: string;
  sourceConversationId?: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  ownerUserId: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  status: 'ACTIVE' | 'INVITED' | 'LEFT';
  joinedAt: string;
  leftAt?: string;
  user?: SunnyUser;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName?: string;
  invitedEmail: string;
  invitedByUserId: string;
  invitedByUserName?: string;
  token: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdAt: string;
  acceptedAt?: string;
  rejectedAt?: string;
}

export type ConversationMode = 'SOLO' | 'GROUP';

export interface Conversation {
  id: string;
  mode: ConversationMode;
  ownerUserId: string;
  groupId?: string;
  groupName?: string;
  status: 'ACTIVE' | 'COMPLETED';
  startedAt: string;
  endedAt?: string;
  title: string;
  summary?: string;
  highlightsCount?: number;
  utterancesCount?: number;
}

export interface Utterance {
  id: string;
  conversationId: string;
  speakerType: 'user' | 'sunny' | 'system';
  speakerUserId?: string;
  speakerName?: string;
  text: string;
  sequenceNumber: number;
  startedAt: string;
  endedAt?: string;
  identityConfidence: 'KNOWN' | 'UNKNOWN';
}

export interface Highlight {
  id: string;
  conversationId: string;
  type: 'DECISION' | 'ACTION_ITEM' | 'INSIGHT' | 'TOPIC' | 'NOTE';
  text: string;
  importance: 'HIGH' | 'MEDIUM' | 'LOW';
  createdAt: string;
}

export interface Memory {
  id: string;
  userId?: string;
  groupId?: string;
  personName?: string;
  type?: 'PREFERENCE' | 'PLAN' | 'FACT' | 'RELATIONSHIP' | 'BACKGROUND';
  subject: string;
  fact: string;
  context: string;
  date: string;
  confidence: 'high' | 'medium' | 'low';
  lastReferenced?: string;
  sourceConversationId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export type GroupSessionStatus = 'STARTING' | 'LIVE' | 'ENDING' | 'ENDED' | 'FAILED';

export interface GroupConversationSession {
  id: string;
  groupId: string;
  groupName: string;
  roomProvider: 'WEBRTC_ROOM' | 'LIVEKIT';
  roomId: string;
  conversationId: string;
  startedByUserId: string;
  startedByUserName: string;
  status: GroupSessionStatus;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
  activeParticipantsCount?: number;
}

export type DeviceAudioMode = 'INDIVIDUAL' | 'SHARED_DEVICE';
export type IdentitySource = 'RTC_PARTICIPANT' | 'SHARED_MIC' | 'EXPLICIT_NAME';

export interface RoomParticipant {
  identity: string; // "user:<sunnyUserId>" or "sunny-agent"
  sunnyUserId?: string;
  displayName: string;
  profilePhoto?: string;
  isAI: boolean;
  isLocal: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  isCameraOn: boolean;
  joinedAt: string;
  deviceMode: DeviceAudioMode;
  audioLevel?: number;
}

export interface RealtimeRoomProvider {
  createRoom(groupId: string, session: GroupConversationSession): Promise<{ roomId: string; token: string }>;
  joinRoom(roomId: string, token: string, options: { deviceMode: DeviceAudioMode; enableAudio?: boolean; enableVideo?: boolean }): Promise<void>;
  leaveRoom(): Promise<void>;
  publishAudio(track: MediaStreamTrack): Promise<void>;
  publishVideo(track: MediaStreamTrack): Promise<void>;
  setMicrophoneEnabled(enabled: boolean): Promise<void>;
  setCameraEnabled(enabled: boolean): Promise<void>;
  getParticipants(): RoomParticipant[];
  observeActiveSpeakers(callback: (speakers: string[]) => void): () => void;
}

export interface SessionState {
  isConnected: boolean;
  isConnecting: boolean;
  isReconnecting: boolean;
  isMuted: boolean;
  status: 'idle' | 'listening' | 'thinking' | 'speaking';
  mode: ConversationMode;
  activeGroup?: Group;
  activeMembers: string[];
  transcriptLogs: { sender: 'user' | 'sunny' | 'system'; text: string; time: string; speakerName?: string }[];
  errorMessage?: string;
}

export type WSMessage =
  | { type: 'audio'; audio: string }
  | { type: 'text'; text: string }
  | { type: 'interrupted' }
  | { type: 'turnComplete' }
  | { type: 'status'; status: 'listening' | 'thinking' | 'speaking' | 'idle' }
  | { type: 'error'; message: string }
  | { type: 'transcript'; sender: 'user' | 'sunny' | 'system'; text: string; speakerName?: string }
  | { type: 'memory_saved'; memory: Memory }
  | { type: 'profile_field_saved'; profileValue: UserProfileValue; fieldLabel?: string }
  | { type: 'highlight_saved'; highlight: Highlight }
  | { type: 'session_resumed'; conversationId: string };

