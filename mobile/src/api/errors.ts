export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const parseApiError = async (response: Response): Promise<ApiError> => {
  const payload = (await response.json().catch(() => ({}))) as { message?: string | string[] };
  const message = Array.isArray(payload.message)
    ? payload.message.join(', ')
    : payload.message || response.statusText;
  return new ApiError(message, response.status);
};
