/**
 * Canonical, reviewed data contract for the ONLY unauthenticated equipment
 * endpoint: GET /public/equipment/:id (QR code scanning).
 *
 * Product decision (2026-10-27): keep every existing field — holder full
 * name, title, organisational path, movement history and document numbers —
 * because the business process needs them on the public QR page. The privacy
 * risk is ACCEPTED and documented in docs/public-qr-privacy.md. In exchange,
 * the exact response shape is frozen: adding, removing or renaming ANY field
 * requires an explicit owner review and a change to this contract, the
 * backend service, the frontend DTO and the docs in the same commit.
 *
 * Both a CI gate (check-public-equipment-contract.ts) and a runtime assertion
 * in PublicEquipmentService enforce it. A runtime violation fails the request
 * closed (500) rather than silently publishing unreviewed data.
 */

export const PUBLIC_EQUIPMENT_CONTRACT_VERSION = 1;

export const PUBLIC_EQUIPMENT_DECISION = {
  status: 'accepted-risk',
  reviewedAt: '2026-10-27',
  endpoint: 'GET /public/equipment/:id',
  summary:
    'All existing DTO fields are intentionally kept; the identity/history disclosure is documented and accepted by the product owner.',
  risk:
    'An unauthenticated QR lookup discloses the current holder name/title/org path, every movement party label, document numbers and labelled specifications (which may contain serial numbers).',
} as const;

export const PUBLIC_EQUIPMENT_MOVEMENTS_DEFAULT = 200;
export const PUBLIC_EQUIPMENT_MOVEMENTS_MIN = 1;
export const PUBLIC_EQUIPMENT_MOVEMENTS_MAX = 1000;
export const PUBLIC_EQUIPMENT_ORG_UNIT_MAX_DEPTH = 20;

/** Exact key sets. `specifications` is an opaque, dynamic string map. */
export const PUBLIC_EQUIPMENT_SHAPES = {
  root: [
    'id',
    'inventoryNumber',
    'isAccountingTracked',
    'status',
    'categoryName',
    'productName',
    'uniqueFields',
    'specifications',
    'currentHolder',
    'warehouse',
    'movements',
    'disposalReason',
  ],
  currentHolder: ['fullName', 'title', 'orgUnitPath'],
  warehouse: ['name'],
  uniqueFields: ['label', 'value'],
  movements: ['date', 'type', 'status', 'fromLabel', 'toLabel', 'documentNumber'],
} as const;

export const PUBLIC_EQUIPMENT_OPAQUE_MAPS = ['specifications'] as const;

export const PUBLIC_EQUIPMENT_PII_PATHS = [
  'currentHolder.fullName',
  'currentHolder.title',
  'currentHolder.orgUnitPath',
  'movements[].fromLabel',
  'movements[].toLabel',
  'movements[].documentNumber',
  'uniqueFields[].value',
  'specifications.*',
  'id',
  'inventoryNumber',
] as const;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const compareKeys = (
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string,
  errors: string[],
): void => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  const extra = actual.filter((key) => !wanted.includes(key));
  const missing = wanted.filter((key) => !actual.includes(key));
  if (extra.length > 0) {
    errors.push(`${path}: unreviewed field(s) ${extra.join(', ')} require an owner privacy review`);
  }
  if (missing.length > 0) {
    errors.push(`${path}: field(s) ${missing.join(', ')} removed without an owner privacy review`);
  }
};

