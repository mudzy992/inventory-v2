import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { buildEffectiveSignerMap } from '../../common/utils/resolve-effective-signer.util';
import { PrismaService } from '../../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import type { InitializeSetupDto } from './dto/initialize-setup.dto';
import { EVIDENS_APP_NAME, collectUsernames, slugifyCatalogCode } from './utils/setup-bootstrap.util';

export interface SetupBootstrapResult {
  cantonId: string;
  cityIds: string[];
  direkcijaId: string;
  warehouseId: string;
  parentCategoryId: string;
  leafCategoryId: string;
  catalogItemId: string;
  usernames: string[];
}

@Injectable()
export class SetupBootstrapService {
  private readonly logger = new Logger(SetupBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
  ) {}

  async bootstrap(
    dto: InitializeSetupDto,
    companySettings: { key: string; value: string | boolean }[],
  ): Promise<SetupBootstrapResult> {
    try {
      collectUsernames([
        dto.admin.username,
        dto.roles.evidenticar.username,
        dto.roles.skladistar.username,
        dto.roles.popis_koordinator.username,
        dto.roles.user.username,
      ]);
    } catch {
      throw new BadRequestException('Korisnička imena moraju biti jedinstvena');
    }
    const passwordHashes = await Promise.all([
      bcrypt.hash(dto.admin.password, 10),
      bcrypt.hash(dto.roles.evidenticar.password, 10),
      bcrypt.hash(dto.roles.skladistar.password, 10),
      bcrypt.hash(dto.roles.popis_koordinator.password, 10),
      bcrypt.hash(dto.roles.user.password, 10),
    ]);
    const catalogCode = dto.catalog.code?.trim() || slugifyCatalogCode(dto.catalog.name);
    const result = await this.prisma.$transaction(async (tx) => {
      // Serialize the first bootstrap across backend replicas. The inner count
      // then runs after the previous transaction commits or rolls back.
      // Return an integer row instead of Prisma having to deserialize PostgreSQL's `void` lock result.
      await tx.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(1800043170, 13579)) AS setup_bootstrap_lock`;
      const existing = await tx.user.count();
      if (existing > 0) {
        throw new ConflictException('Application is already initialized');
      }
      const canton = await tx.canton.create({
        data: { name: dto.location.cantonName.trim() },
      });
      const cities = await Promise.all(
        dto.location.cities.map((name) =>
          tx.city.create({
            data: { name: name.trim(), cantonId: canton.id },
          }),
        ),
      );
      const primaryCity = cities[0];
      const direkcija = await tx.orgUnit.create({
        data: {
          name: dto.company.name.trim(),
          type: 'direkcija',
          parentId: null,
        },
      });
      let warehouseOrgUnitId = direkcija.id;
      if (dto.organization.childUnitName?.trim()) {
        const child = await tx.orgUnit.create({
          data: {
            name: dto.organization.childUnitName.trim(),
            type: dto.organization.childUnitType ?? 'distribucija',
            parentId: direkcija.id,
            locationCityId: primaryCity.id,
            effectiveLocationCityId: primaryCity.id,
          },
        });
        warehouseOrgUnitId = child.id;
      }
      const director = await tx.employee.create({
        data: {
          firstName: dto.director.firstName.trim(),
          lastName: dto.director.lastName.trim(),
          title: dto.director.title.trim(),
          orgUnitId: direkcija.id,
          email: dto.company.email?.trim() || null,
        },
      });
      const userEmployee = await tx.employee.create({
        data: {
          firstName: dto.roles.user.employee.firstName.trim(),
          lastName: dto.roles.user.employee.lastName.trim(),
          title: dto.roles.user.employee.title.trim(),
          orgUnitId: direkcija.id,
        },
      });
      const skladistarEmployee = await tx.employee.create({
        data: {
          firstName: dto.roles.skladistar.employee.firstName.trim(),
          lastName: dto.roles.skladistar.employee.lastName.trim(),
          title: dto.roles.skladistar.employee.title.trim(),
          orgUnitId: warehouseOrgUnitId,
        },
      });
      const evidenticarEmployee = await tx.employee.create({
        data: {
          firstName: dto.roles.evidenticar.employee.firstName.trim(),
          lastName: dto.roles.evidenticar.employee.lastName.trim(),
          title: dto.roles.evidenticar.employee.title.trim(),
          orgUnitId: direkcija.id,
        },
      });
      const coordinatorEmployee = await tx.employee.create({
        data: {
          firstName: dto.roles.popis_koordinator.employee.firstName.trim(),
          lastName: dto.roles.popis_koordinator.employee.lastName.trim(),
          title: dto.roles.popis_koordinator.employee.title.trim(),
          orgUnitId: direkcija.id,
        },
      });
      await tx.orgUnit.update({
        where: { id: direkcija.id },
        data: { signerId: director.id },
      });
      const orgUnitsForSigner = await tx.orgUnit.findMany({
        select: { id: true, parentId: true, signerId: true },
      });
      const effectiveSignerMap = buildEffectiveSignerMap(orgUnitsForSigner);
      for (const unit of orgUnitsForSigner) {
        await tx.orgUnit.update({
          where: { id: unit.id },
          data: { effectiveSignerId: effectiveSignerMap.get(unit.id) ?? null },
        });
      }
      const parentCategory = await tx.category.create({
        data: {
          name: dto.category.parentName.trim(),
          description: '',
          parentId: null,
          categoryKind: 'ASSET',
          fields: [],
          optionalFields: [],
        },
      });
      const leafCategory = await tx.category.create({
        data: {
          name: dto.category.leafName.trim(),
          description: '',
          parentId: parentCategory.id,
          categoryKind: 'ASSET',
          fields: [],
          optionalFields: [],
        },
      });
      const catalogItem = await tx.equipmentCatalogItem.create({
        data: {
          code: catalogCode,
          name: dto.catalog.name.trim(),
          categoryId: leafCategory.id,
          isActive: true,
        },
      });
      const warehouse = await tx.warehouse.create({
        data: {
          name: dto.warehouse.name.trim(),
          cityId: primaryCity.id,
          orgUnitId: warehouseOrgUnitId,
          address: dto.warehouse.address?.trim() || dto.company.address.trim(),
          isActive: true,
        },
      });
      await tx.user.create({
        data: {
          username: dto.admin.username.trim(),
          passwordHash: passwordHashes[0],
          role: 'admin',
          firstName: dto.admin.firstName.trim(),
          lastName: dto.admin.lastName.trim(),
          email: dto.admin.email?.trim() || null,
          isActive: true,
        },
      });
      const evidenticarUser = await tx.user.create({
        data: {
          username: dto.roles.evidenticar.username.trim(),
          passwordHash: passwordHashes[1],
          role: 'evidenticar',
          employeeId: evidenticarEmployee.id,
          isActive: true,
        },
      });
      const skladistarUser = await tx.user.create({
        data: {
          username: dto.roles.skladistar.username.trim(),
          passwordHash: passwordHashes[2],
          role: 'skladistar',
          employeeId: skladistarEmployee.id,
          isActive: true,
        },
      });
      const coordinatorUser = await tx.user.create({
        data: {
          username: dto.roles.popis_koordinator.username.trim(),
          passwordHash: passwordHashes[3],
          role: 'popis_koordinator',
          employeeId: coordinatorEmployee.id,
          isActive: true,
        },
      });
      await tx.user.create({
        data: {
          username: dto.roles.user.username.trim(),
          passwordHash: passwordHashes[4],
          role: 'user',
          employeeId: userEmployee.id,
          isActive: true,
        },
      });
      await tx.warehouseKeeper.create({
        data: { warehouseId: warehouse.id, userId: skladistarUser.id },
      });
      await tx.registrarAssignment.create({
        data: {
          userId: evidenticarUser.id,
          warehouseId: warehouse.id,
          categoryId: parentCategory.id,
        },
      });
      await tx.inventoryCoordinatorAssignment.create({
        data: {
          userId: coordinatorUser.id,
          warehouseId: warehouse.id,
          orgUnitId: direkcija.id,
        },
      });
      await this.settingsService.upsertValuesInTransaction(companySettings, tx);
      return {
        cantonId: canton.id,
        cityIds: cities.map((c) => c.id),
        direkcijaId: direkcija.id,
        warehouseId: warehouse.id,
        parentCategoryId: parentCategory.id,
        leafCategoryId: leafCategory.id,
        catalogItemId: catalogItem.id,
        usernames: [
          dto.admin.username.trim(),
          dto.roles.evidenticar.username.trim(),
          dto.roles.skladistar.username.trim(),
          dto.roles.popis_koordinator.username.trim(),
          dto.roles.user.username.trim(),
        ],
      };
    });
    try {
      await this.settingsService.invalidateValues(companySettings);
    } catch (error) {
      this.logger.warn(`Initial setup committed but settings cache invalidation failed: ${String(error)}`);
    }
    return result;
  }

  buildCompanySettingsEntries(dto: InitializeSetupDto): { key: string; value: string | boolean }[] {
    const entries: { key: string; value: string | boolean }[] = [
      { key: 'company.name', value: dto.company.name.trim() },
      { key: 'company.address', value: dto.company.address.trim() },
      { key: 'company.city', value: dto.company.city.trim() },
      { key: 'app.name', value: EVIDENS_APP_NAME },
      { key: 'app.initialized', value: true },
    ];
    if (dto.company.postalCode?.trim()) {
      entries.push({ key: 'company.postalCode', value: dto.company.postalCode.trim() });
    }
    if (dto.company.phone?.trim()) {
      entries.push({ key: 'company.phone', value: dto.company.phone.trim() });
    }
    if (dto.company.email?.trim()) {
      entries.push({ key: 'company.email', value: dto.company.email.trim() });
    }
    if (dto.company.taxId?.trim()) {
      entries.push({ key: 'company.taxId', value: dto.company.taxId.trim() });
    }
    return entries;
  }
}
