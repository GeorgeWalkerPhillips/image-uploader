import { buildActivityRow, formatActivityTime, logActivity } from './activity';

describe('buildActivityRow', () => {
  it('trims, collapses whitespace and nulls an empty subject', () => {
    expect(buildActivityRow('  Ada  ', ' Completed   a task ', '  ')).toEqual({ actor_name: 'Ada', action: 'Completed a task', subject: null });
  });
  it('clamps to the table limits (100 / 60 / 200)', () => {
    const r = buildActivityRow('n'.repeat(300), 'a'.repeat(300), 's'.repeat(300));
    expect(r?.actor_name.length).toBeLessThanOrEqual(100);
    expect(r?.action.length).toBeLessThanOrEqual(60);
    expect(r?.subject?.length).toBeLessThanOrEqual(200);
  });
  it('falls back for a blank actor and refuses a blank action', () => {
    expect(buildActivityRow('   ', 'Did it')?.actor_name).toBe('Someone');
    expect(buildActivityRow('Ada', '   ')).toBeNull();
  });
});

describe('logActivity', () => {
  it('writes the cleaned row and reports true', async () => {
    const write = jest.fn().mockResolvedValue(undefined);
    await expect(logActivity(write, 'Ada', 'Added a payment', 'Riverside Hall')).resolves.toBe(true);
    expect(write).toHaveBeenCalledWith({ actor_name: 'Ada', action: 'Added a payment', subject: 'Riverside Hall' });
  });
  it('never throws or logs when the write fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(logActivity(() => Promise.reject(new Error('boom')), 'Ada', 'x')).resolves.toBe(false);
    await expect(logActivity(() => { throw new Error('sync boom'); }, 'Ada', 'x')).resolves.toBe(false);
    expect(spy).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
  it('does not call the backend for an empty action', async () => {
    const write = jest.fn();
    await expect(logActivity(write, 'Ada', '')).resolves.toBe(false);
    expect(write).not.toHaveBeenCalled();
  });
});

describe('formatActivityTime', () => {
  const now = new Date('2099-03-01T12:00:00Z');
  it('is relative for the first day, then a Johannesburg date', () => {
    expect(formatActivityTime('2099-03-01T11:59:40Z', now)).toBe('just now');
    expect(formatActivityTime('2099-03-01T11:30:00Z', now)).toBe('30 min ago');
    expect(formatActivityTime('2099-03-01T09:00:00Z', now)).toBe('3 h ago');
    expect(formatActivityTime('2099-02-20T08:30:00Z', now)).toMatch(/20/);
    expect(formatActivityTime('garbage', now)).toBe('');
  });
});
