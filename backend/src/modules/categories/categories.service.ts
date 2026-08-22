import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Category, Prisma } from '../../../generated/prisma/client';
import {
  normalizeLotCategoryFields,
  normalizeUnitCategoryFields,
  parseCategoryFields,
  type CategoryFieldDefinition,
} from '../../common/utils/category-fields.util';
import { CATEGORY_MESSAGES } from '../../common/utils/category-messages.util';
import { AUTOCOMPLETE_SEARCH_LIMIT } from '../../common/dto/autocomplete-search-query.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { SearchCategoriesQueryDto } from './dto/search-categories-query.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

export interface CategoryTreeNode {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  categoryKind: string;
  fields: CategoryFieldDefinition[];
  optionalFields: CategoryFieldDefinition[];
  children: CategoryTreeNode[];
}

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async findFlat(): Promise<Category[]> {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async search(query: SearchCategoriesQueryDto): Promise<Category[]> {
    const term = query.q.trim();
    const limit = Math.min(query.limit ?? AUTOCOMPLETE_SEARCH_LIMIT, AUTOCOMPLETE_SEARCH_LIMIT);
    return this.prisma.category.findMany({
      where: {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: limit,
    });
  }

  async findTree(): Promise<CategoryTreeNode[]> {
    const categories = await this.findFlat();
    return this.buildCategoryTree(categories);
  }

  async findOne(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async create(dto: CreateCategoryDto): Promise<Category> {
    await this.settingsService.assertFeatureEnabled('features.categories');
    if (dto.parentId) {
      await this.findOne(dto.parentId);
    }
    const categoryKind = dto.categoryKind ?? (dto.parentId ? 'ASSET' : 'ASSET');
    const fields = normalizeUnitCategoryFields(dto.fields);
    const optionalFields = normalizeLotCategoryFields(dto.optionalFields ?? []);
    return this.prisma.category.create({
      data: {
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId ?? null,
        categoryKind,
        fields: fields as unknown as Prisma.InputJsonValue,
        optionalFields: optionalFields as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async update(id: string, dto: UpdateCategoryDto): Promise<Category> {
    await this.settingsService.assertFeatureEnabled('features.categories');
    await this.findOne(id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('Category cannot be its own parent');
      }
      await this.findOne(dto.parentId);
    }
    const normalizedFields = dto.fields ? normalizeUnitCategoryFields(dto.fields) : undefined;
    const normalizedOptionalFields = dto.optionalFields
      ? normalizeLotCategoryFields(dto.optionalFields)
      : undefined;
    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        parentId: dto.parentId,
        categoryKind: dto.categoryKind,
        fields: normalizedFields as unknown as Prisma.InputJsonValue | undefined,
        optionalFields: normalizedOptionalFields as unknown as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    const childCount = await this.prisma.category.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BadRequestException(CATEGORY_MESSAGES.deleteHasChildren);
    }
    const equipmentCount = await this.prisma.equipment.count({ where: { categoryId: id } });
    if (equipmentCount > 0) {
      throw new BadRequestException(CATEGORY_MESSAGES.deleteHasEquipment);
    }
    await this.prisma.category.delete({ where: { id } });
  }

  async assertLeafCategory(categoryId: string): Promise<Category> {
    const category = await this.findOne(categoryId);
    const childCount = await this.prisma.category.count({ where: { parentId: categoryId } });
    if (childCount > 0) {
      throw new BadRequestException('Equipment must reference a sub-category (leaf)');
    }
    return category;
  }

  getFieldDefinitions(category: Category): {
    fields: CategoryFieldDefinition[];
    optionalFields: CategoryFieldDefinition[];
  } {
    return {
      fields: parseCategoryFields(category.fields),
      optionalFields: parseCategoryFields(category.optionalFields),
    };
  }

  private buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
    const nodes = new Map<string, CategoryTreeNode>();
    for (const category of categories) {
      nodes.set(category.id, {
        id: category.id,
        name: category.name,
        description: category.description,
        parentId: category.parentId,
        categoryKind: category.categoryKind,
        fields: parseCategoryFields(category.fields),
        optionalFields: parseCategoryFields(category.optionalFields),
        children: [],
      });
    }
    const roots: CategoryTreeNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}
