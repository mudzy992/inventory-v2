import { ApiError } from '../api/client';

export const getApiErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof ApiError ? err.message : fallback;

export const refreshAfterMutation = async (
  refreshFns: Array<() => Promise<void>>,
): Promise<void> => {
  for (const refresh of refreshFns) {
    try {
      await refresh();
    } catch {
      // Mutation succeeded; do not surface refresh errors as mutation failure.
    }
  }
};
