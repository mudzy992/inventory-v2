import { Injectable } from '@nestjs/common';
import {
  getZonedCalendarParts,
  isOnOrAfterMonthDay,
  parseMonthDay,
} from '../utils/inventory-date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SettingsService } from '../../modules/settings/settings.service';

@Injectable()
export class InventoryProductionModeService {
  // findProductionLockOrgUnitIdsForCity radi N+1 upit (jedan po distribuciji
  // u gradu) na svaki poziv — koristi se na potencijalno vrućim putevima
  // (equipment/transfer write provjere). Kratak TTL cache po (grad, dan)
  // svodi to na jedan izračun po gradu po danu umjesto po svakom zahtjevu.
  private static readonly LOCK_CACHE_TTL_SECONDS = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly redisService: RedisService,
  ) {}

  async isProductionModeEnabled(): Promise<boolean> {
    return this.settingsService.getBooleanValue('inventory.production_mode', false);
  }

  async getSchedulerTimezone(): Promise<string> {
    const row = await this.settingsService.getRow('inventory.scheduler_timezone');
    if (!row || row.valueType !== 'string') {
      return 'Europe/Sarajevo';
    }
    const value = row.value.trim();
    return value.length > 0 ? value : 'Europe/Sarajevo';
  }

  async getLockMonthDay(): Promise<{ month: number; day: number }> {
    const row = await this.settingsService.getRow('inventory.lock_date');
    const raw = row?.valueType === 'string' && row.value.trim() ? row.value.trim() : '11-30';
    return parseMonthDay(raw);
  }

  async getSessionEndMonthDay(): Promise<{ month: number; day: number }> {
    const row = await this.settingsService.getRow('inventory.session_end_date');
    const raw = row?.valueType === 'string' && row.value.trim() ? row.value.trim() : '12-31';
    return parseMonthDay(raw);
  }

  async isProductionLockActive(orgUnitId: string, date: Date = new Date()): Promise<boolean> {
    if (!(await this.isProductionModeEnabled())) {
      return false;
    }
    const timeZone = await this.getSchedulerTimezone();
    const calendar = getZonedCalendarParts(date, timeZone);
    const lockDate = await this.getLockMonthDay();
    if (!isOnOrAfterMonthDay(calendar, lockDate)) {
      return false;
    }
    const session = await this.prisma.inventorySession.findUnique({
      where: { orgUnitId_year: { orgUnitId, year: calendar.year } },
      select: { status: true },
    });
    if (!session) {
      return false;
    }
    return session.status !== 'closed';
  }

  async findProductionLockOrgUnitIdsForCity(cityId: string, date: Date = new Date()): Promise<string[]> {
    const cacheKey = `inventory:prodlock:city:${cityId}:${date.toISOString().slice(0, 10)}`;
    return this.redisService.remember(cacheKey, InventoryProductionModeService.LOCK_CACHE_TTL_SECONDS, async () => {
      const distributions = await this.prisma.orgUnit.findMany({
        where: { type: 'distribucija', effectiveLocationCityId: cityId },
        select: { id: true },
      });
      const locked: string[] = [];
      for (const distribution of distributions) {
        if (await this.isProductionLockActive(distribution.id, date)) {
          locked.push(distribution.id);
        }
      }
      return locked;
    });
  }

  async isProductionLockActiveForCity(cityId: string, date: Date = new Date()): Promise<boolean> {
    const locked = await this.findProductionLockOrgUnitIdsForCity(cityId, date);
    return locked.length > 0;
  }
}
