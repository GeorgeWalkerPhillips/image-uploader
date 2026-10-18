import '../testPolyfills';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { renderPage } from '../testHelpers';
import { resetDb } from '../testBackend';
import * as api from '../api';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: { ...b.wedding, budget_cents: 4350000 }, member: b.member }) };
});
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

beforeEach(() => resetDb());

test('money fields show grouped amounts, tidy on blur, and still save as cents', async () => {
  renderPage(<SettingsPage />);
  const budget = screen.getByLabelText('Wedding budget (R)');
  expect(budget).toHaveValue('43 500');

  const honeymoon = screen.getByLabelText('Honeymoon budget (R)');
  await userEvent.clear(honeymoon);
  await userEvent.type(honeymoon, '60000');
  await userEvent.tab();
  expect(honeymoon).toHaveValue('60 000');

  await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await screen.findByRole('button', { name: 'Save settings' });
  const update = api.updateWedding as unknown as jest.Mock;
  expect(update).toHaveBeenCalledWith(
    'w1',
    expect.objectContaining({ budget_cents: 4350000, honeymoon_budget_cents: 6000000 })
  );
});
