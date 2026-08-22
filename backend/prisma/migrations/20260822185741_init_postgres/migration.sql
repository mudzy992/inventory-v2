-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'moderator', 'evidenticar', 'popis_koordinator', 'user', 'skladistar');

-- CreateEnum
CREATE TYPE "OrgUnitType" AS ENUM ('direkcija', 'distribucija', 'podrucje', 'podruznica', 'poslovna_jedinica', 'sektor', 'sluzba', 'odjeljenje');

-- CreateEnum
CREATE TYPE "EquipmentStatus" AS ENUM ('skladiste', 'zaduzeno', 'za_rashod', 'rashodovano');

-- CreateEnum
CREATE TYPE "EquipmentAffiliation" AS ENUM ('distribucija', 'snabdjevanje');

-- CreateEnum
CREATE TYPE "WarehouseCondition" AS ENUM ('na_skladistu', 'spremno_za_unistenje', 'unisteno');

-- CreateEnum
CREATE TYPE "EquipmentEventAction" AS ENUM ('unisteno', 'reaktivirano');

-- CreateEnum
CREATE TYPE "EquipmentDisposalListStatus" AS ENUM ('listed', 'withdrawn', 'assigned', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "TransferType" AS ENUM ('zaduzenje', 'razduzenje', 'rashodovanje', 'prenos');

-- CreateEnum
CREATE TYPE "TransferPartyType" AS ENUM ('skladiste', 'osoba');

-- CreateEnum
CREATE TYPE "TransferToType" AS ENUM ('skladiste', 'osoba', 'rashod');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('raw', 'printed', 'uploaded', 'potpisan', 'cancelled');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('transfer_pending', 'transfer_signed_upload_pending', 'transfer_complete', 'equipment_assigned', 'disposal_pending_approval', 'disposal_approved', 'inventory_transfer_upload_pending', 'inventory_session_closed', 'disposal_approval_pending', 'warehouse_stock_received', 'employee_relocation_action_required', 'employee_relocation_incoming', 'employee_relocation_admin_alert', 'employee_relocation_resolved', 'inventory_draft_created', 'inventory_close_blocked', 'inventory_auto_closed', 'info', 'employee_deactivation_equipment_required');

-- CreateEnum
CREATE TYPE "EmployeeGender" AS ENUM ('male', 'female');

-- CreateEnum
CREATE TYPE "EmployeeRelocationCaseStatus" AS ENUM ('open', 'resolved', 'cancelled');

-- CreateEnum
CREATE TYPE "EmployeeRelocationLineStatus" AS ENUM ('pending_source', 'pending_dest', 'accepted', 'rejected', 'discharged');

-- CreateEnum
CREATE TYPE "EmployeeRelocationSourceAction" AS ENUM ('transfer', 'discharge');

-- CreateEnum
CREATE TYPE "EmployeeRelocationEventAction" AS ENUM ('case_opened', 'source_transfer', 'source_discharge', 'dest_accepted', 'dest_rejected', 'case_resolved', 'case_cancelled', 'superseded', 'catalog_mapped');

-- CreateEnum
CREATE TYPE "WarehouseStockLotStatus" AS ENUM ('ceka_specifikaciju', 'spremno_za_izdavanje', 'zatvoreno');

-- CreateEnum
CREATE TYPE "CategoryKind" AS ENUM ('ASSET', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "WarehouseStockLotKind" AS ENUM ('ISSUABLE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "InstalledPartStatus" AS ENUM ('active', 'faulty', 'removed');

-- CreateEnum
CREATE TYPE "InstalledPartEventAction" AS ENUM ('installed', 'marked_faulty', 'removed', 'replaced');

-- CreateEnum
CREATE TYPE "InventoryWarehouseLineStatus" AS ENUM ('prisutna', 'nije_prisutna', 'ostecena');

-- CreateEnum
CREATE TYPE "SettingScope" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "SettingValueType" AS ENUM ('string', 'number', 'boolean');

-- CreateEnum
CREATE TYPE "UploadEntityType" AS ENUM ('transfer', 'equipment', 'other');

-- CreateEnum
CREATE TYPE "DisposalMemberRole" AS ENUM ('predsjednik', 'clan');

-- CreateEnum
CREATE TYPE "InventorySessionStatus" AS ENUM ('draft', 'active', 'closing', 'closed');

-- CreateEnum
CREATE TYPE "InventoryLineStatus" AS ENUM ('prisutna', 'ostecena', 'promjena_lokacije', 'nije_prisutna', 'predlozen_rashod');

-- CreateEnum
CREATE TYPE "DisposalInventoryApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "InventoryRelocationTarget" AS ENUM ('skladiste', 'osoba');

-- CreateEnum
CREATE TYPE "InventoryLineEventAction" AS ENUM ('create', 'update');

-- CreateEnum
CREATE TYPE "InventoryPendingActionKind" AS ENUM ('mark_present', 'mark_damaged', 'mark_missing', 'relocate_to_warehouse', 'relocate_to_person', 'disposal');

-- CreateEnum
CREATE TYPE "InventoryPendingActionStatus" AS ENUM ('pending', 'running', 'applied', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "InventorySessionCloseJobStatus" AS ENUM ('queued', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "cantons" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "code" VARCHAR(32),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cantons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cities" (
    "id" TEXT NOT NULL,
    "cantonId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT,
    "firstName" VARCHAR(120),
    "lastName" VARCHAR(120),
    "email" VARCHAR(255),
    "username" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registrar_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registrar_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_coordinator_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_coordinator_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderator_org_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderator_org_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderator_warehouse_assignments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderator_warehouse_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "firstName" VARCHAR(120) NOT NULL,
    "lastName" VARCHAR(120) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "staffNumber" VARCHAR(50),
    "gender" "EmployeeGender" NOT NULL DEFAULT 'male',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_units" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "type" "OrgUnitType" NOT NULL,
    "parentId" TEXT,
    "signerId" TEXT,
    "effectiveSignerId" TEXT,
    "locationCityId" TEXT,
    "effectiveLocationCityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "cityId" TEXT NOT NULL,
    "orgUnitId" TEXT,
    "address" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_transfer_templates" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "templatePath" VARCHAR(500) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_transfer_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_document_sequences" (
    "warehouseId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "rashodLastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "transfer_document_sequences_pkey" PRIMARY KEY ("warehouseId","year","month")
);

-- CreateTable
CREATE TABLE "warehouse_keepers" (
    "warehouseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "warehouse_keepers_pkey" PRIMARY KEY ("warehouseId","userId")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "parentId" TEXT,
    "categoryKind" "CategoryKind" NOT NULL DEFAULT 'ASSET',
    "fields" JSONB NOT NULL,
    "optionalFields" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_catalog_items" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "categoryId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_maintenance_links" (
    "id" TEXT NOT NULL,
    "hostCategoryId" TEXT NOT NULL,
    "maintenanceCategoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_maintenance_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "stockLotId" TEXT,
    "inventoryNumber" VARCHAR(120),
    "isAccountingTracked" BOOLEAN NOT NULL DEFAULT true,
    "affiliation" "EquipmentAffiliation" NOT NULL DEFAULT 'distribucija',
    "specifications" JSONB NOT NULL,
    "status" "EquipmentStatus" NOT NULL,
    "contractNumber" VARCHAR(120),
    "entryDate" DATE NOT NULL,
    "currentHolderId" TEXT,
    "warehouseId" TEXT,
    "warehouseCondition" "WarehouseCondition",
    "custodyOrgUnitId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_stock_lots" (
    "id" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "lotKind" "WarehouseStockLotKind" NOT NULL DEFAULT 'ISSUABLE',
    "productName" VARCHAR(255) NOT NULL,
    "incomingRelocation" BOOLEAN NOT NULL DEFAULT false,
    "quantityReceived" INTEGER NOT NULL,
    "quantityOnHand" INTEGER NOT NULL,
    "status" "WarehouseStockLotStatus" NOT NULL,
    "specifications" JSONB NOT NULL DEFAULT '{}',
    "contractNumber" VARCHAR(120),
    "entryDate" DATE NOT NULL,
    "notes" TEXT,
    "receivedByUserId" TEXT NOT NULL,
    "specDefinedByUserId" TEXT,
    "specDefinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouse_stock_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouse_stock_lot_receipts" (
    "id" TEXT NOT NULL,
    "stockLotId" TEXT NOT NULL,
    "quantityReceived" INTEGER NOT NULL,
    "quantityRemaining" INTEGER NOT NULL,
    "entryDate" DATE NOT NULL,
    "contractNumber" VARCHAR(120),
    "notes" TEXT,
    "receivedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_stock_lot_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_installed_parts" (
    "id" TEXT NOT NULL,
    "hostEquipmentId" TEXT NOT NULL,
    "stockLotId" TEXT,
    "maintenanceCategoryId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "legacySpecs" JSONB NOT NULL DEFAULT '{}',
    "status" "InstalledPartStatus" NOT NULL DEFAULT 'active',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "notes" TEXT,
    "installedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_installed_parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_installed_part_events" (
    "id" TEXT NOT NULL,
    "installedPartId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "InstalledPartEventAction" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_installed_part_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_events" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "EquipmentEventAction" NOT NULL,
    "fromCondition" "WarehouseCondition",
    "toCondition" "WarehouseCondition" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "equipment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "type" "TransferType" NOT NULL,
    "fromType" "TransferPartyType" NOT NULL,
    "fromPersonId" TEXT,
    "fromWarehouseId" TEXT,
    "toType" "TransferToType" NOT NULL,
    "toPersonId" TEXT,
    "toWarehouseId" TEXT,
    "signerId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "finalizedByUserId" TEXT,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "status" "TransferStatus" NOT NULL,
    "scannedDocUrl" VARCHAR(500),
    "printedAt" TIMESTAMP(3),
    "documentNumber" VARCHAR(120) NOT NULL,
    "documentWarehouseId" TEXT,
    "generatedDocxPath" VARCHAR(500),
    "generatedPdfPath" VARCHAR(500),
    "notes" TEXT,
    "manualPreuzeoLabel" VARCHAR(255),
    "isCrossServiceTransfer" BOOLEAN NOT NULL DEFAULT false,
    "inventoryLineId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposal_commissions" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disposal_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment_disposal_list_items" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "EquipmentDisposalListStatus" NOT NULL DEFAULT 'listed',
    "note" TEXT,
    "markedByUserId" TEXT NOT NULL,
    "markedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnByUserId" TEXT,
    "withdrawnAt" TIMESTAMP(3),
    "withdrawalNote" TEXT,
    "razduzenjeTransferId" TEXT,
    "disposalCommissionId" TEXT,
    "approvalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_disposal_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposal_inventory_approvals" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "disposalCommissionId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "inventoryLineId" TEXT,
    "status" "DisposalInventoryApprovalStatus" NOT NULL DEFAULT 'pending',
    "reviewedByUserId" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "disposal_inventory_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disposal_commission_members" (
    "commissionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "DisposalMemberRole" NOT NULL,

    CONSTRAINT "disposal_commission_members_pkey" PRIMARY KEY ("commissionId","employeeId")
);

-- CreateTable
CREATE TABLE "inventory_committees" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "categoryId" TEXT NOT NULL,
    "name" VARCHAR(255),
    "disposalCommissionId" TEXT,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "membersConfigured" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_committee_members" (
    "committeeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "DisposalMemberRole" NOT NULL,

    CONSTRAINT "inventory_committee_members_pkey" PRIMARY KEY ("committeeId","employeeId")
);

-- CreateTable
CREATE TABLE "inventory_sessions" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "orgUnitId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "startDate" DATE,
    "endDate" DATE,
    "status" "InventorySessionStatus" NOT NULL DEFAULT 'draft',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_lines" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "status" "InventoryLineStatus" NOT NULL,
    "note" TEXT,
    "relocationTargetType" "InventoryRelocationTarget",
    "relocationWarehouseId" TEXT,
    "relocationToPersonId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_pending_actions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "inventoryLineId" TEXT NOT NULL,
    "kind" "InventoryPendingActionKind" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "InventoryPendingActionStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_pending_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_session_close_jobs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "InventorySessionCloseJobStatus" NOT NULL DEFAULT 'queued',
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "appliedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_session_close_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_line_events" (
    "id" TEXT NOT NULL,
    "inventoryLineId" TEXT,
    "committeeId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" "InventoryLineEventAction" NOT NULL,
    "fromStatus" "InventoryLineStatus",
    "toStatus" "InventoryLineStatus" NOT NULL,
    "fromNote" TEXT,
    "toNote" TEXT,
    "fromRelocationTarget" "InventoryRelocationTarget",
    "toRelocationTarget" "InventoryRelocationTarget",
    "fromRelocationWarehouseId" TEXT,
    "toRelocationWarehouseId" TEXT,
    "fromRelocationToPersonId" TEXT,
    "toRelocationToPersonId" TEXT,
    "generatedTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_line_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_warehouse_committees" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_warehouse_committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_warehouse_committee_members" (
    "committeeId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "role" "DisposalMemberRole" NOT NULL,

    CONSTRAINT "inventory_warehouse_committee_members_pkey" PRIMARY KEY ("committeeId","employeeId")
);

-- CreateTable
CREATE TABLE "inventory_warehouse_lines" (
    "id" TEXT NOT NULL,
    "committeeId" TEXT NOT NULL,
    "stockLotId" TEXT NOT NULL,
    "status" "InventoryWarehouseLineStatus" NOT NULL,
    "quantityCounted" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_warehouse_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_relocation_cases" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fromOrgUnitId" TEXT NOT NULL,
    "toOrgUnitId" TEXT NOT NULL,
    "fromWarehouseId" TEXT NOT NULL,
    "toWarehouseId" TEXT NOT NULL,
    "status" "EmployeeRelocationCaseStatus" NOT NULL DEFAULT 'open',
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "employee_relocation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_relocation_lines" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "EmployeeRelocationLineStatus" NOT NULL DEFAULT 'pending_source',
    "sourceAction" "EmployeeRelocationSourceAction",
    "sourceResolvedByUserId" TEXT,
    "destResolvedByUserId" TEXT,
    "destStockLotId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_relocation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_relocation_events" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "lineId" TEXT,
    "actorUserId" TEXT NOT NULL,
    "action" "EmployeeRelocationEventAction" NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_relocation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "relatedId" VARCHAR(36),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_filters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "categoryId" TEXT,
    "filters" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_filters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" VARCHAR(120) NOT NULL,
    "scope" "SettingScope" NOT NULL,
    "valueType" "SettingValueType" NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "uploads" (
    "id" TEXT NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "mime" VARCHAR(120) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "entityType" "UploadEntityType" NOT NULL,
    "entityId" VARCHAR(36),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cities_cantonId_idx" ON "cities"("cantonId");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeId_key" ON "users"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "registrar_assignments_userId_idx" ON "registrar_assignments"("userId");

-- CreateIndex
CREATE INDEX "registrar_assignments_warehouseId_idx" ON "registrar_assignments"("warehouseId");

-- CreateIndex
CREATE INDEX "registrar_assignments_categoryId_idx" ON "registrar_assignments"("categoryId");

-- CreateIndex
CREATE INDEX "registrar_assignments_orgUnitId_idx" ON "registrar_assignments"("orgUnitId");

-- CreateIndex
CREATE INDEX "inventory_coordinator_assignments_userId_idx" ON "inventory_coordinator_assignments"("userId");

-- CreateIndex
CREATE INDEX "inventory_coordinator_assignments_warehouseId_idx" ON "inventory_coordinator_assignments"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_coordinator_assignments_userId_warehouseId_key" ON "inventory_coordinator_assignments"("userId", "warehouseId");

-- CreateIndex
CREATE INDEX "moderator_org_assignments_userId_idx" ON "moderator_org_assignments"("userId");

-- CreateIndex
CREATE INDEX "moderator_org_assignments_orgUnitId_idx" ON "moderator_org_assignments"("orgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "moderator_org_assignments_userId_orgUnitId_key" ON "moderator_org_assignments"("userId", "orgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "moderator_warehouse_assignments_warehouseId_key" ON "moderator_warehouse_assignments"("warehouseId");

-- CreateIndex
CREATE INDEX "moderator_warehouse_assignments_userId_idx" ON "moderator_warehouse_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employees_staffNumber_key" ON "employees"("staffNumber");

-- CreateIndex
CREATE INDEX "employees_orgUnitId_idx" ON "employees"("orgUnitId");

-- CreateIndex
CREATE INDEX "org_units_parentId_idx" ON "org_units"("parentId");

-- CreateIndex
CREATE INDEX "org_units_type_idx" ON "org_units"("type");

-- CreateIndex
CREATE INDEX "org_units_locationCityId_idx" ON "org_units"("locationCityId");

-- CreateIndex
CREATE INDEX "org_units_effectiveLocationCityId_idx" ON "org_units"("effectiveLocationCityId");

-- CreateIndex
CREATE INDEX "org_units_effectiveSignerId_idx" ON "org_units"("effectiveSignerId");

-- CreateIndex
CREATE INDEX "warehouses_cityId_idx" ON "warehouses"("cityId");

-- CreateIndex
CREATE INDEX "warehouses_orgUnitId_idx" ON "warehouses"("orgUnitId");

-- CreateIndex
CREATE INDEX "warehouse_transfer_templates_warehouseId_isActive_idx" ON "warehouse_transfer_templates"("warehouseId", "isActive");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "categories"("parentId");

-- CreateIndex
CREATE INDEX "categories_categoryKind_idx" ON "categories"("categoryKind");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_catalog_items_code_key" ON "equipment_catalog_items"("code");

-- CreateIndex
CREATE INDEX "equipment_catalog_items_categoryId_idx" ON "equipment_catalog_items"("categoryId");

-- CreateIndex
CREATE INDEX "equipment_catalog_items_name_idx" ON "equipment_catalog_items"("name");

-- CreateIndex
CREATE INDEX "cat_maint_links_maint_cat_idx" ON "category_maintenance_links"("maintenanceCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "cat_maint_links_host_maint_uq" ON "category_maintenance_links"("hostCategoryId", "maintenanceCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_inventoryNumber_key" ON "equipment"("inventoryNumber");

-- CreateIndex
CREATE INDEX "equipment_categoryId_idx" ON "equipment"("categoryId");

-- CreateIndex
CREATE INDEX "equipment_catalogItemId_idx" ON "equipment"("catalogItemId");

-- CreateIndex
CREATE INDEX "equipment_stockLotId_idx" ON "equipment"("stockLotId");

-- CreateIndex
CREATE INDEX "equipment_status_idx" ON "equipment"("status");

-- CreateIndex
CREATE INDEX "equipment_affiliation_idx" ON "equipment"("affiliation");

-- CreateIndex
CREATE INDEX "equipment_isAccountingTracked_idx" ON "equipment"("isAccountingTracked");

-- CreateIndex
CREATE INDEX "equipment_currentHolderId_idx" ON "equipment"("currentHolderId");

-- CreateIndex
CREATE INDEX "equipment_warehouseId_idx" ON "equipment"("warehouseId");

-- CreateIndex
CREATE INDEX "equipment_custodyOrgUnitId_idx" ON "equipment"("custodyOrgUnitId");

-- CreateIndex
CREATE INDEX "warehouse_stock_lots_warehouseId_idx" ON "warehouse_stock_lots"("warehouseId");

-- CreateIndex
CREATE INDEX "warehouse_stock_lots_categoryId_idx" ON "warehouse_stock_lots"("categoryId");

-- CreateIndex
CREATE INDEX "warehouse_stock_lots_catalogItemId_idx" ON "warehouse_stock_lots"("catalogItemId");

-- CreateIndex
CREATE INDEX "warehouse_stock_lots_status_idx" ON "warehouse_stock_lots"("status");

-- CreateIndex
CREATE INDEX "wh_stock_lots_lotKind_idx" ON "warehouse_stock_lots"("lotKind");

-- CreateIndex
CREATE INDEX "wh_stock_lot_receipts_lot_created_idx" ON "warehouse_stock_lot_receipts"("stockLotId", "createdAt");

-- CreateIndex
CREATE INDEX "wh_stock_lot_receipts_received_by_idx" ON "warehouse_stock_lot_receipts"("receivedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "equip_inst_parts_replaced_uq" ON "equipment_installed_parts"("replacedById");

-- CreateIndex
CREATE INDEX "equip_inst_parts_host_idx" ON "equipment_installed_parts"("hostEquipmentId");

-- CreateIndex
CREATE INDEX "equip_inst_parts_status_idx" ON "equipment_installed_parts"("status");

-- CreateIndex
CREATE INDEX "equip_inst_parts_maint_cat_idx" ON "equipment_installed_parts"("maintenanceCategoryId");

-- CreateIndex
CREATE INDEX "equip_inst_parts_lot_idx" ON "equipment_installed_parts"("stockLotId");

-- CreateIndex
CREATE INDEX "equip_inst_ev_part_idx" ON "equipment_installed_part_events"("installedPartId");

-- CreateIndex
CREATE INDEX "equip_inst_ev_actor_idx" ON "equipment_installed_part_events"("actorUserId");

-- CreateIndex
CREATE INDEX "equipment_events_equipmentId_idx" ON "equipment_events"("equipmentId");

-- CreateIndex
CREATE INDEX "equipment_events_warehouseId_idx" ON "equipment_events"("warehouseId");

-- CreateIndex
CREATE INDEX "equipment_events_actorUserId_idx" ON "equipment_events"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_inventoryLineId_key" ON "transfers"("inventoryLineId");

-- CreateIndex
CREATE INDEX "transfers_equipmentId_idx" ON "transfers"("equipmentId");

-- CreateIndex
CREATE INDEX "transfers_signerId_idx" ON "transfers"("signerId");

-- CreateIndex
CREATE INDEX "transfers_status_idx" ON "transfers"("status");

-- CreateIndex
CREATE INDEX "transfers_fromWarehouseId_idx" ON "transfers"("fromWarehouseId");

-- CreateIndex
CREATE INDEX "transfers_toWarehouseId_idx" ON "transfers"("toWarehouseId");

-- CreateIndex
CREATE INDEX "transfers_documentWarehouseId_idx" ON "transfers"("documentWarehouseId");

-- CreateIndex
CREATE INDEX "disposal_commissions_cityId_idx" ON "disposal_commissions"("cityId");

-- CreateIndex
CREATE UNIQUE INDEX "equipment_disposal_list_items_approvalId_key" ON "equipment_disposal_list_items"("approvalId");

-- CreateIndex
CREATE INDEX "equip_disp_list_scope_idx" ON "equipment_disposal_list_items"("sessionId", "warehouseId", "categoryId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "equip_disp_list_session_equip_uq" ON "equipment_disposal_list_items"("sessionId", "equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "disp_inv_appr_line_uq" ON "disposal_inventory_approvals"("inventoryLineId");

-- CreateIndex
CREATE INDEX "disp_inv_appr_comm_st_idx" ON "disposal_inventory_approvals"("disposalCommissionId", "status");

-- CreateIndex
CREATE INDEX "disp_inv_appr_session_idx" ON "disposal_inventory_approvals"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "disp_inv_appr_equip_comm_uq" ON "disposal_inventory_approvals"("equipmentId", "disposalCommissionId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_committees_disposalCommissionId_key" ON "inventory_committees"("disposalCommissionId");

-- CreateIndex
CREATE INDEX "inventory_committees_sessionId_idx" ON "inventory_committees"("sessionId");

-- CreateIndex
CREATE INDEX "inventory_committees_warehouseId_idx" ON "inventory_committees"("warehouseId");

-- CreateIndex
CREATE INDEX "inventory_committees_categoryId_idx" ON "inventory_committees"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_committees_sessionId_warehouseId_categoryId_key" ON "inventory_committees"("sessionId", "warehouseId", "categoryId");

-- CreateIndex
CREATE INDEX "inventory_sessions_status_idx" ON "inventory_sessions"("status");

-- CreateIndex
CREATE INDEX "inventory_sessions_orgUnitId_idx" ON "inventory_sessions"("orgUnitId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_sessions_orgUnitId_year_key" ON "inventory_sessions"("orgUnitId", "year");

-- CreateIndex
CREATE INDEX "inventory_lines_committeeId_idx" ON "inventory_lines"("committeeId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_lines_committeeId_equipmentId_key" ON "inventory_lines"("committeeId", "equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_pending_actions_inventoryLineId_key" ON "inventory_pending_actions"("inventoryLineId");

-- CreateIndex
CREATE INDEX "inventory_pending_actions_sessionId_status_idx" ON "inventory_pending_actions"("sessionId", "status");

-- CreateIndex
CREATE INDEX "inventory_pending_actions_committeeId_status_idx" ON "inventory_pending_actions"("committeeId", "status");

-- CreateIndex
CREATE INDEX "inventory_pending_actions_equipmentId_idx" ON "inventory_pending_actions"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_session_close_jobs_sessionId_key" ON "inventory_session_close_jobs"("sessionId");

-- CreateIndex
CREATE INDEX "inventory_session_close_jobs_status_idx" ON "inventory_session_close_jobs"("status");

-- CreateIndex
CREATE INDEX "inventory_line_events_committeeId_idx" ON "inventory_line_events"("committeeId");

-- CreateIndex
CREATE INDEX "inventory_line_events_equipmentId_idx" ON "inventory_line_events"("equipmentId");

-- CreateIndex
CREATE INDEX "inventory_line_events_actorUserId_idx" ON "inventory_line_events"("actorUserId");

-- CreateIndex
CREATE INDEX "inventory_line_events_inventoryLineId_idx" ON "inventory_line_events"("inventoryLineId");

-- CreateIndex
CREATE INDEX "inventory_warehouse_committees_sessionId_idx" ON "inventory_warehouse_committees"("sessionId");

-- CreateIndex
CREATE INDEX "inventory_warehouse_committees_warehouseId_idx" ON "inventory_warehouse_committees"("warehouseId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_warehouse_committees_sessionId_warehouseId_key" ON "inventory_warehouse_committees"("sessionId", "warehouseId");

-- CreateIndex
CREATE INDEX "inventory_warehouse_lines_committeeId_idx" ON "inventory_warehouse_lines"("committeeId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_warehouse_lines_committeeId_stockLotId_key" ON "inventory_warehouse_lines"("committeeId", "stockLotId");

-- CreateIndex
CREATE INDEX "employee_relocation_cases_employeeId_status_idx" ON "employee_relocation_cases"("employeeId", "status");

-- CreateIndex
CREATE INDEX "employee_relocation_cases_status_idx" ON "employee_relocation_cases"("status");

-- CreateIndex
CREATE INDEX "employee_relocation_lines_caseId_status_idx" ON "employee_relocation_lines"("caseId", "status");

-- CreateIndex
CREATE INDEX "employee_relocation_lines_equipmentId_idx" ON "employee_relocation_lines"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_relocation_lines_caseId_equipmentId_key" ON "employee_relocation_lines"("caseId", "equipmentId");

-- CreateIndex
CREATE INDEX "employee_relocation_events_caseId_idx" ON "employee_relocation_events"("caseId");

-- CreateIndex
CREATE INDEX "employee_relocation_events_actorUserId_idx" ON "employee_relocation_events"("actorUserId");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE INDEX "saved_filters_userId_idx" ON "saved_filters"("userId");

-- CreateIndex
CREATE INDEX "settings_scope_idx" ON "settings"("scope");

-- CreateIndex
CREATE INDEX "uploads_entityType_entityId_idx" ON "uploads"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- AddForeignKey
ALTER TABLE "cities" ADD CONSTRAINT "cities_cantonId_fkey" FOREIGN KEY ("cantonId") REFERENCES "cantons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrar_assignments" ADD CONSTRAINT "registrar_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrar_assignments" ADD CONSTRAINT "registrar_assignments_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrar_assignments" ADD CONSTRAINT "registrar_assignments_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registrar_assignments" ADD CONSTRAINT "registrar_assignments_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_coordinator_assignments" ADD CONSTRAINT "inventory_coordinator_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_coordinator_assignments" ADD CONSTRAINT "inventory_coordinator_assignments_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_coordinator_assignments" ADD CONSTRAINT "inventory_coordinator_assignments_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderator_org_assignments" ADD CONSTRAINT "moderator_org_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderator_org_assignments" ADD CONSTRAINT "moderator_org_assignments_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderator_warehouse_assignments" ADD CONSTRAINT "moderator_warehouse_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderator_warehouse_assignments" ADD CONSTRAINT "moderator_warehouse_assignments_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_effectiveSignerId_fkey" FOREIGN KEY ("effectiveSignerId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_locationCityId_fkey" FOREIGN KEY ("locationCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_effectiveLocationCityId_fkey" FOREIGN KEY ("effectiveLocationCityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfer_templates" ADD CONSTRAINT "warehouse_transfer_templates_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_transfer_templates" ADD CONSTRAINT "warehouse_transfer_templates_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_document_sequences" ADD CONSTRAINT "transfer_document_sequences_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_keepers" ADD CONSTRAINT "warehouse_keepers_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_keepers" ADD CONSTRAINT "warehouse_keepers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_catalog_items" ADD CONSTRAINT "equipment_catalog_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_maintenance_links" ADD CONSTRAINT "category_maintenance_links_hostCategoryId_fkey" FOREIGN KEY ("hostCategoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_maintenance_links" ADD CONSTRAINT "category_maintenance_links_maintenanceCategoryId_fkey" FOREIGN KEY ("maintenanceCategoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "equipment_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "warehouse_stock_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_currentHolderId_fkey" FOREIGN KEY ("currentHolderId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_custodyOrgUnitId_fkey" FOREIGN KEY ("custodyOrgUnitId") REFERENCES "org_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_lots" ADD CONSTRAINT "warehouse_stock_lots_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_lots" ADD CONSTRAINT "warehouse_stock_lots_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_lots" ADD CONSTRAINT "warehouse_stock_lots_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "equipment_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_lots" ADD CONSTRAINT "warehouse_stock_lots_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_lots" ADD CONSTRAINT "warehouse_stock_lots_specDefinedByUserId_fkey" FOREIGN KEY ("specDefinedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_lot_receipts" ADD CONSTRAINT "warehouse_stock_lot_receipts_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "warehouse_stock_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warehouse_stock_lot_receipts" ADD CONSTRAINT "warehouse_stock_lot_receipts_receivedByUserId_fkey" FOREIGN KEY ("receivedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_installed_parts" ADD CONSTRAINT "equipment_installed_parts_hostEquipmentId_fkey" FOREIGN KEY ("hostEquipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_installed_parts" ADD CONSTRAINT "equipment_installed_parts_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "warehouse_stock_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_installed_parts" ADD CONSTRAINT "equipment_installed_parts_maintenanceCategoryId_fkey" FOREIGN KEY ("maintenanceCategoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_installed_parts" ADD CONSTRAINT "equipment_installed_parts_installedByUserId_fkey" FOREIGN KEY ("installedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_installed_parts" ADD CONSTRAINT "equipment_installed_parts_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "equipment_installed_parts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_installed_part_events" ADD CONSTRAINT "equipment_installed_part_events_installedPartId_fkey" FOREIGN KEY ("installedPartId") REFERENCES "equipment_installed_parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_installed_part_events" ADD CONSTRAINT "equipment_installed_part_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_events" ADD CONSTRAINT "equipment_events_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_events" ADD CONSTRAINT "equipment_events_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_events" ADD CONSTRAINT "equipment_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_documentWarehouseId_fkey" FOREIGN KEY ("documentWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_signerId_fkey" FOREIGN KEY ("signerId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_fromPersonId_fkey" FOREIGN KEY ("fromPersonId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_toPersonId_fkey" FOREIGN KEY ("toPersonId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_inventoryLineId_fkey" FOREIGN KEY ("inventoryLineId") REFERENCES "inventory_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_commissions" ADD CONSTRAINT "disposal_commissions_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_markedByUserId_fkey" FOREIGN KEY ("markedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_withdrawnByUserId_fkey" FOREIGN KEY ("withdrawnByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_razduzenjeTransferId_fkey" FOREIGN KEY ("razduzenjeTransferId") REFERENCES "transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_disposalCommissionId_fkey" FOREIGN KEY ("disposalCommissionId") REFERENCES "disposal_commissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "equipment_disposal_list_items" ADD CONSTRAINT "equipment_disposal_list_items_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "disposal_inventory_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_inventory_approvals" ADD CONSTRAINT "disposal_inventory_approvals_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_inventory_approvals" ADD CONSTRAINT "disposal_inventory_approvals_disposalCommissionId_fkey" FOREIGN KEY ("disposalCommissionId") REFERENCES "disposal_commissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_inventory_approvals" ADD CONSTRAINT "disposal_inventory_approvals_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_inventory_approvals" ADD CONSTRAINT "disposal_inventory_approvals_inventoryLineId_fkey" FOREIGN KEY ("inventoryLineId") REFERENCES "inventory_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_inventory_approvals" ADD CONSTRAINT "disposal_inventory_approvals_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_commission_members" ADD CONSTRAINT "disposal_commission_members_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "disposal_commissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disposal_commission_members" ADD CONSTRAINT "disposal_commission_members_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_committees" ADD CONSTRAINT "inventory_committees_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_committees" ADD CONSTRAINT "inventory_committees_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_committees" ADD CONSTRAINT "inventory_committees_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_committees" ADD CONSTRAINT "inventory_committees_disposalCommissionId_fkey" FOREIGN KEY ("disposalCommissionId") REFERENCES "disposal_commissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_committees" ADD CONSTRAINT "inventory_committees_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_committee_members" ADD CONSTRAINT "inventory_committee_members_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "inventory_committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_committee_members" ADD CONSTRAINT "inventory_committee_members_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_sessions" ADD CONSTRAINT "inventory_sessions_orgUnitId_fkey" FOREIGN KEY ("orgUnitId") REFERENCES "org_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "inventory_committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_relocationWarehouseId_fkey" FOREIGN KEY ("relocationWarehouseId") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_lines" ADD CONSTRAINT "inventory_lines_relocationToPersonId_fkey" FOREIGN KEY ("relocationToPersonId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_pending_actions" ADD CONSTRAINT "inventory_pending_actions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_pending_actions" ADD CONSTRAINT "inventory_pending_actions_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "inventory_committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_pending_actions" ADD CONSTRAINT "inventory_pending_actions_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_pending_actions" ADD CONSTRAINT "inventory_pending_actions_inventoryLineId_fkey" FOREIGN KEY ("inventoryLineId") REFERENCES "inventory_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_pending_actions" ADD CONSTRAINT "inventory_pending_actions_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_session_close_jobs" ADD CONSTRAINT "inventory_session_close_jobs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_line_events" ADD CONSTRAINT "inventory_line_events_inventoryLineId_fkey" FOREIGN KEY ("inventoryLineId") REFERENCES "inventory_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_line_events" ADD CONSTRAINT "inventory_line_events_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "inventory_committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_line_events" ADD CONSTRAINT "inventory_line_events_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_line_events" ADD CONSTRAINT "inventory_line_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_line_events" ADD CONSTRAINT "inventory_line_events_generatedTransferId_fkey" FOREIGN KEY ("generatedTransferId") REFERENCES "transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_warehouse_committees" ADD CONSTRAINT "inventory_warehouse_committees_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "inventory_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_warehouse_committees" ADD CONSTRAINT "inventory_warehouse_committees_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_warehouse_committees" ADD CONSTRAINT "inventory_warehouse_committees_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_warehouse_committee_members" ADD CONSTRAINT "inventory_warehouse_committee_members_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "inventory_warehouse_committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_warehouse_committee_members" ADD CONSTRAINT "inventory_warehouse_committee_members_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_warehouse_lines" ADD CONSTRAINT "inventory_warehouse_lines_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "inventory_warehouse_committees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_warehouse_lines" ADD CONSTRAINT "inventory_warehouse_lines_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "warehouse_stock_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_cases" ADD CONSTRAINT "employee_relocation_cases_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_cases" ADD CONSTRAINT "employee_relocation_cases_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_lines" ADD CONSTRAINT "employee_relocation_lines_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "employee_relocation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_lines" ADD CONSTRAINT "employee_relocation_lines_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "equipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_lines" ADD CONSTRAINT "employee_relocation_lines_sourceResolvedByUserId_fkey" FOREIGN KEY ("sourceResolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_lines" ADD CONSTRAINT "employee_relocation_lines_destResolvedByUserId_fkey" FOREIGN KEY ("destResolvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_lines" ADD CONSTRAINT "employee_relocation_lines_destStockLotId_fkey" FOREIGN KEY ("destStockLotId") REFERENCES "warehouse_stock_lots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_events" ADD CONSTRAINT "employee_relocation_events_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "employee_relocation_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_relocation_events" ADD CONSTRAINT "employee_relocation_events_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
