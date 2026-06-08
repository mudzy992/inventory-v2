import { FileText, Package, Bell, ClipboardList, AlertTriangle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const NOTIFICATION_TYPE_META: Record<string, { icon: LucideIcon; label: string }> = {
  transfer_pending: { icon: FileText, label: 'Prenos' },
  transfer_signed_upload_pending: { icon: FileText, label: 'PDF prenosnica' },
  transfer_complete: { icon: FileText, label: 'Prenos završen' },
  equipment_assigned: { icon: Package, label: 'Zaduženje' },
  inventory_transfer_upload_pending: { icon: ClipboardList, label: 'Popis — upload' },
  inventory_session_closed: { icon: ClipboardList, label: 'Popis zatvoren' },
  warehouse_stock_received: { icon: Package, label: 'Skladište' },
  employee_relocation_admin_alert: { icon: AlertTriangle, label: 'Org. promjena' },
  employee_relocation_action_required: { icon: ClipboardList, label: 'Org. promjena' },
  employee_relocation_incoming: { icon: Package, label: 'Org. promjena' },
};

export const getNotificationTypeMeta = (type: string) =>
  NOTIFICATION_TYPE_META[type] ?? { icon: Bell, label: 'Obavijest' };
