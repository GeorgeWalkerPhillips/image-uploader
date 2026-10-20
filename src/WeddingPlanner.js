import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  FaWallet,
  FaTasks,
  FaCalendarAlt,
  FaUserFriends,
  FaPlane,
  FaMobileAlt,
  FaLock,
  FaUsers,
  FaCheck,
} from 'react-icons/fa';
import { toast } from 'react-toastify';
import { WEDDING_PLANNER, TIERS, formatPrice } from './services/pricingTiers';
import { startCheckout, verifyPurchase } from './services/weddingPlannerService';
import { useAuth } from './context/AuthContext';
import { useWeddingPlannerStatus, hasPlannerAccess } from './hooks/useWeddingPlannerStatus';
import { UserBadge } from './components/UserBadge';
import { Spinner } from './components/Spinner';
import styles from './WeddingPlanner.module.css';

// Paystack redirects back before the webhook always lands, so "pending" is
// normal for a few seconds. Exported for tests.
export const VERIFY_ATTEMPTS = 5;
export const VERIFY_DELAY_MS = 3000;

const TITLE = 'Wedding Planner: budget, tasks, guest list & honeymoon in one app | Valere';
const DESCRIPTION =
  'A private wedding planner for you, your partner and your wedding party. Budget, quotes, tasks, calendar, guest list with RSVPs and honeymoon planning. One-time payment, works offline on your phone.';

// Price text for copy, e.g. "R199" (no cents).
export const plannerPriceText = () =>
  formatPrice(WEDDING_PLANNER.amountCents, WEDDING_PLANNER.currency)
    .replace(/[\s ]/g, '')
    .replace(/[,.]00$/, '');

const FEATURES = [
  {
    icon: FaWallet,
    title: 'Budget, quotes and payments',
    text: 'Set a budget, compare supplier quotes, accept one to create a budget line, and record invoices and payments with proof attached.',
  },
  {
    icon: FaTasks,
    title: 'Tasks you can assign',
    text: 'Break the to-do list into tasks and subtasks, repeat the ones that recur, and hand tasks to your wedding party.',
  },
  {
    icon: FaCalendarAlt,
    title: 'Calendar and email reminders',
    text: 'Month, week and agenda views, an .ics export, and a daily email of what is coming up. Reminders are optional per person.',
  },
  {
    icon: FaUserFriends,
    title: 'Guest list with RSVPs',
    text: 'Keep every guest and their RSVP in one list, and bring an existing list in with a CSV import.',
  },
  {
    icon: FaPlane,
    title: 'Honeymoon planner',
    text: 'An itinerary, bookings, a packing list and travel documents, all next to the wedding plan.',
  },
  {
    icon: FaMobileAlt,
    title: 'Works offline, installs on your phone',
    text: 'Add it to your home screen and read your plan without signal. Changes sync live when you are back online.',
  },
  {
    icon: FaUsers,
    title: 'Plan together',
    text: 'Your partner joins with full access, and up to 10 helpers can be invited to the tasks you give them.',
  },
  {
    icon: FaLock,
    title: 'Private by design',
    text: 'Your plan is locked to the people you invite at the database level. Files open only through short-lived links.',
  },
];

const STEPS = [
  {
    title: 'Buy the Wedding Planner',
    text: 'Sign in or create an account and pay once. There is no subscription.',
  },
  {
    title: 'Set up your wedding',
    text: 'Add your date, budget and the things you already know. Bring a guest list in from a CSV.',
  },
  {
    title: 'Invite your partner and helpers',
    text: 'Your partner gets full access. Helpers see only the tasks you assign to them.',
  },
];

const FAQ_ITEMS = [
  {
    q: 'Is it a one-time payment?',
    a: `Yes. It is ${plannerPriceText()} once per wedding. There is no subscription and no renewal.`,
  },
  {
    q: 'Can my partner join for free?',
    a: 'Yes. Your partner and up to 10 helpers are included in the one price. Nobody you invite has to pay.',
  },
  {
    q: 'How many people can I invite?',
    a: 'Your partner plus up to 10 helpers, such as your wedding party or family who are pitching in.',
  },
  {
    q: 'Does it work offline, and can I put it on my phone?',
    a: 'Yes. Open it on your phone and add it to your home screen. Once loaded it can be read without signal, and it syncs again when you are back online.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Only the people you invite can open your plan, and access is enforced in the database, not just in the app. Helpers see only the tasks assigned to them. Money, files and guest details stay private to you and your partner.',
  },
  {
    q: 'Is it part of the photo gallery product?',
    a: 'It is a separate add-on from Valere. You can buy it without creating a photo event, and the photo gallery works without it.',
  },
];

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

