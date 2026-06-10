const CATALOG_PREFIX = 'catalog:';
const PRODUCT_PREFIX = 'product:';
const PRODUCT_SEP = '::';

export interface StockLotGroupSource {
  catalogItemId: string | null;
  categoryId: string;
  productName: string;
}

export const normalizeStockLotProductName = (productName: string): string =>
  productName.trim().toLowerCase();

export const buildStockLotGroupKey = (lot: StockLotGroupSource): string => {
  if (lot.catalogItemId) {
    return `${CATALOG_PREFIX}${lot.catalogItemId}`;
  }
  return `${PRODUCT_PREFIX}${lot.categoryId}${PRODUCT_SEP}${normalizeStockLotProductName(lot.productName)}`;
};

export const buildStockLotGroupWhere = (
  groupKey: string,
): { catalogItemId: string } | { categoryId: string; productName: { equals: string; mode: 'insensitive' } } => {
  if (groupKey.startsWith(CATALOG_PREFIX)) {
    return { catalogItemId: groupKey.slice(CATALOG_PREFIX.length) };
  }
  if (!groupKey.startsWith(PRODUCT_PREFIX)) {
    throw new Error(`Invalid stock lot group key: ${groupKey}`);
  }
  const rest = groupKey.slice(PRODUCT_PREFIX.length);
  const sepIndex = rest.indexOf(PRODUCT_SEP);
  if (sepIndex < 0) {
    throw new Error(`Invalid stock lot product group key: ${groupKey}`);
  }
  const categoryId = rest.slice(0, sepIndex);
  const normalizedName = rest.slice(sepIndex + PRODUCT_SEP.length);
  return {
    categoryId,
    productName: { equals: normalizedName, mode: 'insensitive' },
  };
};
