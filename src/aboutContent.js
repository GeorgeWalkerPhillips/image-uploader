// Copy and SEO data for the About page (src/About.js). Facts here come from the
// product itself and from src/services/pricingTiers.js; nothing about the
// people, history or size of the business is stated because none of it is
// recorded in the repo. Claims must stay honest: no ratings, reviews, user
// counts, awards or "trusted by".
import { TIERS, TIER_ORDER, WEDDING_PLANNER } from './services/pricingTiers';
import { CONTACT_EMAIL, DISAMBIGUATION, ORG_ID, SITE_URL, WEBSITE_ID } from './siteProfile';
import { zar } from './guides/content';

export const ABOUT_PATH = '/about';
export const ABOUT_URL = `${SITE_URL}${ABOUT_PATH}`;
export const ABOUT_TITLE = 'About Valere: South African Wedding Photo App & Planner';
export const ABOUT_DESCRIPTION =
  'Valere is a South African wedding and event photo-sharing app and wedding planner. What it does, how it works, prices in rand and how to contact us.';
export const ABOUT_H1 = 'About Valere';
export const ABOUT_INTRO = `${DISAMBIGUATION} Guests scan a QR code and upload photos from their phone with no app or account, and couples can plan the whole wedding in one private planner.`;

const plannerPrice = zar(WEDDING_PLANNER.amountCents / 100);
const tierLine = (key) => {
  const t = TIERS[key];
  const price = t.amountCents === 0 ? 'free' : zar(t.amountCents / 100);
  return `${t.name}: ${price}, up to ${t.guestCap} guests, ${t.photosPerGuest} photos per guest`;
};

export const PRODUCTS = [
  {
    title: 'Photo sharing by QR code',
    text: 'Create an event and get a QR code and link. Guests scan it and add photos from their phone browser, using the built-in camera or their camera roll. Everything lands in one shared gallery, and you download it all as a ZIP. See [how it works](/#how-it-works) and the [guide to collecting wedding guest photos](/guides/collect-wedding-guest-photos-qr-code).',
  },
  {
    title: 'Wedding Planner',
    text: `A private app for couples: a budget tracker with quotes, invoices and payments in rand, vendor quote comparison, tasks you can assign to helpers who see only their own tasks, a calendar, a guest list with RSVP tracking, and a honeymoon planner. It is ${plannerPrice} once per wedding, with no subscription. See the [Wedding Planner](/wedding-planner).`,
  },
];

export const STEPS = [
  { title: 'Create an event', text: 'Sign up, name your event and get a QR code and link straight away. Your first event is free.' },
  { title: 'Share the QR code', text: 'Print it on table cards, add it to the programme or send the link to your group chat. Guests need no app and no account.' },
  { title: 'Download the gallery', text: 'Watch photos arrive during the day, then download everything as one ZIP.' },
];

export const AUDIENCE = [
  'Couples who want photos from every guest’s point of view, not only the photographer’s.',
  'Hosts of engagement parties, birthdays, anniversaries and corporate events.',
  'Couples planning their own wedding who want budget, tasks and guests in one place.',
  'Wedding parties who are helping and only need to see their own tasks.',
];

export const WHERE = `Valere is built for South Africa. Prices are in South African rand (ZAR), dates are shown in South African time, and payments are processed by Paystack. Nothing stops you using it elsewhere, but amounts are always in rand.`;

export const PRICING_LINES = [...TIER_ORDER.map(tierLine), `${WEDDING_PLANNER.name}: ${plannerPrice} once per wedding, included free with ${TIERS.unlimited.name}`];

export const PRIVACY_TEXT =
  'Guests do not create accounts to upload. Photos are tied to your event and protected by access rules in the database, uploads are rate-limited and files are validated. Read the [privacy policy](/privacy), the [terms](/terms) and the [refund policy](/refund-policy) for the details.';

export const CONTACT = { email: CONTACT_EMAIL };

export const FAQ_ITEMS = [
  { q: 'What is Valere?', a: 'Valere is a South African wedding and event photo-sharing app and wedding planner at valere.co.za. Guests upload photos by scanning a QR code, and couples can plan their wedding in the Wedding Planner.' },
  { q: 'Is Valere the same as other businesses called Valere?', a: 'This site, valere.co.za, is the South African photo-sharing app and wedding planner described on this page. If you are looking for another business with a similar name, check that business’s own website.' },
  { q: 'Do guests need an app or an account?', a: 'No. Guests scan the QR code or open the link and upload from their phone browser. There is nothing to install and no sign-up.' },
  { q: 'Is Valere free?', a: `Your first event is free, for up to ${TIERS.free.guestCap} guests. Bigger events are a one-time price based on guest count, from ${zar(TIERS.starter.amountCents / 100)} to ${zar(TIERS.unlimited.amountCents / 100)}. There is no subscription.` },
  { q: 'Is the Wedding Planner part of the photo product?', a: `No, it is a separate add-on at ${plannerPrice} once per wedding. You can buy it without creating a photo event. It is included free with the ${TIERS.unlimited.name} photo plan.` },
  { q: 'How do I contact Valere?', a: `Email ${CONTACT_EMAIL}. The same address is listed in our privacy policy, terms and refund policy.` },
];

export const ABOUT_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'AboutPage',
  '@id': `${ABOUT_URL}#page`,
  url: ABOUT_URL,
  name: ABOUT_TITLE,
  description: ABOUT_DESCRIPTION,
  inLanguage: 'en-ZA',
  about: { '@id': ORG_ID },
  mainEntity: { '@id': ORG_ID },
  isPartOf: { '@id': WEBSITE_ID },
  publisher: { '@id': ORG_ID },
};
