export type UserRole =
  | 'admin'
  | 'moderator'
  | 'evidenticar'
  | 'popis_koordinator'
  | 'user'
  | 'skladistar';

export type EquipmentStatus = 'skladiste' | 'zaduzeno' | 'za_rashod' | 'rashodovano';
export type TransferType = 'zaduzenje' | 'razduzenje' | 'rashodovanje' | 'prenos';

export interface RegistrarScope {
  warehouseId: string;
  categoryId: string;
  orgUnitId?: string | null;
}

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
  employeeId: string | null;
  registrarScopes: RegistrarScope[];
}

export interface OrgUnit {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  signerId?: string | null;
  locationCityId?: string | null;
  effectiveLocationCityId?: string | null;
}

export interface Warehouse {
  id: string;
  name: string;
  cityId: string;
  orgUnitId?: string | null;
  isActive: boolean;
}

export interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  title: string;
  orgUnitId: string;
  isActive?: boolean;
  heldEquipmentCount?: number;
}

export interface Equipment {
  id: string;
  categoryId: string;
  inventoryNumber: string | null;
  isAccountingTracked: boolean;
  specifications: Record<string, string>;
  status: EquipmentStatus;
  currentHolderId?: string | null;
  currentHolder?: Pick<Employee, 'id' | 'firstName' | 'lastName' | 'orgUnitId' | 'title'> | null;
  category?: { id: string; name: string; parentId: string | null };
  warehouseId?: string | null;
  warehouse?: { id: string; name: string; cityId: string } | null;
  disposalReason?: string | null;
  stockLot?: { id: string; productName: string } | null;
}

export interface TransferRecord {
  id: string;
  type: TransferType;
  status: string;
  date: string;
  documentNumber: string;
  fromPerson?: Pick<Employee, 'firstName' | 'lastName'> | null;
  toPerson?: Pick<Employee, 'firstName' | 'lastName'> | null;
}

export interface PublicEquipment {
  id: string;
  inventoryNumber: string | null;
  isAccountingTracked: boolean;
  status: string;
  categoryName: string;
  productName: string | null;
  uniqueFields: { label: string; value: string }[];
  specifications: Record<string, string>;
  currentHolder: { fullName: string; title: string; orgUnitPath: string } | null;
  warehouse: { name: string } | null;
  movements: {
    date: string;
    type: string;
    status: string;
    fromLabel: string;
    toLabel: string;
    documentNumber: string;
  }[];
  disposalReason: string | null;
}

export interface EmployeeProfile {
  employee: Employee;
  heldEquipment: {
    id: string;
    inventoryNumber: string | null;
    categoryName: string;
    lotName: string | null;
    status: string;
  }[];
  heldEquipmentTotal: number;
}

export interface Paginated<T> {
  items: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface CatalogState {
  orgUnits: OrgUnit[];
  warehouses: Warehouse[];
}