const verifyArray = (
  value: unknown,
  shape: readonly string[],
  path: string,
  errors: string[],
): void => {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected an array`);
    return;
  }
  if (path === 'movements' && value.length > PUBLIC_EQUIPMENT_MOVEMENTS_MAX) {
    errors.push(
      `${path}: ${value.length} entries exceed the hard cap of ${PUBLIC_EQUIPMENT_MOVEMENTS_MAX}`,
    );
  }
  value.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`${path}[${index}]: expected an object`);
      return;
    }
    compareKeys(entry, shape, `${path}[${index}]`, errors);
  });
};

/** Returns every contract violation (empty array == compliant). */
export const verifyPublicEquipmentShape = (value: unknown): string[] => {
  const errors: string[] = [];
  if (!isPlainObject(value)) {
    return ['root: expected an object'];
  }
  compareKeys(value, PUBLIC_EQUIPMENT_SHAPES.root, 'root', errors);

  const specifications = value.specifications;
  if (specifications !== undefined) {
    if (!isPlainObject(specifications)) {
      errors.push('specifications: expected an opaque object map');
    } else {
      for (const [key, entry] of Object.entries(specifications)) {
        if (typeof entry !== 'string') {
          errors.push(`specifications.${key}: only string values may be published`);
        }
      }
    }
  }

  for (const [field, shape] of [
    ['currentHolder', PUBLIC_EQUIPMENT_SHAPES.currentHolder],
    ['warehouse', PUBLIC_EQUIPMENT_SHAPES.warehouse],
  ] as const) {
    const nested = value[field];
    if (nested !== null && nested !== undefined) {
      if (!isPlainObject(nested)) errors.push(`${field}: expected an object or null`);
      else compareKeys(nested, shape, field, errors);
    }
  }

  verifyArray(value.uniqueFields, PUBLIC_EQUIPMENT_SHAPES.uniqueFields, 'uniqueFields', errors);
  verifyArray(value.movements, PUBLIC_EQUIPMENT_SHAPES.movements, 'movements', errors);
  return errors;
};

export const assertPublicEquipmentShape = (value: unknown): void => {
  const errors = verifyPublicEquipmentShape(value);
  if (errors.length === 0) return;
  throw new Error(
    `Public equipment privacy contract violated: ${errors.join('; ')}. ` +
      `Update public-equipment.contract.ts, the frontend DTO and docs/public-qr-privacy.md ` +
      `only after an explicit owner privacy review.`,
  );
};

/** Fail-closed parsing of PUBLIC_EQUIPMENT_MAX_MOVEMENTS. */
export const resolvePublicEquipmentMovementLimit = (raw: string | undefined): number => {
  if (raw === undefined || raw.trim() === '') return PUBLIC_EQUIPMENT_MOVEMENTS_DEFAULT;
  const normalized = raw.trim();
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(
      `PUBLIC_EQUIPMENT_MAX_MOVEMENTS must be an integer between ` +
        `${PUBLIC_EQUIPMENT_MOVEMENTS_MIN} and ${PUBLIC_EQUIPMENT_MOVEMENTS_MAX}`,
    );
  }
  const parsed = Number(normalized);
  if (
    !Number.isSafeInteger(parsed) ||
    parsed < PUBLIC_EQUIPMENT_MOVEMENTS_MIN ||
    parsed > PUBLIC_EQUIPMENT_MOVEMENTS_MAX
  ) {
    throw new Error(
      `PUBLIC_EQUIPMENT_MAX_MOVEMENTS must be an integer between ` +
        `${PUBLIC_EQUIPMENT_MOVEMENTS_MIN} and ${PUBLIC_EQUIPMENT_MOVEMENTS_MAX}`,
    );
  }
  return parsed;
};

type OrgUnitNode = { id: string; name: string; parentId: string | null };

/**
 * Bounded ancestor walk with a cycle guard. The public endpoint used to load
 * EVERY org unit in the system on each cache miss just to render one path.
 */
export const buildOrgUnitPath = (
  orgUnitsById: Map<string, OrgUnitNode>,
  orgUnitId: string,
  maxDepth: number = PUBLIC_EQUIPMENT_ORG_UNIT_MAX_DEPTH,
): string => {
  const parts: string[] = [];
  const seen = new Set<string>();
  let currentId: string | null = orgUnitId;
  while (currentId && parts.length < maxDepth && !seen.has(currentId)) {
    seen.add(currentId);
    const unit = orgUnitsById.get(currentId);
    if (!unit) break;
    parts.unshift(unit.name);
    currentId = unit.parentId;
  }
  return parts.join(' → ');
};

/** Representative compliant payload used by the CI contract gate. */
export const PUBLIC_EQUIPMENT_FIXTURE: Record<string, unknown> = {
  id: 'equipment-1',
  inventoryNumber: 'INV-0001',
  isAccountingTracked: true,
  status: 'zaduzeno',
  categoryName: 'Laptop',
  productName: null,
  uniqueFields: [{ label: 'Serijski broj', value: 'SN-1' }],
  specifications: { Boja: 'Crna' },
  currentHolder: { fullName: 'Ana Anić', title: 'Referent', orgUnitPath: 'Direkcija → Sektor' },
  warehouse: null,
  movements: [
    {
      date: '2026-10-01',
      type: 'zaduzenje',
      status: 'finalized',
      fromLabel: 'Skladište: Glavno',
      toLabel: 'Ana Anić',
      documentNumber: 'TR-1',
    },
  ],
  disposalReason: null,
};
