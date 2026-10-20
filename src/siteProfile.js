// Single source of truth for who Valere is, as machine-readable data
// (schema.org Organization + WebSite). Used by the About page, the guide pages
// and the Wedding Planner page. public/index.html carries a static copy of the
// same graph for the pages that are not React-rendered; src/siteProfile.test.js
// fails if the two drift apart.
import { TIERS, TIER_ORDER } from './services/pricingTiers';

// The canonical host. Everything public (canonical tags, sitemap, JSON-LD) uses
// www; the non-www host should 301 to it (Vercel domain settings).
export const SITE_URL = 'https://www.valere.co.za';
export const SITE_NAME = 'Valere';
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const PHOTO_APP_ID = `${SITE_URL}/#photo-app`;
export const LOGO_URL = `${SITE_URL}/logo512.png`;

// One sentence that separates this Valere from the other businesses that share
// the name. Reused in the Organization description, the About page and llms.txt.
export const DISAMBIGUATION =
  'Valere is a South African wedding and event photo-sharing app and wedding planner.';

// Public contact address. This is the address already published on the
// Privacy Policy, Terms and Refund Policy pages (they import it from here).
// TODO(owner): replace with a mailbox on the valere.co.za domain once one
// exists; changing this one constant updates every page.
export const CONTACT_EMAIL = 'georgewalkerphillips5@gmail.com';

// Real social profile URLs, e.g. 'https://www.instagram.com/<handle>/'.
// Empty on purpose: the owner fills this in after creating the profiles (see
// SEO_AND_AI_VISIBILITY.md). Never put a guessed URL here. When this is
// non-empty, also add the same URLs to "sameAs" in public/index.html (the
// consistency test will tell you).
export const SOCIAL_PROFILES = [];

export const organizationNode = (profiles = SOCIAL_PROFILES) => ({
  '@type': 'Organization',
  '@id': ORG_ID,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  logo: { '@type': 'ImageObject', url: LOGO_URL, width: 512, height: 512 },
  description: DISAMBIGUATION,
  areaServed: 'ZA',
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: CONTACT_EMAIL,
    availableLanguage: 'en',
  },
  ...(profiles.length > 0 ? { sameAs: profiles } : {}),
});

export const websiteNode = () => ({
  '@type': 'WebSite',
  '@id': WEBSITE_ID,
  url: `${SITE_URL}/`,
  name: SITE_NAME,
  description: DISAMBIGUATION,
  inLanguage: 'en-ZA',
  publisher: { '@id': ORG_ID },
});

// Organization + WebSite as one block, for pages that replace index.html's graph.
export const siteGraph = () => ({
  '@context': 'https://schema.org',
  '@graph': [organizationNode(), websiteNode()],
});

// The photo-sharing product (the home page). Prices come from pricingTiers.js.
export const photoAppNode = () => ({
  '@type': 'SoftwareApplication',
  '@id': PHOTO_APP_ID,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  applicationCategory: 'PhotographyApplication',
  operatingSystem: 'Any (Web-based)',
  description:
    'A shared photo gallery for weddings, parties and events. Guests scan a QR code and upload photos straight from their phone with no app download or account required.',
  inLanguage: 'en-ZA',
  publisher: { '@id': ORG_ID },
  isPartOf: { '@id': WEBSITE_ID },
  offers: TIER_ORDER.map((key) => {
    const t = TIERS[key];
    return {
      '@type': 'Offer',
      name: t.name,
      price: (t.amountCents / 100).toFixed(2),
      priceCurrency: 'ZAR',
      description: `One-time price per event, no subscription. Up to ${t.guestCap} guests, ${t.photosPerGuest} photos per guest.`,
    };
  }),
});

// The whole graph that public/index.html carries.
export const homeGraph = () => ({
  '@context': 'https://schema.org',
  '@graph': [organizationNode(), websiteNode(), photoAppNode()],
});
