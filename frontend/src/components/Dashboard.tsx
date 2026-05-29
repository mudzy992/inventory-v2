import { useStore } from '../useStore';
import { isAdmin, isEvidenticar, getManagedOrgUnitIds, getEquipmentStats, getParentCategories, getSubCategories } from '../store';
import { Package, Users, ArrowLeftRight, AlertTriangle, Building2, Layers, Clock } from 'lucide-react';
import { getEmployeeFullName } from '../helpers';

export function Dashboard() {
  const [state] = useStore();
  const admin = isAdmin();
  const evidenticar = isEvidenticar();
  const managedOrgUnitIds = getManagedOrgUnitIds();

  // Filter data based on role
  const relevantEquipment = (admin || !evidenticar) 
    ? state.equipment 
    : state.equipment.filter(e => {
        if (e.status === 'skladiste') return true;
        if (!e.currentHolderId) return true;
        const holder = state.employees.find(emp => emp.id === e.currentHolderId);
        return holder && managedOrgUnitIds.includes(holder.orgUnitId);
      });

  const relevantEmployees = (admin || !evidenticar)
    ? state.employees
    : state.employees.filter(e => managedOrgUnitIds.includes(e.orgUnitId));

  const relevantTransfers = (admin || !evidenticar)
    ? state.transfers
    : state.transfers.filter(t => {
        const eq = state.equipment.find(e => e.id === t.equipmentId);
        if (!eq) return false;
        if (eq.status === 'skladiste') return true;
        if (!eq.currentHolderId) return true;
        const holder = state.employees.find(emp => emp.id === eq.currentHolderId);
        return holder && managedOrgUnitIds.includes(holder.orgUnitId);
      });

  const totalEquipment = relevantEquipment.length;
  const inWarehouse = relevantEquipment.filter(e => e.status === 'skladiste').length;
  const assigned = relevantEquipment.filter(e => e.status === 'zaduzeno').length;
  const decommissioned = relevantEquipment.filter(e => e.status === 'rashodovano').length;
  const totalEmployees = relevantEmployees.length;
  const totalTransfers = relevantTransfers.length;
  const rawTransfers = relevantTransfers.filter(t => t.status === 'raw').length;
  const totalOrgUnits = admin ? state.orgUnits.length : managedOrgUnitIds.length;

  const stats = [
    { label: 'Ukupno opreme', value: totalEquipment, icon: <Package size={24} />, color: 'bg-blue-500' },
    { label: 'Na skladištu', value: inWarehouse, icon: <Package size={24} />, color: 'bg-indigo-500' },
    { label: 'Zaduženo', value: assigned, icon: <ArrowLeftRight size={24} />, color: 'bg-green-500' },
    { label: 'Rashodovano', value: decommissioned, icon: <AlertTriangle size={24} />, color: 'bg-red-500' },
    { label: 'Radnici', value: totalEmployees, icon: <Users size={24} />, color: 'bg-purple-500' },
    { label: 'Org. jedinice', value: totalOrgUnits, icon: <Building2 size={24} />, color: 'bg-teal-500' },
    { label: 'Ukupno prenosa', value: totalTransfers, icon: <ArrowLeftRight size={24} />, color: 'bg-orange-500' },
    { label: 'Čeka potpis', value: rawTransfers, icon: <Clock size={24} />, color: rawTransfers > 0 ? 'bg-yellow-500' : 'bg-gray-400' },
  ];

  // Category stats
  const parentCategories = getParentCategories();
  const categoryStats = parentCategories.map(parent => {
    const subCats = getSubCategories(parent.id);
    const parentStats = getEquipmentStats(parent.id, evidenticar && !admin ? managedOrgUnitIds : undefined);
    
    return {
      parent,
      stats: parentStats,
      subCategories: subCats.map(sub => ({
        category: sub,
        stats: getEquipmentStats(sub.id, evidenticar && !admin ? managedOrgUnitIds : undefined),
      })),
    };
  });

  // Recent transfers
  const recentTransfers = [...relevantTransfers]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  // Managed org units display for evidenticar
  const managedUnits = evidenticar && !admin 
    ? managedOrgUnitIds.map(id => state.orgUnits.find(o => o.id === id)).filter(Boolean)
    : [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {admin ? 'Kontrolna tabla' : 'Kontrolna tabla - Evidencija'}
        </h1>
        <p className="text-gray-500 mt-1">
          {admin 
            ? 'Pregled ukupnog stanja opreme i zaduženja' 
            : `Pregled stanja za ${managedUnits.length} org. jedinica`
          }
        </p>
      </div>

      {/* Evidenticar: Show managed units */}
      {evidenticar && !admin && managedUnits.length > 0 && (
        <div className="mb-6 bg-purple-50 border border-purple-100 rounded-xl p-4">
          <p className="text-sm font-medium text-purple-800 mb-2">Upravljane organizacijske jedinice:</p>
          <div className="flex flex-wrap gap-2">
            {managedUnits.slice(0, 5).map(unit => (
              <span key={unit!.id} className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-lg">
                {unit!.name}
              </span>
            ))}
            {managedUnits.length > 5 && (
              <span className="text-xs text-purple-500">+{managedUnits.length - 5} više</span>
            )}
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex items-center gap-3">
              <div className={`${stat.color} text-white p-2.5 rounded-lg`}>
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Stats */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Layers size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Oprema po kategorijama</h2>
          </div>
          <div className="space-y-4">
            {categoryStats.map(({ parent, stats: parentStats, subCategories }) => (
              <div key={parent.id} className="border border-gray-100 rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                  <span className="font-medium text-sm text-gray-800">{parent.name}</span>
                  <span className="text-xs text-gray-500">Ukupno: {parentStats.total}</span>
                </div>
                <div className="p-3 space-y-2">
                  {subCategories.map(({ category: sub, stats: subStats }) => (
                    <div key={sub.id} className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">{sub.name}</span>
                      <div className="flex gap-2">
                        <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{subStats.total}</span>
                        <span className="bg-green-50 text-green-600 px-1.5 py-0.5 rounded">{subStats.zaduzeno} zaduž.</span>
                        <span className="bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{subStats.skladiste} sklad.</span>
                        {subStats.rawTransfers > 0 && (
                          <span className="bg-yellow-50 text-yellow-600 px-1.5 py-0.5 rounded">{subStats.rawTransfers} ⏳</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {subCategories.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">Nema podkategorija</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transfers */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <ArrowLeftRight size={20} className="text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900">Posljednji prenosi</h2>
          </div>
          <div className="space-y-2">
            {recentTransfers.map(t => {
              const equip = state.equipment.find(e => e.id === t.equipmentId);
              const toPerson = t.toPersonId ? state.employees.find(e => e.id === t.toPersonId) : null;
              const fromPerson = t.fromPersonId ? state.employees.find(e => e.id === t.fromPersonId) : null;
              const cat = equip ? state.categories.find(c => c.id === equip.categoryId) : null;
              
              const typeLabels: Record<string, string> = {
                zaduzenje: 'Zaduženje',
                razduzenje: 'Razduženje',
                rashodovanje: 'Rashodovanje',
                prenos: 'Prenos',
              };
              const typeColors: Record<string, string> = {
                zaduzenje: 'text-green-600',
                razduzenje: 'text-blue-600',
                rashodovanje: 'text-red-600',
                prenos: 'text-orange-600',
              };

              return (
                <div key={t.id} className="flex items-start gap-3 border border-gray-50 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold ${typeColors[t.type] || 'text-gray-600'}`}>
                        {typeLabels[t.type] || t.type}
                      </span>
                      <span className={`text-xs px-1.5 py-0.5 rounded ${t.status === 'raw' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>
                        {t.status === 'raw' ? 'RAW' : 'Potpisan'}
                      </span>
                      {t.isCrossServiceTransfer && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                          Cross-service
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 truncate mt-0.5">
                      {cat?.name} — {equip?.inventoryNumber}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {t.fromType === 'skladiste' ? 'Skladište' : fromPerson ? getEmployeeFullName(fromPerson) : ''}
                      {' → '}
                      {t.toType === 'skladiste' ? 'Skladište' : t.toType === 'rashod' ? 'RASHOD' : toPerson ? getEmployeeFullName(toPerson) : ''}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{t.date}</span>
                </div>
              );
            })}
            {recentTransfers.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-8">Nema evidentiranih prenosa</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
