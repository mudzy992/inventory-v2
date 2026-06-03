import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../../common/types/jwt-payload.type';
import type { NotificationResponse } from './notifications.service';

@WebSocketGateway({
  namespace: 'notifications',
  path: '/backend/socket.io',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const userId = this.resolveUserId(client);
    if (!userId) {
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    await client.join(`user:${userId}`);
    this.logger.debug(`Client connected: user=${userId}`);
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      this.logger.debug(`Client disconnected: user=${userId}`);
    }
  }

  emitNotificationCreated(userId: string, notification: NotificationResponse): void {
    this.server.to(`user:${userId}`).emit('notification.created', notification);
  }

  emitNotificationRead(userId: string, notificationId: string): void {
    this.server.to(`user:${userId}`).emit('notification.read', { id: notificationId });
  }

  emitSettingsUpdated(key: string, value: string | number | boolean): void {
    this.server.emit('settings.updated', { key, value });
  }

  emitToUsers(userIds: string[], event: string, payload: unknown): void {
    const uniqueIds = [...new Set(userIds)];
    for (const userId of uniqueIds) {
      this.server.to(`user:${userId}`).emit(event, payload);
    }
  }

  emitInventoryCloseJobUpdated(
    userIds: string[],
    payload: {
      sessionId: string;
      status: string;
      appliedCount: number;
      failedCount: number;
      totalCount: number;
    },
  ): void {
    this.emitToUsers(userIds, 'inventory.close_job.updated', payload);
  }

  emitInventoryDisposalInboxUpdated(userIds: string[], payload: { sessionId: string }): void {
    this.emitToUsers(userIds, 'inventory.disposal_inbox.updated', payload);
  }

  private resolveUserId(client: Socket): string | null {
    const token = this.extractToken(client);
    if (!token) {
      return null;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      return payload.sub;
    } catch {
      return null;
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice(7);
    }
    return null;
  }
}
