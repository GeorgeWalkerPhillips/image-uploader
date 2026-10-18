import type { CalendarItem } from './calendar';
import { addDaysISO } from './time';

// RFC 5545 calendar export, so events can be added to phone calendars.

export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

const encoder = new TextEncoder();

// Lines may be at most 75 octets; continuation lines start with one space.
// Never splits a multi-byte character.
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (currentBytes + bytes > limit) {
      out.push(current);
      current = ' ';
      currentBytes = 1;
      limit = 75;
    }
    current += ch;
    currentBytes += bytes;
  }
  out.push(current);
  return out.join('\r\n');
}

const pad = (n: number): string => String(n).padStart(2, '0');

// "20270327T080000Z" for an instant.
export function icsDateTimeUTC(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// "20270327" for a calendar date.
export const icsDate = (dateISO: string): string => dateISO.replace(/-/g, '');

const PREFIX: Record<string, string> = { tasks: 'Task: ', payments: 'Payment due: ' };

export interface IcsOptions {
  calendarName: string;
  now?: Date;
}

export function buildICS(items: readonly CalendarItem[], options: IcsOptions): string {
  const stamp = icsDateTimeUTC((options.now ?? new Date()).toISOString());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Valere//Wedding HQ//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.calendarName)}`,
  ];

  for (const item of items) {
    const summary = `${PREFIX[item.layer] ?? ''}${item.done ? '(done) ' : ''}${item.title}`;
    lines.push('BEGIN:VEVENT', `UID:${item.id}@wedding-hq`, `DTSTAMP:${stamp}`);
    if (item.allDay || !item.startsAt) {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(item.date)}`);
      // DTEND is exclusive for all-day events.
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDaysISO(item.endDate, 1))}`);
    } else {
      lines.push(`DTSTART:${icsDateTimeUTC(item.startsAt)}`);
      const end = item.endsAt ?? new Date(new Date(item.startsAt).getTime() + 3600_000).toISOString();
      lines.push(`DTEND:${icsDateTimeUTC(end)}`);
    }
    lines.push(`SUMMARY:${escapeText(summary)}`);
    const description = [item.subtitle, item.notes].filter((s): s is string => !!s).join(' - ');
    if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
    if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
    lines.push(`CATEGORIES:${item.layer}`, 'END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}
