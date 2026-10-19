import '../testPolyfills';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPage } from './SettingsPage';
import { renderPage } from '../testHelpers';
import { db, resetDb } from '../testBackend';
import { notify } from '../notify';
import * as api from '../api';

jest.mock('../api', () => jest.requireActual('../testBackend').createApiMock());
jest.mock('../WeddingContext', () => {
  const b = jest.requireActual('../testBackend');
  return { useWedding: () => ({ wedding: b.wedding, member: b.member }) };
});
jest.mock('../useAuthUser', () => ({
  useAuthUser: () => ({ user: { id: 'user-1' }, loading: false, signOut: async () => undefined }),
}));
jest.mock('../notify', () => ({ notify: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));

const SAVED = {
  id: 'r1', wedding_id: 'w1', user_id: 'user-1', enabled: true, lead_days: [0, 1],
  include_events: true, include_tasks: true, include_payments: true,
};
const save = () => api.saveReminderSettings as unknown as jest.Mock;
const chip = (name: string) => screen.getByRole('button', { name });

beforeEach(() => resetDb());

test('with no saved row the defaults are shown', async () => {
  renderPage(<SettingsPage />);
  await screen.findByRole('heading', { name: 'Email reminders' });
  expect(await screen.findByLabelText('Send me email reminders')).toBeChecked();
  expect(chip('Same day')).toHaveAttribute('aria-pressed', 'true');
  expect(chip('1 day before')).toHaveAttribute('aria-pressed', 'true');
  expect(chip('1 week before')).toHaveAttribute('aria-pressed', 'false');
  for (const l of ['Events', 'Tasks', 'Payments due']) expect(screen.getByLabelText(l)).toBeChecked();
  expect(screen.getByText(/one email around 07:00 listing events, tasks and payments due today and tomorrow/)).toBeInTheDocument();
  expect(screen.getByText(/never guest details/)).toBeInTheDocument();
});

test('chips and toggles save the right payload, creating the row for this user', async () => {
  renderPage(<SettingsPage />);
  await userEvent.click(await screen.findByRole('button', { name: '1 week before' }));
  await userEvent.click(chip('1 day before'));
  await userEvent.click(screen.getByLabelText('Tasks'));
  await userEvent.click(screen.getByRole('button', { name: 'Save reminders' }));
  await waitFor(() => expect(notify.success).toHaveBeenCalledWith('Reminders saved'));
  expect(save()).toHaveBeenCalledWith('w1', 'user-1', {
    enabled: true, lead_days: [0, 7], include_events: true, include_tasks: false, include_payments: true,
  });
});

test('a saved row is shown, and the master toggle can switch reminders off', async () => {
  resetDb({ wedding_reminder_settings: [{ ...SAVED, lead_days: [7], include_payments: false }] });
  renderPage(<SettingsPage />);
  expect(await screen.findByRole('button', { name: '1 week before' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByLabelText('Payments due')).not.toBeChecked();
  await userEvent.click(screen.getByLabelText('Send me email reminders'));
  expect(screen.queryByRole('button', { name: '1 week before' })).not.toBeInTheDocument();
  expect(screen.getByText(/Reminders are off/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Save reminders' }));
  await waitFor(() => expect(save()).toHaveBeenCalled());
  expect(save().mock.calls[0][2]).toMatchObject({ enabled: false, lead_days: [7] });
});

test('chips are 44px-class toggles and stop at six', async () => {
  renderPage(<SettingsPage />);
  for (const l of ['2 days before', '3 days before', '1 week before', '2 weeks before']) await userEvent.click(await screen.findByRole('button', { name: l }));
  expect(chip('30 days before')).toBeDisabled();
  expect(screen.getByText(/up to 6 reminder times/)).toBeInTheDocument();
});

test('none selected while enabled shows an error and does not save', async () => {
  renderPage(<SettingsPage />);
  await userEvent.click(await screen.findByRole('button', { name: 'Same day' }));
  await userEvent.click(chip('1 day before'));
  await userEvent.click(screen.getByRole('button', { name: 'Save reminders' }));
  expect(await screen.findByText('Pick at least one reminder time.')).toBeInTheDocument();
  expect(save()).not.toHaveBeenCalled();
});

test('a failed save shows an error toast and keeps the edits', async () => {
  db.failSave.add('wedding_reminder_settings');
  renderPage(<SettingsPage />);
  await userEvent.click(await screen.findByRole('button', { name: '2 weeks before' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save reminders' }));
  await waitFor(() => expect(notify.error).toHaveBeenCalledWith('mock save failure'));
  expect(notify.success).not.toHaveBeenCalled();
  expect(chip('2 weeks before')).toHaveAttribute('aria-pressed', 'true');
});

test('a failed load shows a retry, never the defaults, and retry recovers', async () => {
  db.failFetch.add('wedding_reminder_settings');
  renderPage(<SettingsPage />);
  expect(await screen.findByText("Couldn't load your reminder settings.")).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Save reminders' })).not.toBeInTheDocument();
  db.failFetch.clear();
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByRole('button', { name: 'Save reminders' })).toBeInTheDocument();
});

test('offline: save is disabled with an honest message', async () => {
  const spy = jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
  renderPage(<SettingsPage />);
  expect(await screen.findByText(/You're offline\. You can save once/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save reminders' })).toBeDisabled();
  spy.mockRestore();
});
