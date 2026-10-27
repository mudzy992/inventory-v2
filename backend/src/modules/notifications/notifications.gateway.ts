import { logStructuredEvent } from '../../common/logging/structured-event.logger';
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
import { PrismaService } from '../../prisma/prisma.service';
import type { NotificationResponse } from './notifications.service';

// Socket.IO path mora pratiti API_PREFIX: kad backend radi na svojoj subdomeni
// (npr. api.evidens.ba101.top) bez prefiksa, API_PREFIX je prazan string i
// socket put postaje "/socket.io"; ako se ikad ponovo koristi path-prefix
// routing (npr. evidens.ba101.top/backend), put automatski postaje
// "/backend/socket.io". Čita se direktno iz process.env jer @WebSocketGateway
// decorator opcije se evaluiraju pri importu modula, prije nego ConfigService
// postoji — vrijednost mora doći iz stvarnih env varijabli kontejnera
// (Coolify injektuje env direktno, tako da je ovo pouzdano i u produkciji).
const resolveSocketIoPath = (): string => {
  const rawPrefix = (process.env.API_PREFIX ?? 'backend').trim();
  const prefix = rawPrefix.replace(/^\/+|\/+$/g, '');
  return prefix ? `/${prefix}/socket.io` : '/socket.io';
};

@WebSocketGateway({
  namespace: 'notifications',
  path: resolveSocketIoPath(),
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const userId = await this.resolveUserId(client);
    if (!userId) {
      client.disconnect(true);
      return;
    }
    client.data.userId = userId;
    await client.join(`user:${userId}`);
    logStructuredEvent(this.logger, 'debug', {
      event: 'notifications_client_connected',
      userId,
    });
  }

  handleDisconnect(client: Socket): void {
    const userId = client.data.userId as string | undefined;
    if (userId) {
      logStructuredEvent(this.logger, 'debug', {
        event: 'notifications_client_disconnected',
        userId,
      });
    }
  }

  disconnectUser(userId: string): void {
    this.server?.in(`user:${userId}`).disconnectSockets(true);
    // Emitted for the audit trail: deactivation/revocation is observable even
    // when this instance has no local sockets for the user.
    logStructuredEvent(this.logger, 'log', {
      event: 'notifications_user_sockets_disconnected',
      userId,
    });
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

  /** Document Engine — status posla konverzije dokumenta (queued/running/
   * done/failed), emitovan SAMO korisniku koji je zatražio generisanje
   * (requestedByUserId na DocumentJob redu). Vidi
   * modules/documents/document-conversion-events.service.ts. */
  emitDocumentJobUpdated(
    userId: string,
    payload: {
      jobId: string;
      sourceType: string;
      sourceId: string;
      status: string;
      error?: string | null;
    },
  ): void {
    this.server.to(`user:${userId}`).emit('document.job.updated', payload);
  }

  private async resolveUserId(client: Socket): Promise<string | null> {
    const token = this.extractToken(client);
    if (!token) {
      return null;
    }
    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { isActive: true },
      });
      return user?.isActive ? payload.sub : null;
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
