import { config } from 'dotenv';
import { resolve } from 'node:path';
import * as bcrypt from 'bcrypt';
import { buildEffectiveSignerMap } from '../src/common/utils/resolve-effective-signer.util';
import { createPrismaClient } from '../src/prisma/create-prisma-client';
import { SETTINGS_REGISTRY } from '../src/modules/settings/settings.registry';

config({ path: resolve(__dirname, '../../.env') });

const ORG = {
  direkcija: 'a1000001-0000-4000-8000-000000000001',
  sektorFinansija: 'a1000001-0000-4000-8000-000000000002',
  sluzbaRacunovodstva: 'a1000001-0000-4000-8000-000000000003',
  sektorIT: 'a1000001-0000-4000-8000-000000000004',
  sluzbaInfrastrukture: 'a1000001-0000-4000-8000-000000000005',
  sluzbaRazvoja: 'a1000001-0000-4000-8000-000000000006',
  distribucijaSarajevo: 'a1000001-0000-4000-8000-000000000007',
};

const LOC = {
  kantonSarajevo: 'd4000001-0000-4000-8000-000000000001',
  gradSarajevo: 'd4000001-0000-4000-8000-000000000002',
  gradZenica: 'd4000001-0000-4000-8000-000000000003',
};

const WH = {
  sarajevo: 'e5000001-0000-4000-8000-000000000001',
};

const EMP = {
  sefIT: 'b2000001-0000-4000-8000-000000000001',
  radnikIT1: 'b2000001-0000-4000-8000-000000000002',
  genDirektor: 'b2000001-0000-4000-8000-000000000003',
  skladistar: 'b2000001-0000-4000-8000-000000000004',
};

