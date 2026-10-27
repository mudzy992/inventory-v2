/**
 * Measurable performance budgets for the paths the audit flagged as
 * unbounded: equipment list/search/CSV export, public QR lookups, bulk stock
 * receipt and deep pagination.
 *
 * Wall-clock thresholds are intentionally NOT the primary gate — they are
 * flaky on shared CI runners. The contract measures *work units* instead:
 * how many DB queries a request may issue, how many rows one query may load,
 * and how many items one write request may accept. Those are deterministic
 * and therefore suitable as a release gate. A generous wall-clock smoke
 * ceiling is reported as a secondary signal only.
 */

export const PERFORMANCE_BUDGETS = {
  csvExportBatchSize: 500,
  csvExportMaxQueriesFor1200Rows: 3,
  maxListPageSize: 10_000,
  maxPageOffset: 100_000,
  maxPublicQrMovements: 1000,
  defaultPublicQrMovements: 200,
  maxOrgUnitPathDepth: 20,
  maxPublicQrQueries: 25,
  bulkReceiptMaxItems: 100,
  maxDtoArrayItems: 200,
  maxListRequestQueries: 8,
  documentWorkerConvertTimeoutMs: 120_000,
  documentJobStaleBoundMs: 30 * 60 * 1000,
  pureSerializationSmokeIterations: 2_000,
  pureSerializationSmokeMaxMs: 2_000,
} as const;

export type QueryAction = 'findMany' | 'findUnique' | 'findFirst' | 'count' | 'groupBy' | 'other';

export interface QueryRecord {
  model: string;
  action: QueryAction;
  take?: number;
}

export interface BudgetViolation {
  label: string;
  message: string;
}

/** Small recorder used by both the CI gate and unit tests. */
export class QueryRecorder {
  private readonly records: QueryRecord[] = [];

  record(model: string, action: QueryAction, args?: { take?: number }): void {
    this.records.push({ model, action, ...(args?.take !== undefined ? { take: args.take } : {}) });
  }

  all(): QueryRecord[] {
    return [...this.records];
  }

  count(model?: string, action?: QueryAction): number {
    return this.records.filter(
      (record) => (model === undefined || record.model === model) && (action === undefined || record.action === action),
    ).length;
  }

  maxTake(): number {
    return this.records.reduce((max, record) => Math.max(max, record.take ?? 0), 0);
  }

  reset(): void {
    this.records.length = 0;
  }
}

/** Upper bound on cursor-page queries: ceil(total/batch) with a final short page. */
export const expectedCursorPageQueries = (totalRows: number, batchSize: number): number => {
  if (!Number.isSafeInteger(totalRows) || totalRows < 0 || !Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new RangeError('totalRows must be >= 0 and batchSize must be a positive integer');
  }
  return totalRows === 0 ? 1 : Math.ceil(totalRows / batchSize);
};

export const verifyQueryBudget = (recorder: QueryRecorder, label: string, maxQueries: number): BudgetViolation[] => {
  const violations: BudgetViolation[] = [];
  const total = recorder.all().length;
  if (total > maxQueries) {
    violations.push({
      label,
      message: `${total} DB queries exceed the ${maxQueries}-query budget (${JSON.stringify(recorder.all())})`,
    });
  }
  for (const record of recorder.all()) {
    if (record.action === 'findMany' && record.take === undefined) {
      violations.push({
        label,
        message: `unbounded ${record.model}.findMany() — every list query must carry take`,
      });
    }
    if (record.take !== undefined && record.take > PERFORMANCE_BUDGETS.maxListPageSize) {
      violations.push({
        label,
        message: `${record.model}.findMany take=${record.take} exceeds the ${PERFORMANCE_BUDGETS.maxListPageSize} page-size budget`,
      });
    }
  }
  return violations;
};

export const assertNoViolations = (violations: BudgetViolation[]): void => {
  if (violations.length === 0) return;
  throw new Error(`Performance budget violated: ${violations.map((item) => `[${item.label}] ${item.message}`).join('; ')}`);
};

export interface BudgetReportRow {
  metric: string;
  measured: number | string;
  budget: number | string;
  status: 'pass' | 'fail';
}

export const buildBudgetReport = (rows: BudgetReportRow[]): string => {
  const failed = rows.filter((row) => row.status === 'fail');
  const lines = [
    `Performance budgets: ${failed.length === 0 ? 'PASS' : 'FAIL'} (${rows.length - failed.length}/${rows.length} within budget)`,
  ];
  for (const row of rows) {
    lines.push(`  [${row.status.toUpperCase()}] ${row.metric}: measured ${row.measured}, budget ${row.budget}`);
  }
  return lines.join('\n');
};
