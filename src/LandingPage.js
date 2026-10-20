import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  FaQrcode,
  FaMobileAlt,
  FaCamera,
  FaUsers,
  FaDownload,
  FaShieldAlt,
  FaHeart,
  FaCheck,
  FaTimes,
  FaWallet,
  FaTasks,
  FaCalendarAlt,
  FaUserFriends,
  FaPlane,
  FaLock,
} from 'react-icons/fa';
import {
  TIERS,
  TIER_ORDER,
  weddingPlannerIncludedLine,
  WEDDING_PLANNER,
  formatGuestCap,
  formatPhotoCap,
  formatPrice,
} from './services/pricingTiers';
import { useAuth } from './context/AuthContext';
import { UserBadge } from './components/UserBadge';
import styles from './LandingPage.module.css';

const POPULAR_TIER = 'growth';

// "R199", no cents — formatted from the one price constant.
const PLANNER_PRICE = formatPrice(WEDDING_PLANNER.amountCents, WEDDING_PLANNER.currency)
  .replace(/[\s\u00a0]/g, '')
  .replace(/[,.]00$/, '');

const PLANNER_FEATURES = [
  { icon: FaWallet, text: 'Budget, quotes and payments in one place' },
  { icon: FaTasks, text: 'Tasks you can assign to your wedding party' },
  { icon: FaCalendarAlt, text: 'Calendar with email reminders' },
  { icon: FaUserFriends, text: 'Guest list with RSVPs and CSV import' },
  { icon: FaPlane, text: 'A honeymoon planner for the trip after' },
  { icon: FaMobileAlt, text: 'View your plan offline: install it on your phone and save it for offline' },
  { icon: FaLock, text: 'Private by design: only the people you invite' },
];

const FAQ_ITEMS = [
  {
    q: 'Do guests need to download an app?',
    a: "No. Guests open your event link or scan the QR code in their phone's browser and start uploading straight away. Nothing to install.",
  },
  {
    q: 'Do guests need to create an account?',
    a: "No. As soon as a guest opens your event link they're ready to upload. No sign-up, no password, no email required.",
  },
  {
    q: 'How long do we have access to our photos?',
    a: "Your gallery stays available for at least 30 days after your event ends, and you can download every photo as a ZIP whenever you like.",
  },
  {
    q: 'Can we download all the photos at once?',
    a: 'Yes. From your event dashboard, download every photo from an event as a single ZIP file with one click.',
  },
  {
    q: 'How does pricing work?',
    a: `Your first event is free, for up to ${TIERS.free.guestCap} guests. Every event after that is priced by guest count: a flat one-time fee, no subscriptions, ever.`,
  },
  {
    q: 'Is there a limit on how many photos each guest can upload?',
    a: `Like a disposable camera, each guest gets a set number of shots depending on plan — from ${TIERS.free.photosPerGuest} on ${TIERS.free.name} up to ${TIERS.unlimited.photosPerGuest} per guest on ${TIERS.unlimited.name} (with up to ${TIERS.unlimited.guestCap} guests) — more than enough for any real event.`,
  },
  {
    q: 'What photo formats can guests upload?',
    a: 'JPEG, PNG, WebP and HEIC are all supported, straight off any phone camera. The same formats your guests already shoot in.',
  },
];

const COMPARISON_ROWS = [
  {
    feature: 'Getting your guests’ photos',
    before: 'Chase down photos from a dozen different phones after the event',
    after: 'Every guest’s upload lands straight in one shared gallery',
  },
  {
    feature: 'Setting up',
    before: 'Buy, distribute, and collect physical disposable cameras',
    after: 'One QR code, generated instantly the moment you create your event',
  },
  {
    feature: 'What guests need',
    before: 'Remember to bring, load, and use an actual camera',
    after: 'Just the phone already in their hand — no app, no account',
  },
  {
    feature: 'Seeing the photos',
    before: 'Wait for film to be developed, sometimes weeks later',
    after: 'Every photo is viewable in the gallery as soon as it’s uploaded',
  },
  {
    feature: 'Collecting everything',
    before: 'Request photos one by one, or dig through a dozen chat threads',
    after: 'Download every photo from the event as one ZIP, in one click',
  },
  {
    feature: 'Cost',
    before: 'Pay per camera, per roll of film, per developing',
    after: 'One flat fee per event — first event free, never a subscription',
  },
];

