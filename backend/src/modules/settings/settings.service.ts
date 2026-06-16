import { BadRequestException, Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import type { Setting, SettingScope } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  getSettingDefinition,
  SETTINGS_REGISTRY,
  type SettingGroup,
} from './settings.registry';
import { getSettingUiMetadata } from './settings-ui-metadata';

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
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async ensureDefaults(): Promise<void> {
    for (const definition of SETTINGS_REGISTRY) {
      const existing = await this.prisma.setting.findUnique({ where: { key: definition.key } });
      if (existing) {
        if (existing.scope !== definition.scope || existing.valueType !== definition.valueType) {
          await this.prisma.setting.update({
            where: { key: definition.key },
            data: {
              scope: definition.scope,
              valueType: definition.valueType,
              description: definition.description,
            },
          });
        }
        continue;
      }
      await this.prisma.setting.create({
        data: {
          key: definition.key,
          scope: definition.scope,
          valueType: definition.valueType,
          value: this.serializeValue(definition.defaultValue, definition.valueType),
          description: definition.description,
        },
      });
    }
  }

  async getBooleanValue(key: string, defaultValue = false): Promise<boolean> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) {
      return defaultValue;
    }
    const parsed = this.parseValue(row.value, row.valueType);
    return parsed === true;
  }

  async getNumberValue(key: string, defaultValue: number): Promise<number> {
    const row = await this.prisma.setting.findUnique({ where: { key } });
    if (!row) {
      return defaultValue;
    }
    const parsed = this.parseValue(row.value, row.valueType);
    return typeof parsed === 'number' && !Number.isNaN(parsed) ? parsed : defaultValue;
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
    for (const entry of entries) {
      const definition = getSettingDefinition(entry.key);
      if (!definition) {
        throw new NotFoundException(`Unknown setting key: ${entry.key}`);
      }
      const serialized = this.serializeValue(entry.value, definition.valueType);
      await this.prisma.setting.upsert({
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
    const serialized = this.serializeValue(rawValue, definition.valueType);
    const row = await this.prisma.setting.update({
      where: { key },
      data: { value: serialized },
    });
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

  private serializeValue(value: string | number | boolean, valueType: string): string {
    if (valueType === 'boolean') {
      return value === true || value === 'true' ? 'true' : 'false';
    }
    if (valueType === 'number') {
      const numeric = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(numeric)) {
        throw new BadRequestException('Invalid number value');
      }
      return String(numeric);
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
