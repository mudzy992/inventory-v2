import { apiRequest } from './client';
import type { Notification } from '../types';

export const fetchNotificationsApi = (): Promise<Notification[]> =>
  apiRequest<Notification[]>('/notifications');

export const markNotificationReadApi = (id: string): Promise<Notification> =>
  apiRequest<Notification>(`/notifications/${id}/read`, { method: 'PATCH' });

export const markAllNotificationsReadApi = (): Promise<{ count: number }> =>
  apiRequest<{ count: number }>('/notifications/read-all', { method: 'POST' });
