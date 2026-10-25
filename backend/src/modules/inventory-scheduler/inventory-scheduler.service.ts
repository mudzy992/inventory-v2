import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  getZonedCalendarParts,
  isOnMonthDay,
} from '../../common/utils/inventory-date.util';
import { InventoryProductionModeService } from '../../common/services/inventory-production-mode.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { InventoryCountService } from '../inventory-count/inventory-count.service';

const DAILY_JOB_LOCK_KEY = 'lock:inventory-scheduler:daily-jobs';
// Lease se periodično obnavlja dok dnevni posao traje; TTL ostaje ograničen
// kako bi Redis očistio lock ako proces padne prije finally/release toka.
const DAILY_JOB_LOCK_TTL_MS = 15 * 60 * 1000;
const DAILY_JOB_LOCK_RENEW_INTERVAL_MS = Math.floor(DAILY_JOB_LOCK_TTL_MS / 3);

@Injectable()
export class InventorySchedulerService {
  private readonly logger = new Logger(InventorySchedulerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly productionModeService: InventoryProductionModeService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly redisService: RedisService,
  ) {}

  // Trigger is pinned to UTC so host/container TZ cannot move the daily tick.
  // The business calendar date is still derived from inventory.scheduler_timezone.
  @Cron('5 0 * * *', { timeZone: 'UTC' })
  async handleDailyInventoryJobs(): Promise<void> {
    if (!this.isSchedulerEnabled()) {
      return;
    }
    if (!(await this.productionModeService.isProductionModeEnabled())) {
      return;
    }
    // Distribuirani lock: @Cron se izvršava NEZAVISNO na svakoj backend
    // instanci — bez ovoga, dvije replike bi obje pokrenule iste dnevne
    // poslove (duplirane draft sesije, duplirano zatvaranje) u istoj minuti.
    // Ovo je danas "buduća zaštita" (aplikacija trenutno radi kao jedna
    // instanca), ali je jeftina i bezopasna da se doda sad — kad god se
    // backend skalira na više replika, ovaj cron ostaje ispravan bez
    // dodatnih izmjena.
    const lockToken = await this.redisService.acquireLock(DAILY_JOB_LOCK_KEY, DAILY_JOB_LOCK_TTL_MS);
    if (!lockToken) {
      this.logger.debug('Daily inventory job skipped — lock held by another instance.');
      return;
    }
    let renewalInFlight: Promise<void> | undefined;
    const renewalTimer = setInterval(() => {
      if (renewalInFlight) return;
      renewalInFlight = this.redisService
        .renewLock(DAILY_JOB_LOCK_KEY, lockToken, DAILY_JOB_LOCK_TTL_MS)
        .then((renewed) => {
          if (!renewed) {
            this.logger.error('Inventory scheduler lock lease was lost while the job was running.');
          }
        })
        .catch((error: unknown) => {
          this.logger.error(`Inventory scheduler lock renewal failed: ${String(error)}`);
        })
        .finally(() => {
          renewalInFlight = undefined;
        });
    }, DAILY_JOB_LOCK_RENEW_INTERVAL_MS);
    renewalTimer.unref();

    try {
      const timeZone = await this.productionModeService.getSchedulerTimezone();
      let today: ReturnType<typeof getZonedCalendarParts>;
      try {
        today = getZonedCalendarParts(new Date(), timeZone);
      } catch (error) {
        this.logger.error(`Invalid inventory scheduler timezone "${timeZone}": ${String(error)}`);
        return;
      }
      const lockDate = await this.productionModeService.getLockMonthDay();
      const endDate = await this.productionModeService.getSessionEndMonthDay();
      if (isOnMonthDay(today, lockDate)) {
        await this.runLockDayJobs(today.year);
      }
      if (today.month === 12 && today.day === 1) {
        await this.runOptionalAutoActivate(today.year);
      }
      if (isOnMonthDay(today, endDate)) {
        await this.runEndDayJobs(today.year);
      }
      if (today.month === 1 && today.day === 1) {
        await this.runJan1DraftJobs(today.year);
      }
    } finally {
      clearInterval(renewalTimer);
      if (renewalInFlight) await renewalInFlight;
      await this.redisService.releaseLock(DAILY_JOB_LOCK_KEY, lockToken);
    }
  }

  private async runJan1DraftJobs(year: number): Promise<void> {
    const autoCreate = await this.readBooleanSetting('inventory.auto_create_draft_session', true);
    if (!autoCreate) {
      return;
    }
    const distributions = await this.prisma.orgUnit.findMany({
      where: { type: 'distribucija' },
      select: { id: true, name: true },
    });
    for (const distribution of distributions) {
      try {
        const result = await this.inventoryCountService.ensureDraftSessionForDistribution(
          distribution.id,
          year,
        );
        if (result.skipped) {
          this.logger.warn(
            `Jan 1 draft skipped for ${distribution.name}: open session "${result.session.name}"`,
          );
          continue;
        }
        this.logger.log(
          `Jan 1 draft session ${result.created ? 'created' : 'reconciled'} for ${distribution.name} year ${year}`,
        );
      } catch (error) {
        this.logger.error(
          `Jan 1 draft job failed for distribution ${distribution.id}: ${String(error)}`,
        );
      }
    }
  }

  private isSchedulerEnabled(): boolean {
    return this.configService.get<string>('INVENTORY_SCHEDULER_ENABLED', 'false') === 'true';
  }

  private async runLockDayJobs(year: number): Promise<void> {
    const autoCreate = await this.readBooleanSetting('inventory.auto_create_draft_session', true);
    if (!autoCreate) {
      return;
    }
    const distributions = await this.prisma.orgUnit.findMany({
      where: { type: 'distribucija' },
      select: { id: true, name: true },
    });
    for (const distribution of distributions) {
      try {
        const created = await this.inventoryCountService.ensureDraftSessionForDistribution(
          distribution.id,
          year,
        );
        if (created.skipped) {
          this.logger.warn(
            `Lock day draft skipped for ${distribution.name}: open session "${created.session.name}"`,
          );
          continue;
        }
        if (created.created) {
          this.logger.log(
            `Draft session created for ${distribution.name} (${distribution.id}) year ${year}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Lock day job failed for distribution ${distribution.id}: ${String(error)}`,
        );
      }
    }
  }

  private async runOptionalAutoActivate(year: number): Promise<void> {
    const autoActivate = await this.readBooleanSetting('inventory.auto_activate_session', false);
    if (!autoActivate) {
      return;
    }
    const sessions = await this.prisma.inventorySession.findMany({
      where: { year, status: 'draft' },
      select: { id: true },
    });
    for (const session of sessions) {
      try {
        await this.inventoryCountService.activateSession(session.id);
        this.logger.log(`Auto-activated session ${session.id}`);
      } catch (error) {
        this.logger.warn(`Auto-activate skipped for ${session.id}: ${String(error)}`);
      }
    }
  }

  private async runEndDayJobs(year: number): Promise<void> {
    const autoClose = await this.readBooleanSetting('inventory.auto_close_session', true);
    if (!autoClose) {
      return;
    }
    await this.inventoryCountService.attemptAutoCloseSessionsForYear(year);
  }

  private async readBooleanSetting(key: string, defaultValue: boolean): Promise<boolean> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) {
      return defaultValue;
    }
    return row.value === 'true';
  }
}
