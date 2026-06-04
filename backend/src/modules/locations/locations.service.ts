import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCantonDto } from './dto/create-canton.dto';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCantonDto } from './dto/update-canton.dto';
import { UpdateCityDto } from './dto/update-city.dto';

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async findCantons() {
    return this.prisma.canton.findMany({
      include: { cities: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createCanton(dto: CreateCantonDto) {
    await this.settingsService.assertFeatureEnabled('features.locations');
    return this.prisma.canton.create({
      data: { name: dto.name, code: dto.code },
      include: { cities: true },
    });
  }

  async updateCanton(id: string, dto: UpdateCantonDto) {
    await this.settingsService.assertFeatureEnabled('features.locations');
    await this.assertCantonExists(id);
    return this.prisma.canton.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
      },
      include: { cities: { orderBy: { name: 'asc' } } },
    });
  }

  async deleteCanton(id: string) {
    await this.assertCantonExists(id);
    const cityCount = await this.prisma.city.count({ where: { cantonId: id } });
    if (cityCount > 0) {
      throw new ConflictException('Cannot delete canton that still has cities');
    }
    return this.prisma.canton.delete({ where: { id } });
  }

  async createCity(dto: CreateCityDto) {
    await this.settingsService.assertFeatureEnabled('features.locations');
    const canton = await this.prisma.canton.findUnique({ where: { id: dto.cantonId } });
    if (!canton) {
      throw new NotFoundException('Canton not found');
    }
    return this.prisma.city.create({
      data: { cantonId: dto.cantonId, name: dto.name },
      include: { canton: true },
    });
  }

  async findCities() {
    return this.prisma.city.findMany({
      include: { canton: true },
      orderBy: [{ canton: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async updateCity(id: string, dto: UpdateCityDto) {
    await this.settingsService.assertFeatureEnabled('features.locations');
    await this.assertCityExists(id);
    if (dto.cantonId) {
      const canton = await this.prisma.canton.findUnique({ where: { id: dto.cantonId } });
      if (!canton) {
        throw new NotFoundException('Canton not found');
      }
    }
    return this.prisma.city.update({
      where: { id },
      data: {
        name: dto.name,
        cantonId: dto.cantonId,
      },
      include: { canton: true },
    });
  }

  async deleteCity(id: string) {
    await this.assertCityExists(id);
    const [orgUnits, warehouses, commissions] = await Promise.all([
      this.prisma.orgUnit.count({
        where: {
          OR: [{ locationCityId: id }, { effectiveLocationCityId: id }],
        },
      }),
      this.prisma.warehouse.count({ where: { cityId: id } }),
      this.prisma.disposalCommission.count({ where: { cityId: id } }),
    ]);
    if (orgUnits > 0 || warehouses > 0 || commissions > 0) {
      throw new ConflictException(
        'Cannot delete city referenced by org units, warehouses, or disposal commissions',
      );
    }
    return this.prisma.city.delete({ where: { id } });
  }

  private async assertCantonExists(id: string): Promise<void> {
    const row = await this.prisma.canton.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('Canton not found');
    }
  }

  private async assertCityExists(id: string): Promise<void> {
    const row = await this.prisma.city.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException('City not found');
    }
  }
}
