import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LabelPrintSheet } from '../LabelPrintSheet';
import type { Category, Equipment } from '../../types';

const categories: Category[] = [
  {
    id: 'cat-1',
    name: 'Laptop',
    parentId: null,
    fields: [{ id: 'f-serial', name: 'Serijski broj', required: false, type: 'text' } as never],
    optionalFields: [],
  } as unknown as Category,
];

const item: Equipment = {
  id: 'eq-1',
  categoryId: 'cat-1',
  inventoryNumber: 'INV-001',
  isAccountingTracked: true,
  affiliation: 'distribucija',
  specifications: { 'f-serial': 'SN-123' },
  status: 'skladiste',
  entryDate: '2026-01-15',
  stockLot: { id: 'lot-1', productName: 'Dell Latitude 5440' },
};

describe('LabelPrintSheet (A4 studio za naljepnice)', () => {
  it('renderuje A4 pregled sa zadanim Avery L7160 formatom', () => {
    window.localStorage.clear();
    render(<LabelPrintSheet items={[item]} categories={categories} onClose={vi.fn()} />);

    expect(screen.getByText('Štampa QR naljepnica')).toBeInTheDocument();
    expect(screen.getByLabelText('Standardni format naljepnica')).toHaveValue('avery-l7160');
    expect(screen.getAllByText(/21 po listu/).length).toBeGreaterThan(0);
    // Sadržaj naljepnice po specifikaciji: naziv opreme (productName iz lota),
    // kategorija, serijski broj i obavezni inventurni broj
    expect(screen.getByText('Dell Latitude 5440')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getAllByText(/SN-123/).length).toBeGreaterThan(0);
    // Margine su podešive
    expect(screen.getByLabelText('Gornja')).toHaveValue(15.1);
    expect(screen.getByLabelText('Lijeva')).toHaveValue(7.2);
  });

  it('mijenja format na L7651 (65 po listu) i pamti geometriju', () => {
    window.localStorage.clear();
    render(<LabelPrintSheet items={[item]} categories={categories} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Standardni format naljepnica'), {
      target: { value: 'avery-l7651' },
    });

    expect(screen.getAllByText(/65 po listu/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Kolona')).toHaveValue(5);
    expect(screen.getByLabelText('Redova')).toHaveValue(13);
  });

  it('preskače početna polja kad se unese početna pozicija', () => {
    window.localStorage.clear();
    render(<LabelPrintSheet items={[item]} categories={categories} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Preskoči polja (1. list)'), {
      target: { value: '2' },
    });

    expect(screen.getByText('preskočeno 1')).toBeInTheDocument();
    expect(screen.getByText('preskočeno 2')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
  });

  it('na malom F-20 formatu i dalje štampa productName i inventurni broj', () => {
    window.localStorage.clear();
    render(<LabelPrintSheet items={[item]} categories={categories} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Standardni format naljepnica'), {
      target: { value: 'fornax-f-20' },
    });

    expect(screen.getAllByText(/56 po listu/).length).toBeGreaterThan(0);
    // 21,2 mm visine (compact) — naziv opreme se ne smije izgubiti
    expect(screen.getByText('Dell Latitude 5440')).toBeInTheDocument();
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    // Inventurni broj je obavezan: prekidač je zaključan
    expect(screen.getByLabelText(/Inventurni broj/)).toBeDisabled();
    expect(screen.getByLabelText(/Inventurni broj/)).toBeChecked();
  });
});
