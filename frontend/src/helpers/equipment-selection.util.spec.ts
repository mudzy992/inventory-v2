import { describe, expect, it, vi } from 'vitest';
import type { Equipment } from '../types';
import { resolveSelectedEquipment } from './equipment-selection.util';

const equipment = (id: string): Equipment =>
  ({
    id,
    categoryId: 'cat-1',
    inventoryNumber: `INV-${id}`,
    isAccountingTracked: true,
    affiliation: 'distribucija',
    specifications: {},
    status: 'skladiste',
    entryDate: '2026-01-01',
  }) as Equipment;

describe('resolveSelectedEquipment', () => {
  it('includes checked equipment which is not on the currently loaded page', async () => {
    const loaded = [equipment('visible-1')];
    const fetchById = vi.fn(async (id: string) => equipment(id));

    const result = await resolveSelectedEquipment(
      ['other-page-1', 'visible-1', 'other-page-2'],
      loaded,
      fetchById,
    );

    expect(result.map((item) => item.id)).toEqual(['other-page-1', 'visible-1', 'other-page-2']);
    expect(fetchById).toHaveBeenCalledTimes(2);
    expect(fetchById).toHaveBeenCalledWith('other-page-1');
    expect(fetchById).toHaveBeenCalledWith('other-page-2');
  });

  it('does not refetch equipment which is already loaded', async () => {
    const loadedItem = equipment('eq-1');
    const fetchById = vi.fn(async (id: string) => equipment(id));

    const result = await resolveSelectedEquipment(['eq-1'], [loadedItem], fetchById);

    expect(result).toEqual([loadedItem]);
    expect(fetchById).not.toHaveBeenCalled();
  });

  it('skips checked IDs which cannot be loaded', async () => {
    const fetchById = vi.fn(async (id: string) => (id === 'deleted' ? null : equipment(id)));

    const result = await resolveSelectedEquipment(['deleted', 'eq-2'], [], fetchById);

    expect(result.map((item) => item.id)).toEqual(['eq-2']);
  });
});
