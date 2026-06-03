import { resolveEquipmentCityId } from '../../helpers/registrar-scope';
import type { AppState, Equipment } from '../../types';

export const getCityEquipment = (state: AppState, cityId: string): Equipment[] =>
  state.equipment.filter((item) => {
    if (item.status === 'rashodovano') {
      return false;
    }
    return resolveEquipmentCityId(state, item) === cityId;
  });
