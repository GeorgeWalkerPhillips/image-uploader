import {
  clearStashedToken, hasFragment, isPlausibleToken, JOIN_TOKEN_KEY, readStashedToken, readTokenFromHash, resolveToken,
  stashToken,
} from './joinToken';

const TOKEN = 'abcDEF0123456789_-abcDEF0123456789';

function memory(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, v); },
  };
}

describe('readTokenFromHash', () => {
  it('reads #token=...', () => {
    expect(readTokenFromHash(`#token=${TOKEN}`)).toBe(TOKEN);
    expect(readTokenFromHash(`token=${TOKEN}`)).toBe(TOKEN);
  });
  it('rejects missing, short, long and odd-character tokens', () => {
    expect(readTokenFromHash('')).toBeNull();
    expect(readTokenFromHash('#')).toBeNull();
    expect(readTokenFromHash('#other=1')).toBeNull();
    expect(readTokenFromHash('#token=short')).toBeNull();
    expect(readTokenFromHash(`#token=${'a'.repeat(201)}`)).toBeNull();
    expect(readTokenFromHash(`#token=${'a'.repeat(20)}<script>`)).toBeNull();
  });
  it('accepts the length bounds', () => {
    expect(isPlausibleToken('a'.repeat(16))).toBe(true);
    expect(isPlausibleToken('a'.repeat(200))).toBe(true);
    expect(isPlausibleToken('a'.repeat(15))).toBe(false);
  });
});

describe('fragment and stash', () => {
  it('detects a fragment worth removing', () => {
    expect(hasFragment('')).toBe(false);
    expect(hasFragment('#')).toBe(false);
    expect(hasFragment('#token=x')).toBe(true);
  });
  it('keeps the token under a wedding-hq: key in session storage only until cleared', () => {
    const s = memory();
    stashToken(TOKEN, s);
    expect(s.getItem(JOIN_TOKEN_KEY)).toBe(TOKEN);
    expect(JOIN_TOKEN_KEY.startsWith('wedding-hq:')).toBe(true);
    expect(readStashedToken(s)).toBe(TOKEN);
    clearStashedToken(s);
    expect(readStashedToken(s)).toBeNull();
  });
  it('ignores a corrupted stash', () => {
    const s = memory();
    s.setItem(JOIN_TOKEN_KEY, 'bad value!');
    expect(readStashedToken(s)).toBeNull();
  });
  it('prefers the URL over the stash, and falls back to the stash', () => {
    const s = memory();
    stashToken('stashed_stashed_stashed', s);
    expect(resolveToken(`#token=${TOKEN}`, s)).toBe(TOKEN);
    expect(resolveToken('', s)).toBe('stashed_stashed_stashed');
    expect(resolveToken('', memory())).toBeNull();
  });
  it('survives blocked storage', () => {
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } } as unknown as Storage;
    expect(() => stashToken(TOKEN, blocked)).not.toThrow();
    expect(readStashedToken(blocked)).toBeNull();
    expect(() => clearStashedToken(blocked)).not.toThrow();
  });
});
