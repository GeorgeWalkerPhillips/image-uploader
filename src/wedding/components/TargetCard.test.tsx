import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TargetCard } from './TargetCard';
import type { Target } from '../types';

const base: Target = {
  id: 't1', wedding_id: 'w', title: 'Venue cap', kind: 'amount', scope: 'wedding', metric: 'paid_total',
  category_id: null, target_cents: 100000, current_cents: 0, target_at: null, notes: null,
  archived: false, sort_order: 0,
} as Target;

test('budget-measured target shows an error with retry, not R 0, when the budget failed', async () => {
  const onRetry = jest.fn();
  render(<TargetCard target={base} metrics={null} onRetry={onRetry} />);
  expect(screen.getByRole('alert')).toHaveTextContent(/Could not load the budget/);
  expect(screen.queryByText(/R\s?0/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(onRetry).toHaveBeenCalled();
});

test('manual target still renders without budget figures', () => {
  render(<TargetCard target={{ ...base, metric: 'manual', current_cents: 5000 }} metrics={null} />);
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});

describe('date target wording (Johannesburg calendar days)', () => {
  afterEach(() => jest.useRealTimers());
  const date = (at: string): Target => ({ ...base, kind: 'date', metric: 'manual', target_cents: null, target_at: at });

  test('23:00 the day before says 1 day to go', () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-03-05T21:00:00Z')); // 23:00 JHB
    render(<TargetCard target={date('2027-03-06T08:00:00Z')} metrics={null} />);
    expect(screen.getByText('1 day to go')).toBeInTheDocument();
  });
  test('same day says Today', () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-03-06T01:00:00Z'));
    render(<TargetCard target={date('2027-03-06T08:00:00Z')} metrics={null} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
  test('past says days ago', () => {
    jest.useFakeTimers().setSystemTime(new Date('2027-03-08T08:00:00Z'));
    render(<TargetCard target={date('2027-03-06T08:00:00Z')} metrics={null} />);
    expect(screen.getByText('2 days ago')).toBeInTheDocument();
  });
});
