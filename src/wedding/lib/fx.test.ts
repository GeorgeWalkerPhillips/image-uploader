import {
  convertText, formatRate, formatThb, normalizeRate, parseFxRate, thbSatangToZarCents, validateFxRate,
  zarCentsToThbSatang,
} from './fx';

const NBSP = ' ';

describe('parseFxRate', () => {
  test.each([
    ['1.85', 1.85],
    ['1,85', 1.85],
    [' 2 ', 2],
    ['0.0001', 0.0001],
    ['1.123456', 1.1235],
    ['999999.9999', 999999.9999],
  ])('%s -> %s', (text, expected) => {
    expect(parseFxRate(text)).toBe(expected);
  });

  test.each(['', 'abc', '0', '0.0000', '0.00004', '-1', '1.2.3', '1e3', '1000000', 'R1.85', '1.85 THB'])(
    'rejects %j',
    (text) => {
      expect(parseFxRate(text)).toBeNull();
    }
  );
});

describe('normalizeRate', () => {
  test('accepts numbers and numeric strings, rejects the rest', () => {
    expect(normalizeRate(1.85)).toBe(1.85);
    expect(normalizeRate('1.8500')).toBe(1.85);
    expect(normalizeRate(null)).toBeNull();
    expect(normalizeRate(undefined)).toBeNull();
    expect(normalizeRate(0)).toBeNull();
    expect(normalizeRate(-2)).toBeNull();
    expect(normalizeRate(NaN)).toBeNull();
    expect(normalizeRate(Infinity)).toBeNull();
  });
});

describe('validateFxRate', () => {
  test('returns the rate for the settings column', () => {
    expect(validateFxRate('1,9')).toEqual({ ok: true, value: { fx_thb_per_zar: 1.9 } });
  });
  test('blank and non-positive rates get friendly errors', () => {
    expect(validateFxRate('')).toEqual({ ok: false, errors: { rate: 'Enter the rate, e.g. 1.85.' } });
    const zero = validateFxRate('0');
    expect(zero.ok).toBe(false);
    const neg = validateFxRate('-3');
    expect(neg.ok).toBe(false);
    const tiny = validateFxRate('0.00001');
    expect(tiny.ok).toBe(false);
  });
});

describe('conversion', () => {
  test('R100.00 at 1.85 is THB 185.00 and back', () => {
    expect(zarCentsToThbSatang(10000, 1.85)).toBe(18500);
    expect(thbSatangToZarCents(18500, 1.85)).toBe(10000);
  });

  test('R60 000 honeymoon budget converts exactly', () => {
    expect(zarCentsToThbSatang(6000000, 1.85)).toBe(11100000);
  });

  test('rounds half up to the nearest satang / cent', () => {
    // 1 cent at 1.85 = 1.85 satang -> 2
    expect(zarCentsToThbSatang(1, 1.85)).toBe(2);
    // 0.5 satang exactly: 1 cent at 0.5 -> rounds up to 1
    expect(zarCentsToThbSatang(1, 0.5)).toBe(1);
    expect(zarCentsToThbSatang(1, 0.4999)).toBe(0);
    // 1 satang at 1.85 = 0.5405 cents -> 1
    expect(thbSatangToZarCents(1, 1.85)).toBe(1);
    expect(thbSatangToZarCents(1, 3)).toBe(0);
  });

  test('zero converts to zero', () => {
    expect(zarCentsToThbSatang(0, 1.85)).toBe(0);
    expect(thbSatangToZarCents(0, 1.85)).toBe(0);
  });

  test('does not suffer from floating point drift', () => {
    // 0.1 + 0.2 style traps: 33 cents at 1.1 is exactly 36.3 satang
    expect(zarCentsToThbSatang(33, 1.1)).toBe(36);
    expect(zarCentsToThbSatang(1005, 1.0001)).toBe(1005);
    expect(zarCentsToThbSatang(123456789, 1.2345)).toBe(152407406);
  });

  test('refuses unusable rates, negative or unsafe amounts', () => {
    expect(zarCentsToThbSatang(100, 0)).toBeNull();
    expect(zarCentsToThbSatang(100, -1)).toBeNull();
    expect(zarCentsToThbSatang(100, NaN)).toBeNull();
    expect(zarCentsToThbSatang(-100, 1.85)).toBeNull();
    expect(zarCentsToThbSatang(1.5, 1.85)).toBeNull();
    expect(zarCentsToThbSatang(Number.MAX_SAFE_INTEGER, 1.85)).toBeNull();
    expect(thbSatangToZarCents(100, 0)).toBeNull();
    expect(thbSatangToZarCents(-1, 1.85)).toBeNull();
  });
});

describe('formatting', () => {
  test('formatThb groups with non-breaking spaces', () => {
    expect(formatThb(18500)).toBe(`THB${NBSP}185,00`);
    expect(formatThb(11100000)).toBe(`THB${NBSP}111${NBSP}000,00`);
    expect(formatThb(5)).toBe(`THB${NBSP}0,05`);
    expect(formatThb(NaN)).toBe(`THB${NBSP}0,00`);
  });
  test('formatRate shows the stored rate', () => {
    expect(formatRate(1.85)).toBe('1.85');
  });
});

describe('convertText', () => {
  test('empty input shows nothing, valid input converts, bad input explains', () => {
    expect(convertText('  ', 'zarToThb', 1.85)).toBeNull();
    expect(convertText('1 000', 'zarToThb', 1.85)).toEqual({ ok: true, minor: 185000, inputMinor: 100000 });
    expect(convertText('1850', 'thbToZar', 1.85)).toEqual({ ok: true, minor: 100000, inputMinor: 185000 });
    expect(convertText('12,50', 'zarToThb', 2)).toEqual({ ok: true, minor: 2500, inputMinor: 1250 });
    expect(convertText('abc', 'zarToThb', 1.85)).toEqual({ ok: false, error: 'Enter a valid amount, e.g. 1 500.' });
    expect(convertText('-5', 'zarToThb', 1.85)).toEqual({ ok: false, error: 'Enter a valid amount, e.g. 1 500.' });
    expect(convertText('90071992547409', 'zarToThb', 1.85)).toEqual({ ok: false, error: 'That amount is too large to convert.' });
  });
});
