import { WebSocket } from 'ws';
import { GoogleGenAI } from '@google/genai';
import {
  GroupConversationSession,
  RoomParticipant,
  SunnyUser,
  Memory,
  Highlight,
} from '../../src/types';
import { SunnyRoomController } from './SunnyRoomController';
import {
  groupSessionRepo,
  groupRepo,
  userRepo,
  conversationRepo,
} from '../repositories';

export interface RoomClient {
  ws: WebSocket;
  identity: string;
  sunnyUserId: string;
  displayName: string;
  profilePhoto?: string;
  deviceMode: 'INDIVIDUAL' | 'SHARED_DEVICE';
  isMuted: boolean;
  isCameraOn: boolean;
  isSpeaking: boolean;
  joinedAt: string;
}

export interface ActiveRoom {
  roomId: string;
  sessionId: string;
  groupId: string;
  session: GroupConversationSession;
  clients: Map<string, RoomClient>; // identity -> RoomClient
  sunnyController: SunnyRoomController;
  createdAt: string;
}

export class RoomManager {
  private activeRooms: Map<string, ActiveRoom> = new Map(); // roomId -> ActiveRoom
  private ai: GoogleGenAI;

  constructor(aiClient: GoogleGenAI) {
    this.ai = aiClient;
  }

  public async getOrCreateRoom(session: GroupConversationSession): Promise<ActiveRoom> {
    let room = this.activeRooms.get(session.roomId);
    if (room) return room;

    console.log(`Creating active realtime room: ${session.roomId} for group ${session.groupId}`);

    // Create Sunny Room Controller
    let controller: SunnyRoomController;
    const callbacks = {
      broadcastSunnyAudio: (pcmBase64: string) => {
        this.broadcastToRoom(session.roomId, {
          type: 'audio_sunny',
          audio: pcmBase64,
        });
      },
      broadcastSunnyStatus: (status: 'idle' | 'listening' | 'thinking' | 'speaking' | 'reconnecting') => {
        this.broadcastToRoom(session.roomId, {
          type: 'sunny_status',
          status,
        });
      },
      broadcastSunnyTranscript: (text: string, sender: 'sunny' | 'system') => {
        this.broadcastToRoom(session.roomId, {
          type: 'transcript',
          sender,
          text,
          speakerName: 'Sunny (सन्नी)',
        });
      },
      broadcastMemorySaved: (memory: Memory) => {
        this.broadcastToRoom(session.roomId, {
          type: 'memory_saved',
          memory,
        });
      },
      broadcastHighlightSaved: (highlight: Highlight) => {
        this.broadcastToRoom(session.roomId, {
          type: 'highlight_saved',
          highlight,
        });
      },
      broadcastInterruption: () => {
        this.broadcastToRoom(session.roomId, {
          type: 'interrupted',
        });
      },
    };

    controller = new SunnyRoomController(session, this.ai, callbacks);
    await controller.start();

    room = {
      roomId: session.roomId,
      sessionId: session.id,
      groupId: session.groupId,
      session,
      clients: new Map(),
      sunnyController: controller,
      createdAt: new Date().toISOString(),
    };

    this.activeRooms.set(session.roomId, room);
    return room;
  }

  public getRoom(roomId: string): ActiveRoom | undefined {
    return this.activeRooms.get(roomId);
  }

  public getActiveRoomByGroupId(groupId: string): ActiveRoom | undefined {
    for (const room of this.activeRooms.values()) {
      if (room.groupId === groupId) {
        return room;
      }
    }
    return undefined;
  }

  public getActiveRoomBySessionId(sessionId: string): ActiveRoom | undefined {
    for (const room of this.activeRooms.values()) {
      if (room.sessionId === sessionId) {
        return room;
      }
    }
    return undefined;
  }

  public getRoomParticipantNames(sessionId: string): string[] {
    const room = this.getActiveRoomBySessionId(sessionId);
    if (!room) return [];
    const names: string[] = [];
    for (const client of room.clients.values()) {
      if (client.displayName && !names.includes(client.displayName)) {
        names.push(client.displayName);
      }
    }
    return names;
  }

  public async handleClientConnection(ws: WebSocket, tokenData: {
    userId: string;
    groupId: string;
    sessionId: string;
    roomId: string;
    deviceMode?: 'INDIVIDUAL' | 'SHARED_DEVICE';
  }) {
    const { userId, groupId, sessionId, roomId, deviceMode = 'INDIVIDUAL' } = tokenData;

    // Verify user & membership
    const user = await userRepo.getById(userId);
    if (!user) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unauthorized user' }));
      ws.close();
      return;
    }

