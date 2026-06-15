import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AUTOCOMPLETE_SEARCH_LIMIT } from '../../common/dto/autocomplete-search-query.dto';
import { LOCATION_MESSAGES } from '../../common/utils/location-messages.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCantonDto } from './dto/create-canton.dto';
import { SearchLocationsQueryDto } from './dto/search-locations-query.dto';
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

  async searchCantons(query: SearchLocationsQueryDto) {
    const term = query.q.trim();
    const limit = Math.min(query.limit ?? AUTOCOMPLETE_SEARCH_LIMIT, AUTOCOMPLETE_SEARCH_LIMIT);
    return this.prisma.canton.findMany({
      where: {
        OR: [{ name: { contains: term } }, { code: { contains: term } }],
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }

  async searchCities(query: SearchLocationsQueryDto) {
    const term = query.q.trim();
    const limit = Math.min(query.limit ?? AUTOCOMPLETE_SEARCH_LIMIT, AUTOCOMPLETE_SEARCH_LIMIT);
    return this.prisma.city.findMany({
      where: {
        OR: [{ name: { contains: term } }, { canton: { name: { contains: term } } }],
      },
      include: { canton: true },
      orderBy: [{ canton: { name: 'asc' } }, { name: 'asc' }],
      take: limit,
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
      throw new ConflictException(LOCATION_MESSAGES.deleteCantonHasCities);
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
      throw new ConflictException(LOCATION_MESSAGES.deleteCityReferenced);
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
