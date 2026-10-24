import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {}

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
    timestamp: string;
  }> {
    const [databaseResult, redisResult] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.pingRedisWithTimeout(),
    ]);
    const database = databaseResult.status === 'fulfilled' ? 'connected' : 'disconnected';
    const redis = redisResult.status === 'fulfilled' ? 'connected' : 'disconnected';
    const response = {
      status: database === 'connected' && redis === 'connected' ? 'ok' : 'degraded',
      database,
      redis,
      timestamp: new Date().toISOString(),
    };
    if (response.status !== 'ok') {
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return response;
  }

  private async pingRedisWithTimeout(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Redis readiness probe timed out')), 1000);
      void Promise.resolve()
        .then(() => this.redisService.getClient().ping())
        .then(() => resolve())
        .catch(reject)
        .finally(() => clearTimeout(timeout));
    });
  }
}