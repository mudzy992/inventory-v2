import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransferDocumentPanel } from './TransferDocumentPanel';

// Panel cita efektivne postavke (auth), toast i socket kontekste; u unit
// testu ih zamjenjujemo deterministickim mockovima (bez providera).
vi.mock('../hooks/use-effective-settings', () => ({
  useEffectiveSettings: () => ({
    settings: {},
    isLoading: false,
    refresh: async () => undefined,
    getBoolean: (_key: string, fallback = false) => fallback,
    getNumber: (_key: string, fallback: number) => fallback,
  }),
}));

vi.mock('../contexts/toast-context', () => ({
  useToast: () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }),
}));

vi.mock('../contexts/SocketContext', () => ({
  useNotifications: () => ({ isConnected: false }),
  useDocumentJobUpdates: () => undefined,
}));

const mockTransfer = {
  id: 'transfer-001',
  documentNumber: 'PR-2026-001',
  status: 'raw',
  documentGenerationStatus: 'not_requested',
  hasGeneratedDocument: false,
  scannedDocUrl: null,
  notes: 'Napomena iz zapisa prenosnice',
} as const;

describe('TransferDocumentPanel design contract', () => {
  it('renders the panel header and record notes', () => {
    render(
      <TransferDocumentPanel
        transfer={mockTransfer as any}
        allowSign={false}
        inventoryMode={false}
      />,
    );
    expect(screen.getByText(/Prenosnica PR-2026-001/)).toBeInTheDocument();
    // Regresija: notes dolazi iz zapisa kad prop nije proslijedjen
    // (ranije: duplicate identifier 'notes' / props is not defined).
    expect(screen.getByText(/Napomena iz zapisa prenosnice/)).toBeInTheDocument();
  });

  it('prop notes takes precedence over record notes', () => {
    render(
      <TransferDocumentPanel
        transfer={mockTransfer as any}
        allowSign={false}
        inventoryMode={false}
        notes="Eksplicitna napomena"
      />,
    );
    expect(screen.getByText(/Eksplicitna napomena/)).toBeInTheDocument();
    expect(screen.queryByText(/Napomena iz zapisa prenosnice/)).not.toBeInTheDocument();
  });
});
