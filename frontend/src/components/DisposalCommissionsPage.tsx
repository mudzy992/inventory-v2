import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, X, Users, FileWarning } from 'lucide-react';
import {
  fetchDisposalCommissionsApi,
  fetchPendingDisposalApprovalsApi,
  voteDisposalApprovalApi,
  type DisposalApprovalDto,
  type DisposalCommissionDto,
} from '../api/disposal-api';
import { ApiError } from '../api/client';
import { useToast } from '../contexts/toast-context';
import { Badge } from './ui/badge';
import { useStore, useRefreshData } from '../useStore';
import { isAdmin } from '../store';
import { PageHeaderRow } from './ui/page-header-row';
import { ResponsiveTable } from './ui/responsive-table';
import { Button } from './ui/button';
import { EmptyState } from './ui/empty-state';
import { PageTabs } from './ui/page-tabs';
import { DisposalCommissionFormModal } from './disposal-commissions/disposal-commission-form-modal';

type DisposalTab = 'commissions' | 'legacy';

export const DisposalCommissionsPage = () => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const admin = isAdmin();
  const { toastError, toastSuccess } = useToast();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [commissions, setCommissions] = useState<DisposalCommissionDto[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<DisposalApprovalDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<DisposalTab>('commissions');
  const employeesWithUser = useMemo(() => {
    const linked = new Set(
      state.users.filter((user) => user.isActive && user.employeeId).map((user) => user.employeeId!),
    );
    return state.employees.filter((employee) => linked.has(employee.id));
  }, [state.users, state.employees]);
  const citiesWithActiveCommission = useMemo(
    () => new Set(commissions.map((commission) => commission.cityId)),
    [commissions],
  );
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, approvals] = await Promise.all([
        fetchDisposalCommissionsApi(),
        fetchPendingDisposalApprovalsApi().catch(() => [] as DisposalApprovalDto[]),
      ]);
      setCommissions(rows);
      setPendingApprovals(approvals);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadData();
  }, [loadData]);
  const handleCreated = async () => {
    await refresh();
    await loadData();
    toastSuccess('Komisija za rashod je kreirana.');
  };
  const handleVote = async (approvalId: string, approved: boolean) => {
    try {
      await voteDisposalApprovalApi(approvalId, approved);
      await loadData();
      toastSuccess(approved ? 'Glas za odobrenje je zabilježen.' : 'Glas protiv je zabilježen.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
  };
  return (
    <div className="space-y-6">
      <PageHeaderRow
        title="Komisije za rashod"
        description="Jedna aktivna komisija po gradu. Rashod opreme se vezuje na grad lokacije radnika ili skladišta gdje je oprema."
        actions={
          admin && tab === 'commissions' ? (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus size={16} />
              Nova komisija
            </Button>
          ) : undefined
        }
      />
      <PageTabs
        tabs={[
          { id: 'commissions', label: 'Komisije', icon: Users },
          { id: 'legacy', label: 'Legacy odobrenja', icon: FileWarning },
        ]}
        activeTab={tab}
        onChange={setTab}
      />
      {tab === 'commissions' ? (
        <div>
          <h2 className="text-sm font-medium text-gray-800 mb-2">Aktivne komisije</h2>
          <ResponsiveTable
            isEmpty={commissions.length === 0 && !loading}
            emptyMessage="Nema komisija za rashod."
            mobile={commissions.map((commission) => (
              <div key={commission.id} className="p-4 space-y-2">
                <p className="font-medium text-gray-800">{commission.city?.name ?? commission.cityId}</p>
                <p className="text-sm text-gray-700">{commission.name}</p>
                <ul className="text-xs text-gray-600 space-y-1">
                  {commission.members.map((member) => (
                    <li key={member.employeeId}>
                      {member.employee
                        ? `${member.employee.firstName} ${member.employee.lastName}`
                        : member.employeeId}
                      {member.role === 'predsjednik' ? ' (predsjednik)' : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            desktop={
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Grad</th>
                  <th className="text-left px-4 py-2 font-medium">Naziv</th>
                  <th className="text-left px-4 py-2 font-medium">Članovi</th>
                </tr>
              </thead>
              <tbody>
                {commissions.map((commission) => (
                  <tr key={commission.id} className="border-t">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{commission.city?.name ?? commission.cityId}</div>
                      {commission.city?.canton?.name ? (
                        <div className="text-xs text-gray-500">{commission.city.canton.name}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium">{commission.name}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      <ul className="space-y-1">
                        {commission.members.map((member) => (
                          <li key={member.employeeId}>
                            {member.employee
                              ? `${member.employee.firstName} ${member.employee.lastName}`
                              : member.employeeId}
                            {member.role === 'predsjednik' ? ' (predsjednik)' : ''}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            }
          />
        </div>
      ) : null}
      {tab === 'legacy' ? (
        pendingApprovals.length > 0 ? (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h2 className="text-sm font-medium text-gray-800">Odobrenja na čekanju</h2>
              <Badge tone="warning">Legacy — prenos rashodovanja</Badge>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Odobrenja vezana uz transfer tipa rashodovanje. Popisni rashod obrađuje se u Godišnjem popisu (inbox komisije).
            </p>
            <ResponsiveTable
              mobile={pendingApprovals.map((approval) => (
                <div key={approval.id} className="p-4 space-y-2">
                  <p className="font-mono text-xs">{approval.transfer.documentNumber}</p>
                  <p className="text-sm text-gray-700">{approval.transfer.equipment?.inventoryNumber ?? '—'}</p>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="!py-1 !px-2 text-xs" onClick={() => void handleVote(approval.id, true)}>
                      <Check size={12} />
                      Za
                    </Button>
                    <Button variant="danger" className="!py-1 !px-2 text-xs" onClick={() => void handleVote(approval.id, false)}>
                      <X size={12} />
                      Protiv
                    </Button>
                  </div>
                </div>
              ))}
              desktop={
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Dokument</th>
                    <th className="text-left px-4 py-2 font-medium">Oprema</th>
                    <th className="text-left px-4 py-2 font-medium">Akcije</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingApprovals.map((approval) => (
                    <tr key={approval.id} className="border-t">
                      <td className="px-4 py-3 font-mono text-xs">{approval.transfer.documentNumber}</td>
                      <td className="px-4 py-3">{approval.transfer.equipment?.inventoryNumber ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Button variant="secondary" className="!py-1 !px-2 text-xs" onClick={() => void handleVote(approval.id, true)}>
                            <Check size={12} />
                            Za
                          </Button>
                          <Button variant="danger" className="!py-1 !px-2 text-xs" onClick={() => void handleVote(approval.id, false)}>
                            <X size={12} />
                            Protiv
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              }
            />
          </div>
        ) : (
          <EmptyState message="Nema legacy odobrenja na čekanju." />
        )
      ) : null}
      {showCreateModal ? (
        <DisposalCommissionFormModal
          cities={state.cities}
          employees={state.employees}
          employeesWithUser={employeesWithUser}
          orgUnits={state.orgUnits}
          citiesWithActiveCommission={citiesWithActiveCommission}
          onClose={() => setShowCreateModal(false)}
          onCreated={handleCreated}
        />
      ) : null}
    </div>
  );
};
