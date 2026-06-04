import { useEffect, useState } from 'react';
import { Package, QrCode } from 'lucide-react';
import { ApiError } from '../api/client';
import { fetchPublicEquipmentApi, type PublicEquipmentDto } from '../api/public-equipment-api';
import { usePublicSettings } from '../contexts/public-settings-context';
import { buildCompanyAddressLine, companyHeaderFromSettings } from '../helpers/company-header.util';
import { getStatusColor, getStatusLabel } from '../helpers';

interface PublicEquipmentPageProps {
  equipmentId: string;
}

export const PublicEquipmentPage = ({ equipmentId }: PublicEquipmentPageProps) => {
  const { settings, getBoolean } = usePublicSettings();
  const lookupEnabled = getBoolean('features.public_equipment_lookup', true);
  const [equipment, setEquipment] = useState<PublicEquipmentDto | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const company = companyHeaderFromSettings(settings);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError('');
      try {
        const data = await fetchPublicEquipmentApi(equipmentId);
        setEquipment(data);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Oprema nije pronađena';
        setError(message);
        setEquipment(null);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [equipmentId, lookupEnabled]);

  if (!lookupEnabled) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 flex items-center justify-center">
        <p className="text-sm text-slate-600 text-center max-w-sm">
          Javni pregled opreme putem QR linka trenutno nije omogućen.
        </p>
      </div>
    );
  }

  const companyLine = buildCompanyAddressLine(company);

  return (
    <div className="min-h-screen bg-slate-50 p-4 flex items-start justify-center">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 text-center">
          {company.name ? (
            <>
              <p className="font-semibold text-slate-900">{company.name}</p>
              {companyLine && <p className="text-xs text-slate-500 mt-1">{companyLine}</p>}
            </>
          ) : (
            <p className="font-semibold text-slate-900 flex items-center justify-center gap-2">
              <QrCode size={18} className="text-blue-600" />
              Inventar
            </p>
          )}
        </div>
        <div className="p-5">
          {isLoading && <p className="text-sm text-slate-500 text-center">Učitavanje...</p>}
          {error && !isLoading && (
            <p className="text-sm text-red-600 text-center bg-red-50 rounded-xl py-3">{error}</p>
          )}
          {equipment && !isLoading && (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Package size={20} className="text-blue-600" />
                </div>
                <div>
                  <h1 className="font-semibold text-slate-900 leading-snug">{equipment.displayName}</h1>
                  <p className="font-mono text-sm text-slate-600 mt-1">{equipment.inventoryNumber}</p>
                  <span
                    className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${getStatusColor(equipment.status)}`}
                  >
                    {getStatusLabel(equipment.status)}
                  </span>
                </div>
              </div>
              <dl className="text-sm space-y-2 border-t border-slate-100 pt-4">
                <div className="flex justify-between gap-4">
                  <dt className="text-slate-500">Kategorija</dt>
                  <dd className="text-slate-900 text-right">{equipment.categoryName}</dd>
                </div>
                {equipment.uniqueField && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-slate-500">{equipment.uniqueField.label}</dt>
                    <dd className="text-slate-900 text-right font-medium">{equipment.uniqueField.value}</dd>
                  </div>
                )}
                {Object.entries(equipment.specifications).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-slate-500">{label}</dt>
                    <dd className="text-slate-900 text-right">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-slate-400 text-center pt-2">Samo pregled — bez akcija</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
