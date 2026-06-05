import type { AvailabilityStatus } from '../../hooks/use-equipment-availability';

export const AvailabilityHint = ({ status }: { status: AvailabilityStatus }) => {
  if (status === 'checking') {
    return <p className="text-[11px] text-gray-400 mt-1">Provjera dostupnosti…</p>;
  }
  if (status === 'available') {
    return <p className="text-[11px] text-green-600 mt-1">Dostupan — nije u upotrebi.</p>;
  }
  if (status === 'taken') {
    return <p className="text-[11px] text-red-600 mt-1">Već postoji u aplikaciji.</p>;
  }
  return null;
};
