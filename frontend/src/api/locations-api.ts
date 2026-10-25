import { apiRequest } from './client';
import type { Canton, City } from '../types';

export const fetchCantonsApi = () => apiRequest<Canton[]>('/locations/cantons');

export const searchCantonsApi = (q: string, limit = 20) => {
  const params = new URLSearchParams({ q });
  if (limit !== 20) {
    params.set('limit', String(limit));
  }
  return apiRequest<Canton[]>(`/locations/cantons/search?${params.toString()}`);
};

export const fetchCitiesApi = () => apiRequest<City[]>('/locations/cities');

export const searchCitiesApi = (q: string, limit = 20) => {
  const params = new URLSearchParams({ q });
  if (limit !== 20) {
    params.set('limit', String(limit));
  }
  return apiRequest<City[]>(`/locations/cities/search?${params.toString()}`);
};

export const createCantonApi = (body: { name: string; code?: string }) =>
  apiRequest<Canton>('/locations/cantons', { method: 'POST', body: JSON.stringify(body) });

export const updateCantonApi = (id: string, body: { name?: string; code?: string }) =>
  apiRequest<Canton>(`/locations/cantons/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteCantonApi = (id: string) =>
  apiRequest<void>(`/locations/cantons/${id}`, { method: 'DELETE' });

export const createCityApi = (body: { cantonId: string; name: string }) =>
  apiRequest<City>('/locations/cities', { method: 'POST', body: JSON.stringify(body) });

export const updateCityApi = (id: string, body: { cantonId?: string; name?: string }) =>
  apiRequest<City>(`/locations/cities/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteCityApi = (id: string) =>
  apiRequest<void>(`/locations/cities/${id}`, { method: 'DELETE' });
