import { apiRequest } from './client';

export interface AvailabilityResult {
  available: boolean;
}

export const checkInventoryNumberAvailableApi = (value: string) =>
  apiRequest<AvailabilityResult>(
    `/equipment/check/inventory-number?value=${encodeURIComponent(value)}`,
  );

export const checkSpecificationValueAvailableApi = (
  categoryId: string,
  fieldId: string,
  value: string,
) =>
  apiRequest<AvailabilityResult>(
    `/equipment/check/specification-value?categoryId=${encodeURIComponent(categoryId)}&fieldId=${encodeURIComponent(fieldId)}&value=${encodeURIComponent(value)}`,
  );
