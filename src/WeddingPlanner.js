import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { FaCheck, FaLock } from 'react-icons/fa';
import { toast } from 'react-toastify';
import { WEDDING_PLANNER } from './services/pricingTiers';
import { startCheckout, verifyPurchase } from './services/weddingPlannerService';
import { useAuth } from './context/AuthContext';
import { useWeddingPlannerStatus, hasPlannerAccess } from './hooks/useWeddingPlannerStatus';
import { UserBadge } from './components/UserBadge';
import { Spinner } from './components/Spinner';
import {
  APPLICATION_JSON_LD,
  AUDIENCE,
  BREADCRUMB_JSON_LD,
  COMPARISON,
  DEEP_DIVES,
  DESCRIPTION,
  FAQ_ITEMS,
  FAQ_JSON_LD,
  H1,
  HERO_IMAGE,
  IMAGES,
  NOT_FOR,
  OG_IMAGE,
  PAGE_URL,
  PRIVACY_CAN,
  PRIVACY_CANNOT,
  STEPS,
  TIMELINE,
  TITLE,
  includedWith,
  plannerPriceText,
} from './weddingPlannerContent';
import styles from './WeddingPlanner.module.css';

export { plannerPriceText };

// Paystack redirects back before the webhook always lands, so "pending" is
// normal for a few seconds. Exported for tests.
export const VERIFY_ATTEMPTS = 5;
export const VERIFY_DELAY_MS = 3000;

// Head tags this page owns. Existing tags from index.html are updated in place
// and restored on the way out; missing ones are created and removed again.
const META_TAGS = [
  { sel: 'meta[name="description"]', tag: 'meta', key: { name: 'description' }, attr: 'content', value: DESCRIPTION },
  { sel: 'meta[name="keywords"]', tag: 'meta', key: { name: 'keywords' }, attr: 'content', value: 'wedding planner app, wedding budget tracker, wedding planner South Africa, wedding checklist, wedding guest list RSVP, honeymoon planner' },
  { sel: 'meta[name="robots"]', tag: 'meta', key: { name: 'robots' }, attr: 'content', value: 'index,follow,max-image-preview:large' },
  { sel: 'link[rel="canonical"]', tag: 'link', key: { rel: 'canonical' }, attr: 'href', value: PAGE_URL },
  { sel: 'meta[property="og:title"]', tag: 'meta', key: { property: 'og:title' }, attr: 'content', value: TITLE },
  { sel: 'meta[property="og:description"]', tag: 'meta', key: { property: 'og:description' }, attr: 'content', value: DESCRIPTION },
  { sel: 'meta[property="og:type"]', tag: 'meta', key: { property: 'og:type' }, attr: 'content', value: 'website' },
  { sel: 'meta[property="og:url"]', tag: 'meta', key: { property: 'og:url' }, attr: 'content', value: PAGE_URL },
  { sel: 'meta[property="og:locale"]', tag: 'meta', key: { property: 'og:locale' }, attr: 'content', value: 'en_ZA' },
  { sel: 'meta[property="og:image"]', tag: 'meta', key: { property: 'og:image' }, attr: 'content', value: OG_IMAGE.url },
  { sel: 'meta[property="og:image:width"]', tag: 'meta', key: { property: 'og:image:width' }, attr: 'content', value: String(OG_IMAGE.width) },
  { sel: 'meta[property="og:image:height"]', tag: 'meta', key: { property: 'og:image:height' }, attr: 'content', value: String(OG_IMAGE.height) },
  { sel: 'meta[property="og:image:alt"]', tag: 'meta', key: { property: 'og:image:alt' }, attr: 'content', value: OG_IMAGE.alt },
  { sel: 'meta[name="twitter:card"]', tag: 'meta', key: { name: 'twitter:card' }, attr: 'content', value: 'summary_large_image' },
  { sel: 'meta[name="twitter:title"]', tag: 'meta', key: { name: 'twitter:title' }, attr: 'content', value: TITLE },
  { sel: 'meta[name="twitter:description"]', tag: 'meta', key: { name: 'twitter:description' }, attr: 'content', value: DESCRIPTION },
  { sel: 'meta[name="twitter:image"]', tag: 'meta', key: { name: 'twitter:image' }, attr: 'content', value: OG_IMAGE.url },
  { sel: 'meta[name="twitter:image:alt"]', tag: 'meta', key: { name: 'twitter:image:alt' }, attr: 'content', value: OG_IMAGE.alt },
];

