import { apiRequest } from './client';
import type { OrgUnit } from '../types';

export const fetchOrgUnitsFlatApi = () => apiRequest<OrgUnit[]>('/org-units');

export const fetchOrgUnitsTreeApi = () => apiRequest<OrgUnit[]>('/org-units/tree');

export const searchOrgUnitsApi = (q: string, limit = 20) => {
  const params = new URLSearchParams({ q });
  if (limit !== 20) {
    params.set('limit', String(limit));
  }
  return apiRequest<OrgUnit[]>(`/org-units/search?${params.toString()}`);
};

export const fetchOrgUnitApi = (id: string) => apiRequest<OrgUnit>(`/org-units/${id}`);

export const fetchOrgUnitEquipmentSubtreeCountApi = (orgUnitId: string) =>
  apiRequest<{ count: number }>(`/org-units/${orgUnitId}/equipment-subtree-count`);
