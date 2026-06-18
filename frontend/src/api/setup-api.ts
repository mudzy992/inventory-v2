import { apiRequest } from './client';

export interface SetupStatusDto {
  needsSetup: boolean;
}

export interface SetupEmployeePayload {
  firstName: string;
  lastName: string;
  title: string;
}

export interface SetupRoleAccountPayload {
  employee: SetupEmployeePayload;
  username: string;
  password: string;
}

export interface InitializeSetupPayload {
  company: {
    name: string;
    address: string;
    city: string;
    postalCode?: string;
    phone?: string;
    email?: string;
    taxId?: string;
  };
  location: {
    cantonName: string;
    cities: string[];
  };
  organization: {
    childUnitName?: string;
    childUnitType?: string;
  };
  warehouse: {
    name: string;
    address?: string;
  };
  category: {
    parentName: string;
    leafName: string;
  };
  catalog: {
    name: string;
    code?: string;
  };
  admin: {
    firstName: string;
    lastName: string;
    email?: string;
    username: string;
    password: string;
  };
  roles: {
    evidenticar: SetupRoleAccountPayload;
    skladistar: SetupRoleAccountPayload;
    popis_koordinator: SetupRoleAccountPayload;
    user: SetupRoleAccountPayload;
  };
  director: {
    firstName: string;
    lastName: string;
    title: string;
  };
  setupToken?: string;
}

export interface SetupInitializeResponse {
  success: boolean;
  usernames: string[];
}

export const fetchSetupStatusApi = (): Promise<SetupStatusDto> =>
  apiRequest<SetupStatusDto>('/setup/status');

export const initializeSetupApi = (payload: InitializeSetupPayload): Promise<SetupInitializeResponse> =>
  apiRequest<SetupInitializeResponse>('/setup/initialize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
