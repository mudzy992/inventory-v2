import { apiRequest } from './client';

export interface UniqueFieldDisplayDto {
  label: string;
  value: string;
}

export interface PublicEquipmentHolderDto {
  fullName: string;
  title: string;
  orgUnitPath: string;
}

export interface PublicEquipmentWarehouseDto {
  name: string;
}

export interface PublicEquipmentMovementDto {
  date: string;
  type: string;
  status: string;
  fromLabel: string;
  toLabel: string;
  documentNumber: string;
}

export interface PublicEquipmentDto {
  id: string;
  inventoryNumber: string | null;
  isAccountingTracked: boolean;
  status: string;
  categoryName: string;
  productName: string | null;
  uniqueFields: UniqueFieldDisplayDto[];
  specifications: Record<string, string>;
  currentHolder: PublicEquipmentHolderDto | null;
  warehouse: PublicEquipmentWarehouseDto | null;
  movements: PublicEquipmentMovementDto[];
  disposalReason: string | null;
}

export const fetchPublicEquipmentApi = (id: string): Promise<PublicEquipmentDto> =>
  apiRequest<PublicEquipmentDto>(`/public/equipment/${id}`);
