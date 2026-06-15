import { Injectable } from '@nestjs/common';
import {
  getZonedCalendarParts,
  isOnOrAfterMonthDay,
  parseMonthDay,
} from '../utils/inventory-date.util';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class InventoryProductionModeService {
  constructor(private readonly prisma: PrismaService) {}

  async isProductionModeEnabled(): Promise<boolean> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'inventory.production_mode' } });
    if (!row) {
      return false;
    }
    return row.value === 'true';
  }

  async getSchedulerTimezone(): Promise<string> {
    const row = await this.prisma.setting.findUnique({
      where: { key: 'inventory.scheduler_timezone' },
    });
    if (!row || row.valueType !== 'string') {
      return 'Europe/Sarajevo';
    }
    const value = row.value.trim();
    return value.length > 0 ? value : 'Europe/Sarajevo';
  }

  async getLockMonthDay(): Promise<{ month: number; day: number }> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'inventory.lock_date' } });
    const raw = row?.valueType === 'string' && row.value.trim() ? row.value.trim() : '11-30';
    return parseMonthDay(raw);
  }

  async getSessionEndMonthDay(): Promise<{ month: number; day: number }> {
    const row = await this.prisma.setting.findUnique({
      where: { key: 'inventory.session_end_date' },
    });
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
  }

  async isProductionLockActiveForCity(cityId: string, date: Date = new Date()): Promise<boolean> {
    const locked = await this.findProductionLockOrgUnitIdsForCity(cityId, date);
    return locked.length > 0;
  }
}
