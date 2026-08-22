-- Employee status fields + deactivation notification type

ALTER TABLE `notifications` MODIFY `type` ENUM(
  'transfer_pending',
  'transfer_signed_upload_pending',
  'transfer_complete',
  'equipment_assigned',
  'disposal_pending_approval',
  'disposal_approved',
  'inventory_transfer_upload_pending',
  'inventory_session_closed',
  'disposal_approval_pending',
  'warehouse_stock_received',
  'employee_relocation_action_required',
  'employee_relocation_incoming',
  'employee_relocation_admin_alert',
  'employee_relocation_resolved',
  'inventory_draft_created',
  'inventory_close_blocked',
  'inventory_auto_closed',
  'info',
  'employee_deactivation_equipment_required'
) NOT NULL;

ALTER TABLE `employees`
  ADD COLUMN `staffNumber` VARCHAR(50) NULL,
  ADD COLUMN `gender` ENUM('male', 'female') NOT NULL DEFAULT 'male',
  ADD COLUMN `isActive` BOOLEAN NOT NULL DEFAULT true;

CREATE UNIQUE INDEX `employees_staffNumber_key` ON `employees`(`staffNumber`);
