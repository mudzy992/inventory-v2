import { useEffect, useMemo, useState } from 'react';
import {
  fetchAdminRelocationAlertsApi,
  type AdminRelocationAlerts,
} from '../api/employee-relocation-api';
import { useStore } from '../useStore';
import {
  getCurrentUser,
  getEquipmentStats,
  getParentCategories,
  getRegistrarScopes,
  getSubCategories,
  isAdmin,
  isEvidenticar,
  equipmentMatchesScope,
  employeeMatchesScope,
  transferMatchesScope,
} from '../store';
import { formatRegistrarAssignmentLabel } from '../helpers/org-warehouse.util';
import type { PageId } from './Layout';
import { useIsPageEnabled } from '../hooks/use-is-page-enabled';
import { Package, Users, ArrowLeftRight, AlertTriangle, MapPin, Layers, Clock } from 'lucide-react';
import { getEmployeeFullName } from '../helpers';

interface DashboardProps {
  onNavigate?: (page: PageId) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const [state] = useStore();
  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const inventoryCountEnabled = useIsPageEnabled('inventory-count');
  const user = getCurrentUser();
  const scopes = getRegistrarScopes();

  const relevantEquipment = useMemo(() => {
    if (admin || !evidenticar) {
      return state.equipment;
    }
    return state.equipment.filter((row) => equipmentMatchesScope(row, state, user));
  }, [state, admin, evidenticar, user]);

  const relevantEmployees = useMemo(() => {
    if (admin || !evidenticar) {
      return state.employees;
    }
    return state.employees.filter((row) => employeeMatchesScope(row, state, user));
  }, [state, admin, evidenticar, user]);

  const relevantTransfers = useMemo(() => {
    if (admin || !evidenticar) {
      return state.transfers;
    }
    return state.transfers.filter((row) => transferMatchesScope(row, state, user));
  }, [state, admin, evidenticar, user]);

  const totalEquipment = relevantEquipment.length;
  const inWarehouse = relevantEquipment.filter((e) => e.status === 'skladiste').length;
  const assigned = relevantEquipment.filter((e) => e.status === 'zaduzeno').length;
  const decommissioned = relevantEquipment.filter((e) => e.status === 'rashodovano').length;
  const totalEmployees = relevantEmployees.length;
  const totalTransfers = relevantTransfers.length;
  const rawTransfers = relevantTransfers.filter((t) => t.status === 'raw').length;
  const scopeCount = admin ? state.cities.length : scopes.length;
  const assignmentLabels = scopes.map((scope) => formatRegistrarAssignmentLabel(scope, state));
  const myWarehouseIds = new Set(scopes.map((scope) => scope.warehouseId));
  const myWarehouses = state.warehouses.filter((row) => myWarehouseIds.has(row.id));
  const [relocationAlerts, setRelocationAlerts] = useState<AdminRelocationAlerts | null>(null);

  useEffect(() => {
    if (!admin) {
      return;
    }
    void fetchAdminRelocationAlertsApi()
      .then(setRelocationAlerts)
      .catch(() => setRelocationAlerts(null));
  }, [admin]);

  const stats = [
    { label: 'Ukupno opreme', value: totalEquipment, icon: <Package size={24} />, color: 'bg-blue-500' },
    { label: 'Na skladištu', value: inWarehouse, icon: <Package size={24} />, color: 'bg-indigo-500' },
    { label: 'Zaduženo', value: assigned, icon: <ArrowLeftRight size={24} />, color: 'bg-green-500' },
    { label: 'Rashodovano', value: decommissioned, icon: <AlertTriangle size={24} />, color: 'bg-red-500' },
    { label: 'Radnici', value: totalEmployees, icon: <Users size={24} />, color: 'bg-purple-500' },
    { label: 'Dodjele', value: scopeCount, icon: <MapPin size={24} />, color: 'bg-teal-500' },
    { label: 'Ukupno prenosa', value: totalTransfers, icon: <ArrowLeftRight size={24} />, color: 'bg-orange-500' },
    { label: 'Čeka potpis', value: rawTransfers, icon: <Clock size={24} />, color: rawTransfers > 0 ? 'bg-yellow-500' : 'bg-gray-400' },
  ];

  const parentCategories = getParentCategories();
  const categoryStats = parentCategories.map((parent) => {
    const subCats = getSubCategories(parent.id);
    const useScope = evidenticar && !admin;
    const parentStats = getEquipmentStats(parent.id, useScope);
    return {
      parent,
      stats: parentStats,
      subCategories: subCats.map((sub) => ({
        category: sub,
        stats: getEquipmentStats(sub.id, useScope),
      })),
    };
  });

