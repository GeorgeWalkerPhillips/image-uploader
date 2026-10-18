import { centsToGroupedInput, centsToInput, formatAmountText, formatZar, formatZarShort, parseRandsToCents, sumCents } from './money';

const nb = ' ';

describe('formatZar', () => {
  it('formats as R 15 000,00 with non-breaking spaces', () => {
    expect(formatZar(1500000)).toBe(`R${nb}15${nb}000,00`);
  });
  it('handles zero, small and fractional amounts', () => {
    expect(formatZar(0)).toBe(`R${nb}0,00`);
    expect(formatZar(5)).toBe(`R${nb}0,05`);
    expect(formatZar(750050)).toBe(`R${nb}7${nb}500,50`);
  });
  it('handles millions and negatives', () => {
    expect(formatZar(123456789)).toBe(`R${nb}1${nb}234${nb}567,89`);
    expect(formatZar(-150000)).toBe(`-R${nb}1${nb}500,00`);
  });
  it('never throws on bad input', () => {
    expect(formatZar(Number.NaN)).toBe(`R${nb}0,00`);
  });
  it('short form rounds to whole rands', () => {
    expect(formatZarShort(1500049)).toBe(`R${nb}15${nb}000`);
    expect(formatZarShort(6000000)).toBe(`R${nb}60${nb}000`);
  });
});

describe('parseRandsToCents', () => {
  it.each([
    ['15000', 1500000],
    ['15 000', 1500000],
    ['R15 000', 1500000],
    ['R 15 000,50', 1500050],
    ['15,000', 1500000],
    ['15.000', 1500000],
    ['15,000.50', 1500050],
    ['15.000,50', 1500050],
    ['15,5', 1550],
    ['0,05', 5],
    ['7500', 750000],
    ['1,234,567.89', 123456789],
  ])('parses %s', (input, expected) => {
    expect(parseRandsToCents(input as string)).toBe(expected);
  });
  it('parses negatives', () => {
    expect(parseRandsToCents('-R1 500')).toBe(-150000);
  });
  it('rejects garbage', () => {
    expect(parseRandsToCents('')).toBeNull();
    expect(parseRandsToCents('abc')).toBeNull();
    expect(parseRandsToCents('R')).toBeNull();
    expect(parseRandsToCents('12x4')).toBeNull();
  });
  it('round-trips through centsToInput', () => {
    for (const cents of [0, 5, 100, 750050, 1500000, 6000000, 123456789]) {
      expect(parseRandsToCents(centsToInput(cents))).toBe(cents);
    }
  });
});

describe('sumCents', () => {
  it('adds integers exactly', () => {
    expect(sumCents([750000, 1500000, 1500000, 400000, 200000, 0])).toBe(4350000);
  });
});

describe('grouped amount text', () => {
  test('centsToGroupedInput groups thousands and round-trips', () => {
    expect(centsToGroupedInput(4350000)).toBe('43 500');
    expect(centsToGroupedInput(4350050)).toBe('43 500,50');
    expect(centsToGroupedInput(0)).toBe('0');
    expect(centsToGroupedInput(null)).toBe('');
    expect(parseRandsToCents(centsToGroupedInput(123456789))).toBe(123456789);
  });
  test('formatAmountText formats valid text and leaves junk alone', () => {
    expect(formatAmountText('43500')).toBe('43 500');
    expect(formatAmountText('R15000,5')).toBe('15 000,50');
    expect(formatAmountText('')).toBe('');
    expect(formatAmountText('abc')).toBe('abc');
  });
});
