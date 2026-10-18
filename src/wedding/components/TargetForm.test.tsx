import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TargetForm } from './TargetForm';
import { computeMetrics } from '../lib/budget';
import type { Metrics } from '../lib/budget';
import type { Category } from '../types';

const categories: Category[] = [
  { id: 'c1', wedding_id: 'w', scope: 'wedding', name: 'Venue', color: null, sort_order: 0 },
];

function setup() {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();
  render(<TargetForm categories={categories} onSubmit={onSubmit} onCancel={onCancel} />);
  return { onSubmit, onCancel };
}

test('empty form shows errors and does not submit', async () => {
  const { onSubmit } = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Save target' }));
  expect(screen.getByText('Give the target a title.')).toBeInTheDocument();
  expect(screen.getByText('Enter the target amount.')).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('category metric requires a category; category select only shows then', async () => {
  const { onSubmit } = setup();
  expect(screen.queryByLabelText('Category')).not.toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('Title'), 'Venue cap');
  await userEvent.type(screen.getByLabelText('Target amount (R)'), '50 000');
  await userEvent.selectOptions(screen.getByLabelText('Measured by'), 'category_paid');
  await userEvent.click(screen.getByRole('button', { name: 'Save target' }));
  expect(screen.getByText('Choose a category for this metric.')).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();

  await userEvent.selectOptions(screen.getByLabelText(/^Category/), 'c1');
  await userEvent.click(screen.getByRole('button', { name: 'Save target' }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({ title: 'Venue cap', metric: 'category_paid', category_id: 'c1', target_cents: 5000000 })
  );
});

test('date target needs a date', async () => {
  const { onSubmit } = setup();
  await userEvent.type(screen.getByLabelText('Title'), 'Dress fitting');
  await userEvent.selectOptions(screen.getByLabelText('Type'), 'date');
  await userEvent.click(screen.getByRole('button', { name: 'Save target' }));
  expect(screen.getByText('Choose the date.')).toBeInTheDocument();
  expect(onSubmit).not.toHaveBeenCalled();
});

describe('per-month hint', () => {
  const metrics = computeMetrics({ categories: [], lines: [], invoices: [], payments: [], savings: [] });
  const future = `${new Date().getFullYear() + 1}-12-31`;

  async function fillSavings(m?: Metrics) {
    render(<TargetForm categories={categories} metrics={m} onSubmit={jest.fn()} onCancel={jest.fn()} />);
    await userEvent.selectOptions(screen.getByLabelText('Scope'), 'savings');
    await userEvent.type(screen.getByLabelText('Target amount (R)'), '12 000');
    await userEvent.type(screen.getByLabelText(/^Deadline/), future);
  }

  test('shows for a manual savings goal', async () => {
    await fillSavings(metrics);
    expect(screen.getByText(/per month to finish on time/)).toBeInTheDocument();
  });

  test('also shows for a budget-measured savings goal when figures loaded', async () => {
    await fillSavings(metrics);
    await userEvent.selectOptions(screen.getByLabelText('Measured by'), 'savings_total');
    expect(screen.getByText(/per month to finish on time/)).toBeInTheDocument();
  });

  test('is hidden for a budget-measured goal when figures failed to load', async () => {
    await fillSavings(undefined);
    await userEvent.selectOptions(screen.getByLabelText('Measured by'), 'savings_total');
    expect(screen.queryByText(/per month to finish on time/)).not.toBeInTheDocument();
  });
});

test('field error sits outside the label but is linked by aria-describedby', async () => {
  setup();
  await userEvent.click(screen.getByRole('button', { name: 'Save target' }));
  const alert = screen.getByText('Give the target a title.');
  expect(alert.closest('label')).toBeNull();
  expect(screen.getByLabelText('Title')).toHaveAttribute('aria-describedby', alert.id);
});