    const members = await groupRepo.getMembers(groupId);
    const isMember = members.some((m) => m.userId === userId && m.status === 'ACTIVE');
    if (!isMember) {
      ws.send(JSON.stringify({ type: 'error', message: 'Must be an active group member to join call' }));
      ws.close();
      return;
    }

    let session = await groupSessionRepo.getById(sessionId);
    if (!session || (session.status !== 'LIVE' && session.status !== 'STARTING')) {
      ws.send(JSON.stringify({ type: 'error', message: 'Call session has ended' }));
      ws.close();
      return;
    }

    // Ensure room is live
    if (session.status === 'STARTING') {
      session = (await groupSessionRepo.update(session.id, { status: 'LIVE' })) || session;
    }

    const room = await this.getOrCreateRoom(session);
    const participantIdentity = `user:${user.id}`;
    const now = new Date().toISOString();

    const client: RoomClient = {
      ws,
      identity: participantIdentity,
      sunnyUserId: user.id,
      displayName: user.displayName,
      profilePhoto: user.photoURL,
      deviceMode,
      isMuted: false,
      isCameraOn: false,
      isSpeaking: false,
      joinedAt: now,
    };

    // Add to room
    room.clients.set(participantIdentity, client);

    // Update active participants count in DB
    await groupSessionRepo.update(session.id, {
      activeParticipantsCount: room.clients.size,
    });

    const sunnyParticipant: RoomParticipant = {
      identity: 'sunny-agent',
      displayName: 'Sunny (सन्नी)',
      profilePhoto: 'https://api.dicebear.com/7.x/bottts/svg?seed=SunnyCompanion',
      isAI: true,
      isLocal: false,
      isSpeaking: room.sunnyController.getStatus() === 'speaking',
      isMuted: false,
      isCameraOn: false,
      joinedAt: room.createdAt,
      deviceMode: 'INDIVIDUAL',
    };

    // Send room welcome & initial state to newly joined client
    const existingParticipants: RoomParticipant[] = Array.from(room.clients.values()).map((c) => ({
      identity: c.identity,
      sunnyUserId: c.sunnyUserId,
      displayName: c.displayName,
      profilePhoto: c.profilePhoto,
      isAI: false,
      isLocal: c.identity === participantIdentity,
      isSpeaking: c.isSpeaking,
      isMuted: c.isMuted,
      isCameraOn: c.isCameraOn,
      joinedAt: c.joinedAt,
      deviceMode: c.deviceMode,
    }));

    // Include Sunny in the participant list
    existingParticipants.push(sunnyParticipant);

    ws.send(
      JSON.stringify({
        type: 'room_joined',
        roomId: room.roomId,
        sessionId: room.sessionId,
        groupId: room.groupId,
        localIdentity: participantIdentity,
        participants: existingParticipants,
        sunnyStatus: room.sunnyController.getStatus(),
      })
    );

    // Notify other participants of this new human joining
    const newParticipantData: RoomParticipant = {
      identity: participantIdentity,
      sunnyUserId: user.id,
      displayName: user.displayName,
      profilePhoto: user.photoURL,
      isAI: false,
      isLocal: false,
      isSpeaking: false,
      isMuted: false,
      isCameraOn: false,
      joinedAt: now,
      deviceMode,
    };

    this.broadcastToRoom(
      room.roomId,
      {
        type: 'participant_joined',
        participant: newParticipantData,
      },
      participantIdentity // exclude self
    );

    // Notify Sunny of human join
    room.sunnyController.onParticipantJoined(newParticipantData);

