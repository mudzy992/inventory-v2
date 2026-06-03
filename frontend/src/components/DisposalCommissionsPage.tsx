import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Plus, X, Users, FileWarning } from 'lucide-react';
import {
  createDisposalCommissionApi,
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
import { PageHeader } from './ui/page-header';
import { FormCard } from './ui/form-card';
import { Button } from './ui/button';
import { DataTable } from './ui/data-table';
import { EmptyState } from './ui/empty-state';
import { inputClass, labelClass, selectClass } from './ui/form-styles';
import { PageTabs } from './ui/page-tabs';

type DisposalTab = 'commissions' | 'legacy';

export const DisposalCommissionsPage = () => {
  const [state] = useStore();
  const refresh = useRefreshData();
  const admin = isAdmin();
  const { toastError, toastSuccess } = useToast();
  const [cityId, setCityId] = useState('');
  const [name, setName] = useState('');
  const [presidentId, setPresidentId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
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
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, approvals] = await Promise.all([
        fetchDisposalCommissionsApi(cityId || undefined),
        fetchPendingDisposalApprovalsApi().catch(() => [] as DisposalApprovalDto[]),
      ]);
      setCommissions(rows);
      setPendingApprovals(approvals);
    } finally {
      setLoading(false);
    }
  }, [cityId]);
  useEffect(() => {
    void loadData();
  }, [loadData]);
  const handleToggleMember = (employeeId: string) => {
    if (employeeId === presidentId) {
      return;
    }
    setMemberIds((prev) =>
      prev.includes(employeeId) ? prev.filter((id) => id !== employeeId) : [...prev, employeeId],
    );
  };
  const canCreate = Boolean(cityId && name.trim() && presidentId && memberIds.length >= 2);
  const handleCreate = async () => {
    if (!canCreate) {
      return;
    }
    try {
      await createDisposalCommissionApi({
        cityId,
        name: name.trim(),
        members: [
          { employeeId: presidentId, role: 'predsjednik' },
          ...memberIds.map((employeeId) => ({ employeeId, role: 'clan' as const })),
        ],
      });
      setName('');
      setPresidentId('');
      setMemberIds([]);
      await refresh();
      await loadData();
      toastSuccess('Komisija za rashod je kreirana.');
    } catch (err) {
      toastError(err instanceof ApiError ? err.message : 'Greška');
    }
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
      <PageHeader
        title="Komisije za rashod"
        description="Jedna aktivna komisija po gradu — saglasnost prije potpisa rashodovanja."
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
        <>
      {admin ? (
        <FormCard title="Nova komisija">
          <select value={cityId} onChange={(event) => setCityId(event.target.value)} className={selectClass}>
            <option value="">Grad</option>
            {state.cities.map((city) => (
              <option key={city.id} value={city.id}>
                {city.name}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Naziv komisije"
            className={inputClass}
          />
          <div>
            <label className={labelClass}>Predsjednik (mora imati korisnički račun)</label>
            <select
              value={presidentId}
              onChange={(event) => setPresidentId(event.target.value)}
              className={selectClass}
            >
              <option value="">— Odaberite —</option>
              {employeesWithUser.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.firstName} {employee.lastName} — {employee.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Članovi (min. 2, bilo koji radnik)</label>
            <div className="border border-gray-200 rounded-lg divide-y max-h-48 overflow-y-auto">
              {state.employees
                .filter((employee) => employee.id !== presidentId)
                .map((employee) => (
                  <label
                    key={employee.id}
                    className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50"
                  >
                    <input
                      type="checkbox"
                      checked={memberIds.includes(employee.id)}
                      onChange={() => handleToggleMember(employee.id)}
                    />
                    {employee.firstName} {employee.lastName}
                  </label>
                ))}
            </div>
          </div>
          <Button onClick={() => void handleCreate()} disabled={!canCreate}>
            <Plus size={14} />
            Kreiraj komisiju
          </Button>
        </FormCard>
      ) : null}
      <div>
        <h2 className="text-sm font-medium text-gray-800 mb-2">Aktivne komisije</h2>
        <DataTable>
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
                  <td className="px-4 py-3">{commission.city?.name ?? commission.cityId}</td>
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
              {commissions.length === 0 && !loading ? (
                <tr>
                  <td colSpan={3}>
                    <EmptyState message="Nema komisija za rashod." />
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </DataTable>
      </div>
        </>
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
          <DataTable>
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
          </DataTable>
        </div>
      ) : (
        <EmptyState message="Nema legacy odobrenja na čekanju." />
      )) : null}
    </div>
  );
};
