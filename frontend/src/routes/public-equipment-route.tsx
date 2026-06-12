import { Navigate, useParams } from 'react-router-dom';
import { PublicEquipmentPage } from '../components/public-equipment-page';
import { isEquipmentUuidPath } from './app-routes';

export const PublicEquipmentRoute = () => {
  const { equipmentId } = useParams<{ equipmentId: string }>();
  if (!equipmentId || !isEquipmentUuidPath(equipmentId)) {
    return <Navigate to="/" replace />;
  }
  return <PublicEquipmentPage equipmentId={equipmentId} />;
};