const serializeSettingValue = (value: string | number | boolean, valueType: string): string => {
  if (valueType === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
};

const main = async (): Promise<void> => {
  const prisma = createPrismaClient();
  await prisma.$connect();

  await prisma.inventoryWarehouseLine.deleteMany();
  await prisma.inventoryWarehouseCommitteeMember.deleteMany();
  await prisma.inventoryWarehouseCommittee.deleteMany();
  await prisma.inventoryPendingAction.deleteMany();
  await prisma.inventoryLineEvent.deleteMany();
  await prisma.inventoryLine.deleteMany();
  await prisma.inventorySessionCloseJob.deleteMany();
  await prisma.inventorySession.deleteMany();
  await prisma.inventoryCommitteeMember.deleteMany();
  await prisma.inventoryCommittee.deleteMany();
  await prisma.disposalApprovalVote.deleteMany();
  await prisma.disposalApproval.deleteMany();
  await prisma.disposalCommissionMember.deleteMany();
  await prisma.disposalCommission.deleteMany();
  await prisma.warehouseKeeper.deleteMany();
  await prisma.upload.deleteMany();
  await prisma.registrarAssignment.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.savedFilter.deleteMany();
  await prisma.transfer.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.warehouseStockLot.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.orgUnit.deleteMany();
  await prisma.city.deleteMany();
  await prisma.canton.deleteMany();
  await prisma.setting.deleteMany();

  await prisma.canton.create({
    data: { id: LOC.kantonSarajevo, name: 'Kanton Sarajevo', code: 'KS' },
  });
  await prisma.city.createMany({
    data: [
      { id: LOC.gradSarajevo, cantonId: LOC.kantonSarajevo, name: 'Sarajevo' },
      { id: LOC.gradZenica, cantonId: LOC.kantonSarajevo, name: 'Zenica' },
    ],
  });

  await prisma.orgUnit.createMany({
    data: [
      {
        id: ORG.direkcija,
        name: 'Direkcija Društva',
        type: 'direkcija',
        parentId: null,
      },
      {
        id: ORG.sektorFinansija,
        name: 'Sektor za finansije',
        type: 'sektor',
        parentId: ORG.direkcija,
      },
      {
        id: ORG.sluzbaRacunovodstva,
        name: 'Služba računovodstva',
        type: 'sluzba',
        parentId: ORG.sektorFinansija,
      },
      {
        id: ORG.sektorIT,
        name: 'Sektor za IT',
        type: 'sektor',
        parentId: ORG.direkcija,
        effectiveLocationCityId: LOC.gradSarajevo,
      },
      {
        id: ORG.sluzbaInfrastrukture,
        name: 'Služba za infrastrukturu',
        type: 'sluzba',
        parentId: ORG.sektorIT,
      },
      {
        id: ORG.sluzbaRazvoja,
        name: 'Služba za razvoj',
        type: 'sluzba',
        parentId: ORG.sektorIT,
      },
      {
        id: ORG.distribucijaSarajevo,
        name: 'Distribucija Sarajevo',
        type: 'distribucija',
        parentId: ORG.direkcija,
        locationCityId: LOC.gradSarajevo,
        effectiveLocationCityId: LOC.gradSarajevo,
      },
    ],
  });

  await prisma.employee.createMany({
    data: [
      {
        id: EMP.genDirektor,
        firstName: 'Emir',
        lastName: 'Hadžić',
        title: 'Generalni direktor',
        orgUnitId: ORG.direkcija,
        email: 'emir.hadzic@firma.ba',
      },
      {
        id: EMP.sefIT,
        firstName: 'Adnan',
        lastName: 'Sarajlić',
        title: 'Rukovodilac sektora za IT',
        orgUnitId: ORG.sektorIT,
        email: 'adnan.sarajlic@firma.ba',
      },
      {
        id: EMP.radnikIT1,
        firstName: 'Kenan',
        lastName: 'Hodžić',
        title: 'Sistem administrator',
        orgUnitId: ORG.sluzbaInfrastrukture,
        email: 'kenan.hodzic@firma.ba',
      },
      {
        id: EMP.skladistar,
        firstName: 'Amir',
        lastName: 'Skladištar',
        title: 'Skladištar',
        orgUnitId: ORG.distribucijaSarajevo,
        email: 'amir.skladistar@firma.ba',
      },
    ],
  });

  await prisma.warehouse.create({
    data: {
      id: WH.sarajevo,
      name: 'Centralno skladište Sarajevo',
      cityId: LOC.gradSarajevo,
      orgUnitId: ORG.distribucijaSarajevo,
      address: 'Industrijska zona bb',
      notes: 'Demo skladište',
      isActive: true,
    },
  });

  await prisma.orgUnit.update({
    where: { id: ORG.direkcija },
    data: { signerId: EMP.genDirektor },
  });

  const orgUnitsForSigner = await prisma.orgUnit.findMany({
    select: { id: true, parentId: true, signerId: true },
  });
  const effectiveSignerMap = buildEffectiveSignerMap(orgUnitsForSigner);
  for (const unit of orgUnitsForSigner) {
    await prisma.orgUnit.update({
      where: { id: unit.id },
      data: { effectiveSignerId: effectiveSignerMap.get(unit.id) ?? null },
    });
  }

  const adminHash = await bcrypt.hash('admin123', 10);
  const userHash = await bcrypt.hash('user123', 10);

  await prisma.user.create({
    data: {
      username: 'admin',
      passwordHash: adminHash,
      role: 'admin',
      isActive: true,
    },
  });

  const parentCategoryId = 'c3000001-0000-4000-8000-000000000001';
  const subCategoryId = 'c3000001-0000-4000-8000-000000000002';

  await prisma.category.create({
    data: {
      id: parentCategoryId,
      name: 'Računarska oprema',
      description: 'Parent kategorija',
      parentId: null,
      fields: [],
      optionalFields: [],
    },
  });

  await prisma.category.create({
    data: {
      id: subCategoryId,
      name: 'Laptop',
      description: 'Prijenosno računalo',
      parentId: parentCategoryId,
      fields: [
        {
          id: 'proizvodjac',
          name: 'Proizvođač',
          type: 'text',
          required: true,
          unique: false,
        },
        {
          id: 'sn',
          name: 'Serijski broj',
          type: 'text',
          required: true,
          unique: true,
        },
      ],
      optionalFields: [],
    },
  });

  await prisma.user.create({
    data: {
      username: 'adnan.sarajlic',
      passwordHash: userHash,
      role: 'admin',
      employeeId: EMP.sefIT,
      isActive: true,
    },
  });

  await prisma.user.create({
    data: {
      username: 'kenan.hodzic',
      passwordHash: userHash,
      role: 'evidenticar',
      employeeId: EMP.radnikIT1,
      isActive: true,
      registrarAssignments: {
        create: [{ warehouseId: WH.sarajevo, categoryId: parentCategoryId }],
      },
    },
  });

  const skladistarUser = await prisma.user.create({
    data: {
      username: 'amir.skladistar',
      passwordHash: userHash,
      role: 'skladistar',
      employeeId: EMP.skladistar,
      isActive: true,
    },
  });

  await prisma.warehouseKeeper.create({
    data: { warehouseId: WH.sarajevo, userId: skladistarUser.id },
  });

  await prisma.warehouseStockLot.create({
    data: {
      warehouseId: WH.sarajevo,
      categoryId: subCategoryId,
      productName: 'Računar Dell 3080 SFF',
      quantityReceived: 5,
      quantityOnHand: 5,
      status: 'ceka_specifikaciju',
      specifications: {},
      entryDate: new Date('2024-01-15'),
      receivedByUserId: skladistarUser.id,
    },
  });

  for (const definition of SETTINGS_REGISTRY) {
    await prisma.setting.create({
      data: {
        key: definition.key,
        scope: definition.scope,
        valueType: definition.valueType,
        value: serializeSettingValue(definition.defaultValue, definition.valueType),
        description: definition.description,
      },
    });
  }

  await prisma.$disconnect();
  console.log('Demo seed completed.');
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
