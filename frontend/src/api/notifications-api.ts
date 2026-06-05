import { apiRequest } from './client';
import type { PaginatedListParams, PaginatedResponse } from '../types/pagination';
import { buildListQueryString } from '../types/pagination';
import type { Notification } from '../types';

export interface NotificationsListFilters extends PaginatedListParams {
  unread?: string;
}

export const fetchNotificationsPageApi = (params: NotificationsListFilters = {}) => {
  const query = buildListQueryString(params);
  return apiRequest<PaginatedResponse<Notification>>(
    `/notifications${query ? `?${query}` : ''}`,
  );
};

const NOTIFICATIONS_BOOTSTRAP_PAGE_SIZE = 50;

/** First page of notifications for bootstrap/header. */
export const fetchNotificationsApi = async (): Promise<Notification[]> => {
  const response = await fetchNotificationsPageApi({ page: 1, pageSize: NOTIFICATIONS_BOOTSTRAP_PAGE_SIZE });
  return response.items;
};

export const fetchUnreadNotificationsCountApi = async (): Promise<number> => {
  const response = await fetchNotificationsPageApi({ page: 1, pageSize: 1, unread: 'true' });
  return response.meta.total;
};

export const markNotificationReadApi = (id: string): Promise<Notification> =>
  apiRequest<Notification>(`/notifications/${id}/read`, { method: 'PATCH' });

export const markAllNotificationsReadApi = (): Promise<{ count: number }> =>
  apiRequest<{ count: number }>('/notifications/read-all', { method: 'POST' });
