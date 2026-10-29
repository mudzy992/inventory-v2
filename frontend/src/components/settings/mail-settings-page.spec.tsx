import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../contexts/toast-context';
import { MailSettingsPage } from './mail-settings-page';

vi.mock('../../api/mail-api', () => ({
  fetchMailConfigApi: vi.fn(async () => ({
    enabled: false,
    provider: 'custom',
    host: '',
    port: 587,
    secure: false,
    username: '',
    fromEmail: '',
    fromName: '',
    hasPassword: false,
    presets: [
      {
        id: 'gmail',
        label: 'Gmail / Google Workspace',
        description: 'Google SMTP',
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        usernameHint: 'Puna Gmail adresa',
        passwordHint: 'App Password',
      },
      {
        id: 'office365',
        label: 'Microsoft 365 / Outlook',
        description: 'M365 SMTP',
        host: 'smtp.office365.com',
        port: 587,
        secure: false,
        usernameHint: 'M365 adresa',
        passwordHint: 'Lozinka naloga',
      },
      {
        id: 'custom',
        label: 'Custom SMTP',
        description: 'Vlastiti server',
        host: '',
        port: 587,
        secure: false,
        usernameHint: '',
        passwordHint: '',
      },
    ],
  })),
  fetchEmailTemplatesApi: vi.fn(async () => [
    {
      id: 't1',
      key: 'transfer.completed',
      name: 'Prenos opreme izvršen',
      description: 'Glavni template',
      subject: 'Prenosnica {{documentNumber}}',
      bodyHtml: '<p>{{equipmentName}}</p>',
      bodyText: '{{equipmentName}}',
      variables: [{ name: 'documentNumber', description: 'Broj prenosnice' }],
      enabled: true,
      isSystem: true,
      updatedAt: '2026-10-29T00:00:00.000Z',
    },
  ]),
  fetchEmailLogsApi: vi.fn(async () => []),
  saveMailConfigApi: vi.fn(),
  testMailConnectionApi: vi.fn(),
  sendTestEmailApi: vi.fn(),
  updateEmailTemplateApi: vi.fn(),
  resetEmailTemplateApi: vi.fn(),
  previewEmailTemplateApi: vi.fn(async () => ({
    subject: 'Prenosnica PR-2026-001',
    html: '<p>Laptop</p>',
    text: 'Laptop',
  })),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <MailSettingsPage />
      </ToastProvider>
    </MemoryRouter>,
  );

describe('MailSettingsPage', () => {
  it('renders provider cards and the custom SMTP form', async () => {
    renderPage();
    expect(await screen.findByText('Gmail / Google Workspace')).toBeTruthy();
    expect(screen.getByText('Microsoft 365 / Outlook')).toBeTruthy();
    expect(screen.getByText('Custom SMTP')).toBeTruthy();
    expect(screen.getByText('SMTP host')).toBeTruthy();
    expect(screen.getByText('Template je uključen') || screen.getByDisplayValue('Prenosnica {{documentNumber}}')).toBeTruthy();
  });

  it('selecting Gmail locks connection fields to the preset', async () => {
    renderPage();
    const gmailCard = await screen.findByText('Gmail / Google Workspace');
    fireEvent.click(gmailCard);
    await waitFor(() => {
      expect(screen.getByText(/zaključani na Gmail \/ Google Workspace preset/)).toBeTruthy();
    });
    expect(screen.queryByText('SMTP host')).toBeNull();
    expect(screen.getByText('App Password')).toBeTruthy();
  });

  it('renders template editor with variables and preview action', async () => {
    renderPage();
    expect(await screen.findByDisplayValue('Prenosnica {{documentNumber}}')).toBeTruthy();
    expect(screen.getByText('{{documentNumber}}')).toBeTruthy();
    fireEvent.click(screen.getByText(/Pregled \(ogledni podaci\)/));
    expect(await screen.findByText('Prenosnica PR-2026-001')).toBeTruthy();
  });
});