const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.a,
    },
  })),
};

// Fades sections in as they scroll into view. Elements marked
// [data-reveal] stay fully visible when IntersectionObserver is missing or the
// user prefers reduced motion, so nothing is ever hidden without JS.
function useScrollReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]');
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// Shows the mobile sticky CTA once the hero has scrolled out of view.
function usePastHero() {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const onScroll = () => setPast(window.scrollY > 520);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return past;
}

function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isLoggedIn = user && !user.is_anonymous;
  const pastHero = usePastHero();
  useScrollReveal();

  return (
    <div className={styles.landing}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      <header className={styles.landingNav}>
        <img
          className={styles.landingNavBrand}
          src="/valere_logo.png"
          alt="valere"
          width="85"
          height="28"
        />
        <nav className={styles.landingNavLinks}>
          <a href="#how-it-works">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link to="/wedding-planner">Wedding Planner</Link>
          <Link to="/guides">Guides</Link>
          <Link to="/blog">Blog</Link>
          <a href="#faq">FAQ</a>
        </nav>
        <div className={styles.landingNavActions}>
          {isLoggedIn ? (
            <UserBadge />
          ) : (
            <>
              <button className={styles.landingNavSignIn} onClick={() => navigate('/login?mode=signin')}>
                Sign In
              </button>
              <button className={styles.landingNavCta} onClick={() => navigate('/login?mode=signup')}>
                Create an Event
              </button>
            </>
          )}
        </div>
      </header>
      <p className={styles.mobileSubNav}>
        <Link to="/wedding-planner">Wedding Planner &rarr;</Link>
        <Link to="/guides">Guides &rarr;</Link>
        <Link to="/blog">Blog &rarr;</Link>
      </p>

      <main>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <h1 id="hero-heading">Every Guest's Photos. One Wedding Gallery.</h1>
          <p className={styles.heroSub}>
            Skip the disposable cameras. Guests scan a code, snap or upload
            photos straight from their phone, and everyone watches the
            gallery fill up together. No app to download, no account
            required.
          </p>

          <div className={styles.heroActions}>
            <button className={styles.btnPrimary} onClick={() => navigate('/login?mode=signup')}>
              Create Your Free Event
            </button>
          </div>

          <ul className={styles.trustBar}>
            <li>No app required for guests</li>
            <li>First event free</li>
            <li>Ready in under 2 minutes</li>
          </ul>

          <div className={styles.heroPhotos} aria-hidden="true">
            <img
              className={`${styles.heroPhoto} ${styles.heroPhotoLeft}`}
              src="/qr-table-stand.jpg"
              alt=""
              width="540"
              height="675"
              fetchPriority="high"
            />
            <img
              className={`${styles.heroPhoto} ${styles.heroPhotoRight}`}
              src="/qr-table-flowers.jpg"
              alt=""
              width="540"
              height="675"
              fetchPriority="high"
            />
          </div>
        </section>

        <section id="how-it-works" className={styles.howItWorks} aria-labelledby="how-heading" data-reveal>
          <h2 id="how-heading">How It Works</h2>
          <ol className={styles.steps}>
            <li>
              <span className={styles.stepNumber}>1</span>
              <div>
                <h3>Share your QR code</h3>
                <p>
                  Create an event and get a unique link and QR code instantly.
                  Print it on a table card, add it to your invites, or text it
                  to your group chat.
                </p>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber}>2</span>
              <div>
                <h3>Guests snap and upload</h3>
                <p>
                  No download, no login. Guests open the link, use the
                  built-in camera or pick photos from their camera roll, and
                  they land straight in the shared gallery.
                </p>
              </div>
            </li>
            <li>
              <span className={styles.stepNumber}>3</span>
              <div>
                <h3>Everyone gets the gallery</h3>
                <p>
                  Watch photos from every angle of the day arrive live, then
                  download the entire event as one ZIP whenever you're ready.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section aria-labelledby="features-heading" data-reveal>
          <h2 id="features-heading">Everything You Need, Nothing You Don't</h2>
          <div className={styles.featureGrid}>
            <article className={styles.featureCard}>
              <FaQrcode className={styles.featureIcon} aria-hidden="true" />
              <h3>Instant QR code</h3>
              <p>
                Every event comes with a printable QR code guests can scan
                from a table, program, or invite.
              </p>
            </article>
            <article className={styles.featureCard}>
              <FaMobileAlt className={styles.featureIcon} aria-hidden="true" />
              <h3>Zero friction for guests</h3>
              <p>
                No app store, no signup. Guests are uploading photos within
                seconds of scanning the code.
              </p>
            </article>
            <article className={styles.featureCard}>
              <FaCamera className={styles.featureIcon} aria-hidden="true" />
              <h3>Built-in camera</h3>
              <p>
                Filters, a timer, and front/back flip built right in. Guests
                don't even need to leave the page to take the shot.
              </p>
            </article>
            <article className={styles.featureCard}>
              <FaUsers className={styles.featureIcon} aria-hidden="true" />
              <h3>One shared gallery</h3>
              <p>
                Every photo from every guest lands in a single, beautifully
                organized gallery you can browse together, live.
              </p>
            </article>
            <article className={styles.featureCard}>
              <FaDownload className={styles.featureIcon} aria-hidden="true" />
              <h3>Download everything</h3>
              <p>
                Grab every photo from your event as one ZIP with a single
                click. No hunting through a dozen phones.
              </p>
            </article>
            <article className={styles.featureCard}>
              <FaShieldAlt className={styles.featureIcon} aria-hidden="true" />
              <h3>Private and secure</h3>
              <p>
                Photos are locked to your event with row-level security,
                rate-limited uploads, and strict file validation.
              </p>
            </article>
          </div>
        </section>

        <section className={styles.useCases} aria-labelledby="use-cases-heading" data-reveal>
          <h2 id="use-cases-heading">Built First for Weddings</h2>
          <p className={styles.useCasesIntro}>
            The moment you say "I do," a hundred phones start filming.
            Valere collects every single point of view: the ceremony from
            row three, the first dance from the bar, the candid shots your
            photographer never sees, all in one gallery.
          </p>
          <div className={styles.useCaseGrid}>
            <div className={`${styles.useCaseCard} ${styles.useCasePrimary}`}>
              <FaHeart className={styles.featureIcon} aria-hidden="true" />
              <h3>Weddings</h3>
              <p>
                A shared photo gallery for your ceremony and reception,
                built by every guest who was there.
              </p>
            </div>
            <div className={styles.useCaseCard}>
              <h3>Engagement parties</h3>
              <p>Collect every candid before the big day.</p>
            </div>
            <div className={styles.useCaseCard}>
              <h3>Birthdays &amp; anniversaries</h3>
              <p>Every guest's angle, in one place by morning.</p>
            </div>
            <div className={styles.useCaseCard}>
              <h3>Corporate events</h3>
              <p>A shared gallery for conferences, launches, and parties.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="comparison-heading" data-reveal>
          <h2 id="comparison-heading">Life Before and After Valere</h2>
          <p className={styles.useCasesIntro}>
            Every event still needs guest photos collected somehow. Here's
            what changes.
          </p>
          <div className={styles.comparisonTable}>
            <div className={styles.comparisonHeaderRow}>
              <div className={styles.comparisonFeatureCol} />
              <div className={styles.comparisonBeforeCol}>Without Valere</div>
              <div className={styles.comparisonHeaderHighlight}>With Valere</div>
            </div>
            {COMPARISON_ROWS.map((row) => (
              <div className={styles.comparisonRow} key={row.feature}>
                <div className={styles.comparisonFeatureCol}>
                  <span className={styles.comparisonFeatureLabel}>{row.feature}</span>
                </div>
                <div className={styles.comparisonBeforeCol}>
                  <FaTimes className={styles.comparisonBeforeIcon} aria-hidden="true" />
                  <span>{row.before}</span>
                </div>
                <div className={styles.comparisonAfterCol}>
                  <FaCheck className={styles.comparisonAfterIcon} aria-hidden="true" />
                  <span>{row.after}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-heading" data-reveal>
          <h2 id="pricing-heading">Priced by Guest Count, Not Subscriptions</h2>
          <p className={styles.useCasesIntro}>
            Pay once per event, based on how many guests are contributing.
            Never a monthly fee.
          </p>
          <div className={styles.pricingGrid}>
            {TIER_ORDER.map((tierKey) => {
              const tier = TIERS[tierKey];
              const isFree = tierKey === 'free';
              const isPopular = tierKey === POPULAR_TIER;
              return (
                <div
                  key={tierKey}
                  className={`${styles.pricingCard}${isPopular ? ` ${styles.pricingCardPopular}` : ''}`}
                >
                  {isPopular && <div className={styles.pricingBadge}>MOST POPULAR</div>}
                  <h3>{tier.name}</h3>
                  <p className={styles.price}>
                    {tier.display}
                    {!isFree && <span className={styles.pricePeriod}>/event</span>}
                  </p>
                  <p>{formatGuestCap(tier.guestCap)}</p>
                  <p>{formatPhotoCap(tier.photosPerGuest)}</p>
                  {isFree && <p>One per account</p>}
                  {weddingPlannerIncludedLine(tierKey) && (
                    <p className={styles.pricingExtra}>{weddingPlannerIncludedLine(tierKey)}</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section id="wedding-planner" className={styles.plannerSection} aria-labelledby="planner-heading" data-reveal>
          <p className={styles.plannerEyebrow}>New: Wedding Planner</p>
          <h2 id="planner-heading">Plan the whole wedding in one private place</h2>
          <p className={styles.useCasesIntro}>
            Budget, tasks, guests and honeymoon for you, your partner and your wedding party.
          </p>
          <ul className={styles.plannerList}>
            {PLANNER_FEATURES.map(({ icon: Icon, text }) => (
              <li key={text}>
                <Icon className={styles.plannerIcon} aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className={styles.plannerFooter}>
            <p className={styles.plannerPrice}>
              One-time {PLANNER_PRICE} per wedding
              <span> Partner and helpers included. No subscription.</span>
              <span>
                Included free with {TIERS.unlimited.name}. <a href="#pricing">See pricing</a>
              </span>
            </p>
            <Link to="/wedding-planner" className={styles.btnPrimaryLink}>
              Explore the Wedding Planner
            </Link>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-heading" data-reveal>
          <h2 id="faq-heading">Frequently Asked Questions</h2>
          <div className={styles.faqList}>
            {FAQ_ITEMS.map((item) => (
              <details className={styles.faqItem} key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.ctaSection} aria-labelledby="cta-heading" data-reveal>
          <h2 id="cta-heading">Ready to collect every photo from your day?</h2>
          <p>Scan your event's QR code to jump right in.</p>
          {!isLoggedIn && (
            <button className={styles.btnPrimary} onClick={() => navigate('/login?mode=signup')}>
              Create Your Free Event
            </button>
          )}
        </section>
      </main>

      {!isLoggedIn && (
        <div
          className={`${styles.stickyCta}${pastHero ? ` ${styles.stickyCtaVisible}` : ''}`}
          aria-hidden={!pastHero}
        >
          <button
            className={styles.btnPrimary}
            tabIndex={pastHero ? 0 : -1}
            onClick={() => navigate('/login?mode=signup')}
          >
            Create Your Free Event
          </button>
        </div>
      )}

      <footer className={styles.landingFooter}>
        <p>&copy; {new Date().getFullYear()} Valere. All rights reserved.</p>
        <nav className={styles.landingFooterLinks}>
          <Link to="/guides">Guides</Link>
          <Link to="/blog">Blog</Link>
          <Link to="/about">About Valere</Link>
          <Link to="/privacy">Privacy Policy</Link>
          <Link to="/terms">Terms and Conditions</Link>
          <Link to="/refund-policy">Refund Policy</Link>
          <Link to="/wedding-planner">Wedding Planner</Link>
        </nav>
      </footer>
    </div>
  );
}

export default LandingPage;
