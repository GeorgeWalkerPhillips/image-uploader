import { startCheckout, verifyPurchase, getPlannerStatus, NO_PLANNER_STATUS } from './weddingPlannerService';
import { supabase } from '../supabaseClient';

jest.mock('../supabaseClient', () => ({
  supabase: { functions: { invoke: jest.fn() }, rpc: jest.fn() },
}));

describe('weddingPlannerService', () => {
  const originalLocation = window.location;
  let assign;

  beforeEach(() => {
    jest.resetAllMocks();
    assign = jest.fn();
    delete window.location;
    window.location = { ...originalLocation, assign };
  });
  afterEach(() => {
    window.location = originalLocation;
  });

  describe('startCheckout', () => {
    it('invokes the checkout function and redirects to the returned url', async () => {
      supabase.functions.invoke.mockResolvedValue({ data: { checkoutUrl: 'https://checkout.paystack.com/abc' }, error: null });
      await startCheckout();
      expect(supabase.functions.invoke).toHaveBeenCalledWith('wedding-planner-checkout', { body: {} });
      expect(assign).toHaveBeenCalledWith('https://checkout.paystack.com/abc');
    });

    it('surfaces the server error body and does not redirect', async () => {
      const error = { message: 'non-2xx', context: { json: async () => ({ error: 'Already purchased' }) } };
      supabase.functions.invoke.mockResolvedValue({ data: null, error });
      await expect(startCheckout()).rejects.toThrow('Already purchased');
      expect(assign).not.toHaveBeenCalled();
    });

    it('rejects a missing or non-https checkout url', async () => {
      supabase.functions.invoke.mockResolvedValue({ data: { checkoutUrl: 'javascript:alert(1)' }, error: null });
      await expect(startCheckout()).rejects.toThrow(/checkout/i);
      supabase.functions.invoke.mockResolvedValue({ data: {}, error: null });
      await expect(startCheckout()).rejects.toThrow(/checkout/i);
      expect(assign).not.toHaveBeenCalled();
    });
  });

  describe('verifyPurchase', () => {
    it('sends the reference and returns the status', async () => {
      supabase.functions.invoke.mockResolvedValue({ data: { status: 'paid' }, error: null });
      await expect(verifyPurchase('ref1')).resolves.toEqual({ status: 'paid' });
      expect(supabase.functions.invoke).toHaveBeenCalledWith('wedding-planner-verify', { body: { reference: 'ref1' } });
    });

    it('rejects on transport error and on a reply with no status', async () => {
      supabase.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error('network') });
      await expect(verifyPurchase('r')).rejects.toThrow();
      supabase.functions.invoke.mockResolvedValueOnce({ data: { error: 'nope' }, error: null });
      await expect(verifyPurchase('r')).rejects.toThrow('nope');
    });
  });

  describe('getPlannerStatus', () => {
    it('returns the RPC row', async () => {
      supabase.rpc.mockResolvedValue({ data: { entitled: true, wedding_id: 'w1', access: 'partner', role: 'bride' }, error: null });
      await expect(getPlannerStatus()).resolves.toEqual({ entitled: true, wedding_id: 'w1', access: 'partner', role: 'bride' });
      expect(supabase.rpc).toHaveBeenCalledWith('my_wedding_planner_status');
    });

    it('accepts a single-row array reply', async () => {
      supabase.rpc.mockResolvedValue({ data: [{ entitled: false, wedding_id: 'w1', access: 'collaborator', role: 'helper' }], error: null });
      expect((await getPlannerStatus()).access).toBe('collaborator');
    });

    it('fails closed on RPC error, thrown error, or junk', async () => {
      supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'x' } });
      await expect(getPlannerStatus()).resolves.toEqual(NO_PLANNER_STATUS);
      supabase.rpc.mockRejectedValueOnce(new Error('offline'));
      await expect(getPlannerStatus()).resolves.toEqual(NO_PLANNER_STATUS);
      supabase.rpc.mockResolvedValueOnce({ data: { entitled: 'yes', access: 'admin' }, error: null });
      await expect(getPlannerStatus()).resolves.toMatchObject({ entitled: false, access: null });
    });
  });
});
