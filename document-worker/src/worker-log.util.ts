export interface CorrelatedJobData {
  correlationId?: string;
}

export const formatJobCorrelation = (job?: CorrelatedJobData | null): string =>
  `correlationId=${job?.correlationId ?? 'unknown'}`;
