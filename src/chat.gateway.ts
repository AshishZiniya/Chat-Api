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
import { Injectable } from '@nestjs/common';
import { MessageDoc } from './messages/messages.schema';

interface ConnectedUser {
  socketId: string;
  userId: string;
  username: string;
  avatar?: string;
}

@Injectable()
@WebSocketGateway({ cors: { origin: '*', credentials: true } })
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer() server: Server;
  private connected = new Map<string, ConnectedUser>(); // userId -> ConnectedUser

  constructor(
    private usersService: UsersService,
    private messagesService: MessagesService,
  ) {}

  afterInit(_server: Server) {
    void _server;
    // no-op
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

      this.connected.set(String(userId), {
        socketId: client.id,
        userId: String(userId),
        username: user.username,
        avatar: user.avatar,
      });
      await this.usersService.setOnline(userId, true);

      // broadcast updated user list
      this.server.emit('users:updated', await this.usersService.listAll());

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

      // Send any recent deletions that occurred while user was offline
      // This ensures multi-device synchronization
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
        // Continue with connection - don't fail the entire connection
      }
    } catch {
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    // find user by socket
    for (const [userId, info] of this.connected.entries()) {
      if (info.socketId === client.id) {
        this.connected.delete(userId);
        await this.usersService.setOnline(userId, false);
        this.server.emit('users:updated', await this.usersService.listAll());
        break;
      }
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() payload: { to: string; typing: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = [...this.connected.values()].find(
      (c) => c.socketId === client.id,
    );
    if (!fromUser) return;
    const toConn = this.connected.get(payload.to);
    if (toConn)
      this.server.to(toConn.socketId).emit('typing', {
        from: fromUser.userId,
        username: fromUser.username,
        typing: payload.typing,
      });
  }

  @SubscribeMessage('message')
  async handleMessage(
    @MessageBody()
    payload: {
      to: string;
      text: string;
      type?: string;
      fileName?: string;
      fileSize?: number;
      fileType?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = [...this.connected.values()].find(
      (c) => c.socketId === client.id,
    );
    if (!fromUser) return;

    let saved: MessageDoc;
    const type = payload.type || 'text';

    // store message based on type
    if (type === 'text') {
      saved = await this.messagesService.save(
        fromUser.userId,
        payload.to,
        payload.text,
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
      );
    }

    // send to receiver if online
    const toConn = this.connected.get(payload.to);
    const data = {
      _id: saved?._id,
      from: fromUser.userId,
      to: payload.to,
      type,
      text: payload.text,
      fileName: payload.fileName,
      fileSize: payload.fileSize,
      fileType: payload.fileType,
      createdAt: saved.createdAt,
      avatar: fromUser.avatar,
      username: fromUser.username,
    };

    // emit to both: sender and receiver
    client.emit('message', data);
    if (toConn) {
      this.server.to(toConn.socketId).emit('message', data);
      await this.messagesService.markDelivered([String(saved._id)]);
    }
  }

  @SubscribeMessage('location')
  async handleLocation(
    @MessageBody()
    payload: {
      to: string;
      latitude: number;
      longitude: number;
      isLive?: boolean;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = [...this.connected.values()].find(
      (c) => c.socketId === client.id,
    );
    if (!fromUser) return;

    const saved = await this.messagesService.saveLocation(
      fromUser.userId,
      payload.to,
      payload.latitude,
      payload.longitude,
      payload.isLive || false,
    );

    const toConn = this.connected.get(payload.to);
    const data = {
      _id: saved._id,
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
    if (toConn) {
      this.server.to(toConn.socketId).emit('message', data);
      await this.messagesService.markDelivered([String(saved._id)]);
    }
  }

  @SubscribeMessage('webview')
  async handleWebView(
    @MessageBody()
    payload: {
      to: string;
      url: string;
      title?: string;
      description?: string;
      imageUrl?: string;
    },
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = [...this.connected.values()].find(
      (c) => c.socketId === client.id,
    );
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
    const data = {
      _id: saved._id,
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
    if (toConn) {
      this.server.to(toConn.socketId).emit('message', data);
      await this.messagesService.markDelivered([String(saved._id)]);
    }
  }

  @SubscribeMessage('get:conversation')
  async handleGetConversation(
    @MessageBody() payload: { withUserId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const fromUser = [...this.connected.values()].find(
      (c) => c.socketId === client.id,
    );
    if (!fromUser) return;
    const conv = await this.messagesService.getConversation(
      fromUser.userId,
      payload.withUserId,
    );
    client.emit('conversation', conv);
  }

  @SubscribeMessage('delete:message')
  async handleDeleteMessage(
    @MessageBody() payload: { id: string },
    @ConnectedSocket() client: Socket,
  ) {
    try {
      const fromUser = [...this.connected.values()].find(
        (c) => c.socketId === client.id,
      );
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
      // Find all connected clients that are part of this conversation
      const conversationParticipants = [fromId, toId];

      for (const participantId of conversationParticipants) {
        const participantConn = this.connected.get(participantId);
        if (participantConn) {
          this.server.to(participantConn.socketId).emit('message:deleted', {
            id: payload.id,
            deletedBy: fromUser.userId,
            conversationId: `${fromId}-${toId}`, // Include conversation identifier
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
