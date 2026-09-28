export type ErrorDetails = Record<string, unknown>;

/**
 * An error whose message is safe to show to API clients. Anything that is
 * not an AppError is reported to clients as a generic 500.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: ErrorDetails,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: ErrorDetails) =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required.', code = 'UNAUTHORIZED') =>
  new AppError(401, code, message);

export const forbidden = (message = 'You do not have permission to perform this action.') =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found.`);

export const conflict = (message: string, details?: ErrorDetails) =>
  new AppError(409, 'CONFLICT', message, details);

/** A request that is well-formed but breaks a business rule. */
export const unprocessable = (message: string, code = 'BUSINESS_RULE_VIOLATION', details?: ErrorDetails) =>
  new AppError(422, code, message, details);
