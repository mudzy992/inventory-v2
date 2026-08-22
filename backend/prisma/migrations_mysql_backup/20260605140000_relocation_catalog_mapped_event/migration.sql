-- Add catalog_mapped audit action for employee relocation

ALTER TABLE `employee_relocation_events` MODIFY `action` ENUM(
  'case_opened',
  'source_transfer',
  'source_discharge',
  'dest_accepted',
  'dest_rejected',
  'case_resolved',
  'case_cancelled',
  'superseded',
  'catalog_mapped'
) NOT NULL;
