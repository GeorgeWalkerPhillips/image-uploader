import { acceptQuoteChanges, invoiceDraftFromQuote } from './spending';
import type { Quote } from '../types';

export interface AcceptQuoteDeps {
  setQuoteAccepted: (quoteId: string) => Promise<unknown>;
  setLineQuoted: (lineId: string, quotedCents: number) => Promise<unknown>;
  createInvoice: (values: Record<string, unknown>) => Promise<unknown>;
  // Asked only after the earlier writes succeeded.
  confirmInvoice: () => boolean;
}

export type AcceptStep = 'quote' | 'line' | 'invoice';

export interface AcceptQuoteOutcome {
  quoteAccepted: boolean;
  lineUpdated: boolean; // false also when the quote has no linked line
  invoiceCreated: boolean;
  failedStep: AcceptStep | null;
  error: string | null;
}

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : 'Something went wrong.');

// Writes in a fixed order and stops at the first failure so the result is
// honest about exactly what did and did not happen:
//   1. quote -> accepted   2. linked budget line -> quoted price   3. invoice
export async function acceptQuote(quote: Quote, deps: AcceptQuoteDeps): Promise<AcceptQuoteOutcome> {
  const outcome: AcceptQuoteOutcome = {
    quoteAccepted: false,
    lineUpdated: false,
    invoiceCreated: false,
    failedStep: null,
    error: null,
  };
  const changes = acceptQuoteChanges(quote);

  try {
    await deps.setQuoteAccepted(quote.id);
    outcome.quoteAccepted = true;
  } catch (e) {
    return { ...outcome, failedStep: 'quote', error: messageOf(e) };
  }

  if (quote.budget_line_id && changes.lineQuotedCents !== null) {
    try {
      await deps.setLineQuoted(quote.budget_line_id, changes.lineQuotedCents);
      outcome.lineUpdated = true;
    } catch (e) {
      return { ...outcome, failedStep: 'line', error: messageOf(e) };
    }
  }

  if (deps.confirmInvoice()) {
    try {
      await deps.createInvoice({ ...invoiceDraftFromQuote(quote) });
      outcome.invoiceCreated = true;
    } catch (e) {
      return { ...outcome, failedStep: 'invoice', error: messageOf(e) };
    }
  }
  return outcome;
}

export function acceptQuoteMessage(o: AcceptQuoteOutcome): { kind: 'success' | 'warning' | 'error'; text: string } {
  if (!o.failedStep) {
    const parts = ['Quote accepted'];
    if (o.lineUpdated) parts.push('budget line price updated');
    if (o.invoiceCreated) parts.push('invoice created');
    return { kind: 'success', text: `${parts.join(', ')}.` };
  }
  if (o.failedStep === 'quote') {
    return { kind: 'error', text: `Could not accept the quote. Nothing was changed. (${o.error})` };
  }
  if (o.failedStep === 'line') {
    return {
      kind: 'warning',
      text: `Quote accepted, but the budget line price was NOT updated (${o.error}). No invoice was created. Set the line's quoted price by hand.`,
    };
  }
  return {
    kind: 'warning',
    text: `Quote accepted${o.lineUpdated ? ' and budget line updated' : ''}, but the invoice was NOT created (${o.error}). Add it from Invoices.`,
  };
}
