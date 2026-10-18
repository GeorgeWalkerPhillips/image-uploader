import { OFFLINE_WRITE_MESSAGE, assertOnline, isOnline } from './useOnline';

afterEach(() => jest.restoreAllMocks());

test('writes fail immediately and honestly while offline, and pass when online', () => {
  const spy = jest.spyOn(window.navigator, 'onLine', 'get');
  spy.mockReturnValue(true);
  expect(isOnline()).toBe(true);
  expect(() => assertOnline()).not.toThrow();
  spy.mockReturnValue(false);
  expect(isOnline()).toBe(false);
  expect(() => assertOnline()).toThrow(OFFLINE_WRITE_MESSAGE);
});
