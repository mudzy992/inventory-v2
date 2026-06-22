import { v4 as uuidv4 } from 'uuid';
import type { AppState, UserAccount, Notification, UserRole } from './types';

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
let _cachedAuthUserView: UserAccount | null = null;
let _cachedAuthUserKey: string | null = null;
const _listeners: Set<() => void> = new Set();

function invalidateAuthUserCache(): void {
  _cachedAuthUserView = null;
  _cachedAuthUserKey = null;
}

function buildAuthUserCacheKey(user: AuthUserDto): string {
  return JSON.stringify({
    id: user.id,
    username: user.username,
    role: user.role,
    employeeId: user.employeeId ?? '',
    registrarScopes: user.registrarScopes,
    coordinatorAssignments: user.coordinatorAssignments,
    moderatorOrgAssignments: user.moderatorOrgAssignments,
    moderatorWarehouseAssignments: user.moderatorWarehouseAssignments,
  });
}

export function syncAppState(state: AppState): void {
  _state = state;
  _listeners.forEach((listener) => listener());
}

export function setAuthUser(user: AuthUserDto | null): void {
  _authUser = user;
  invalidateAuthUserCache();
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

export function getCurrentUser(): UserAccount | null {
  if (!_authUser) {
    return null;
  }
  const existing = _state.users.find((user) => user.id === _authUser?.id);
  if (existing) {
    return existing;
  }
  const key = buildAuthUserCacheKey(_authUser);
  if (_cachedAuthUserKey === key && _cachedAuthUserView) {
    return _cachedAuthUserView;
  }
  _cachedAuthUserKey = key;
  _cachedAuthUserView = {
    id: _authUser.id,
    username: _authUser.username,
    role: _authUser.role,
    employeeId: _authUser.employeeId ?? '',
    password: '',
    isActive: true,
    registrarScopes: _authUser.registrarScopes,
    coordinatorAssignments: _authUser.coordinatorAssignments ?? [],
    moderatorOrgAssignments: _authUser.moderatorOrgAssignments ?? [],
    moderatorWarehouseAssignments: _authUser.moderatorWarehouseAssignments ?? [],
  };
  return _cachedAuthUserView;
}

export function isAdmin(): boolean {
  const user = getCurrentUser();
  return user?.role === 'admin';
}

export function isEvidenticar(): boolean {
  const user = getCurrentUser();
  return user?.role === 'evidenticar';
}

export function isPopisKoordinator(): boolean {
  const user = getCurrentUser();
  return user?.role === 'popis_koordinator';
}

export function isSkladistar(): boolean {
  const user = getCurrentUser();
  return user?.role === 'skladistar';
}

export function isModerator(): boolean {
  const user = getCurrentUser();
  return user?.role === 'moderator';
}

export function isModeratorWarehouseAssigned(warehouseId: string): boolean {
  const user = getCurrentUser();
  if (!user || user.role !== 'moderator') {
    return false;
  }
  return (user.moderatorWarehouseAssignments ?? []).some((row) => row.warehouseId === warehouseId);
}

export function getModeratorWarehouseIds(): string[] {
  const user = getCurrentUser();
  if (!user || user.role !== 'moderator') {
    return [];
  }
  return (user.moderatorWarehouseAssignments ?? []).map((row) => row.warehouseId);
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

/** Cross-service when org units diverge at sektor level or above. Uses org unit IDs only. */
export function isCrossServiceTransfer(
  fromOrgUnitId: string | undefined,
  toOrgUnitId: string | undefined,
): boolean {
  if (!fromOrgUnitId || !toOrgUnitId) {
    return false;
  }
  if (fromOrgUnitId === toOrgUnitId) {
    return false;
  }

  function getServiceChain(orgUnitId: string): string[] {
    const chain: string[] = [];
    let current = _state.orgUnits.find((o) => o.id === orgUnitId);
    while (current) {
      chain.unshift(current.id);
      current = _state.orgUnits.find((o) => o.id === current!.parentId);
    }
    return chain;
  }

  const fromChain = getServiceChain(fromOrgUnitId);
  const toChain = getServiceChain(toOrgUnitId);
  const fromService = _state.orgUnits.find((o) => o.id === fromOrgUnitId);
  const toService = _state.orgUnits.find((o) => o.id === toOrgUnitId);

  if (!fromService || !toService) {
    return true;
  }

  if (fromChain.includes(toOrgUnitId) || toChain.includes(fromOrgUnitId)) {
    return false;
  }

  for (let i = 0; i < Math.min(fromChain.length, toChain.length); i++) {
    if (fromChain[i] !== toChain[i]) {
      const divergePoint = i > 0 ? _state.orgUnits.find((o) => o.id === fromChain[i - 1]) : null;
      if (divergePoint) {
        const types = ['sektor', 'sluzba', 'odjeljenje'];
        if (types.includes(divergePoint.type)) {
          return false;
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
  return _state.notifications.filter((n) => n.userId === userId && !n.read).length;
}

// Category helpers
export function getParentCategories(): typeof _state.categories {
  return _state.categories.filter((c) => c.parentId === null);
}

export function getSubCategories(parentId: string): typeof _state.categories {
  return _state.categories.filter((c) => c.parentId === parentId);
}

export function getCategoryWithParent(categoryId: string): { category: typeof _state.categories[0] | null, parent: typeof _state.categories[0] | null } {
  const category = _state.categories.find((c) => c.id === categoryId) || null;
  const parent = category?.parentId ? _state.categories.find((c) => c.id === category.parentId) || null : null;
  return { category, parent };
}
