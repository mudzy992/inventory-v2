/** Default vrijednosti za public `features.*` ključeve (usklađeno sa settings.registry.ts). */
export const PUBLIC_FEATURE_DEFAULTS: Record<string, boolean> = {
  'features.dashboard': true,
  'features.organization': true,
  'features.locations': true,
  'features.categories': true,
  'features.user_management': true,
  'features.employees': true,
  'features.evidenticar_employee_ops': true,
  'features.warehouses': true,
  'features.registrar_stock': true,
  'features.registrar_mode_b_custody_pool': true,
  'features.warehouse_inventory': true,
  'features.equipment': true,
  'features.equipment_labels': true,
  'features.transfers': true,
  'features.documents': true,
  'features.disposal_commissions': true,
  'features.disposal_pre_list': true,
  'features.inventory_count': true,
  'features.my_equipment': true,
  'features.qr_scanner': true,
  'features.public_equipment_lookup': true,
  'features.maintenance_parts': true,
  'features.equipment_catalog': true,
  'features.employee_relocation': true,
};

const isExplicitBooleanSetting = (value: string | number | boolean | undefined): boolean =>
  typeof value === 'boolean' || value === 'true' || value === 'false';

export const mergePublicSettingsWithFeatureDefaults = (
  settings: Record<string, string | number | boolean>,
): Record<string, string | number | boolean> => {
  const merged: Record<string, string | number | boolean> = { ...settings };
  for (const [key, defaultValue] of Object.entries(PUBLIC_FEATURE_DEFAULTS)) {
    if (!isExplicitBooleanSetting(merged[key])) {
      merged[key] = defaultValue;
    }
  }
  return merged;
};
