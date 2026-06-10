import { apiRequest } from './client';
import type { PageId } from '../components/page-id';

export type ModuleBadges = Partial<Record<PageId, number>>;

export const fetchModuleBadgesApi = () => apiRequest<ModuleBadges>('/nav/module-badges');