const PRODUCT_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: `Valere ${WEDDING_PLANNER.name}`,
  description: DESCRIPTION,
  brand: { '@type': 'Brand', name: 'Valere' },
  offers: {
    '@type': 'Offer',
    price: (WEDDING_PLANNER.amountCents / 100).toFixed(2),
    priceCurrency: WEDDING_PLANNER.currency,
    availability: 'https://schema.org/InStock',
    url: 'https://www.valere.co.za/wedding-planner',
  },
};

// Sets document title / description / canonical for this route, restoring
// whatever index.html had on the way out.
function usePageMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    const ensure = (selector, create) => {
      let el = document.head.querySelector(selector);
      const created = !el;
      if (!el) {
        el = create();
        document.head.appendChild(el);
      }
      return { el, created };
    };
    const desc = ensure('meta[name="description"]', () => {
      const m = document.createElement('meta');
      m.setAttribute('name', 'description');
      return m;
    });
    const canon = ensure('link[rel="canonical"]', () => {
      const l = document.createElement('link');
      l.setAttribute('rel', 'canonical');
      return l;
    });
    const prevDesc = desc.el.getAttribute('content');
    const prevCanon = canon.el.getAttribute('href');

    document.title = TITLE;
    desc.el.setAttribute('content', DESCRIPTION);
    canon.el.setAttribute('href', 'https://www.valere.co.za/wedding-planner');

    return () => {
      document.title = prevTitle;
      if (desc.created) desc.el.remove();
      else desc.el.setAttribute('content', prevDesc ?? '');
      if (canon.created) canon.el.remove();
      else canon.el.setAttribute('href', prevCanon ?? '');
    };
  }, []);
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function WeddingPlanner() {
  usePageMeta();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  // Anonymous camera-guest sessions are NOT accounts: treat as signed out.
  const signedIn = !!user && !user.is_anonymous;
  const { status, loading: statusLoading, refresh } = useWeddingPlannerStatus();
  const hasAccess = hasPlannerAccess(status);

  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState(null);
  // idle | confirming | paid | pending | failed | not_found | error
  const [verify, setVerify] = useState('idle');
  const busyRef = useRef(false);

  const reference = searchParams.get('payment') === 'success' ? searchParams.get('reference') : null;
  const wantsBuy = searchParams.get('buy') === '1';

  const goToLogin = useCallback(
    (returnTo) => {
      navigate(`/login?mode=signup&next=${encodeURIComponent(returnTo)}`);
    },
    [navigate]
  );

  const handleBuy = useCallback(async () => {
    if (busyRef.current || authLoading) return;
    if (!signedIn) {
      goToLogin('/wedding-planner?buy=1');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setCheckoutError(null);
    try {
      await startCheckout(); // redirects the whole page on success
    } catch (err) {
      setCheckoutError(err.message || 'Could not start checkout. Please try again.');
      busyRef.current = false;
      setBusy(false);
    }
  }, [authLoading, signedIn, goToLogin]);

  // Returned from sign-in with ?buy=1: carry straight on to checkout, once.
  const autoBuyRef = useRef(false);
  useEffect(() => {
    if (!wantsBuy || autoBuyRef.current) return;
    if (authLoading) return;
    if (!signedIn) return;
    if (statusLoading) return;
    autoBuyRef.current = true;
    // Drop the flag so Back / refresh never re-triggers a payment.
    const next = new URLSearchParams(searchParams);
    next.delete('buy');
    setSearchParams(next, { replace: true });
    if (!hasAccess) handleBuy();
  }, [wantsBuy, authLoading, signedIn, statusLoading, hasAccess, handleBuy, searchParams, setSearchParams]);

  // Returned from Paystack: confirm the payment with the server.
  const verifiedRef = useRef(null);
  const runVerify = useCallback(
    async (ref) => {
      setVerify('confirming');
      let last = 'pending';
      for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
        if (attempt > 0) await wait(VERIFY_DELAY_MS);
        try {
          const res = await verifyPurchase(ref);
          last = res.status;
        } catch (err) {
          last = 'error';
        }
        if (last === 'paid' || last === 'already_paid') {
          await refresh();
          setVerify('paid');
          return;
        }
        if (last === 'failed' || last === 'not_found') {
          setVerify(last);
          return;
        }
      }
      setVerify(last === 'error' ? 'error' : 'pending');
    },
    [refresh]
  );

  useEffect(() => {
    if (!reference || authLoading || !signedIn) return;
    if (verifiedRef.current === reference) return;
    verifiedRef.current = reference;
    runVerify(reference);
  }, [reference, authLoading, signedIn, runVerify]);

  const retryVerify = () => {
    if (reference) runVerify(reference);
  };

  useEffect(() => {
    if (verify === 'paid') toast.success('Payment confirmed. Welcome to the Wedding Planner!');
  }, [verify]);

  const primaryDisabled = busy || authLoading || (signedIn && statusLoading);

  const renderAction = (idleLabel, className = styles.btnPrimary) => {
    if (signedIn && hasAccess) {
      return (
        <Link to="/hq/" className={className}>
          Open your Wedding Planner
        </Link>
      );
    }
    return (
      <button type="button" className={className} onClick={handleBuy} disabled={primaryDisabled}>
        {busy ? (
          <>
            <Spinner size="small" variant="light" /> Taking you to payment...
          </>
        ) : (
          idleLabel
        )}
      </button>
    );
  };

  const price = plannerPriceText();

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(PRODUCT_JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />

      <header className={styles.nav}>
        <Link to="/" aria-label="Valere home" className={styles.navBrandLink}>
          <img className={styles.navBrand} src="/valere_logo.png" alt="valere" width="85" height="28" />
        </Link>
        <nav className={styles.navLinks} aria-label="Page sections">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div className={styles.navActions}>
          {signedIn ? (
            <UserBadge />
          ) : (
            <button type="button" className={styles.navSignIn} onClick={() => navigate('/login?mode=signin&next=%2Fwedding-planner')}>
              Sign In
            </button>
          )}
        </div>
      </header>

      <main>
        {reference && (
          <section className={styles.statusSection} aria-live="polite" aria-label="Payment status">
            <div className={`${styles.statusCard} ${verify === 'paid' ? styles.statusOk : ''}`}>
              {!signedIn && !authLoading && (
                <>
                  <h2>Sign in to confirm your payment</h2>
                  <p>
                    We could not tell who you are. Sign in with the account you paid with and we will
                    finish setting up your Wedding Planner.
                  </p>
                  <button
                    type="button"
                    className={styles.btnPrimary}
                    onClick={() => goToLogin(`/wedding-planner?payment=success&reference=${encodeURIComponent(reference)}`)}
                  >
                    Sign in
                  </button>
                </>
              )}
              {(authLoading || (signedIn && (verify === 'idle' || verify === 'confirming'))) && (
                <>
                  <h2>
                    <Spinner size="small" /> Confirming your payment...
                  </h2>
                  <p>This usually takes a few seconds. Please keep this page open.</p>
                </>
              )}
              {signedIn && verify === 'paid' && (
                <>
                  <h2>You are all set</h2>
                  <p>Payment confirmed. Your Wedding Planner is ready.</p>
                  <Link to="/hq/" className={styles.btnPrimary}>
                    Open your Wedding Planner
                  </Link>
                </>
              )}
              {signedIn && verify === 'pending' && (
                <>
                  <h2>Still waiting for confirmation</h2>
                  <p>
                    Your bank has not confirmed the payment yet. If you were charged, your Wedding Planner
                    will unlock as soon as it comes through, and you do not need to pay again. You can check
                    again now or come back to this page in a few minutes.
                  </p>
                  <button type="button" className={styles.btnPrimary} onClick={retryVerify}>
                    Check again
                  </button>
                </>
              )}
              {signedIn && verify === 'error' && (
                <>
                  <h2>We could not check your payment</h2>
                  <p>That looks like a connection problem on our side or yours. Your payment is safe. Please try again.</p>
                  <button type="button" className={styles.btnPrimary} onClick={retryVerify}>
                    Try again
                  </button>
                </>
              )}
              {signedIn && verify === 'failed' && (
                <>
                  <h2>The payment did not go through</h2>
                  <p>You have not been charged for a Wedding Planner. You can try again whenever you are ready.</p>
                  <button type="button" className={styles.btnPrimary} onClick={handleBuy} disabled={primaryDisabled}>
                    Try payment again
                  </button>
                </>
              )}
              {signedIn && verify === 'not_found' && (
                <>
                  <h2>We could not find that payment</h2>
                  <p>
                    The payment reference does not match an order on your account. Make sure you are signed in
                    with the account you paid with. If you were charged, contact us and quote reference{' '}
                    <strong>{reference}</strong>.
                  </p>
                </>
              )}
            </div>
          </section>
        )}

        <section className={styles.hero} aria-labelledby="planner-hero">
          <p className={styles.eyebrow}>Wedding Planner</p>
          <h1 id="planner-hero">Plan the whole wedding, together, in one private place.</h1>
          <p className={styles.heroSub}>
            Budget, tasks, guest list and honeymoon for you, your partner and your wedding party. {price} once,
            no subscription.
          </p>
          <div className={styles.heroActions}>
            {renderAction(`Get the Wedding Planner · ${price}`)}
            <a className={styles.btnGhost} href="#features">
              See what is included
            </a>
          </div>
          {checkoutError && (
            <p role="alert" className={styles.errorText}>
              {checkoutError}
            </p>
          )}
          <ul className={styles.trustBar}>
            <li>One-time payment</li>
            <li>Partner and helpers included</li>
            <li>Works offline on your phone</li>
          </ul>
        </section>

        <section id="features" aria-labelledby="features-heading">
          <h2 id="features-heading">Everything the planning needs</h2>
          <div className={styles.featureGrid}>
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article className={styles.featureCard} key={title}>
                <Icon className={styles.featureIcon} aria-hidden="true" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.band} aria-labelledby="how-heading">
          <h2 id="how-heading">How it works</h2>
          <ol className={styles.steps}>
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className={styles.stepNumber}>{i + 1}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">Who sees what</h2>
          <p className={styles.intro}>
            Your helpers should be able to help without seeing your finances. That is how it is built.
          </p>
          <div className={styles.privacyGrid}>
            <div className={styles.privacyCard}>
              <h3>Helpers can see</h3>
              <ul>
                <li><FaCheck aria-hidden="true" /> Only the tasks assigned to them</li>
                <li><FaCheck aria-hidden="true" /> Nothing else from your plan</li>
              </ul>
            </div>
            <div className={`${styles.privacyCard} ${styles.privacyCardDark}`}>
              <h3>Private to you and your partner</h3>
              <ul>
                <li><FaLock aria-hidden="true" /> Budget, quotes and payments</li>
                <li><FaLock aria-hidden="true" /> Uploaded files and documents</li>
                <li><FaLock aria-hidden="true" /> Guest details and RSVPs</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="pricing" className={styles.band} aria-labelledby="pricing-heading">
          <h2 id="pricing-heading">One price. Everyone included.</h2>
          <div className={styles.priceCard}>
            <h3>{WEDDING_PLANNER.name}</h3>
            <p className={styles.price}>
              {price}
              <span className={styles.pricePeriod}> one-time, per wedding</span>
            </p>
            <ul className={styles.priceList}>
              <li><FaCheck aria-hidden="true" /> Your partner, with full access</li>
              <li><FaCheck aria-hidden="true" /> Up to 10 helpers on assigned tasks</li>
              <li><FaCheck aria-hidden="true" /> Budget, tasks, calendar, guests, honeymoon</li>
              <li><FaCheck aria-hidden="true" /> Offline reading and phone install</li>
            </ul>
            {signedIn && hasAccess ? (
              <>
                <p className={styles.owned}>You have the Wedding Planner.</p>
                {renderAction('', styles.btnPrimaryBlock)}
              </>
            ) : (
              renderAction(`Buy for ${price}`, styles.btnPrimaryBlock)
            )}
            {checkoutError && (
              <p role="alert" className={styles.errorText}>
                {checkoutError}
              </p>
            )}
            <p className={styles.fine}>
              Included free with {TIERS.unlimited.name} for Capture by Val events.{' '}
              <a href="/#pricing">See event pricing</a>
            </p>
            <p className={styles.fine}>
              Secure payment by Paystack. See our <Link to="/refund-policy">refund policy</Link>.
            </p>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-heading">
          <h2 id="faq-heading">Frequently asked questions</h2>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details className={styles.faqItem} key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
            <details className={styles.faqItem}>
              <summary>What if I need a refund?</summary>
              <p>
                Our <Link to="/refund-policy">Refund Policy</Link> explains when a payment can be refunded.
              </p>
            </details>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} Valere. All rights reserved.</p>
        <nav className={styles.footerLinks}>
          <Link to="/">Home</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms and Conditions</Link>
          <Link to="/refund-policy">Refund Policy</Link>
        </nav>
      </footer>
    </div>
  );
}

export default WeddingPlanner;
