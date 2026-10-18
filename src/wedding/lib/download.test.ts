import { downloadTextFile } from './download';

describe('downloadTextFile', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    jest.useRealTimers();
  });

  it('clicks a download link with the filename, then revokes the object URL', async () => {
    jest.useFakeTimers();
    const create = jest.fn(() => 'blob:test-url');
    const revoke = jest.fn();
    URL.createObjectURL = create;
    URL.revokeObjectURL = revoke;
    const clicked: { href: string; download: string }[] = [];
    const spy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.href, download: this.download });
    });

    downloadTextFile('wedding-hq.ics', 'BEGIN:VCALENDAR', 'text/calendar;charset=utf-8');

    expect(create).toHaveBeenCalledTimes(1);
    const blob = (create.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toBe('text/calendar;charset=utf-8');
    expect(blob.size).toBe('BEGIN:VCALENDAR'.length);
    expect(clicked).toEqual([{ href: 'blob:test-url', download: 'wedding-hq.ics' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revoke).not.toHaveBeenCalled();
    jest.advanceTimersByTime(60000);
    expect(revoke).toHaveBeenCalledWith('blob:test-url');
    spy.mockRestore();
  });
});
