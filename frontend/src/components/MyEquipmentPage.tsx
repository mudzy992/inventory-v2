import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore } from '../useStore';
import { getCurrentUser } from '../store';
import { fetchEquipmentPageApi } from '../api/equipment-api';
import { fetchTransfersPageApi } from '../api/transfers-api';
import { apiRequest } from '../api/client';
import { usePaginatedList } from '../hooks/usePaginatedList';
import type { Employee, Equipment } from '../types';
import {
  Package,
  Monitor,
  Laptop,
  Printer as PrinterIcon,
  Smartphone,
  QrCode,
  History,
  ChevronRight,
  Building2,
  Mail,
  User,
  Calendar,
} from 'lucide-react';
import { LabelPrintSheet } from './LabelPrintSheet';
import { getOrgUnitPath, formatDate, getStatusLabel, getStatusColor } from '../helpers';
import { EquipmentCard } from './EquipmentCard';
import { EmptyState } from './ui/empty-state';
import { PaginationControls } from './ui/pagination-controls';

export function MyEquipmentPage() {
  const [state] = useStore();
  const currentUser = getCurrentUser();
  const [selectedEquipId, setSelectedEquipId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    if (!currentUser?.employeeId) {
      setEmployee(null);
      return;
    }
    void apiRequest<Employee>(`/employees/${currentUser.employeeId}`)
      .then(setEmployee)
      .catch(() => setEmployee(null));
  }, [currentUser?.employeeId]);

  const fetchEquipment = useCallback(
    (params: { page?: number; pageSize?: number }) =>
      fetchEquipmentPageApi({
        ...params,
        status: 'zaduzeno',
        currentHolderId: currentUser?.employeeId,
      }),
    [currentUser?.employeeId],
  );

  const equipmentList = usePaginatedList<Equipment>({
    fetchPage: fetchEquipment,
    enabled: Boolean(currentUser?.employeeId),
  });

  const fetchTransfers = useCallback(
    (params: { page?: number; pageSize?: number }) =>
      fetchTransfersPageApi({
        ...params,
        personId: currentUser?.employeeId,
        sortBy: 'createdAt',
        sortDir: 'desc',
      }),
    [currentUser?.employeeId],
  );

  const transfersList = usePaginatedList({
    fetchPage: fetchTransfers,
    enabled: Boolean(currentUser?.employeeId),
    initialPageSize: 10,
  });

  const myEquipment = equipmentList.items;

  const equipmentByCategory = useMemo(() => {
    const groups = new Map<string, Equipment[]>();
    for (const item of myEquipment) {
      const category = item.category ?? state.categories.find((row) => row.id === item.categoryId);
      const parent = category?.parentId
        ? state.categories.find((row) => row.id === category.parentId)
        : category;
      const label = parent?.name ?? category?.name ?? 'Ostalo';
      const list = groups.get(label) ?? [];
      list.push(item);
      groups.set(label, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [myEquipment, state.categories]);

  if (!currentUser) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <EmptyState message="Niste prijavljeni." />
      </div>
    );
  }

  if (!employee && !equipmentList.isLoading) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <EmptyState message="Nalog nije povezan s radnikom. Kontaktirajte administratora da poveže vaš korisnički nalog s evidencijom radnika." />
      </div>
    );
  }

  const orgUnit = employee ? state.orgUnits.find((o) => o.id === employee.orgUnitId) : null;

  const getCategoryIcon = (catId: string) => {
    const cat = state.categories.find((c) => c.id === catId);
    if (!cat) return <Package size={20} />;
    const name = cat.name.toLowerCase();
    if (name.includes('monitor')) return <Monitor size={20} />;
    if (name.includes('laptop')) return <Laptop size={20} />;
    if (name.includes('print')) return <PrinterIcon size={20} />;
    if (name.includes('mobil') || name.includes('telefon')) return <Smartphone size={20} />;
    return <Package size={20} />;
  };

  return (
    <div>
      {employee ? (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 mb-6 text-white">
          <div className="flex items-start gap-6">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-bold backdrop-blur-sm">
              {employee.firstName[0]}
              {employee.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold">
                {employee.firstName} {employee.lastName}
              </h1>
              <p className="text-blue-100 mt-1">{employee.title}</p>
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-blue-100">
                {orgUnit ? (
                  <span className="flex items-center gap-1">
                    <Building2 size={14} /> {getOrgUnitPath(state.orgUnits, orgUnit.id)}
                  </span>
                ) : null}
                {employee.email ? (
                  <span className="flex items-center gap-1">
                    <Mail size={14} /> {employee.email}
                  </span>
                ) : null}
                <span className="flex items-center gap-1">
                  <User size={14} /> {equipmentList.meta?.total ?? myEquipment.length} komada opreme
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Rest of page uses myEquipment and transfersList - keep existing UI structure below header */}
      {equipmentList.isLoading ? (
        <p className="text-center text-gray-400 py-8">Učitavanje opreme…</p>
      ) : myEquipment.length === 0 ? (
        <EmptyState message="Nemate zaduženu opremu." />
      ) : (
        equipmentByCategory.map(([label, items]) => (
          <div key={label} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
              {getCategoryIcon(items[0]?.categoryId ?? '')}
              {label}
              <span className="text-sm font-normal text-gray-400">({items.length})</span>
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((eq) => (
                <button
                  key={eq.id}
                  type="button"
                  onClick={() => setSelectedEquipId(eq.id)}
                  className="text-left bg-white border border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:shadow-sm transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-mono text-xs text-gray-500">{eq.inventoryNumber}</p>
                      <p className="text-sm font-medium text-gray-900 mt-1">
                        {eq.category?.name ?? 'Oprema'}
                      </p>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(eq.status)}`}
                    >
                      {getStatusLabel(eq.status)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-3 text-xs text-blue-600">
                    <QrCode size={12} /> Detalji
                    <ChevronRight size={12} />
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {equipmentList.meta ? (
        <PaginationControls
          page={equipmentList.meta.page}
          pageSize={equipmentList.meta.pageSize}
          total={equipmentList.meta.total}
          totalPages={equipmentList.meta.totalPages}
          onPageChange={equipmentList.setPage}
          onPageSizeChange={equipmentList.setPageSize}
          className="mb-8 rounded-xl border border-gray-100 bg-white"
        />
      ) : null}

      {transfersList.items.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <History size={20} /> Povijest prenosa
          </h2>
          <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
            {transfersList.items.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium text-gray-800">{t.documentNumber || t.type}</p>
                  <p className="text-xs text-gray-500">
                    {t.equipment?.inventoryNumber ?? '—'} · {formatDate(t.date)}
                  </p>
                </div>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Calendar size={12} />
                  {t.status}
                </span>
              </div>
            ))}
          </div>
          {transfersList.meta ? (
            <PaginationControls
              page={transfersList.meta.page}
              pageSize={transfersList.meta.pageSize}
              total={transfersList.meta.total}
              totalPages={transfersList.meta.totalPages}
              onPageChange={transfersList.setPage}
            />
          ) : null}
        </div>
      ) : null}

      {selectedEquipId ? (
        <EquipmentCard
          equipmentId={selectedEquipId}
          onClose={() => setSelectedEquipId(null)}
          showTransferActions={false}
        />
      ) : null}

      {showLabels ? (
        <LabelPrintSheet
          items={myEquipment.filter((eq) => selectedEquipId === eq.id)}
          categories={state.categories}
          onClose={() => setShowLabels(false)}
        />
      ) : null}
    </div>
  );
}
