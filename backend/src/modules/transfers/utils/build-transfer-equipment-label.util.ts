import type { Prisma } from '../../../../generated/prisma/client';
import {
  parseCategoryFields,
  resolveSerialNumberFromSpecifications,
} from '../../../common/utils/category-fields.util';

type EquipmentForTransferLabel = {
  category: {
    name: string;
    fields: Prisma.JsonValue;
    optionalFields: Prisma.JsonValue;
  };
  specifications: Prisma.JsonValue;
  stockLot: { productName: string } | null;
};

export const buildTransferEquipmentLabel = (equipment: EquipmentForTransferLabel): string => {
  const lotName = equipment.stockLot?.productName?.trim();
  if (!lotName) {
    return equipment.category.name;
  }
  const specifications = (equipment.specifications ?? {}) as Record<string, string>;
  const fields = parseCategoryFields(equipment.category.fields);
  const optionalFields = parseCategoryFields(equipment.category.optionalFields);
  const serialNumber = resolveSerialNumberFromSpecifications(
    fields,
    optionalFields,
    specifications,
  );
  if (serialNumber) {
    return `${lotName} — ${serialNumber}`;
  }
  return lotName;
};
