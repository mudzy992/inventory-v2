import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import {
  getActiveSocketIoAdapterMode,
  isSharedSocketIoAdapterRequired,
  type SocketIoAdapterMode,
} from '../../redis/socketio-adapter.registry';
import { DOCUMENT_GENERATION_QUEUE } from '../documents/document-generation.queue';
import { INVENTORY_SESSION_CLOSE_QUEUE } from '../inventory-count/inventory-session-close.queue';

const PROBE_TIMEOUT_MS = 1_000;

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @InjectQueue(INVENTORY_SESSION_CLOSE_QUEUE)
    private readonly inventoryCloseQueue: Queue,
    @InjectQueue(DOCUMENT_GENERATION_QUEUE)
    private readonly documentGenerationQueue: Queue,
  ) {}

  @Get('live')
  getLiveness(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get()
  async getHealth(): Promise<{
    status: string;
    database: string;
    timestamp: string;
  }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new HttpException(
        {
          status: 'degraded',
          database: 'disconnected',
          timestamp: new Date().toISOString(),
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  @Get('ready')
  async getReadiness(): Promise<{
    status: string;
    database: string;
    redis: string;
    queues: { inventoryClose: string; documentGeneration: string };
    socketio: { mode: SocketIoAdapterMode; sharedAdapterRequired: boolean };
    timestamp: string;
  }> {
    const [databaseResult, redisResult, inventoryQueueResult, documentQueueResult] =
      await Promise.allSettled([
        this.probe(() => this.prisma.$queryRaw`SELECT 1`, 'database'),
        this.probe(() => this.redisService.getClient().ping(), 'Redis'),
        this.probe(() => this.inventoryCloseQueue.getJobCounts('waiting', 'active'), 'inventory-close queue'),
        this.probe(
          () => this.documentGenerationQueue.getJobCounts('waiting', 'active'),
          'document-generation queue',
        ),
      ]);

    const database = databaseResult.status === 'fulfilled' ? 'connected' : 'disconnected';
    const redis = redisResult.status === 'fulfilled' ? 'connected' : 'disconnected';
    const queues = {
      inventoryClose: inventoryQueueResult.status === 'fulfilled' ? 'connected' : 'disconnected',
      documentGeneration: documentQueueResult.status === 'fulfilled' ? 'connected' : 'disconnected',
    };
    // A plain Redis PING cannot prove THIS process installed the shared
    // Socket.IO adapter. Report the effective mode; when the deployment
    // requires horizontal scaling, an in-memory fallback degrades readiness.
    const socketio = {
      mode: getActiveSocketIoAdapterMode(),
      sharedAdapterRequired: isSharedSocketIoAdapterRequired(),
    };
    const status =
      database === 'connected' &&
      redis === 'connected' &&
      queues.inventoryClose === 'connected' &&
      queues.documentGeneration === 'connected' &&
      (!socketio.sharedAdapterRequired || socketio.mode === 'shared_redis')
        ? 'ok'
        : 'degraded';
    const response = {
      status,
      database,
      redis,
      queues,
      socketio,
      timestamp: new Date().toISOString(),
    };
    if (status !== 'ok') {
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return response;
  }

  private async probe<T>(operation: () => Promise<T>, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`${label} readiness probe timed out`)),
        PROBE_TIMEOUT_MS,
      );
      void Promise.resolve()
        .then(operation)
        .then(resolve, reject)
        .finally(() => clearTimeout(timeout));
    });
  }
}
