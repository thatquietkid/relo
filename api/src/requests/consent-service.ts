import { ApiError } from '../shared/errors.js';

export const REQUEST_FIELDS = ['email', 'destination_city', 'move_date'] as const;
export type RequestField = (typeof REQUEST_FIELDS)[number];

export interface ConsentInput {
  field: string;
  consented: boolean;
}

export interface ConsentSnapshot {
  field: RequestField;
  value: string;
  consented: true;
}

export interface ConsentFieldPreview {
  field: RequestField;
  label: string;
  value: string;
  required: true;
}

export function snapshotRequiredConsent(fields: readonly ConsentFieldPreview[], input: readonly ConsentInput[]): ConsentSnapshot[] {
  if (input.length !== fields.length) {
    throw new ApiError(400, 'CONSENT_REQUIRED', 'Consent is required for every field shared with the provider.');
  }

  const byField = new Map<string, ConsentInput>();
  for (const consent of input) {
    if (byField.has(consent.field) || !REQUEST_FIELDS.includes(consent.field as RequestField)) {
      throw new ApiError(400, 'CONSENT_REQUIRED', 'Consent must be provided once for each requested field.');
    }
    byField.set(consent.field, consent);
  }

  return fields.map((field) => {
    const consent = byField.get(field.field);
    if (!consent?.consented) {
      throw new ApiError(400, 'CONSENT_REQUIRED', 'Consent is required for every field shared with the provider.');
    }
    return { field: field.field, value: field.value, consented: true };
  });
}
