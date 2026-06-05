import { useMemo, useState } from 'react';
import { useStore } from '../useStore';
import { getCurrentUser } from '../store';
import { Package, Monitor, Laptop, Printer as PrinterIcon, Smartphone, QrCode, History, ChevronRight, Building2, Mail, User, Calendar } from 'lucide-react';
import { LabelPrintSheet } from './LabelPrintSheet';
import { getOrgUnitPath, formatDate, getStatusLabel, getStatusColor } from '../helpers';
import { EquipmentCard } from './EquipmentCard';
import { EmptyState } from './ui/empty-state';

export function MyEquipmentPage() {
  const [state] = useStore();
  const currentUser = getCurrentUser();
  const [selectedEquipId, setSelectedEquipId] = useState<string | null>(null);
  const [showLabels, setShowLabels] = useState(false);

  const employee = currentUser
    ? state.employees.find((e) => e.id === currentUser.employeeId)
    : undefined;

  const myEquipment = employee
    ? state.equipment.filter(
        (e) => e.currentHolderId === employee.id && e.status === 'zaduzeno',
      )
    : [];

  const equipmentByCategory = useMemo(() => {
    const groups = new Map<string, typeof myEquipment>();
    for (const item of myEquipment) {
      const category = state.categories.find((row) => row.id === item.categoryId);
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

  if (!employee) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <EmptyState message="Nalog nije povezan s radnikom. Kontaktirajte administratora da poveže vaš korisnički nalog s evidencijom radnika." />
      </div>
    );
  }

  const orgUnit = state.orgUnits.find((o) => o.id === employee.orgUnitId);

  const myTransfers = state.transfers
    .filter((t) => t.toPersonId === employee.id || t.fromPersonId === employee.id)
    .sort((a, b) => b.date.localeCompare(a.date));

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
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 mb-6 text-white">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center text-3xl font-bold backdrop-blur-sm">
            {employee.firstName[0]}{employee.lastName[0]}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{employee.firstName} {employee.lastName}</h1>
            <p className="text-blue-100 flex items-center gap-2 mt-1">
              <User size={14} /> {employee.title}
            </p>
            <p className="text-blue-100 flex items-center gap-2 mt-0.5">
              <Building2 size={14} /> {orgUnit ? getOrgUnitPath(state.orgUnits, orgUnit.id) : '—'}
            </p>
            {employee.email && (
              <p className="text-blue-100 flex items-center gap-2 mt-0.5">
                <Mail size={14} /> {employee.email}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="bg-white/20 rounded-xl px-4 py-3 backdrop-blur-sm">
              <p className="text-3xl font-bold">{myEquipment.length}</p>
              <p className="text-sm text-blue-100">Zaduženo</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
              <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Package size={20} className="text-blue-500" />
                Moja zadužena oprema
              </h2>
              {myEquipment.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLabels(true)}
                  className="flex items-center gap-1.5 text-sm border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  <PrinterIcon size={14} /> Štampaj naljepnice
                </button>
              )}
            </div>

            {myEquipment.length > 0 ? (
              <div className="space-y-3">
                {myEquipment.map((eq) => {
                  const cat = state.categories.find((c) => c.id === eq.categoryId);
                  const lastTransfer = state.transfers
                    .filter((t) => t.equipmentId === eq.id && t.toPersonId === employee.id)
                    .sort((a, b) => b.date.localeCompare(a.date))[0];

                  return (
                    <div
                      key={eq.id}
                      className="border border-gray-100 rounded-xl p-4 hover:border-blue-200 hover:bg-blue-50/50 transition-all cursor-pointer group"
                      onClick={() => setSelectedEquipId(eq.id)}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                          {getCategoryIcon(eq.categoryId)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">{cat?.name}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(eq.status)}`}>
                              {getStatusLabel(eq.status)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 font-mono">{eq.inventoryNumber}</p>
                          {lastTransfer && (
                            <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                              <Calendar size={10} /> Zaduženo: {formatDate(lastTransfer.date)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                            title="Prikaži QR kod"
                            onClick={(e) => { e.stopPropagation(); setSelectedEquipId(eq.id); }}
                          >
                            <QrCode size={18} />
                          </button>
                          <ChevronRight size={18} className="text-gray-300 group-hover:text-blue-500 transition-colors" />
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {cat && cat.fields.slice(0, 4).map((f) => {
                          const val = eq.specifications[f.id];
                          if (!val) return null;
                          return (
                            <span key={f.id} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-lg">
                              {f.name}: <span className="font-medium">{val}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400">
                <Package size={48} className="mx-auto mb-3 opacity-30" />
                <p>Nemate zadužene opreme</p>
              </div>
            )}
          </div>
          {myEquipment.length > 0 ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
              <h2 className="text-lg font-semibold text-gray-800 mb-4">Pregled po kategorijama (popis)</h2>
              <div className="space-y-6">
                {equipmentByCategory.map(([categoryName, items]) => (
                  <div key={categoryName}>
                    <h3 className="text-sm font-medium text-gray-700 border-b border-gray-100 pb-1 mb-2">
                      {categoryName}
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 text-gray-600">
                          <tr>
                            <th className="text-left px-2 py-1 font-medium">Inv. broj</th>
                            <th className="text-left px-2 py-1 font-medium">Naziv</th>
                            <th className="text-center px-2 py-1 font-medium w-10">Kol.</th>
                            <th className="text-left px-2 py-1 font-medium w-20">Potpis</th>
                            <th className="text-left px-2 py-1 font-medium">Napomena</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.map((item) => {
                            const category = state.categories.find((row) => row.id === item.categoryId);
                            return (
                              <tr key={item.id} className="border-t border-gray-50">
                                <td className="px-2 py-1.5 font-mono">{item.inventoryNumber}</td>
                                <td className="px-2 py-1.5">{category?.name ?? '—'}</td>
                                <td className="px-2 py-1.5 text-center">1</td>
                                <td className="px-2 py-1.5" />
                                <td className="px-2 py-1.5" />
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <History size={20} className="text-orange-500" />
              Moja historija
            </h2>

            {myTransfers.length > 0 ? (
              <div className="space-y-3">
                {myTransfers.slice(0, 10).map((t) => {
                  const eq = state.equipment.find((e) => e.id === t.equipmentId);
                  const cat = eq ? state.categories.find((c) => c.id === eq.categoryId) : null;
                  const isIncoming = t.toPersonId === employee.id;

                  return (
                    <div key={t.id} className="border-l-2 border-gray-100 pl-3 py-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isIncoming ? 'bg-green-500' : 'bg-orange-500'}`} />
                        <span className="text-xs font-medium text-gray-600">
                          {isIncoming ? 'Primljeno' : 'Predato'}
                        </span>
                        <span className="text-xs text-gray-400">{formatDate(t.date)}</span>
                      </div>
                      <p className="text-sm text-gray-800 mt-0.5">{cat?.name}</p>
                      <p className="text-xs text-gray-400 font-mono">{eq?.inventoryNumber}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8 text-sm">Nema historije</p>
            )}
          </div>
        </div>
      </div>

      {showLabels && (
        <LabelPrintSheet
          items={myEquipment}
          categories={state.categories}
          onClose={() => setShowLabels(false)}
        />
      )}

      {selectedEquipId && (
        <EquipmentCard
          equipmentId={selectedEquipId}
          onClose={() => setSelectedEquipId(null)}
          showTransferActions={false}
        />
      )}
    </div>
  );
}
