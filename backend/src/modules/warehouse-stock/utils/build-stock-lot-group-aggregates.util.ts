import { buildStockLotGroupKey } from './stock-lot-group-key.util';

export type StockLotGroupLotRow = {
  warehouseId: string;
  catalogItemId: string | null;
  categoryId: string;
  productName: string;
  quantityOnHand: number;
  quantityReceived: number;
  status: string;
  category: { name: string };
};

export type StockLotProductGroupAggregate = {
  groupKey: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  catalogItemId: string | null;
  warehouseCount: number;
  totalOnHand: number;
  totalReceived: number;
  awaitingSpecCount: number;
  readyToIssueCount: number;
};

export type StockLotGroupHistoricalTotals = {
  totalReceived: number;
  warehouseCount: number;
};

export const buildStockLotHistoricalTotalsByGroup = (
  lots: StockLotGroupLotRow[],
): Map<string, StockLotGroupHistoricalTotals> => {
  const receivedByGroup = new Map<string, number>();
  const warehouseIdsByGroup = new Map<string, Set<string>>();
  for (const lot of lots) {
    const groupKey = buildStockLotGroupKey(lot);
    receivedByGroup.set(groupKey, (receivedByGroup.get(groupKey) ?? 0) + lot.quantityReceived);
    const warehouseIds = warehouseIdsByGroup.get(groupKey) ?? new Set<string>();
    warehouseIds.add(lot.warehouseId);
    warehouseIdsByGroup.set(groupKey, warehouseIds);
  }
  const result = new Map<string, StockLotGroupHistoricalTotals>();
  for (const [groupKey, totalReceived] of receivedByGroup) {
    result.set(groupKey, {
      totalReceived,
      warehouseCount: warehouseIdsByGroup.get(groupKey)?.size ?? 0,
    });
  }
  return result;
};

export const buildStockLotProductGroupsFromLots = (
  lots: StockLotGroupLotRow[],
): StockLotProductGroupAggregate[] => {
  const groupMap = new Map<string, StockLotProductGroupAggregate>();
  const warehouseIdsByGroup = new Map<string, Set<string>>();
  for (const lot of lots) {
    const groupKey = buildStockLotGroupKey(lot);
    const warehouseIds = warehouseIdsByGroup.get(groupKey) ?? new Set<string>();
    warehouseIds.add(lot.warehouseId);
    warehouseIdsByGroup.set(groupKey, warehouseIds);
    const existing = groupMap.get(groupKey);
    if (existing) {
      existing.warehouseCount = warehouseIds.size;
      existing.totalOnHand += lot.quantityOnHand;
      existing.totalReceived += lot.quantityReceived;
      if (lot.status === 'ceka_specifikaciju') {
        existing.awaitingSpecCount += 1;
      }
      if (lot.status === 'spremno_za_izdavanje') {
        existing.readyToIssueCount += 1;
      }
      continue;
    }
    groupMap.set(groupKey, {
      groupKey,
      productName: lot.productName,
      categoryId: lot.categoryId,
      categoryName: lot.category.name,
      catalogItemId: lot.catalogItemId,
      warehouseCount: warehouseIds.size,
      totalOnHand: lot.quantityOnHand,
      totalReceived: lot.quantityReceived,
      awaitingSpecCount: lot.status === 'ceka_specifikaciju' ? 1 : 0,
      readyToIssueCount: lot.status === 'spremno_za_izdavanje' ? 1 : 0,
    });
  }
  return [...groupMap.values()].sort((a, b) => a.productName.localeCompare(b.productName, 'bs'));
};

export const applyHistoricalTotalsToProductGroups = (
  groups: StockLotProductGroupAggregate[],
  historicalByGroup: Map<string, StockLotGroupHistoricalTotals>,
): StockLotProductGroupAggregate[] => {
  return groups.map((group) => {
    const historical = historicalByGroup.get(group.groupKey);
    if (!historical) {
      return group;
    }
    return {
      ...group,
      totalReceived: historical.totalReceived,
      warehouseCount: historical.warehouseCount,
    };
  });
};