    // Handle incoming client messages
    ws.on('message', async (data: any) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          // WebRTC Signaling messages forwarded peer-to-peer
          case 'signal': {
            const { toParticipantIdentity, signalData } = msg;
            if (toParticipantIdentity) {
              const target = room.clients.get(toParticipantIdentity);
              if (target && target.ws.readyState === WebSocket.OPEN) {
                target.ws.send(
                  JSON.stringify({
                    type: 'signal',
                    fromParticipantIdentity: participantIdentity,
                    signalData,
                  })
                );
              }
            }
            break;
          }

          // Audio chunk sent to Sunny for AI listening & attribution, and bridged to other participants
          case 'audio_human': {
            if (msg.audio) {
              await room.sunnyController.handleHumanAudio(
                participantIdentity,
                msg.audio,
                client.deviceMode
              );

              // Broadcast human audio to other participants in the room
              this.broadcastToRoom(
                room.roomId,
                {
                  type: 'audio_peer',
                  fromParticipantIdentity: participantIdentity,
                  displayName: client.displayName,
                  audio: msg.audio,
                },
                participantIdentity // exclude sender
              );
            }
            break;
          }

          // Update speaking status from client VAD
          case 'speaking': {
            const isSpeaking = Boolean(msg.isSpeaking);
            client.isSpeaking = isSpeaking;

            // Broadcast speaking indicator to all room participants
            this.broadcastToRoom(room.roomId, {
              type: 'participant_speaking',
              identity: participantIdentity,
              isSpeaking,
            });

            // Inform Sunny Room Controller
            room.sunnyController.onParticipantSpeakingChanged(participantIdentity, isSpeaking);
            break;
          }

          // Update mute / camera / deviceMode
          case 'update_state': {
            if (typeof msg.isMuted === 'boolean') client.isMuted = msg.isMuted;
            if (typeof msg.isCameraOn === 'boolean') client.isCameraOn = msg.isCameraOn;
            if (msg.deviceMode) client.deviceMode = msg.deviceMode;

            this.broadcastToRoom(room.roomId, {
              type: 'participant_updated',
              identity: participantIdentity,
              updates: {
                isMuted: client.isMuted,
                isCameraOn: client.isCameraOn,
                deviceMode: client.deviceMode,
              },
            });
            break;
          }

          // Human text utterance in call
          case 'chat_message': {
            if (msg.text) {
              this.broadcastToRoom(room.roomId, {
                type: 'transcript',
                sender: 'user',
                text: msg.text,
                speakerName: client.displayName,
              });

              // Persist utterance
              await conversationRepo.addUtterance(session.conversationId, {
                conversationId: session.conversationId,
                speakerType: 'user',
                speakerUserId: client.sunnyUserId,
                speakerName: client.displayName,
                text: msg.text,
                sequenceNumber: Date.now(),
                identityConfidence: client.deviceMode === 'INDIVIDUAL' ? 'KNOWN' : 'UNKNOWN',
              });

              // Send to Sunny
              await room.sunnyController.handleTextInput(msg.text, client.displayName);
            }
            break;
          }

          // Client leaves voluntarily
          case 'leave': {
            this.handleClientLeave(room, participantIdentity);
            break;
          }
        }
      } catch (e) {
        console.error('Error handling room ws message:', e);
      }
    });

    ws.on('close', () => {
      this.handleClientLeave(room, participantIdentity);
    });

    ws.on('error', (err) => {
      console.warn(`Room ws client error (${participantIdentity}):`, err);
      this.handleClientLeave(room, participantIdentity);
    });
  }

  private handleClientLeave(room: ActiveRoom, identity: string) {
    if (!room.clients.has(identity)) return;

    const client = room.clients.get(identity);
    room.clients.delete(identity);

    console.log(`Participant ${identity} left room ${room.roomId}`);

    // Broadcast leave event
    this.broadcastToRoom(room.roomId, {
      type: 'participant_left',
      identity,
      displayName: client?.displayName || 'Member',
    });

    // Notify Sunny
    room.sunnyController.onParticipantLeft(identity);

    // Update active participants count in DB
    groupSessionRepo.update(room.sessionId, {
      activeParticipantsCount: room.clients.size,
    });

    // If room is empty of human clients, schedule teardown after grace period (e.g. 5 minutes)
    if (room.clients.size === 0) {
      console.log(`Room ${room.roomId} is now empty of humans.`);
    }
  }

  public async endRoomSession(sessionId: string): Promise<boolean> {
    for (const [roomId, room] of this.activeRooms.entries()) {
      if (room.sessionId === sessionId) {
        // Broadcast session_ended to all clients
        this.broadcastToRoom(roomId, {
          type: 'session_ended',
          sessionId,
          message: 'The host has ended this group call session.',
        });

        // Destroy Sunny controller
        await room.sunnyController.destroy();

        // Close all client sockets
        for (const client of room.clients.values()) {
          try {
            client.ws.close();
          } catch {}
        }
        room.clients.clear();

        // Mark session as ENDED in DB
        await groupSessionRepo.endSession(sessionId);
        await conversationRepo.update(room.session.conversationId, {
          status: 'COMPLETED',
          endedAt: new Date().toISOString(),
        });

        this.activeRooms.delete(roomId);
        console.log(`Ended group call room ${roomId}`);
        return true;
      }
    }

    await groupSessionRepo.endSession(sessionId);
    return false;
  }

  public broadcastToRoom(roomId: string, message: any, excludeIdentity?: string) {
    const room = this.activeRooms.get(roomId);
    if (!room) return;

    const payload = JSON.stringify(message);
    for (const [identity, client] of room.clients.entries()) {
      if (excludeIdentity && identity === excludeIdentity) continue;
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(payload);
      }
    }
  }
}
