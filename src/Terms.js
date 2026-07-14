import React from 'react';
import { Link } from 'react-router-dom';
import styles from './LegalPage.module.css';

// TODO before launch: confirm the contact email and legal/trading name
// below are correct for your business.
const CONTACT_EMAIL = 'georgewalkerphillips5@gmail.com';
const TRADING_NAME = 'Capture by Val.';

function Terms() {
  return (
    <div className={styles.legalContainer}>
      <div className={styles.legalCard}>
        <Link to="/" className={styles.brand}>
          Capture
        </Link>
        <h1>Terms and Conditions</h1>
        <p className={styles.updatedAt}>Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <p>
          These terms govern your use of {TRADING_NAME} ("Capture," "we,"
          "us"). By creating an account, creating an event, or uploading a
          photo as a guest, you agree to them. If you don't agree, please
          don't use the service.
        </p>

        <h2>The service</h2>
        <p>
          Capture lets an organizer create an event and share a link or QR
          code so guests can upload photos straight from their phone into a
          shared gallery, with no app download or guest account required.
        </p>

        <h2>Accounts</h2>
        <p>
          You must be at least 18 years old to create an organizer account.
          You're responsible for keeping your login details secure and for
          all activity that happens under your account.
        </p>

        <h2>Pricing and payment</h2>
        <p>
          Your first event is free, up to the guest limit shown at signup.
          Every event after that is billed as a one-time, per-event fee based
          on guest count, shown to you before you pay, never a recurring
          subscription. Payments are processed by Paystack; we never see or
          store your card details. Because access is granted immediately on
          payment, fees are generally non-refundable except where required by
          South African consumer protection law.
        </p>

        <h2>Acceptable use</h2>
        <p>You agree not to use Capture to:</p>
        <ul>
          <li>Upload content that is illegal, harassing, or infringes someone else's rights.</li>
          <li>Upload photos of other people without their knowledge or consent to being photographed at the event.</li>
          <li>Attempt to access another organizer's events, guest data, or photos without authorization.</li>
          <li>Disrupt or overload the service, or attempt to bypass any usage limits.</li>
        </ul>
        <p>
          We may suspend or remove content, or terminate an account, that
          violates these terms.
        </p>

        <h2>Content ownership</h2>
        <p>
          Guests retain ownership of the photos they upload. By uploading, a
          guest grants the event's organizer, and Capture as the platform
          hosting it, a license to store, display, and allow downloading of
          that photo as part of the event gallery. The event organizer is
          responsible for who they invite to their event and what happens to
          downloaded photos afterward.
        </p>

        <h2>Availability</h2>
        <p>
          We aim to keep Capture available and your photos safe, but we don't
          guarantee uninterrupted access, and we recommend downloading a copy
          of your event's photos rather than relying on Capture as permanent
          storage.
        </p>

        <h2>Limitation of liability</h2>
        <p>
          To the extent permitted by law, Capture is provided "as is," and we
          aren't liable for indirect or consequential losses arising from your
          use of the service, including lost photos, missed events, or
          disputes between an organizer and their guests.
        </p>

        <h2>Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Material changes will
          be reflected by updating the date at the top of this page.
          Continuing to use Capture after a change means you accept the
          updated terms.
        </p>

        <h2>Governing law</h2>
        <p>These terms are governed by the laws of South Africa.</p>

        <h2>Contact</h2>
        <p>
          Questions about these terms? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <Link to="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

export default Terms;
