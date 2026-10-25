import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type { Setting, SettingScope } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  getSettingDefinition,
  SETTINGS_REGISTRY,
  type SettingDefinition,
  type SettingGroup,
} from './settings.registry';
import { getSettingUiMetadata } from './settings-ui-metadata';
import {
  assertPageSizeSettingRelationship,
  parseAndValidateNumericSetting,
} from './utils/numeric-setting-validation.util';

export interface SettingDependsOn {
  key: string;
  equals?: boolean | string | number;
}

export type SettingDisplay = 'default' | 'info' | 'deprecated';

export interface SettingResponse {
  key: string;
  scope: SettingScope;
  valueType: string;
  value: string | number | boolean;
  label: string;
  description: string;
  detail?: string;
  group: SettingGroup;
  adminEditable: boolean;
  dependsOn?: SettingDependsOn;
  display: SettingDisplay;
}

@Injectable()
export class SettingsService {
  // Settings se čitaju na skoro svakom write putu u aplikaciji (feature
  // flag provjere, production-mode lock provjere po više org jedinica u
  // petlji — vidi InventoryProductionModeService) ali se mijenjaju rijetko
  // (administrator ih upisuje ručno). Kratak TTL cache-aside eliminiše
  // veliku većinu ponovljenih upita bez primjetnog staleness rizika;
  // eksplicitna invalidacija na svaki upis (updateValue/upsertValues)
  // dodatno smanjuje taj prozor na praktično nulu za normalne tokove.
  private static readonly CACHE_TTL_SECONDS = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  private static cacheKey(key: string): string {
    return `settings:row:${key}`;
  }

  /** Cache-aside čitanje sirovog Setting reda. Javna metoda jer je i drugi
   * servisi (npr. InventoryProductionModeService) koriste direktno umjesto
   * da rade svoj vlastiti prisma.setting.findUnique poziv. */
  async getRow(key: string): Promise<Pick<Setting, 'value' | 'valueType'> | null> {
    const cached = await this.redisService.getJson<Pick<Setting, 'value' | 'valueType'> | null>(
      SettingsService.cacheKey(key),
    );
    if (cached !== undefined) {
      return cached;
    }
    const row = await this.prisma.setting.findUnique({
      where: { key },
      select: { value: true, valueType: true },
    });
    await this.redisService.setJson(SettingsService.cacheKey(key), row ?? null, SettingsService.CACHE_TTL_SECONDS);
    return row;
  }

  async ensureDefaults(): Promise<void> {
    const defaultWrites = SETTINGS_REGISTRY.map((definition) =>
      this.prisma.setting.upsert({
        where: { key: definition.key },
        create: {
          key: definition.key,
          scope: definition.scope,
          valueType: definition.valueType,
          value: this.serializeValue(definition.defaultValue, definition),
          description: definition.description,
        },
        // Preserve administrator-configured values; reconcile only registry metadata.
        update: {
          scope: definition.scope,
          valueType: definition.valueType,
          description: definition.description,
        },
      }),
    );

    // A single transaction makes the defaults visible as one consistent set;
    // upsert also makes simultaneous multi-instance startup idempotent.
    await this.prisma.$transaction(defaultWrites);
    // Other startup hooks may have cached misses before defaults were inserted.
    await this.redisService.del(...SETTINGS_REGISTRY.map(({ key }) => SettingsService.cacheKey(key)));
  }

  async getBooleanValue(key: string, defaultValue = false): Promise<boolean> {
    const row = await this.getRow(key);
    if (!row) {
      return defaultValue;
    }
    const parsed = this.parseValue(row.value, row.valueType);
    return parsed === true;
  }

  async getNumberValue(key: string, defaultValue: number): Promise<number> {
    const row = await this.getRow(key);
    if (!row) {
      return defaultValue;
    }
    const parsed = this.parseValue(row.value, row.valueType);
    return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : defaultValue;
  }

  async isFeatureEnabled(key: string, defaultValue = true): Promise<boolean> {
    return this.getBooleanValue(key, defaultValue);
  }

  async assertFeatureEnabled(key: string, message?: string): Promise<void> {
    const enabled = await this.isFeatureEnabled(key, true);
    if (!enabled) {
      const definition = getSettingDefinition(key);
      throw new BadRequestException(
        message ?? `Feature is disabled: ${definition?.label ?? key}`,
      );
    }
  }

