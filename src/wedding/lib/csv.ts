// Small, dependency-free CSV reader and writer for Wedding HQ (guest import,
// data export). Reading is lenient (Excel, Google Sheets and phone exports all
// differ); writing is strict: Excel-safe and safe against formula injection.

export interface CsvParseResult {
  rows: string[][];
  delimiter: ',' | ';' | '\t';
  // True when a quoted field was never closed (the rest of the text was kept as that field).
  unterminatedQuote: boolean;
}

const BOM = '﻿';

// Picks the delimiter from the first line, ignoring anything inside quotes.
// Excel in South African locales writes ";" and Sheets copies as tabs.
export function detectDelimiter(text: string): ',' | ';' | '\t' {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const ch of text) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === '\n' || ch === '\r') break;
      if (ch in counts) counts[ch] += 1;
    }
  }
  if (counts[','] >= counts[';'] && counts[','] >= counts['\t']) return ',';
  return counts[';'] >= counts['\t'] ? ';' : '\t';
}

// Parses CSV text into rows of cells. Handles a leading BOM, CRLF / LF / CR line
// ends, quoted fields with "" escapes, and commas or newlines inside quotes.
// Rows are not padded (ragged rows stay ragged) and fully blank lines are dropped.
export function parseCsv(input: string): CsvParseResult {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let cellStarted = false; // a quote opened this cell, so "" is an empty value not a blank line
  let unterminatedQuote = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
    cellStarted = false;
  };
  const endRow = () => {
    const quoted = cellStarted;
    endCell();
    const blank = row.length === 1 && row[0].trim() === '' && !quoted;
    if (!blank) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (text.charAt(i + 1) === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === '' && !cellStarted) {
      inQuotes = true;
      cellStarted = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\r') {
      if (text.charAt(i + 1) === '\n') i += 1;
      endRow();
    } else if (ch === '\n') {
      endRow();
    } else {
      cell += ch;
    }
  }
  if (inQuotes) unterminatedQuote = true;
  if (cell !== '' || row.length > 0 || cellStarted) endRow();
  return { rows, delimiter, unterminatedQuote };
}

// ---------------------------------------------------------------- writing

// A trusted numeric string such as "15000.00" or "-250.50", written as-is so a
// negative amount is not mistaken for a formula. Anything that is not a plain
// decimal falls back to being escaped like text.
export interface CsvNumber {
  num: string;
}
export const csvNum = (num: string): CsvNumber => ({ num });

export type CsvCell = string | number | boolean | null | undefined | CsvNumber;

const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;
const FORMULA_START = /^[=+\-@\t\r]/;

// Text a spreadsheet could run as a formula gets a leading apostrophe, so it
// opens as text. This also changes "-5" typed as text, which is the safe side.
export function neutraliseFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

export function csvCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return '';
  if (typeof cell === 'number') return Number.isFinite(cell) ? String(cell) : '';
  if (typeof cell === 'boolean') return cell ? 'yes' : 'no';
  let text: string;
  if (typeof cell === 'object') {
    if (PLAIN_DECIMAL.test(cell.num)) return cell.num;
    text = neutraliseFormula(cell.num);
  } else {
    text = neutraliseFormula(cell);
  }
  return /[",\r\n;]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

// UTF-8 BOM (so Excel reads accents and rand signs correctly) and CRLF line ends.
export function toCsv(header: readonly string[], rows: readonly (readonly CsvCell[])[]): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(','));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
