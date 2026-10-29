import { apiRequest } from './client';

export type MailProviderId = 'gmail' | 'office365' | 'custom';

export interface MailProviderPresetDto {
  id: MailProviderId;
  label: string;
  description: string;
  host: string;
  port: number;
  secure: boolean;
  usernameHint: string;
  passwordHint: string;
}

export interface MailConfigDto {
  enabled: boolean;
  provider: MailProviderId;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  fromEmail: string;
  fromName: string;
  hasPassword: boolean;
  presets: MailProviderPresetDto[];
}

export interface SaveMailConfigPayload {
  enabled: boolean;
  provider: MailProviderId;
  host?: string;
  port?: number;
  secure?: boolean;
  username: string;
  password?: string;
  fromEmail: string;
  fromName?: string;
}

export interface EmailTemplateDto {
  id: string;
  key: string;
  name: string;
  description: string | null;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: { name: string; description: string }[];
  enabled: boolean;
  isSystem: boolean;
  updatedAt: string;
}

export interface EmailLogDto {
  id: string;
  templateKey: string | null;
  toAddresses: string;
  ccAddresses: string | null;
  bccAddresses: string | null;
  subject: string;
  status: 'sent' | 'failed';
  error: string | null;
  transferId: string | null;
  createdAt: string;
}

export const fetchMailConfigApi = () => apiRequest<MailConfigDto>('/mail/config');

export const saveMailConfigApi = (payload: SaveMailConfigPayload) =>
  apiRequest<MailConfigDto>('/mail/config', { method: 'PUT', body: JSON.stringify(payload) });

export const testMailConnectionApi = () =>
  apiRequest<{ ok: true; message: string }>('/mail/config/test-connection', { method: 'POST' });

export const sendTestEmailApi = (to: string) =>
  apiRequest<EmailLogDto>('/mail/test-send', { method: 'POST', body: JSON.stringify({ to }) });

export const fetchEmailTemplatesApi = () => apiRequest<EmailTemplateDto[]>('/mail/templates');

export const updateEmailTemplateApi = (
  key: string,
  payload: {
    name: string;
    description?: string;
    subject: string;
    bodyHtml: string;
    bodyText: string;
    enabled: boolean;
  },
) => apiRequest<EmailTemplateDto>(`/mail/templates/${encodeURIComponent(key)}`, {
  method: 'PUT',
  body: JSON.stringify(payload),
});

export const resetEmailTemplateApi = (key: string) =>
  apiRequest<EmailTemplateDto>(`/mail/templates/${encodeURIComponent(key)}/reset`, {
    method: 'POST',
  });

export const previewEmailTemplateApi = (
  key: string,
  payload: { subject?: string; bodyHtml?: string; bodyText?: string },
) =>
  apiRequest<{ subject: string; html: string; text: string }>(
    `/mail/templates/${encodeURIComponent(key)}/preview`,
    { method: 'POST', body: JSON.stringify(payload) },
  );

export const fetchEmailLogsApi = (limit = 50) =>
  apiRequest<EmailLogDto[]>(`/mail/logs?limit=${limit}`);

export const sendTransferEmailApi = (
  transferId: string,
  payload: { to: string; cc?: string; bcc?: string },
) =>
  apiRequest<{ id: string; status: string; to: string; subject: string; attachment: string }>(
    `/mail/transfers/${transferId}/send`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