// Sets document title and head meta for this route.
function usePageMeta() {
  useEffect(() => {
    const prevTitle = document.title;
    const restores = META_TAGS.map(({ sel, tag, key, attr, value }) => {
      let el = document.head.querySelector(sel);
      const created = !el;
      if (!el) {
        el = document.createElement(tag);
        Object.entries(key).forEach(([k, v]) => el.setAttribute(k, v));
        document.head.appendChild(el);
      }
      const prev = el.getAttribute(attr);
      el.setAttribute(attr, value);
      return () => {
        if (created) el.remove();
        else el.setAttribute(attr, prev ?? '');
      };
    });
    // index.html carries the photo product's JSON-LD; it does not describe this
    // page, so park it while the planner page is open.
    const parked = Array.from(document.head.querySelectorAll('script[type="application/ld+json"]')).map((el) => {
      const parent = el.parentNode;
      const next = el.nextSibling;
      el.remove();
      return () => parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    });
    document.title = TITLE;
    return () => {
      document.title = prevTitle;
      restores.forEach((r) => r());
      parked.forEach((r) => r());
    };
  }, []);
}

// Fades sections in as they scroll into view (same pattern as the landing
// page). Nothing stays hidden without IntersectionObserver or with reduced motion.
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof IntersectionObserver === 'undefined' || reduced) {
      els.forEach((el) => el.setAttribute('data-revealed', 'true'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute('data-revealed', 'true');
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// A phone-shaped frame drawn in CSS around a screenshot.
function Phone({ image, eager = false, className = '' }) {
  return (
    <div className={`${styles.phone} ${className}`}>
      <img
        src={image.src}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading={eager ? undefined : 'lazy'}
        decoding="async"
        {...(eager ? { fetchpriority: 'high' } : {})}
      />
    </div>
  );
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function WeddingPlanner() {
  usePageMeta();
  useScrollReveal();
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
  const entitled = signedIn && hasAccess;

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(APPLICATION_JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(BREADCRUMB_JSON_LD) }} />

      <header className={styles.nav}>
        <Link to="/" aria-label="Valere home" className={styles.navBrandLink}>
          <img className={styles.navBrand} src="/valere_logo.png" alt="valere" width="85" height="28" />
        </Link>
        <nav className={styles.navLinks} aria-label="Page sections">
          <a href="#features">Features</a>
          <a href="#checklist">Checklist</a>
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
          <div className={styles.heroText}>
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <Link to="/">Home</Link> <span aria-hidden="true">/</span> <span aria-current="page">Wedding Planner</span>
            </nav>
            <p className={styles.eyebrow}>Wedding Planner by Valere</p>
            <h1 id="planner-hero">{H1}</h1>
            <p className={styles.heroSub}>
              Budget, vendor quotes, tasks for your wedding party, guest list and honeymoon, together in one private app
              for you and your partner. {price} once, no subscription.
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
              <li>View your plan offline</li>
            </ul>
          </div>
          <Phone image={HERO_IMAGE} eager className={styles.heroPhone} />
        </section>

        <section className={styles.band} aria-labelledby="how-heading" data-reveal>
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

        <section id="features" aria-labelledby="features-heading">
          <h2 id="features-heading">Everything you need to plan the wedding</h2>
          <p className={styles.intro}>
            Real screens from the app, shown with a made-up couple. Every feature below is included in the one price.
          </p>
          <div className={styles.dives}>
            {DEEP_DIVES.map((d, i) => (
              <article id={d.id} className={`${styles.dive} ${i % 2 ? styles.diveFlip : ''}`} key={d.id} data-reveal>
                <div className={styles.diveText}>
                  <h3>{d.title}</h3>
                  <p>{d.text}</p>
                  <ul className={styles.checkList}>
                    {d.bullets.map((b) => (
                      <li key={b}><FaCheck aria-hidden="true" /> <span>{b}</span></li>
                    ))}
                  </ul>
                </div>
                <div className={`${styles.diveShots} ${d.images.length > 1 ? styles.diveShotsTwo : ''}`}>
                  {d.images.map((key) => (
                    <Phone image={IMAGES[key]} key={key} />
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.band} aria-labelledby="audience-heading" data-reveal>
          <h2 id="audience-heading">Who the Wedding Planner is for</h2>
          <div className={styles.cardGrid}>
            {AUDIENCE.map((a) => (
              <div className={styles.card} key={a.title}>
                <h3>{a.title}</h3>
                <p>{a.text}</p>
              </div>
            ))}
          </div>
          <div className={styles.notFor}>
            <h3>What it is not</h3>
            <ul>
              {NOT_FOR.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="compare-heading" data-reveal>
          <h2 id="compare-heading">Wedding Planner vs spreadsheets</h2>
          <div className={styles.tableWrap}>
            <table className={styles.compare}>
              <caption className={styles.srOnly}>{COMPARISON.caption}</caption>
              <thead>
                <tr>
                  <th scope="col"><span className={styles.srOnly}>Feature</span></th>
                  <th scope="col">Spreadsheet</th>
                  <th scope="col">Wedding Planner</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.rows.map((r) => (
                  <tr key={r.label}>
                    <th scope="row">{r.label}</th>
                    <td>{r.sheet}</td>
                    <td>{r.planner}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.tableNote}>{COMPARISON.note}</p>
        </section>

        <section id="checklist" className={styles.band} aria-labelledby="checklist-heading" data-reveal>
          <h2 id="checklist-heading">Wedding planning checklist: 12 months to the big day</h2>
          <p className={styles.intro}>
            A general timeline for South African weddings. Squeeze it or stretch it to fit your own date, then put the
            tasks into your planner and hand some to your wedding party.
          </p>
          <ol className={styles.timeline}>
            {TIMELINE.map((t) => (
              <li key={t.when}>
                <h3>{t.when}</h3>
                <ul>
                  {t.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="privacy-heading" data-reveal>
          <h2 id="privacy-heading">Private and secure: who sees what</h2>
          <p className={styles.intro}>
            Your helpers should be able to help without seeing your finances. Only the people you invite can open your
            plan, and the database enforces it, not just the app.
          </p>
          <div className={styles.privacySplit}>
            <Phone image={IMAGES.helper} />
            <div className={styles.privacyGrid}>
              <div className={styles.privacyCard}>
                <h3>Helpers can see</h3>
                <ul>
                  {PRIVACY_CAN.map((t) => (
                    <li key={t}><FaCheck aria-hidden="true" /> {t}</li>
                  ))}
                </ul>
              </div>
              <div className={`${styles.privacyCard} ${styles.privacyCardDark}`}>
                <h3>Private to you and your partner</h3>
                <ul>
                  {PRIVACY_CANNOT.map((t) => (
                    <li key={t}><FaLock aria-hidden="true" /> {t}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section id="pricing" className={styles.band} aria-labelledby="pricing-heading" data-reveal>
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
              <li><FaCheck aria-hidden="true" /> Offline viewing once saved, and phone install</li>
              <li><FaCheck aria-hidden="true" /> No subscription</li>
            </ul>
            {entitled ? (
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
              Included free with {includedWith} for Capture by Val events.{' '}
              <a href="/#pricing">See event pricing</a>
            </p>
            <p className={styles.fine}>
              Secure payment by Paystack. See our <Link to="/refund-policy">refund policy</Link>.
            </p>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-heading" data-reveal>
          <h2 id="faq-heading">Wedding Planner questions answered</h2>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details className={styles.faqItem} key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
                {item.link && (
                  <p>
                    <Link to={item.link.to}>{item.link.label}</Link>
                  </p>
                )}
              </details>
            ))}
          </div>
        </section>

        <section className={styles.ctaBand} aria-labelledby="cta-heading" data-reveal>
          <h2 id="cta-heading">Start planning together</h2>
          <p className={styles.intro}>
            {entitled
              ? 'Your plan is waiting.'
              : `${price} once for the whole wedding, with your partner and up to 10 helpers included.`}
          </p>
          <div className={styles.ctaActions}>
            {renderAction(`Buy for ${price}`)}
            {!signedIn && (
              <Link className={styles.btnGhost} to="/login?mode=signup&next=%2Fwedding-planner">
                Create an account first
              </Link>
            )}
          </div>
          <p className={styles.fine}>
            Also planning the photos? <a href="/#how-it-works">See how Capture by Val works</a>, where guests upload
            photos straight from their phones.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <p>&copy; {new Date().getFullYear()} Valere. All rights reserved.</p>
        <nav className={styles.footerLinks} aria-label="Footer">
          <Link to="/">Home</Link>
          <a href="/#how-it-works">Wedding photo gallery</a>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms and Conditions</Link>
          <Link to="/refund-policy">Refund Policy</Link>
        </nav>
      </footer>
    </div>
  );
}

export default WeddingPlanner;
