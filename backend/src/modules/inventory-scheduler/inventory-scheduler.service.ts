import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  getZonedCalendarParts,
  isOnMonthDay,
} from '../../common/utils/inventory-date.util';
import { InventoryProductionModeService } from '../../common/services/inventory-production-mode.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InventoryCountService } from '../inventory-count/inventory-count.service';

@Injectable()
export class InventorySchedulerService {
  private readonly logger = new Logger(InventorySchedulerService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly productionModeService: InventoryProductionModeService,
    private readonly inventoryCountService: InventoryCountService,
  ) {}

  @Cron('5 0 * * *')
  async handleDailyInventoryJobs(): Promise<void> {
    if (!this.isSchedulerEnabled()) {
      return;
    }
    if (!(await this.productionModeService.isProductionModeEnabled())) {
      return;
    }
    const timeZone = await this.productionModeService.getSchedulerTimezone();
    const today = getZonedCalendarParts(new Date(), timeZone);
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
