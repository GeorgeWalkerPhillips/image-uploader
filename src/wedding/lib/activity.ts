// The activity feed is a shared, append-only log of who did what. Subjects are
// deliberately non-identifying: task, vendor, target and item titles are fine,
// but never a guest's name, email or phone (use "Updated an RSVP" with no subject).

export const ACTIVITY_LIMITS = { actor: 100, action: 60, subject: 200 } as const;

export interface ActivityInsert {
  actor_name: string;
  action: string;
  subject: string | null;
}

const clamp = (s: string, max: number): string => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

// Fits a feed entry to the table's limits (the database rejects longer text).
// Returns null if there is nothing meaningful to write.
export function buildActivityRow(
  actorName: string,
  action: string,
  subject?: string | null
): ActivityInsert | null {
  const act = clamp(action, ACTIVITY_LIMITS.action);
  if (!act) return null;
  const subj = subject ? clamp(subject, ACTIVITY_LIMITS.subject) : '';
  return {
    actor_name: clamp(actorName, ACTIVITY_LIMITS.actor) || 'Someone',
    action: act,
    subject: subj || null,
  };
}

// Best-effort: resolves to true if written, false otherwise. Never throws and
// never logs, so a feed problem can never block or spoil the person's action.
export async function logActivity(
  write: (values: Record<string, unknown>) => Promise<unknown>,
  actorName: string,
  action: string,
  subject?: string | null
): Promise<boolean> {
  try {
    const row = buildActivityRow(actorName, action, subject);
    if (!row) return false;
    await write({ ...row });
    return true;
  } catch {
    return false;
  }
}

export function formatActivityTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';
  const mins = Math.floor((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(then);
}
