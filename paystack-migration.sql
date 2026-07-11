-- Switching payment provider from Stripe to Paystack (Stripe doesn't
-- support South African merchant payouts — see conversation). The
-- security architecture from security-hardening.sql is fully
-- provider-agnostic (it only checks auth.role() = 'service_role') and
-- needs no changes at all. This migration just fixes a column name that
-- was Stripe-specific and would now be misleading.
ALTER TABLE payments RENAME COLUMN stripe_payment_intent_id TO payment_reference;

-- The index name is cosmetic (doesn't affect anything functionally) but
-- renamed too for consistency with the column.
ALTER INDEX IF EXISTS idx_payments_stripe_id RENAME TO idx_payments_reference;
