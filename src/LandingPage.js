import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FaQrcode,
  FaMobileAlt,
  FaCamera,
  FaUsers,
  FaDownload,
  FaShieldAlt,
  FaHeart,
} from 'react-icons/fa';
import { TIERS, TIER_ORDER, formatGuestCap, formatPhotoCap } from './services/pricingTiers';
import styles from './LandingPage.module.css';

const POPULAR_TIER = 'growth';

const FAQ_ITEMS = [
  {
    q: 'Do guests need to download an app?',
    a: "No. Guests open your event link or scan the QR code in their phone's browser and start uploading straight away — nothing to install.",
  },
  {
    q: 'Do guests need to create an account?',
    a: "No. As soon as a guest opens your event link they're ready to upload — no sign-up, no password, no email required.",
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
    a: `Your first event is free, for up to ${TIERS.free.guestCap} guests. Every event after that is priced by guest count — a flat one-time fee, no subscriptions, ever.`,
  },
  {
    q: 'Is there a limit on how many photos each guest can upload?',
    a: `Like a disposable camera, each guest gets a set number of shots on the Free, Starter, and Growth plans (from ${TIERS.free.photosPerGuest} up to ${TIERS.growth.photosPerGuest}, depending on plan). The Unlimited plan removes the cap entirely.`,
  },
  {
    q: 'What photo formats can guests upload?',
    a: 'JPEG, PNG, WebP and HEIC are all supported, straight off any phone camera — the same formats your guests already shoot in.',
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

function LandingPage() {
  const navigate = useNavigate();

  const handleJoinEvent = (e) => {
    e.preventDefault();
    const code = e.target.elements.eventCode.value.trim();
    if (code) navigate(`/?event=${code}`);
  };

  return (
    <div className={styles.landing}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }}
      />

      <header className={styles.landingNav}>
        <span className={styles.landingNavBrand}>Capture</span>
        <div className={styles.landingNavActions}>
          <button className={styles.landingNavSignIn} onClick={() => navigate('/login?mode=signin')}>
            Sign In
          </button>
          <button className={styles.landingNavCta} onClick={() => navigate('/login?mode=signup')}>
            Create an Event
          </button>
        </div>
      </header>

      <main>
        <section className={styles.hero} aria-labelledby="hero-heading">
          <h1 id="hero-heading">Every Guest's Photos. One Wedding Gallery.</h1>
          <p className={styles.heroSub}>
            Skip the disposable cameras. Guests scan a code, snap or upload
            photos straight from their phone, and everyone watches the
            gallery fill up together — no app to download, no account
            required.
          </p>

          <div className={styles.heroActions}>
            <button className={styles.btnPrimary} onClick={() => navigate('/login?mode=signup')}>
              Create Your Free Event
            </button>
            <form className={styles.heroJoin} onSubmit={handleJoinEvent}>
              <input
                type="text"
                name="eventCode"
                placeholder="Have an event code? Enter it here"
                aria-label="Event code"
              />
              <button type="submit" className={styles.btnSecondary}>
                Join
              </button>
            </form>
          </div>

          <ul className={styles.trustBar}>
            <li>No app required for guests</li>
            <li>First event free</li>
            <li>Ready in under 2 minutes</li>
          </ul>
        </section>

        <section className={styles.howItWorks} aria-labelledby="how-heading">
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

        <section aria-labelledby="features-heading">
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
                Filters, a timer, and front/back flip built right in — guests
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
                click — no hunting through a dozen phones.
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

        <section className={styles.useCases} aria-labelledby="use-cases-heading">
          <h2 id="use-cases-heading">Built First for Weddings</h2>
          <p className={styles.useCasesIntro}>
            The moment you say "I do," a hundred phones start filming.
            Capture collects every single point of view — the ceremony from
            row three, the first dance from the bar, the candid shots your
            photographer never sees — all in one gallery.
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

        <section aria-labelledby="pricing-heading">
          <h2 id="pricing-heading">Priced by Guest Count, Not Subscriptions</h2>
          <p className={styles.useCasesIntro}>
            Pay once per event, based on how many guests are contributing —
            never a monthly fee.
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
                </div>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="faq-heading">
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

        <section className={styles.ctaSection} aria-labelledby="cta-heading">
          <h2 id="cta-heading">Ready to collect every photo from your day?</h2>
          <p>Have an event link already? Paste your code below to jump in.</p>
          <form className={styles.ctaJoin} onSubmit={handleJoinEvent}>
            <input
              type="text"
              name="eventCode"
              placeholder="Enter event code or link"
              aria-label="Event code"
            />
            <button type="submit" className={styles.btnPrimary}>
              Join Event
            </button>
          </form>
        </section>
      </main>

      <footer className={styles.landingFooter}>
        <p>&copy; {new Date().getFullYear()} Capture by Val. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default LandingPage;
