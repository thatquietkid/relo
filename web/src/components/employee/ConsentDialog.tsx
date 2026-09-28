import { useState } from 'react';
import type { RequestConsentField } from '../../app/auth/auth-client';

export function ConsentDialog({ fields, onConfirm, onCancel }: { fields: RequestConsentField[]; onConfirm: (consents: Array<{ field: string; consented: boolean }>) => void; onCancel: () => void }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const complete = fields.length > 0 && fields.every((field) => checked[field.field]);
  return <div className="sheet-backdrop" role="presentation"><section className="consent-dialog" role="dialog" aria-modal="true" aria-labelledby="consent-title"><div className="sheet-handle" aria-hidden="true" /><p className="eyebrow">One clear request</p><h2 id="consent-title">What will be shared</h2><p className="muted">Review the details before Relo introduces you to this provider.</p><div className="consent-fields">{fields.map((field) => <label className="consent-field" key={field.field}><input type="checkbox" checked={Boolean(checked[field.field])} onChange={(event) => setChecked((current) => ({ ...current, [field.field]: event.target.checked }))} /><span><strong>{field.label}</strong><small>{field.value}</small></span></label>)}</div><div className="sheet-actions"><button className="button button-quiet" type="button" onClick={onCancel}>Not now</button><button className="button button-primary" type="button" disabled={!complete} onClick={() => onConfirm(fields.map((field) => ({ field: field.field, consented: true })))}>Send request</button></div></section></div>;
}
