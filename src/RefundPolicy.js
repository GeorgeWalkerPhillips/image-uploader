import React from 'react';
import { Link } from 'react-router-dom';
import styles from './LegalPage.module.css';

// TODO before launch: confirm the contact email, trading name, and the
// 7-day/24-hour refund windows below match what you actually want to honor.
const CONTACT_EMAIL = 'georgewalkerphillips5@gmail.com';
const TRADING_NAME = 'Valere';

function RefundPolicy() {
  return (
    <div className={styles.legalContainer}>
      <div className={styles.legalCard}>
        <Link to="/" className={styles.brand}>
          Valere
        </Link>
        <h1>Refund and Cancellation Policy</h1>
        <p className={styles.updatedAt}>Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <p>
          {TRADING_NAME} charges a single, one-time fee per event based on
          your guest-count tier (Free, Starter, Growth, or Unlimited) — never
          a recurring subscription. This policy explains when that fee is
          refundable if your plans change or something goes wrong.
        </p>

        <h2>Cancelling before your event</h2>
        <p>
          If you cancel your event more than 7 days before its start date,
          you'll receive a full refund. Email us using the details below and
          we'll process it — no need to justify the cancellation.
        </p>

        <h2>Cancelling close to or after your event</h2>
        <p>
          Once your event is within 7 days of its start date, your gallery
          link and QR code are live and guests may already be uploading
          photos, so the service has effectively begun being used:
        </p>
        <ul>
          <li>
            <strong>Within 7 days of the start date, before it begins, and no
            guest has uploaded a photo yet:</strong> we'll refund 50% of the
            fee.
          </li>
          <li>
            <strong>Once the event has started, or once any guest has
            uploaded a photo:</strong> the fee is non-refundable. At that
            point you've received the guest cap, photo cap, and gallery
            access you paid for.
          </li>
        </ul>
        <p>
          This mirrors the payment terms in our{' '}
          <Link to="/terms">Terms and Conditions</Link>.
        </p>

        <h2>Technical failures on our end</h2>
        <p>
          If a fault in {TRADING_NAME} itself — such as app downtime or a
          bug — prevents your guests from uploading photos for a meaningful
          part of your event, we'll make it right: either a full refund or,
          if you'd rather keep using the platform, a credit toward a future
          event (e.g. an extended expiry window or a complimentary
          tier upgrade). This does not cover issues outside our control,
          like a guest's own phone, camera, or internet connection.
        </p>

        <h2>Free events</h2>
        <p>
          Free-tier events aren't charged, so there's nothing to refund. This
          policy applies only to paid events (Starter, Growth, and
          Unlimited).
        </p>

        <h2>How to request a cancellation or refund</h2>
        <p>
          Email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with
          your event name or event ID and the reason for your request. We'll
          confirm which of the above applies and let you know the outcome.
        </p>

        <h2>Refund processing time</h2>
        <p>
          We aim to review every request within 3 business days. Approved
          refunds are issued back to your original Paystack payment method
          and typically reflect within 5–10 business days, depending on your
          bank or card issuer — we don't hold refunded funds any longer than
          it takes Paystack to process them.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will
          be reflected by updating the date at the top of this page.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy, or about a specific event's
          eligibility? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <Link to="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

export default RefundPolicy;
