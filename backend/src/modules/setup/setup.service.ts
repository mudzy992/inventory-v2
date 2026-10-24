import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { InitializeSetupDto } from './dto/initialize-setup.dto';
import { SetupBootstrapService } from './setup-bootstrap.service';
import { getSetupTokenFailure } from './utils/setup-auth.util';

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
    const tokenFailure = getSetupTokenFailure(
      this.configService.get<string>('SETUP_TOKEN'),
      dto.setupToken,
      this.configService.get<string>('NODE_ENV') === 'production',
    );
    if (tokenFailure === 'missing-production-token') {
      throw new ServiceUnavailableException('SETUP_TOKEN must be configured before production setup');
    }
    if (tokenFailure === 'invalid-token') {
      throw new UnauthorizedException('Invalid setup token');
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
