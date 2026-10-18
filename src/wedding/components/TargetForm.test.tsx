import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TargetForm } from './TargetForm';
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
