import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { InitializeSetupDto } from './dto/initialize-setup.dto';
import { SetupBootstrapService } from './setup-bootstrap.service';

export interface SetupStatusResponse {
  needsSetup: boolean;
}

export interface SetupInitializeResponse {
  success: boolean;
  usernames: string[];
}

@Injectable()
export class SetupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    private readonly configService: ConfigService,
    private readonly bootstrapService: SetupBootstrapService,
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
    const result = await this.bootstrapService.bootstrap(dto);
    await this.settingsService.upsertValues(this.bootstrapService.buildCompanySettingsEntries(dto));
    return { success: true, usernames: result.usernames };
  }
}
