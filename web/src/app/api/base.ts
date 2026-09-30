import type { ApiErrorResponse } from '@relo/contracts/http';

export interface ApiFailure extends Error {
  response: ApiErrorResponse;
  status: number;
}

export const apiUrl = (): string => {
  const configured = import.meta.env.VITE_RELO_API_URL as string | undefined;
  return (configured ?? '').replace(/\/$/, '');
};

export function failure(response: ApiErrorResponse, status: number): ApiFailure {
  const error = new Error(response.error.message) as ApiFailure;
  error.name = 'ApiFailure';
  error.response = response;
  error.status = status;
  return error;
}

/**
 * Standard typed JSON request function with error normalization.
 */
export async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, { ...init, headers });
  } catch {
    throw failure({
      error: {
        code: 'NETWORK_ERROR',
        message: 'The Relo service is unavailable. Please check your internet connection.',
        requestId: 'browser'
      }
    }, 0);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorResponse = payload as ApiErrorResponse;
    const fallbackMessage = response.status === 404
      ? 'Requested resource was not found.'
      : response.status === 403
        ? 'You do not have permission to perform this action.'
        : response.status === 401
          ? 'Please log in to continue.'
          : 'The Relo service returned an error. Please try again.';

    throw failure(
      errorResponse.error
        ? errorResponse
        : {
            error: {
              code: `HTTP_${response.status}`,
              message: (payload as any)?.message || (payload as any)?.error || fallbackMessage,
              requestId: response.headers.get('x-request-id') || 'browser'
            }
          },
      response.status
    );
  }
  return payload as T;
}
