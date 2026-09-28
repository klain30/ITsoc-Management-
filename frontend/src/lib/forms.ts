import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';

import { ApiError } from './api';

/**
 * Maps server-side validation errors onto form fields. Returns the message
 * for anything that is not tied to a field (show it in <FormError/>).
 */
export const applyServerErrors = <T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, fields: readonly string[]) => {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  let unmatched = error.message;
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    if (fields.includes(field) && messages?.[0]) {
      setError(field as Path<T>, { type: 'server', message: messages[0] });
      unmatched = error.code === 'VALIDATION_ERROR' ? '' : unmatched;
    }
  }
  return unmatched || null;
};
