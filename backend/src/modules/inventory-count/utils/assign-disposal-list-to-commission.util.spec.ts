import { assignListedDisposalItemsToCommissionInTx } from './assign-disposal-list-to-commission.util';

describe('assignListedDisposalItemsToCommissionInTx', () => {
  it('creates pending approvals for listed skladiste equipment', async () => {
    const approvalCreate = jest.fn().mockResolvedValue({ id: 'appr-1' });
    const listUpdate = jest.fn().mockResolvedValue({});
    const tx = {
      equipmentDisposalListItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'list-1',
            equipmentId: 'eq-1',
            equipment: { id: 'eq-1', status: 'skladiste', inventoryNumber: 'INV-1' },
          },
        ]),
        update: listUpdate,
      },
      disposalInventoryApproval: {
        upsert: approvalCreate,
      },
    } as unknown as Parameters<typeof assignListedDisposalItemsToCommissionInTx>[0];

    const count = await assignListedDisposalItemsToCommissionInTx(tx, {
      sessionId: 'sess-1',
      warehouseId: 'wh-1',
      parentCategoryId: 'cat-parent',
      disposalCommissionId: 'comm-1',
    });

    expect(count).toBe(1);
    expect(approvalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          equipmentId: 'eq-1',
          disposalCommissionId: 'comm-1',
          sessionId: 'sess-1',
          status: 'pending',
        }),
      }),
    );
    expect(listUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'list-1' },
        data: expect.objectContaining({ status: 'assigned', approvalId: 'appr-1' }),
      }),
    );
  });

  it('skips zaduzeno equipment still on holder', async () => {
    const approvalCreate = jest.fn();
    const tx = {
      equipmentDisposalListItem: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'list-2',
            equipmentId: 'eq-2',
            equipment: { id: 'eq-2', status: 'zaduzeno', inventoryNumber: 'INV-2' },
          },
        ]),
        update: jest.fn(),
      },
      disposalInventoryApproval: { upsert: approvalCreate },
    } as unknown as Parameters<typeof assignListedDisposalItemsToCommissionInTx>[0];

    const count = await assignListedDisposalItemsToCommissionInTx(tx, {
      sessionId: 'sess-1',
      warehouseId: 'wh-1',
      parentCategoryId: 'cat-parent',
      disposalCommissionId: 'comm-1',
    });

    expect(count).toBe(0);
    expect(approvalCreate).not.toHaveBeenCalled();
  });
});