  const recentTransfers = [...relevantTransfers]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {admin ? 'Kontrolna tabla' : 'Kontrolna tabla - Evidencija'}
        </h1>
        <p className="text-gray-500 mt-1">
          {admin
            ? 'Pregled ukupnog stanja opreme i zaduženja'
            : `Pregled stanja za ${assignmentLabels.length} dodjela (skladište + kategorija)`}
        </p>
      </div>
      {evidenticar && !admin && assignmentLabels.length === 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-sm text-amber-900">
            Nemate dodijeljenih skladišta ni kategorija. Kontaktirajte administratora da vam dodijeli opseg rada.
          </p>
        </div>
      )}
      {evidenticar && !admin && assignmentLabels.length > 0 && (
        <div className="mb-6 bg-purple-50 border border-purple-100 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-purple-800">Moje dodjele (evidentičar)</p>
          <div className="flex flex-wrap gap-2">
            {assignmentLabels.map((label) => (
              <span
                key={label}
                className="text-xs bg-white text-purple-700 px-2 py-1 rounded-lg border border-purple-100"
              >
                {label}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {onNavigate ? (
              <>
                <button
                  type="button"
                  onClick={() => onNavigate('equipment')}
                  className="text-xs font-medium text-purple-800 underline"
                >
                  Oprema u mom skladištu
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('transfers')}
                  className="text-xs font-medium text-purple-800 underline"
                >
                  Zaduženja
                </button>
                {inventoryCountEnabled ? (
                  <button
                    type="button"
                    onClick={() => onNavigate('inventory-count')}
                    className="text-xs font-medium text-purple-800 underline"
                  >
                    Popis (pregled)
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
          {myWarehouses.length > 0 ? (
            <p className="text-xs text-purple-700">
              Skladišta: {myWarehouses.map((row) => row.name).join(', ')}
            </p>
          ) : null}
        </div>
      )}
      {admin && relocationAlerts ? (
        <div className="mb-6 grid lg:grid-cols-2 gap-4">
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-amber-900 flex items-center gap-2">
              <AlertTriangle size={16} />
              Relocation i evidentičari
            </h2>
            <p className="text-sm text-amber-800 mt-2">
              Otvorenih case-ova: <strong>{relocationAlerts.openCases}</strong> · Čeka prihvat na cilju:{' '}
              <strong>{relocationAlerts.pendingDest}</strong>
            </p>
            {onNavigate && relocationAlerts.openCases > 0 ? (
              <button
                type="button"
                className="text-xs font-medium text-amber-900 underline mt-2"
                onClick={() => onNavigate('employee-relocation')}
              >
                Otvori akcije
              </button>
            ) : null}
          </div>
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 max-h-40 overflow-auto">
            <h2 className="text-sm font-semibold text-red-900">Glavne kategorije bez evidentičara</h2>
            {relocationAlerts.missingRegistrars.length === 0 ? (
              <p className="text-sm text-red-800 mt-2">Sve aktivne kombinacije imaju evidentičara.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-red-800">
                {relocationAlerts.missingRegistrars.slice(0, 8).map((row) => (
                  <li key={`${row.warehouseId}:${row.categoryId}`}>
                    {row.warehouseName} — {row.categoryName}
                  </li>
                ))}
                {relocationAlerts.missingRegistrars.length > 8 ? (
                  <li>… i još {relocationAlerts.missingRegistrars.length - 8}</li>
                ) : null}
              </ul>
            )}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-4">
            <div className={`${stat.color} text-white p-3 rounded-xl`}>{stat.icon}</div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Layers size={20} className="text-blue-600" />
            Oprema po kategorijama
          </h2>
          <div className="space-y-4">
            {categoryStats.map(({ parent, stats: parentStats, subCategories }) => (
              <div key={parent.id}>
                <div className="flex justify-between items-center mb-1">
                  <span className="font-medium text-gray-800">{parent.name}</span>
                  <span className="text-sm text-gray-500">{parentStats.total} kom</span>
                </div>
                {subCategories.length > 0 && (
                  <div className="ml-4 space-y-1">
                    {subCategories.map(({ category, stats: subStats }) => (
                      <div key={category.id} className="flex justify-between text-sm text-gray-600">
                        <span>{category.name}</span>
                        <span>{subStats.total}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <ArrowLeftRight size={20} className="text-orange-600" />
            Nedavni prenosi
          </h2>
          <div className="space-y-3">
            {recentTransfers.map((t) => {
              const eq = state.equipment.find((e) => e.id === t.equipmentId);
              const from = t.fromPersonId ? state.employees.find((e) => e.id === t.fromPersonId) : null;
              const to = t.toPersonId ? state.employees.find((e) => e.id === t.toPersonId) : null;
              return (
                <div key={t.id} className="flex justify-between items-center text-sm border-b border-gray-50 pb-2">
                  <div>
                    <span className="font-mono text-xs text-gray-600">{t.documentNumber}</span>
                    <p className="text-gray-800">{eq?.inventoryNumber}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    {from ? getEmployeeFullName(from) : 'Skladište'} → {to ? getEmployeeFullName(to) : t.toType}
                  </div>
                </div>
              );
            })}
            {recentTransfers.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Nema prenosa</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
