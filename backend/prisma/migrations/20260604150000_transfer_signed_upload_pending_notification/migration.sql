-- Transfer signed PDF upload reminder (RAW transfers)
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
  'info'
) NOT NULL;
