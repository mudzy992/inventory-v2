export type OrgUnitType =
  | 'direkcija'
  | 'distribucija'
  | 'podrucje'
  | 'podruznica'
  | 'poslovna_jedinica'
  | 'sektor'
  | 'sluzba'
  | 'odjeljenje';

export type UserRole = 'admin' | 'evidenticar' | 'user' | 'skladistar';

export type WarehouseCondition = 'na_skladistu' | 'spremno_za_unistenje' | 'unisteno';

export interface Canton {
  id: string;
  name: string;
  code?: string | null;
  cities?: City[];
}

export interface City {
  id: string;
  cantonId: string;
  name: string;
  canton?: Canton;
}

export interface Warehouse {
  id: string;
  name: string;
  cityId: string;
  orgUnitId?: string | null;
  address: string;
  notes?: string | null;
  isActive: boolean;
  city?: City;
  keepers?: { userId: string; user?: { id: string; username: string } }[];
}

export interface RegistrarScopeAssignment {
  warehouseId: string;
  categoryId: string;
  orgUnitId?: string | null;
}

export interface UserAccount {
  id: string;
  employeeId: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
  registrarScopes?: RegistrarScopeAssignment[];
}

export interface OrgUnit {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  signerId?: string | null;
  effectiveSignerId?: string | null;
  locationCityId?: string | null;
  effectiveLocationCityId?: string | null;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  orgUnitId: string;
  email?: string;
  phone?: string;
  heldEquipmentCount?: number;
}

export interface CategoryField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select';
  required: boolean;
  unique: boolean;
  options?: string[];
}

export type CategoryKind = 'ASSET' | 'MAINTENANCE';

export interface Category {
  id: string;
  name: string;
  description: string;
  parentId: string | null;
  categoryKind?: CategoryKind;
  fields: CategoryField[];
  optionalFields: CategoryField[];
}

export type WarehouseStockLotStatus =
  | 'ceka_specifikaciju'
  | 'spremno_za_izdavanje'
  | 'zatvoreno';

export type WarehouseStockLotKind = 'ISSUABLE' | 'MAINTENANCE';

export interface WarehouseStockLot {
  id: string;
  warehouseId: string;
  categoryId: string;
  lotKind?: WarehouseStockLotKind;
  categoryName?: string;
  warehouseName?: string;
  productName: string;
  quantityReceived: number;
  quantityOnHand: number;
  status: WarehouseStockLotStatus;
  specifications?: Record<string, string>;
  contractNumber?: string | null;
  entryDate: string;
  notes?: string | null;
  issuedUnits?: {
    id: string;
    inventoryNumber: string;
    status: string;
    currentHolderId?: string | null;
    currentHolder?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'orgUnitId'> | null;
    createdAt: string;
  }[];
}

export interface Equipment {
  id: string;
  categoryId: string;
  stockLotId?: string | null;
  inventoryNumber: string;
  specifications: Record<string, string>;
  status: 'skladiste' | 'zaduzeno' | 'rashodovano';
  contractNumber?: string;
  entryDate: string;
  currentHolderId?: string;
  currentHolder?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'orgUnitId'>;
  category?: Pick<Category, 'id' | 'name' | 'parentId'>;
  warehouseId?: string | null;
  warehouseCondition?: WarehouseCondition | null;
  notes?: string;
  stockLot?: { id: string; productName: string } | null;
}

export type TransferType = 'zaduzenje' | 'razduzenje' | 'rashodovanje' | 'prenos';

export interface TransferRecord {
  id: string;
  equipmentId: string;
  type: TransferType;
  fromType: 'skladiste' | 'osoba';
  fromPersonId?: string;
  toType: 'skladiste' | 'osoba' | 'rashod';
  toPersonId?: string;
  signerId: string;
  date: string;
  reason?: string;
  status: 'raw' | 'printed' | 'uploaded' | 'potpisan' | 'cancelled';
  scannedDocUrl?: string;
  documentNumber: string;
  notes?: string;
  isCrossServiceTransfer?: boolean;
  fromWarehouseId?: string | null;
  toWarehouseId?: string | null;
  inventoryLineId?: string | null;
  disposalApproval?: {
    id: string;
    status: 'pending' | 'approved' | 'rejected';
  };
  equipment?: Pick<Equipment, 'id' | 'inventoryNumber' | 'status' | 'warehouseId' | 'categoryId'> & {
    currentHolder?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'orgUnitId'>;
    warehouse?: Pick<Warehouse, 'id' | 'name' | 'cityId'>;
  };
  signer?: Pick<Employee, 'id' | 'firstName' | 'lastName'>;
  fromPerson?: Pick<Employee, 'id' | 'firstName' | 'lastName'>;
  toPerson?: Pick<Employee, 'id' | 'firstName' | 'lastName'>;
}

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  relatedId?: string;
}

export interface SavedFilter {
  id: string;
  userId: string;
  name: string;
  categoryId?: string;
  filters: FilterCondition[];
}

export interface FilterCondition {
  fieldId: string;
  fieldName: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string;
}

export interface AppState {
  cantons: Canton[];
  cities: City[];
  warehouses: Warehouse[];
  orgUnits: OrgUnit[];
  employees: Employee[];
  categories: Category[];
  equipment: Equipment[];
  transfers: TransferRecord[];
  users: UserAccount[];
  notifications: Notification[];
  savedFilters: SavedFilter[];
  currentUserId: string | null;
}
