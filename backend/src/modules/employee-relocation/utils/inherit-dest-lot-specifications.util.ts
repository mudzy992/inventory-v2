import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../../../generated/prisma/client';
import {
  splitCategoryFieldsForStock,
  validateLotSpecifications,
  type CategoryFieldDefinition,
} from '../../../common/utils/category-fields.util';

export type SpecInheritanceSource = 'source_lot' | 'dest_existing';

export type SpecInheritanceResult = {
  inherited: boolean;
  source: SpecInheritanceSource | null;
};

export type InheritDestLotSpecificationsInput = {
  destLotId: string;
  sourceStockLotId: string | null;
  destWarehouseId: string;
  catalogItemId: string | null;
  categoryId: string;
  fields: CategoryFieldDefinition[];
  optionalFields: CategoryFieldDefinition[];
  actorUserId: string;
};

type LotSpecCandidate = {
  specifications: unknown;
  status: string;
} | null;

export const parseLotSpecifications = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (typeof val === 'string') {
      result[key] = val;
    }
  }
  return result;
};

export const isLotSpecificationsEmpty = (
  specs: Record<string, string>,
  lotFields: CategoryFieldDefinition[],
): boolean => {
  if (lotFields.length === 0) {
    return Object.keys(specs).length === 0 || Object.values(specs).every((value) => value.trim() === '');
  }
  return !lotFields.some((field) => (specs[field.id] ?? '').trim() !== '');
};

export const resolveInheritedLotSpecifications = (
  sourceLot: LotSpecCandidate,
  destExistingLot: LotSpecCandidate,
  lotFields: CategoryFieldDefinition[],
): { specs: Record<string, string>; source: SpecInheritanceSource } | null => {
  if (sourceLot) {
    const specs = parseLotSpecifications(sourceLot.specifications);
    if (!isLotSpecificationsEmpty(specs, lotFields)) {
      return { specs, source: 'source_lot' };
    }
  }
  if (destExistingLot) {
    const specs = parseLotSpecifications(destExistingLot.specifications);
    if (!isLotSpecificationsEmpty(specs, lotFields)) {
      return { specs, source: 'dest_existing' };
    }
  }
  return null;
};

const findDestExistingLotWithSpecs = async (
  tx: Prisma.TransactionClient,
  input: Pick<InheritDestLotSpecificationsInput, 'destWarehouseId' | 'catalogItemId' | 'destLotId'>,
  lotFields: CategoryFieldDefinition[],
) => {
  if (!input.catalogItemId) {
    return null;
  }
  const candidates = await tx.warehouseStockLot.findMany({
    where: {
      warehouseId: input.destWarehouseId,
      catalogItemId: input.catalogItemId,
      status: 'spremno_za_izdavanje',
      id: { not: input.destLotId },
    },
    orderBy: { specDefinedAt: 'desc' },
    take: 10,
  });
  return (
    candidates.find(
      (row) => !isLotSpecificationsEmpty(parseLotSpecifications(row.specifications), lotFields),
    ) ?? null
  );
};

export const inheritDestLotSpecificationsInTx = async (
  tx: Prisma.TransactionClient,
  input: InheritDestLotSpecificationsInput,
): Promise<SpecInheritanceResult> => {
  const destLot = await tx.warehouseStockLot.findUnique({ where: { id: input.destLotId } });
  if (!destLot) {
    throw new NotFoundException('Destinacijski lot nije pronađen');
  }

  const lotFields = getLotFieldsFromCategoryDefinitions(input.fields, input.optionalFields);
  const destSpecs = parseLotSpecifications(destLot.specifications);
  if (!isLotSpecificationsEmpty(destSpecs, lotFields)) {
    return { inherited: false, source: null };
  }

  const sourceLot = input.sourceStockLotId
    ? await tx.warehouseStockLot.findUnique({ where: { id: input.sourceStockLotId } })
    : null;

  const destExistingLot = await findDestExistingLotWithSpecs(
    tx,
    {
      destLotId: input.destLotId,
      destWarehouseId: input.destWarehouseId,
      catalogItemId: input.catalogItemId,
    },
    lotFields,
  );

  const resolved = resolveInheritedLotSpecifications(sourceLot, destExistingLot, lotFields);
  if (!resolved) {
    return { inherited: false, source: null };
  }

  try {
    validateLotSpecifications(resolved.specs, input.fields, input.optionalFields);
  } catch (err) {
    if (err instanceof BadRequestException) {
      return { inherited: false, source: null };
    }
    throw err;
  }

  await tx.warehouseStockLot.update({
    where: { id: input.destLotId },
    data: {
      specifications: resolved.specs,
      status: 'spremno_za_izdavanje',
      specDefinedByUserId: input.actorUserId,
      specDefinedAt: new Date(),
    },
  });

  return { inherited: true, source: resolved.source };
};

export const getLotFieldsFromCategoryDefinitions = (
  fields: CategoryFieldDefinition[],
  optionalFields: CategoryFieldDefinition[],
): CategoryFieldDefinition[] => splitCategoryFieldsForStock(fields, optionalFields).lotFields;
