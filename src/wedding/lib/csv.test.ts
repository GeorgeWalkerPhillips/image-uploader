import { csvCell, csvNum, neutraliseFormula, parseCsv, toCsv } from './csv';

describe('parseCsv', () => {
  it('parses plain rows', () => {
    expect(parseCsv('a,b,c\n1,2,3').rows).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });
  it('handles CRLF, lone CR and a trailing newline', () => {
    expect(parseCsv('a,b\r\n1,2\r\n').rows).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2').rows).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('strips a UTF-8 BOM so the first header is clean', () => {
    expect(parseCsv('﻿name,email\nAda,a@x.co').rows[0]).toEqual(['name', 'email']);
  });
  it('keeps commas, doubled quotes and newlines inside quoted fields', () => {
    const r = parseCsv('name,notes\n"Test, Ada","She said ""hi""\nsecond line"\n').rows;
    expect(r).toEqual([['name', 'notes'], ['Test, Ada', 'She said "hi"\nsecond line']]);
  });
  it('keeps ragged rows ragged and drops blank lines', () => {
    expect(parseCsv('a,b,c\n1\n\n1,2,3,4\n').rows).toEqual([['a', 'b', 'c'], ['1'], ['1', '2', '3', '4']]);
  });
  it('keeps empty cells and an explicitly quoted empty row', () => {
    expect(parseCsv('a,,c\n"",,').rows).toEqual([['a', '', 'c'], ['', '', '']]);
    expect(parseCsv('a\n""\n').rows).toEqual([['a'], ['']]);
  });
  it('treats a quote in the middle of an unquoted cell as text', () => {
    expect(parseCsv('5" pipe,x').rows).toEqual([['5" pipe', 'x']]);
  });
  it('detects semicolons and tabs, ignoring delimiters inside quotes', () => {
    expect(parseCsv('a;b\n1;2').delimiter).toBe(';');
    expect(parseCsv('a;b\n1;2').rows).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a\tb\n1\t2').rows).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('"a;b;c",d\n1,2').delimiter).toBe(',');
  });
  it('flags an unterminated quote instead of throwing', () => {
    const r = parseCsv('a,b\n1,"oops');
    expect(r.unterminatedQuote).toBe(true);
    expect(r.rows[1]).toEqual(['1', 'oops']);
  });
  it('returns no rows for empty input', () => {
    expect(parseCsv('').rows).toEqual([]);
    expect(parseCsv('\n\n').rows).toEqual([]);
  });
});

describe('csv writing', () => {
  it('neutralises cells a spreadsheet would run as formulas', () => {
    for (const bad of ['=SUM(A1)', '+1', '-1', '@cmd', '\tx', '\rx']) {
      expect(neutraliseFormula(bad)).toBe(`'${bad}`);
    }
    expect(neutraliseFormula('Ada')).toBe('Ada');
    expect(neutraliseFormula('a=b')).toBe('a=b');
  });
  it('quotes cells with commas, quotes, newlines or edge spaces', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(' pad')).toBe('" pad"');
    expect(csvCell('plain')).toBe('plain');
  });
  it('writes the injected text quoted and prefixed together', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe('"\'=HYPERLINK(""http://evil"",""x"")"');
  });
  it('writes null, booleans and numbers', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('yes');
    expect(csvCell(false)).toBe('no');
    expect(csvCell(-250)).toBe('-250');
    expect(csvCell(Number.NaN)).toBe('');
  });
  it('writes trusted decimals raw (negative too) but escapes anything else', () => {
    expect(csvCell(csvNum('-250.50'))).toBe('-250.50');
    expect(csvCell(csvNum('15000.00'))).toBe('15000.00');
    expect(csvCell(csvNum('=1+1'))).toBe("'=1+1");
  });
  it('starts with a BOM, uses CRLF and ends with a line break', () => {
    const out = toCsv(['A', 'B'], [['x', 1], ['y,z', null]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.slice(1)).toBe('A,B\r\nx,1\r\n"y,z",\r\n');
  });
  it('round-trips through parseCsv', () => {
    const rows = [['Ada, "the" first', 'line1\nline2'], ['', 'x']];
    expect(parseCsv(toCsv(['a', 'b'], rows)).rows.slice(1)).toEqual(rows);
  });
});

describe('parseCsv whitespace before an opening quote', () => {
  it('keeps a quoted cell with a comma when spaces precede the quote', () => {
    expect(parseCsv('Ada, "Smith, Jr",x').rows).toEqual([['Ada', 'Smith, Jr', 'x']]);
    expect(parseCsv('a;\t"b;c";d').rows[0]).toEqual(['a', 'b;c', 'd']);
  });
  it('does not treat a quote after other text as an opening quote', () => {
    expect(parseCsv('a, x"y,z').rows).toEqual([['a', ' x"y', 'z']]);
  });
});
