import '../testPolyfills';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { computeMetrics } from '../lib/budget';

const refetchBudget = jest.fn();
const refetchTargets = jest.fn();
const refetchTasks = jest.fn();
const emptyMetrics = computeMetrics({ categories: [], lines: [], invoices: [], payments: [], savings: [] });

jest.mock('../WeddingContext', () => ({
  useWedding: () => ({
    member: { display_name: 'Val' },
    wedding: {
      id: 'w1', name: 'Our Wedding', wedding_date: '2027-03-06T13:00:00Z', honeymoon_start: null,
      budget_cents: 0, honeymoon_budget_cents: 0,
    },
  }),
}));

const mockBudget = jest.fn();
const mockTasks = jest.fn();
const mockTargets = jest.fn();
jest.mock('../hooks', () => ({
  useBudgetData: () => mockBudget(),
  useTasks: () => mockTasks(),
  useTargets: () => mockTargets(),
}));

const okBudget = {
  loading: false, isError: false, refetch: refetchBudget, categories: [], lines: [], invoices: [],
  payments: [], savings: [], metrics: emptyMetrics,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockBudget.mockReturnValue(okBudget);
  mockTasks.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: refetchTasks });
  mockTargets.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: refetchTargets });
});

const renderHome = () => render(<MemoryRouter><HomePage /></MemoryRouter>);

test('failed budget shows errors with retry instead of R 0 rings', async () => {
  mockBudget.mockReturnValue({ ...okBudget, isError: true });
  renderHome();
  expect(screen.getByText('Could not load the budget.')).toBeInTheDocument();
  expect(screen.getByText('Could not load what is coming up.')).toBeInTheDocument();
  await userEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]);
  expect(refetchBudget).toHaveBeenCalled();
});

test('failed tasks and targets show errors, not empty states', async () => {
  mockTasks.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: refetchTasks });
  mockTargets.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: refetchTargets });
  renderHome();
  expect(screen.queryByText(/Nothing due/)).not.toBeInTheDocument();
  expect(screen.queryByText(/No targets yet/)).not.toBeInTheDocument();
  expect(screen.getByText('Could not load targets.')).toBeInTheDocument();
  const buttons = screen.getAllByRole('button', { name: 'Try again' });
  expect(buttons).toHaveLength(2);
  for (const b of buttons) await userEvent.click(b);
  expect(refetchTasks).toHaveBeenCalled();
  expect(refetchTargets).toHaveBeenCalled();
});
