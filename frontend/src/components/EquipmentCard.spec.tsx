import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EquipmentCard } from './EquipmentCard';
import type { Equipment } from '../types';

// Modal detalja opreme (otvara se na "oko") cita API, store i kontekste;
// u unit testu ih zamjenjujemo deterministickim mockovima.
const baseEquipment: Equipment = {
  id: 'eq-1',
  categoryId: 'cat-1',
  inventoryNumber: 'INV-001',
  isAccountingTracked: true,
  affiliation: 'distribucija',
  specifications: {},
  status: 'skladiste',
  entryDate: '2026-01-15',
  notes: 'Napomena vidljiva u detaljima',
};

const equipmentState = { current: baseEquipment as Equipment };

vi.mock('../api/equipment-api', () => ({
  fetchEquipmentApi: async () => equipmentState.current,
  reactivateEquipmentApi: vi.fn(),
}));

vi.mock('../api/transfers-api', () => ({
  fetchTransfersPageApi: async () => ({ items: [], total: 0, page: 1, pageSize: 100 }),
}));

vi.mock('../api/data-api', () => ({ createTransferApi: vi.fn() }));

vi.mock('../useStore', () => ({
  useStore: () => [
    {
      categories: [
        { id: 'cat-1', name: 'Laptop', parentId: null, fields: [], optionalFields: [] },
      ],
      orgUnits: [],
      warehouses: [],
    },
    vi.fn(),
  ],
  useRefreshData: () => async () => undefined,
}));

vi.mock('../store', () => ({
  getCurrentUser: () => ({ id: 'u1', role: 'admin' }),
  isAdmin: () => true,
  isEvidenticar: () => false,
}));

vi.mock('../contexts/toast-context', () => ({
  useToast: () => ({ toastError: vi.fn(), toastSuccess: vi.fn() }),
}));

vi.mock('../contexts/public-settings-context', () => ({
  usePublicSettings: () => ({
    getBoolean: (_key: string, fallback = false) => fallback,
  }),
}));

vi.mock('./maintenance-parts/equipment-installed-parts-panel', () => ({
  EquipmentInstalledPartsPanel: () => null,
}));

vi.mock('./equipment/equipment-mark-disposal-dialog', () => ({
  EquipmentMarkDisposalDialog: () => null,
}));

describe('EquipmentCard (detalji opreme)', () => {
  it('prikazuje polje Napomena u modalu detalja', async () => {
    equipmentState.current = baseEquipment;
    render(<EquipmentCard equipmentId="eq-1" onClose={vi.fn()} />);

    expect(await screen.findByText('Napomena')).toBeInTheDocument();
    expect(screen.getByText('Napomena vidljiva u detaljima')).toBeInTheDocument();
  });

  it('ne prikazuje polje Napomena kad oprema nema napomenu', async () => {
    equipmentState.current = { ...baseEquipment, notes: undefined };
    render(<EquipmentCard equipmentId="eq-1" onClose={vi.fn()} />);

    // Modal se učitao (vidi se inv. broj), ali blok napomene ne postoji.
    expect(await screen.findByText('INV-001')).toBeInTheDocument();
    expect(screen.queryByText('Napomena')).not.toBeInTheDocument();
    expect(screen.queryByText('Napomena vidljiva u detaljima')).not.toBeInTheDocument();
  });
});