  async findByScope(scope: SettingScope): Promise<SettingResponse[]> {
    const rows = await this.prisma.setting.findMany({
      where: { scope },
      orderBy: { key: 'asc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async upsertValues(
    entries: { key: string; value: string | number | boolean }[],
  ): Promise<void> {
    await this.writeValues(entries, this.prisma);
    await this.invalidateValues(entries);
  }

  async upsertValuesInTransaction(
    entries: { key: string; value: string | number | boolean }[],
    settingStore: Pick<PrismaService, 'setting'>,
  ): Promise<void> {
    await this.writeValues(entries, settingStore);
  }

  async invalidateValues(entries: { key: string }[]): Promise<void> {
    for (const entry of entries) {
      await this.redisService.del(SettingsService.cacheKey(entry.key));
    }
  }

  private async writeValues(
    entries: { key: string; value: string | number | boolean }[],
    settingStore: Pick<PrismaService, 'setting'>,
  ): Promise<void> {
    for (const entry of entries) {
      const definition = getSettingDefinition(entry.key);
      if (!definition) {
        throw new NotFoundException(`Unknown setting key: ${entry.key}`);
      }
      const serialized = this.serializeValue(entry.value, definition);
      await settingStore.setting.upsert({
        where: { key: entry.key },
        create: {
          key: entry.key,
          scope: definition.scope,
          valueType: definition.valueType,
          value: serialized,
          description: definition.description,
        },
        update: { value: serialized },
      });
    }
  }

  async updateValue(key: string, rawValue: string | number | boolean): Promise<SettingResponse> {
    const definition = getSettingDefinition(key);
    if (!definition) {
      throw new NotFoundException(`Unknown setting key: ${key}`);
    }
    if (!definition.adminEditable) {
      throw new BadRequestException(`Setting cannot be edited: ${key}`);
    }
    const serialized = this.serializeValue(rawValue, definition);
    if (key === 'lists.default_page_size' || key === 'lists.max_page_size') {
      await this.assertPageSizeRelationship(key, Number(serialized));
    }
    const row = await this.prisma.setting.update({
      where: { key },
      data: { value: serialized },
    });
    await this.redisService.del(SettingsService.cacheKey(key));
    const response = this.toResponse(row);
    if (definition.scope === 'public') {
      this.notificationsService.emitPublicSettingUpdated(response.key, response.value);
    }
    return response;
  }

  private toResponse(row: Setting): SettingResponse {
    const definition = getSettingDefinition(row.key);
    const ui = getSettingUiMetadata(row.key);
    return {
      key: row.key,
      scope: row.scope,
      valueType: row.valueType,
      value: this.parseValue(row.value, row.valueType),
      label: definition?.label ?? row.key,
      description: definition?.description ?? row.description,
      detail: ui?.detail,
      group: definition?.group ?? 'system',
      adminEditable: definition?.adminEditable ?? false,
      dependsOn: ui?.dependsOn,
      display: ui?.display ?? 'default',
    };
  }

  private async assertPageSizeRelationship(key: string, value: number): Promise<void> {
    const otherKey =
      key === 'lists.default_page_size' ? 'lists.max_page_size' : 'lists.default_page_size';
    const otherDefinition = getSettingDefinition(otherKey);
    if (!otherDefinition) {
      throw new BadRequestException(`Missing related setting definition: ${otherKey}`);
    }
    const otherRow = await this.prisma.setting.findUnique({
      where: { key: otherKey },
      select: { value: true },
    });
    const otherValue = otherRow ? Number(otherRow.value) : Number(otherDefinition.defaultValue);
    assertPageSizeSettingRelationship(key, value, otherValue);
  }

  private serializeValue(value: string | number | boolean, definition: SettingDefinition): string {
    if (definition.valueType === 'boolean') {
      if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
      }
      if (value === 'true' || value === 'false') {
        return value;
      }
      throw new BadRequestException(`Invalid boolean value for setting: ${definition.key}`);
    }
    if (definition.valueType === 'number') {
      return String(parseAndValidateNumericSetting(value, definition));
    }
    return String(value);
  }

  private parseValue(value: string, valueType: string): string | number | boolean {
    if (valueType === 'boolean') {
      return value === 'true';
    }
    if (valueType === 'number') {
      return Number(value);
    }
    return value;
  }
}
