import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { InitializeSetupDto } from './dto/initialize-setup.dto';

export interface SetupStatusResponse {
  needsSetup: boolean;
}

export interface SetupInitializeResponse {
  success: boolean;
}

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
  ) {}

  async getStatus(): Promise<SetupStatusResponse> {
    const userCount = await this.prisma.user.count();
    return { needsSetup: userCount === 0 };
  }

  async initialize(dto: InitializeSetupDto): Promise<SetupInitializeResponse> {
    const configuredToken = this.configService.get<string>('SETUP_TOKEN');
    if (configuredToken && configuredToken.length > 0) {
      if (!dto.setupToken || dto.setupToken !== configuredToken) {
        throw new UnauthorizedException('Invalid setup token');
      }
    }
    const userCount = await this.prisma.user.count();
    if (userCount > 0) {
      throw new ConflictException('Application is already initialized');
    }
    const passwordHash = await bcrypt.hash(dto.adminPassword, 10);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.count();
      if (existing > 0) {
        throw new ConflictException('Application is already initialized');
      }
      await tx.user.create({
        data: {
          username: dto.adminUsername.trim(),
          passwordHash,
          role: 'admin',
          firstName: dto.adminFirstName.trim(),
          lastName: dto.adminLastName.trim(),
          email: dto.adminEmail?.trim() || null,
          isActive: true,
        },
      });
    });
    const companyEntries: { key: string; value: string | boolean }[] = [
      { key: 'company.name', value: dto.companyName.trim() },
      { key: 'company.address', value: dto.companyAddress.trim() },
      { key: 'company.city', value: dto.companyCity.trim() },
      { key: 'app.name', value: dto.companyName.trim() },
      { key: 'app.initialized', value: true },
    ];
    if (dto.companyPostalCode?.trim()) {
      companyEntries.push({ key: 'company.postalCode', value: dto.companyPostalCode.trim() });
    }
    if (dto.companyPhone?.trim()) {
      companyEntries.push({ key: 'company.phone', value: dto.companyPhone.trim() });
    }
    if (dto.companyEmail?.trim()) {
      companyEntries.push({ key: 'company.email', value: dto.companyEmail.trim() });
    }
    if (dto.companyTaxId?.trim()) {
      companyEntries.push({ key: 'company.taxId', value: dto.companyTaxId.trim() });
    }
    await this.settingsService.upsertValues(companyEntries);
    return { success: true };
  }
}
