import { v4 as uuidv4 } from 'uuid';
import { equipmentMatchesScope } from './helpers/registrar-scope';
import type { AppState, Employee, UserAccount, Notification, UserRole } from './types';


import type { AuthUserDto } from './api/auth-api';

const emptyAppState = (): AppState => ({
  cantons: [],
  cities: [],
  warehouses: [],
  orgUnits: [],
  employees: [],
  categories: [],
  equipment: [],
  transfers: [],
  users: [],
  notifications: [],
  savedFilters: [],
  currentUserId: null,
});

let _state: AppState = emptyAppState();
let _authUser: AuthUserDto | null = null;
const _listeners: Set<() => void> = new Set();

export function syncAppState(state: AppState): void {
  _state = state;
  _listeners.forEach((listener) => listener());
}

export function setAuthUser(user: AuthUserDto | null): void {
  _authUser = user;
  _listeners.forEach((listener) => listener());
}

export function getState(): AppState {
  return _state;
}

/** @deprecated Prefer API mutations + refresh() from useData() */
export function setState(updater: (prev: AppState) => AppState): void {
  _state = updater(_state);
  _listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

export function getNextDocumentNumber(): string {
  const year = new Date().getFullYear();
  const thisYearTransfers = _state.transfers.filter(
    (transfer) =>
      transfer.documentNumber.includes(String(year)) &&
      !transfer.documentNumber.includes('RASH') &&
      !transfer.documentNumber.startsWith('DRAFT'),
  );
  return `PRN-${year}-${String(thisYearTransfers.length + 1).padStart(4, '0')}`;
}

export function getCurrentUser(): UserAccount | null {
  if (!_authUser) {
    return null;
  }
  const existing = _state.users.find((user) => user.id === _authUser?.id);
  if (existing) {
    return existing;
  }
  return {
    id: _authUser.id,
    username: _authUser.username,
    role: _authUser.role,
    employeeId: _authUser.employeeId ?? '',
    password: '',
    isActive: true,
    registrarScopes: _authUser.registrarScopes,
  };
}

export function getCurrentEmployee(): Employee | null {
  const user = getCurrentUser();
  if (!user) return null;
  return _state.employees.find(e => e.id === user.employeeId) || null;
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function isEvidenticar(): boolean {
  const user = getCurrentUser();
  return user?.role === 'evidenticar';
}

export function isSkladistar(): boolean {
  const user = getCurrentUser();
  return user?.role === 'skladistar';
}

export function getUserRole(): UserRole | null {
  const user = getCurrentUser();
  return user?.role || null;
}

export {
  equipmentMatchesScope,
  employeeMatchesScope,
  isEmployeeInManagedUnits,
  transferMatchesScope,
  isCrossRegistrarScopeTransfer,
} from './helpers/registrar-scope';

export function getRegistrarScopes() {
  return getCurrentUser()?.registrarScopes ?? [];
}

// Check if transfer is cross-service (different org units at service level)
export function isCrossServiceTransfer(fromEmployeeId: string | undefined, toEmployeeId: string | undefined): boolean {
  if (!fromEmployeeId || !toEmployeeId) return false;
  
  const fromEmp = _state.employees.find(e => e.id === fromEmployeeId);
  const toEmp = _state.employees.find(e => e.id === toEmployeeId);
  
  if (!fromEmp || !toEmp) return false;
  
  // Check if they're in the same service chain
  function getServiceChain(orgUnitId: string): string[] {
    const chain: string[] = [];
    let current = _state.orgUnits.find(o => o.id === orgUnitId);
    while (current) {
      chain.unshift(current.id);
      current = _state.orgUnits.find(o => o.id === current!.parentId);
    }
    return chain;
  }
  
  const fromChain = getServiceChain(fromEmp.orgUnitId);
  const toChain = getServiceChain(toEmp.orgUnitId);
  
  // If they share a common path at service/sektor level, not cross-service
  // Otherwise, it's cross-service
  const fromService = _state.orgUnits.find(o => o.id === fromEmp.orgUnitId);
  const toService = _state.orgUnits.find(o => o.id === toEmp.orgUnitId);
  
  if (!fromService || !toService) return true;
  
  // Same org unit = not cross-service
  if (fromEmp.orgUnitId === toEmp.orgUnitId) return false;
  
  // Check if one is ancestor of other
  if (fromChain.includes(toEmp.orgUnitId) || toChain.includes(fromEmp.orgUnitId)) return false;
  
  // Check if they share common parent at sektor level or below
  for (let i = 0; i < Math.min(fromChain.length, toChain.length); i++) {
    if (fromChain[i] !== toChain[i]) {
      // They diverge - check at what level
      const divergePoint = i > 0 ? _state.orgUnits.find(o => o.id === fromChain[i - 1]) : null;
      if (divergePoint) {
        // If diverge at sektor level or higher, it's cross-service for evidenticar
        const types = ['sektor', 'sluzba', 'odjeljenje'];
        if (types.includes(divergePoint.type)) {
          return false; // Same branch
        }
      }
      return true;
    }
  }
  
  return false;
}

// Notification helpers (synced via REST + Socket.IO)
export function applyNotificationsLoaded(notifications: Notification[]): void {
  setState((prev) => ({ ...prev, notifications }));
}

export function applyNotificationCreated(notification: Notification): void {
  setState((prev) => {
    if (prev.notifications.some((row) => row.id === notification.id)) {
      return prev;
    }
    return { ...prev, notifications: [notification, ...prev.notifications] };
  });
}

export function applyNotificationRead(notificationId: string): void {
  setState((prev) => ({
    ...prev,
    notifications: prev.notifications.map((row) =>
      row.id === notificationId ? { ...row, read: true } : row,
    ),
  }));
}

/** @deprecated Use API + SocketProvider instead */
export function addNotification(userId: string, type: Notification['type'], title: string, message: string, relatedId?: string): void {
  const notification: Notification = {
    id: uuidv4(),
    userId,
    type,
    title,
    message,
    read: false,
    createdAt: new Date().toISOString(),
    relatedId,
  };
  applyNotificationCreated(notification);
}

/** @deprecated Use markNotificationReadApi + SocketProvider */
export function markNotificationRead(notificationId: string): void {
  applyNotificationRead(notificationId);
}

export function getUnreadNotificationsCount(userId: string): number {
  return _state.notifications.filter(n => n.userId === userId && !n.read).length;
}

// Category helpers
export function getParentCategories(): typeof _state.categories {
  return _state.categories.filter(c => c.parentId === null);
}

export function getSubCategories(parentId: string): typeof _state.categories {
  return _state.categories.filter(c => c.parentId === parentId);
}

export function getCategoryWithParent(categoryId: string): { category: typeof _state.categories[0] | null, parent: typeof _state.categories[0] | null } {
  const category = _state.categories.find(c => c.id === categoryId) || null;
  const parent = category?.parentId ? _state.categories.find(c => c.id === category.parentId) || null : null;
  return { category, parent };
}

// Equipment stats helper
export function getEquipmentStats(categoryId?: string, useRegistrarScope = false) {
  let filtered = _state.equipment;
  const user = getCurrentUser();
  if (categoryId) {
    const subCats = getSubCategories(categoryId);
    if (subCats.length > 0) {
      const subCatIds = subCats.map((c) => c.id);
      filtered = filtered.filter((e) => subCatIds.includes(e.categoryId));
    } else {
      filtered = filtered.filter((e) => e.categoryId === categoryId);
    }
  }
  if (useRegistrarScope && user?.role === 'evidenticar') {
    filtered = filtered.filter((e) => equipmentMatchesScope(e, _state, user));
  }
  
  const total = filtered.length;
  const skladiste = filtered.filter(e => e.status === 'skladiste').length;
  const zaduzeno = filtered.filter(e => e.status === 'zaduzeno').length;
  const rashodovano = filtered.filter(e => e.status === 'rashodovano').length;
  
  // Get transfer stats
  const equipIds = filtered.map(e => e.id);
  const relatedTransfers = _state.transfers.filter(t => equipIds.includes(t.equipmentId));
  const rawTransfers = relatedTransfers.filter(t => t.status === 'raw').length;
  const signedTransfers = relatedTransfers.filter(t => t.status === 'potpisan').length;
  
  return { total, skladiste, zaduzeno, rashodovano, rawTransfers, signedTransfers };
}
