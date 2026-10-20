import { safeNextPath, rememberNextPath, consumeNextPath } from './postAuthRedirect';

describe('safeNextPath', () => {
  it('accepts same-origin absolute paths', () => {
    expect(safeNextPath('/wedding-planner?buy=1')).toBe('/wedding-planner?buy=1');
    expect(safeNextPath('/admin')).toBe('/admin');
  });
  it.each([null, undefined, '', 'https://evil.com', '//evil.com', '/\\evil.com', 'javascript:alert(1)', '/login', '/login?next=/x', '/a\nb'])(
    'rejects %p',
    (v) => expect(safeNextPath(v)).toBeNull()
  );
});

describe('remember/consume', () => {
  it('round-trips once and ignores unsafe values', () => {
    rememberNextPath('//evil.com');
    expect(consumeNextPath()).toBeNull();
    rememberNextPath('/wedding-planner?buy=1');
    expect(consumeNextPath()).toBe('/wedding-planner?buy=1');
    expect(consumeNextPath()).toBeNull();
  });
});
