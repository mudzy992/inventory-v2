import { apiRequest, fetchAuthenticatedBlob } from './client';

export interface WarehouseTransferTemplateMeta {
  id: string;
  label: string;
  isActive: boolean;
  createdAt: string;
  uploadedBy?: { id: string; username: string };
}

export const fetchWarehouseTransferTemplatesApi = (warehouseId: string) =>
  apiRequest<WarehouseTransferTemplateMeta[]>(`/warehouses/${warehouseId}/transfer-templates`);

export const fetchActiveWarehouseTransferTemplateApi = (warehouseId: string) =>
  apiRequest<WarehouseTransferTemplateMeta | null>(
    `/warehouses/${warehouseId}/transfer-template/active`,
  );

export const activateWarehouseTransferTemplateApi = (
  warehouseId: string,
  templateId: string,
) =>
  apiRequest(`/warehouses/${warehouseId}/transfer-template/${templateId}/activate`, {
    method: 'PATCH',
  });

export const downloadWarehouseTransferTemplateApi = async (
  warehouseId: string,
  templateId: string,
  filename: string,
): Promise<void> => {
  const blob = await fetchAuthenticatedBlob(
    `/warehouses/${warehouseId}/transfer-template/${templateId}/download`,
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.docx') ? filename : `${filename}.docx`;
  link.click();
  URL.revokeObjectURL(url);
};

export const uploadWarehouseTransferTemplateApi = (
  warehouseId: string,
  file: File,
  label: string,
): Promise<WarehouseTransferTemplateMeta> => {
  const form = new FormData();
  form.append('file', file);
  form.append('label', label);
  return apiRequest<WarehouseTransferTemplateMeta>(
    `/warehouses/${warehouseId}/transfer-template`,
    { method: 'POST', body: form },
  );
};
