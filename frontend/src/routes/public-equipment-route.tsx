import { Suspense } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { FullScreenRouteFallback } from '../components/ui/route-page-fallback';
import { isEquipmentUuidPath } from './app-routes';
import { LazyPublicEquipmentPage } from './lazy-pages';

export const PublicEquipmentRoute = () => {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  if (!equipmentId || !isEquipmentUuidPath(equipmentId)) {
    return <Navigate to="/" replace />;
  }
  return (
    <Suspense fallback={<FullScreenRouteFallback />}>
      <LazyPublicEquipmentPage equipmentId={equipmentId} />
    </Suspense>
  );
};
