import { apiRequest } from './client';

export interface SetupStatusDto {
  needsSetup: boolean;
}

export interface InitializeSetupPayload {
  companyName: string;
  companyAddress: string;
  companyCity: string;
  companyPostalCode?: string;
  companyPhone?: string;
  companyEmail?: string;
  companyTaxId?: string;
  adminFirstName: string;
  adminLastName: string;
  adminEmail?: string;
  adminUsername: string;
  adminPassword: string;
  setupToken?: string;
}

export const fetchSetupStatusApi = (): Promise<SetupStatusDto> =>
  apiRequest<SetupStatusDto>('/setup/status');

export const initializeSetupApi = (payload: InitializeSetupPayload): Promise<{ success: boolean }> =>
  apiRequest<{ success: boolean }>('/setup/initialize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
