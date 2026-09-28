export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export type IdempotencyKey = string & {
  readonly __brand: 'IdempotencyKey';
};
