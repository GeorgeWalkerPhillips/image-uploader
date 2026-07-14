import React from 'react';
import { Link } from 'react-router-dom';
import styles from './LegalPage.module.css';

// TODO before launch: confirm the contact email and legal/trading name
// below are correct for your business.
const CONTACT_EMAIL = 'georgewalkerphillips5@gmail.com';
const TRADING_NAME = 'Capture by Val.';

function PrivacyPolicy() {
  return (
    <div className={styles.legalContainer}>
      <div className={styles.legalCard}>
        <Link to="/" className={styles.brand}>
          Capture
        </Link>
        <h1>Privacy Policy</h1>
        <p className={styles.updatedAt}>Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <p>
          {TRADING_NAME} ("Capture," "we," "us") provides a shared photo gallery
          service for weddings, parties, and other events. This policy explains
          what personal information we collect, why, and what rights you have
          over it. We're based in South Africa and handle personal information
          in line with the Protection of Personal Information Act (POPIA).
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Account holders (event organizers):</strong> your name, email
            address, and password (stored securely by our authentication
            provider, never in plain text).
          </li>
          <li>
            <strong>Event details:</strong> the event name, description, and
            dates you enter when creating an event.
          </li>
          <li>
            <strong>Guest uploads:</strong> photos guests upload to an event,
            the display name a guest chooses to enter (optional), and basic
            upload metadata (time, image dimensions).
          </li>
          <li>
            <strong>Payment information:</strong> for paid events, payments are
            processed directly by Paystack. We only store the transaction
            reference, amount, and status, never your card details.
          </li>
          <li>
            <strong>Technical logs:</strong> basic error and audit logs (e.g.
            login events, upload failures) used to diagnose problems, tied to
            your account ID, event ID, browser, and the page you were on.
          </li>
        </ul>

        <h2>How we use it</h2>
        <p>
          To operate the service itself (creating events, uploading and
          displaying photos, processing payments), to keep the app secure
          (rate-limiting, fraud prevention, diagnosing bugs), and to
          communicate with you about your account (email confirmation,
          password resets, payment confirmations).
        </p>

        <h2>Who we share it with</h2>
        <p>
          We use third-party infrastructure providers to run the service:
          Supabase (database, authentication, and file storage) and Paystack
          (payment processing). We don't sell personal information to anyone,
          and we don't share guest photos outside of the event they were
          uploaded to.
        </p>

        <h2>How long we keep it</h2>
        <p>
          Event data and photos are kept for as long as the event exists on
          the platform. At present we don't automatically delete events or
          photos after a fixed period. An event organizer can delete an event
          (and its photos) at any time from their dashboard. If you'd like
          something deleted sooner, contact us using the details below.
        </p>

        <h2>Your rights</h2>
        <p>
          Under POPIA, you have the right to ask what personal information we
          hold about you, request corrections, request deletion, and object to
          certain processing. To exercise any of these, email us at{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. You can also
          lodge a complaint with South Africa's Information Regulator if you
          believe your information has been mishandled.
        </p>

        <h2>Photos of other people</h2>
        <p>
          Because guests upload photos taken at real events, those photos may
          contain images of people other than the uploader. Anyone uploading
          to an event is responsible for only sharing photos they have the
          right to share, and event organizers are responsible for the guest
          list they invite to their event.
        </p>

        <h2>Cookies and local storage</h2>
        <p>
          We use your browser's local storage to remember your session (so
          you don't have to sign in every visit) and, for guests, to
          pre-fill the display name you entered last time. We don't use
          third-party advertising or tracking cookies.
        </p>

        <h2>Changes to this policy</h2>
        <p>
          We may update this policy from time to time. Material changes will
          be reflected by updating the date at the top of this page.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about this policy or your personal information? Email{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>

        <Link to="/" className={styles.backLink}>
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

export default PrivacyPolicy;
