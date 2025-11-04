import {
  WebSocketGateway,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketServer,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { UsersService } from './users/users.service';
import { MessagesService } from './messages/messages.service';
import { GroupsService } from './groups/groups.service';
import { NotificationsService } from './notifications/notifications.service';
import { Injectable } from '@nestjs/common';
import { MessageDoc } from './messages/messages.schema';

// Socket event schemas
interface SocketUser {
  socketId: string;
  userId: string;
  username: string;
  avatar?: string;
}

interface TypingEvent {
  to: string;
  typing: boolean;
}

interface MessageEvent {
  to: string;
  text: string;
  type?: 'text' | 'emoji' | 'gif' | 'sticker' | 'file' | 'location' | 'webview';
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  groupId?: string;
}

interface LocationEvent {
  to: string;
  latitude: number;
  longitude: number;
  isLive?: boolean;
}

interface WebViewEvent {
  to: string;
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
}

interface GetConversationEvent {
  withUserId: string;
}

interface GetGroupConversationEvent {
  groupId: string;
}

interface DeleteMessageEvent {
  id: string;
}

interface MessageData {
  _id: string;
  from: string;
  to: string;
  type: string;
  text?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  groupId?: string;
  createdAt: Date;
  avatar?: string;
  username: string;
  latitude?: number;
  longitude?: number;
  isLive?: boolean;
  webUrl?: string;
  webTitle?: string;
  webDescription?: string;
  webImageUrl?: string;
}

interface ErrorEvent {
  message: string;
}

@Injectable()
@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
})
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private connected = new Map<string, SocketUser[]>();
  private readonly maxConnectionsPerUser = 5; // Limit concurrent connections per user

  constructor(
    private usersService: UsersService,
    private messagesService: MessagesService,
    private groupsService: GroupsService,
    private notificationsService: NotificationsService,
  ) {}

  afterInit(_server: Server) {
    void _server;
  }

  async handleConnection(client: Socket) {
    try {
      let token: string | undefined;
      if (
        client.handshake.auth &&
        typeof client.handshake.auth.token === 'string'
      ) {
        token = client.handshake.auth.token.replace('Bearer ', '');
      } else if (
        typeof client.handshake.headers['authorization'] === 'string'
      ) {
        token = client.handshake.headers['authorization'].replace(
          'Bearer ',
          '',
        );
      }
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRET || 'dev_secret',
      ) as { sub: string };
      const userId = payload.sub;
      const user = await this.usersService.findById(userId);
      if (!user) {
        client.disconnect(true);
        return;
      }

      const userSockets = this.connected.get(String(userId)) || [];

      // Limit concurrent connections per user
      if (userSockets.length >= this.maxConnectionsPerUser) {
        client.emit('error', { message: 'Maximum connections exceeded' });
        client.disconnect(true);
        return;
      }

      userSockets.push({
        socketId: client.id,
        userId: String(userId),
        username: user.username,
        avatar: user.avatar,
      });
      this.connected.set(String(userId), userSockets);
      await this.usersService.setOnline(userId, true);

      // broadcast updated user list
      this.server.emit('users:updated', {
        users: await this.usersService.listAll(),
      });

      // deliver pending messages
      const pending = await this.messagesService.getPendingFor(String(userId));
      if (pending.length) {
        client.emit('messages:pending', pending);
        await this.messagesService.markDelivered(
          pending
            .map((p) => {
              if (typeof p._id === 'string') {
                return p._id;
              }
              if (
                typeof p._id === 'object' &&
                p._id !== null &&
                typeof (p._id as { toHexString?: unknown }).toHexString ===
                  'function'
              ) {
                return (p._id as { toHexString: () => string }).toHexString();
              }
              return '';
            })
            .filter((id): id is string => !!id),
        );
      }

      // Send push notifications for any unread messages
      try {
        const unreadCount = await this.messagesService.getUnreadCountForUser(
          String(userId),
        );
        if (unreadCount > 0) {
          // TODO: Send push notification about unread messages
          // This would require storing user push subscriptions
        }
      } catch (error) {
        console.error('Error checking unread messages:', error);
      }

      // Send any recent deletions that occurred while user was offline
      try {
        const recentDeletions =
          await this.messagesService.getRecentDeletionsForUser(String(userId));
        if (recentDeletions && recentDeletions.length) {
          for (const deletion of recentDeletions) {
            client.emit('message:deleted', {
              id: String(deletion.messageId),
              deletedBy: deletion.deletedBy,
              conversationId: deletion.conversationId,
            });
          }
        }
      } catch (error) {
        console.error('Error sending recent deletions:', error);
      }
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    try {
      // find user by socket
      for (const [userId, userSockets] of this.connected.entries()) {
        const socketIndex = userSockets.findIndex(
          (socket) => socket.socketId === client.id,
        );
        if (socketIndex !== -1) {
          userSockets.splice(socketIndex, 1);
          if (userSockets.length === 0) {
            this.connected.delete(userId);
            await this.usersService.setOnline(userId, false);
            this.server.emit('users:updated', {
              users: await this.usersService.listAll(),
            });
          } else {
            this.connected.set(userId, userSockets);
          }
          break;
        }
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() payload: TypingEvent,
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = Array.from(this.connected.values())
      .flat()
      .find((c) => c.socketId === client.id);
    if (!fromUser) return;
    const toConn = this.connected.get(payload.to);
    if (toConn && toConn.length > 0)
      toConn.forEach((conn) =>
        this.server.to(conn.socketId).emit('typing', {
          from: fromUser.userId,
          username: fromUser.username,
          typing: payload.typing,
        }),
      );
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody() payload: MessageEvent,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const fromUser = Array.from(this.connected.values())
        .flat()
        .find((c) => c.socketId === client.id);
      if (!fromUser) {
        client.emit('error', { message: 'Unauthorized' });
        return;
      }

      let saved: MessageDoc;
      const type = payload.type || 'text';

      // Validate message type
      const validTypes = [
        'text',
        'emoji',
        'gif',
        'sticker',
        'file',
        'location',
        'webview',
      ];
      if (!validTypes.includes(type)) {
        client.emit('error', { message: 'Invalid message type' });
        return;
      }

      // store message based on type
      if (type === 'text') {
        saved = await this.messagesService.save(
          fromUser.userId,
          payload.to,
          payload.text,
          undefined,
          payload.groupId,
        );
      } else if (type === 'emoji') {
        saved = await this.messagesService.saveEmoji(
          fromUser.userId,
          payload.to,
          payload.text,
        );
      } else if (type === 'gif') {
        saved = await this.messagesService.saveGif(
          fromUser.userId,
          payload.to,
          payload.text,
        );
      } else if (type === 'sticker') {
        saved = await this.messagesService.saveSticker(
          fromUser.userId,
          payload.to,
          payload.text,
        );
      } else if (type === 'file') {
        saved = await this.messagesService.saveFile(
          fromUser.userId,
          payload.to,
          payload.text, // fileUrl
          payload.fileName || 'file',
          payload.fileSize || 0,
          payload.fileType || 'application/octet-stream',
        );
      } else {
        // For other types, save as text for now
        saved = await this.messagesService.save(
          fromUser.userId,
          payload.to,
          payload.text,
          undefined,
          payload.groupId,
        );
      }

      // send to receiver if online
      const toConn = this.connected.get(payload.to);
      const data: MessageData = {
        _id: String(saved?._id),
        from: fromUser.userId,
        to: payload.to,
        type,
        text: payload.text,
        fileName: payload.fileName,
        fileSize: payload.fileSize,
        fileType: payload.fileType,
        groupId: payload.groupId,
        createdAt: saved.createdAt,
        avatar: fromUser.avatar,
        username: fromUser.username,
      };

      // emit to both: sender and receiver
      client.emit('message', data);
      if (toConn && toConn.length > 0) {
        toConn.forEach((conn) => {
          this.server.to(conn.socketId).emit('message', data);
        });
        await this.messagesService.markDelivered([String(saved._id)]);
      }

      // If it's a group message, broadcast to all group members
      if (payload.groupId) {
        try {
          const group = await this.groupsService.findById(payload.groupId);
          if (group) {
            // Send to all group members who are online
            for (const memberId of group.members) {
              const memberConns = this.connected.get(String(memberId));
              if (memberConns && memberConns.length > 0) {
                memberConns.forEach((conn) => {
                  if (conn.socketId !== client.id) {
                    // Don't send to sender
                    this.server.to(conn.socketId).emit('message', data);
                  }
                });
                await this.messagesService.markDelivered([String(saved._id)]);
              }
            }
          }
        } catch (error) {
          console.error('Error broadcasting group message:', error);
        }
      }
    } catch (error) {
      console.error('Error handling message:', error);
      client.emit('error', { message: 'Failed to send message' });
    }
  }

  @SubscribeMessage('location')
  async handleLocation(
    @MessageBody() payload: LocationEvent,
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = Array.from(this.connected.values())
      .flat()
      .find((c) => c.socketId === client.id);
    if (!fromUser) return;

    const saved = await this.messagesService.saveLocation(
      fromUser.userId,
      payload.to,
      payload.latitude,
      payload.longitude,
      payload.isLive || false,
    );

    const toConn = this.connected.get(payload.to);
    const data: MessageData = {
      _id: String(saved._id),
      from: fromUser.userId,
      to: payload.to,
      type: 'location',
      latitude: payload.latitude,
      longitude: payload.longitude,
      isLive: payload.isLive || false,
      createdAt: saved.createdAt,
      avatar: fromUser.avatar,
      username: fromUser.username,
    };

    client.emit('message', data);
    if (toConn && toConn.length > 0) {
      toConn.forEach((conn) => {
        this.server.to(conn.socketId).emit('message', data);
      });
      await this.messagesService.markDelivered([String(saved._id)]);
    }
  }

  @SubscribeMessage('webview')
  async handleWebView(
    @MessageBody() payload: WebViewEvent,
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = Array.from(this.connected.values())
      .flat()
      .find((c) => c.socketId === client.id);
    if (!fromUser) return;

    const saved = await this.messagesService.saveWebView(
      fromUser.userId,
      payload.to,
      payload.url,
      payload.title,
      payload.description,
      payload.imageUrl,
    );

    const toConn = this.connected.get(payload.to);
    const data: MessageData = {
      _id: String(saved._id),
      from: fromUser.userId,
      to: payload.to,
      type: 'webview',
      webUrl: payload.url,
      webTitle: payload.title,
      webDescription: payload.description,
      webImageUrl: payload.imageUrl,
      createdAt: saved.createdAt,
      avatar: fromUser.avatar,
      username: fromUser.username,
    };

    client.emit('message', data);
    if (toConn && toConn.length > 0) {
      toConn.forEach((conn) => {
        this.server.to(conn.socketId).emit('message', data);
      });
      await this.messagesService.markDelivered([String(saved._id)]);
    }
  }

  @SubscribeMessage('get:conversation')
  async handleGetConversation(
    @MessageBody() payload: GetConversationEvent,
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = Array.from(this.connected.values())
      .flat()
      .find((c) => c.socketId === client.id);
    if (!fromUser) return;
    const conv = await this.messagesService.getConversation(
      fromUser.userId,
      payload.withUserId,
    );
    client.emit('conversation', conv);
  }

  @SubscribeMessage('get:group:conversation')
  async handleGetGroupConversation(
    @MessageBody() payload: GetGroupConversationEvent,
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = Array.from(this.connected.values())
      .flat()
      .find((c) => c.socketId === client.id);
    if (!fromUser) return;
    const conv = await this.messagesService.getGroupConversation(
      payload.groupId,
      fromUser.userId,
    );
    client.emit('group:conversation', conv);
  }

  @SubscribeMessage('userOnline')
  async handleUserOnline(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = Array.from(this.connected.values())
      .flat()
      .find((c) => c.socketId === client.id);
    if (!fromUser || fromUser.userId !== payload.userId) return;

    // Update user status in database
    await this.usersService.setOnline(payload.userId, true);

    // Broadcast to all connected clients except sender
    client.broadcast.emit('userStatusUpdate', {
      userId: payload.userId,
      online: true,
    });
  }

  @SubscribeMessage('userOffline')
  async handleUserOffline(
    @MessageBody() payload: { userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = Array.from(this.connected.values())
      .flat()
      .find((c) => c.socketId === client.id);
    if (!fromUser || fromUser.userId !== payload.userId) return;

    // Update user status in database
    await this.usersService.setOnline(payload.userId, false);

    // Broadcast to all connected clients except sender
    client.broadcast.emit('userStatusUpdate', {
      userId: payload.userId,
      online: false,
    });
  }

  @SubscribeMessage('user:heartbeat')
  handleHeartbeat(@MessageBody() payload: { userId: string }) {
    // Heartbeat to keep user online status - no action needed, just acknowledge
    console.log('Heartbeat received from user:', payload.userId);
  }

  @SubscribeMessage('delete:message')
  async handleDeleteMessage(
    @MessageBody() payload: DeleteMessageEvent,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const fromUser = Array.from(this.connected.values())
        .flat()
        .find((c) => c.socketId === client.id);
      if (!fromUser) {
        client.emit('error', { message: 'Unauthorized' });
        return;
      }

      const msg = await this.messagesService.findById(payload.id);
      if (!msg) {
        client.emit('error', { message: 'Message not found' });
        return;
      }

      // Allow both sender and receiver to delete the message
      const fromId =
        typeof msg.from === 'string' ? msg.from : msg.from.toString();
      const toId = typeof msg.to === 'string' ? msg.to : msg.to.toString();

      if (fromId !== fromUser.userId && toId !== fromUser.userId) {
        client.emit('error', {
          message: 'You can only delete your own messages',
        });
        return;
      }

      // Mark the message as deleted in database
      await this.messagesService.markDeleted(payload.id, fromUser.userId);

      // Broadcast deletion to ALL connected clients in the conversation
      const conversationParticipants = [fromId, toId];

      for (const participantId of conversationParticipants) {
        const participantConns = this.connected.get(participantId);
        if (participantConns && participantConns.length > 0) {
          participantConns.forEach((conn) => {
            this.server.to(conn.socketId).emit('message:deleted', {
              id: payload.id,
              deletedBy: fromUser.userId,
              conversationId: `${fromId}-${toId}`,
            });
          });
        }
      }

      // Also emit to the sender's client for consistency
      client.emit('message:deleted', {
        id: payload.id,
        deletedBy: fromUser.userId,
        conversationId: `${fromId}-${toId}`,
      });
    } catch (error) {
      client.emit('error', {
        message:
          error instanceof Error ? error.message : 'Failed to delete message',
      });
    }
  }
}
