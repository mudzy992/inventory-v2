import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client';
import {
  buildContainsSearchWhere,
  buildOrderBy,
  paginate,
  parsePagination,
  resolveListPageSize,
} from '../../common/utils/pagination.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { ListDisposalCommissionsQueryDto } from './dto/list-disposal-commissions-query.dto';

const COMMISSION_LIST_INCLUDE = {
  city: { include: { canton: true } },
  members: { include: { employee: true } },
  inventoryCommittee: {
    include: {
      session: { select: { id: true, name: true, year: true, status: true } },
      warehouse: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.DisposalCommissionInclude;

const COMMISSION_SORT_FIELDS: Record<string, string> = {
  name: 'name',
  createdAt: 'createdAt',
};

@Injectable()
export class DisposalCommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  private async assertDisposalCommissionsEnabled(): Promise<void> {
    await this.settingsService.assertFeatureEnabled('features.disposal_commissions');
  }

  async findAll(query: ListDisposalCommissionsQueryDto) {
    await this.assertDisposalCommissionsEnabled();
    const { pageSize, maxPageSize } = await resolveListPageSize(query.pageSize, this.settingsService);
    const { page, take } = parsePagination(query, { defaultPageSize: pageSize, maxPageSize });
    const filters: Prisma.DisposalCommissionWhereInput[] = [{ isActive: true }];
    if (query.cityId) {
      filters.push({ cityId: query.cityId });
    }
    const searchWhere = buildContainsSearchWhere(query.search, ['name']);
    if (searchWhere) {
      filters.push(searchWhere);
    }
    const where: Prisma.DisposalCommissionWhereInput =
      filters.length === 1 ? filters[0]! : { AND: filters };
    const orderBy = buildOrderBy(query.sortBy, query.sortDir, COMMISSION_SORT_FIELDS, 'name');
    return paginate({
      findMany: (args) =>
        this.prisma.disposalCommission.findMany({
          ...args,
          include: COMMISSION_LIST_INCLUDE,
        }),
      count: (args) => this.prisma.disposalCommission.count(args),
      where,
      orderBy,
      page,
      pageSize: take,
    });
  }

  async findOne(id: string) {
    await this.assertDisposalCommissionsEnabled();
    const commission = await this.prisma.disposalCommission.findUnique({
      where: { id },
      include: COMMISSION_LIST_INCLUDE,
    });
    if (!commission) {
      throw new NotFoundException('Disposal commission not found');
    }
    return commission;
  }
}
