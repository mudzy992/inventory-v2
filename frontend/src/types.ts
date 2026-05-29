export type OrgUnitType =
  | 'direkcija'
  | 'distribucija'
  | 'podrucje'
  | 'podruznica'
  | 'sektor'
  | 'sluzba'
  | 'odjeljenje';

export type UserRole = 'admin' | 'evidenticar' | 'user';

export interface UserAccount {
  id: string;
  employeeId: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  lastLogin?: string;
  // For evidenticar role - which org units they manage
  managedOrgUnitIds?: string[];
}

export interface OrgUnit {
  id: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  signerId?: string;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  orgUnitId: string;
  email?: string;
  phone?: string;
}

export interface CategoryField {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select';
  required: boolean;
  unique: boolean;
  options?: string[];
}

// Updated Category with parent-child hierarchy
export interface Category {
  id: string;
  name: string;
  description: string;
  parentId: string | null; // null = parent category, string = sub-category
  fields: CategoryField[];
  optionalFields: CategoryField[];
}

export interface Equipment {
  id: string;
  categoryId: string; // Should point to sub-category
  inventoryNumber: string;
  specifications: Record<string, string>;
  status: 'skladiste' | 'zaduzeno' | 'rashodovano';
  contractNumber?: string;
  entryDate: string;
  currentHolderId?: string;
  notes?: string;
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
  status: 'raw' | 'potpisan';
  scannedDocUrl?: string;
  documentNumber: string;
  notes?: string;
  // Flag for cross-service transfers (only admin can do these)
  isCrossServiceTransfer?: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'transfer_pending' | 'transfer_complete' | 'equipment_assigned' | 'info';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  relatedId?: string;
}

// User-defined filter configuration
export interface SavedFilter {
  id: string;
  userId: string;
  name: string;
  categoryId?: string;
  filters: FilterCondition[];
}

export interface FilterCondition {
  fieldId: string; // Can be 'status', 'inventoryNumber', or spec field id
  fieldName: string;
  operator: 'equals' | 'contains' | 'startsWith' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string;
}

export interface AppState {
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
