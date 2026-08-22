-- Drop legacy transfer-based disposal voting (replaced by DisposalInventoryApproval)
DROP TABLE IF EXISTS `disposal_approval_votes`;
DROP TABLE IF EXISTS `disposal_approvals`;
