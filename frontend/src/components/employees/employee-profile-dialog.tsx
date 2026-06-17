import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  ExternalLink,
  Mail,
  Package,
  Phone,
  Shield,
  User,
} from 'lucide-react';
import { fetchEmployeeProfileApi, type EmployeeProfile } from '../../api/employees-api';
import { ApiError } from '../../api/client';
import { getOrgUnitPath, getStatusColor, getStatusLabel } from '../../helpers';
import { PAGE_PATHS } from '../../routes/app-routes';
import type { OrgUnit } from '../../types';
import { ModalRoot } from '../ui/modal-root';
import { ModalBody, ModalFooter, ModalHeader } from '../ui/modal-layout';
import { Button } from '../ui/button';

interface EmployeeProfileDialogProps {
  employeeId: string | null;
  orgUnits: OrgUnit[];
  isAdmin: boolean;
  onClose: () => void;
  onEdit?: (employeeId: string) => void;
  onOpenEquipment?: (equipmentId: string) => void;
}

const getInitials = (firstName: string, lastName: string): string =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

const ProfileSkeleton = () => (
  <div className="space-y-5 animate-pulse">
    <div className="flex items-start gap-4">
      <div className="h-14 w-14 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-2">
        <div className="h-6 w-48 rounded bg-gray-200" />
        <div className="h-4 w-32 rounded bg-gray-100" />
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="h-16 rounded-lg bg-gray-100" />
      <div className="h-16 rounded-lg bg-gray-100" />
    </div>
    <div className="h-20 rounded-lg bg-gray-100" />
    <div className="space-y-2">
      <div className="h-4 w-36 rounded bg-gray-200" />
      <div className="h-24 rounded-lg bg-gray-100" />
    </div>
  </div>
);

export const EmployeeProfileDialog = ({
  employeeId,
  orgUnits,
  isAdmin,
  onClose,
  onEdit,
  onOpenEquipment,
}: EmployeeProfileDialogProps) => {
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadProfile = useCallback(async () => {
    if (!employeeId) {
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchEmployeeProfileApi(employeeId);
      setProfile(data);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Greška pri učitavanju profila';
      setError(message);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    if (employeeId) {
      void loadProfile();
    } else {
      setProfile(null);
      setError('');
    }
  }, [employeeId, loadProfile]);

  const employee = profile?.employee;
  const orgPath = employee ? getOrgUnitPath(orgUnits, employee.orgUnitId) : '';

  return (
    <ModalRoot
      open={Boolean(employeeId)}
      onClose={onClose}
      size="lg"
      panelClassName="bg-white shadow-xl border border-gray-100"
      enableEscape
      closeOnBackdrop
    >
      <ModalHeader title="Profil radnika" onClose={onClose} />
      <ModalBody className="space-y-5">
        {loading ? (
          <ProfileSkeleton />
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : employee ? (
          <>
            <div className="rounded-xl border border-gray-100 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-600 text-lg font-semibold text-white shadow-sm">
                  {getInitials(employee.firstName, employee.lastName)}
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xl font-semibold text-gray-900">
                    {employee.firstName} {employee.lastName}
                  </h4>
                  <p className="text-sm text-gray-600">{employee.title || '—'}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {employee.hasUserAccount ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-100">
                        <User size={12} />
                        Korisnički nalog
                      </span>
                    ) : null}
                    {employee.isOrgSigner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-800 ring-1 ring-violet-100">
                        <Shield size={12} />
                        Potpisnik OJ
                      </span>
                    ) : null}
                    {(employee.openRelocationCount ?? 0) > 0 ? (
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-100">
                        Relokacija u toku ({employee.openRelocationCount})
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Email</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-800">
                  <Mail size={14} className="text-gray-400" />
                  {employee.email || '—'}
                </p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Telefon</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-800">
                  <Phone size={14} className="text-gray-400" />
                  {employee.phone || '—'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Org. jedinica</p>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-gray-800">
                <Building2 size={14} className="mt-0.5 shrink-0 text-gray-400" />
                <span>{orgPath || '—'}</span>
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-center shadow-sm">
                <p className="text-lg font-semibold text-gray-900">{employee.heldEquipmentCount ?? 0}</p>
                <p className="text-xs text-gray-500">Zadužena oprema</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-center shadow-sm">
                <p className="text-lg font-semibold text-gray-900">{employee.signedTransferCount ?? 0}</p>
                <p className="text-xs text-gray-500">Potpisane prenosnice</p>
              </div>
              <div className="rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-center shadow-sm col-span-2 sm:col-span-1">
                <p className="text-lg font-semibold text-gray-900">{employee.openRelocationCount ?? 0}</p>
                <p className="text-xs text-gray-500">Otvorene relokacije</p>
              </div>
            </div>

            {profile.user && isAdmin ? (
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-800">Povezani korisnik</p>
                <p className="mt-1 text-sm text-blue-950">{profile.user.email}</p>
                <p className="text-xs text-blue-700">Uloga: {profile.user.role}</p>
                <Link
                  to={PAGE_PATHS['user-management']}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
                >
                  Upravljanje korisnicima
                  <ExternalLink size={12} />
                </Link>
              </div>
            ) : null}

            <div>
              <h5 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-800">
                <Package size={14} />
                Zadužena oprema
                {profile.heldEquipmentTotal > profile.heldEquipment.length ? (
                  <span className="text-xs font-normal text-gray-500">
                    (prikazano {profile.heldEquipment.length} od {profile.heldEquipmentTotal})
                  </span>
                ) : null}
              </h5>
              {profile.heldEquipment.length === 0 ? (
                <p className="text-sm text-gray-500 rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center">
                  Nema aktivno zadužene opreme.
                </p>
              ) : (
                <ul className="space-y-2">
                  {profile.heldEquipment.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onOpenEquipment?.(item.id)}
                        className="flex w-full items-start justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-3 text-left shadow-sm transition-colors hover:border-blue-100 hover:bg-blue-50/30"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          {item.lotName ? (
                            <p className="text-sm font-medium text-gray-900 truncate">{item.lotName}</p>
                          ) : null}
                          <p className="text-xs text-gray-500">{item.categoryName}</p>
                          <p className="font-mono text-sm font-bold text-gray-900">{item.inventoryNumber}</p>
                          {item.serialNumber ? (
                            <p className="text-xs text-gray-600">
                              Serijski: <span className="font-medium text-gray-800">{item.serialNumber}</span>
                            </p>
                          ) : null}
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${getStatusColor(item.status)}`}>
                          {getStatusLabel(item.status)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>
          Zatvori
        </Button>
        {isAdmin && employee && onEdit ? (
          <Button
            onClick={() => {
              onEdit(employee.id);
              onClose();
            }}
          >
            Uredi radnika
          </Button>
        ) : null}
      </ModalFooter>
    </ModalRoot>
  );
};
