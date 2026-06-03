import { apiRequest } from './client';

export interface UniqueFieldDisplayDto {
  label: string;
  value: string;
}

export interface PublicEquipmentDto {
  id: string;
  inventoryNumber: string;
  status: string;
  categoryName: string;
  displayName: string;
  uniqueField: UniqueFieldDisplayDto | null;
  specifications: Record<string, string>;
}

export const fetchPublicEquipmentApi = (id: string): Promise<PublicEquipmentDto> =>
  apiRequest<PublicEquipmentDto>(`/public/equipment/${id}`);
