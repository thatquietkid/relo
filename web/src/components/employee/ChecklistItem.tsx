import type { ChecklistItem as ChecklistItemData } from '../../app/auth/auth-client';

export function ChecklistItem({ item, onComplete }: { item: ChecklistItemData; onComplete: () => void }) {
  const complete = item.state === 'completed';
  return <article className={`checklist-item${complete ? ' is-complete' : ''}`}><span className="checklist-dot" aria-hidden="true">{complete ? '✓' : '·'}</span><div className="checklist-copy"><h3>{item.title}</h3>{item.description && <p>{item.description}</p>}</div>{complete ? <span className="checklist-state">Done</span> : <button className="button button-quiet button-small" type="button" aria-label={`Complete ${item.title}`} onClick={onComplete}>Complete</button>}</article>;
}
