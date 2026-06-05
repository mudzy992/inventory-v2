import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CategoriesService } from '../categories/categories.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { SearchCatalogQueryDto } from './dto/search-catalog-query.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';

const CATALOG_SORT_FIELDS: Record<string, string> = {
  name: 'name',
  code: 'code',
  createdAt: 'createdAt',
};

@Injectable()
export class EquipmentCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categoriesService: CategoriesService,
    private readonly settingsService: SettingsService,
  ) {}

  async findAll(query: SearchCatalogQueryDto) {
    await this.settingsService.assertFeatureEnabled('features.equipment_catalog');
    const searchTerm = (query.search ?? query.q)?.trim();
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, skip, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const where: Prisma.EquipmentCatalogItemWhereInput = {
      isActive: true,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(searchTerm
        ? {
            OR: [{ code: { contains: searchTerm } }, { name: { contains: searchTerm } }],
          }
        : {}),
    };
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, CATALOG_SORT_FIELDS, 'name');
    return paginate({
      findMany: (args) =>
        this.prisma.equipmentCatalogItem.findMany({
          ...args,
          include: { category: { select: { id: true, name: true, parentId: true } } },
        }),
      count: (args) => this.prisma.equipmentCatalogItem.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
  }

  async findOne(id: string) {
    await this.settingsService.assertFeatureEnabled('features.equipment_catalog');
    const row = await this.prisma.equipmentCatalogItem.findUnique({
      where: { id },
      include: { category: true },
    });
    if (!row) {
      throw new NotFoundException('Catalog item not found');
    }
    return row;
  }

  async create(dto: CreateCatalogItemDto) {
    await this.settingsService.assertFeatureEnabled('features.equipment_catalog');
    await this.categoriesService.assertLeafCategory(dto.categoryId);
    const code = dto.code.trim();
    const existing = await this.prisma.equipmentCatalogItem.findUnique({ where: { code } });
    if (existing) {
      throw new ConflictException('Šifra već postoji u šifrarniku');
    }
    return this.prisma.equipmentCatalogItem.create({
      data: {
        code,
        name: dto.name.trim(),
        categoryId: dto.categoryId,
        isActive: dto.isActive ?? true,
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: UpdateCatalogItemDto) {
    await this.settingsService.assertFeatureEnabled('features.equipment_catalog');
    await this.findOne(id);
    if (dto.categoryId) {
      await this.categoriesService.assertLeafCategory(dto.categoryId);
    }
    if (dto.code) {
      const code = dto.code.trim();
      const existing = await this.prisma.equipmentCatalogItem.findFirst({
        where: { code, NOT: { id } },
      });
      if (existing) {
        throw new ConflictException('Šifra već postoji u šifrarniku');
      }
    }
    return this.prisma.equipmentCatalogItem.update({
      where: { id },
      data: {
        code: dto.code?.trim(),
        name: dto.name?.trim(),
        categoryId: dto.categoryId,
        isActive: dto.isActive,
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async remove(id: string) {
    await this.settingsService.assertFeatureEnabled('features.equipment_catalog');
    const inUse = await this.prisma.equipment.count({ where: { catalogItemId: id } });
    if (inUse > 0) {
      throw new BadRequestException('Stavka šifrarnika je u upotrebi na opremi');
    }
    await this.prisma.equipmentCatalogItem.delete({ where: { id } });
  }

  async resolveForStockLot(input: {
    catalogItemId?: string;
    productName: string;
    categoryId: string;
  }): Promise<{ catalogItemId: string | null; productName: string }> {
    if (input.catalogItemId) {
      const item = await this.prisma.equipmentCatalogItem.findFirst({
        where: { id: input.catalogItemId, isActive: true },
      });
      if (!item) {
        throw new BadRequestException('Stavka šifrarnika nije pronađena');
      }
      if (item.categoryId !== input.categoryId) {
        throw new BadRequestException('Šifrarnik ne pripada odabranoj kategoriji');
      }
      return { catalogItemId: item.id, productName: item.name };
    }
    return { catalogItemId: null, productName: input.productName.trim() };
  }
}
