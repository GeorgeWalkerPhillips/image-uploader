// Copy, FAQ, images and SEO constants for the Wedding Planner marketing page
// (src/WeddingPlanner.js). Kept apart from the component so the FAQ, the
// JSON-LD and the tests all read the same data. Claims here must stay true to
// what the app does: no ratings, reviews, user counts or awards.
import { WEDDING_PLANNER, TIERS, formatPrice } from './services/pricingTiers';
import { SITE_URL, WEBSITE_ID, organizationNode } from './siteProfile';

export { SITE_URL };
export const PAGE_PATH = '/wedding-planner';
export const PAGE_URL = `${SITE_URL}${PAGE_PATH}`;
export const IMAGE_DIR = '/wedding-planner';

export const TITLE = 'Wedding Planner App for South African Couples | Valere';
export const DESCRIPTION =
  'Plan your wedding together: budget tracker, vendor quotes, tasks for your wedding party, guest list and honeymoon. One payment, view it offline.';
export const H1 = 'Wedding planner app for South African couples';

export const OG_IMAGE = {
  url: `${SITE_URL}${IMAGE_DIR}/og-wedding-planner.jpg`,
  width: 1200,
  height: 630,
  alt: 'Valere Wedding Planner on a phone, showing the countdown, budget and task list',
};

// Price text for copy, e.g. "R199" (no cents).
export const plannerPriceText = () =>
  formatPrice(WEDDING_PLANNER.amountCents, WEDDING_PLANNER.currency)
    .replace(/[\s ]/g, '')
    .replace(/[,.]00$/, '');

const PRICE = plannerPriceText();

// Every screenshot is 780x1688 (a 390x844 phone at 2x). See
// scripts/generate-planner-screenshots.js. The sample couple is fictional.
const shot = (file, alt) => ({ src: `${IMAGE_DIR}/${file}.webp`, alt, width: 780, height: 1688 });

export const IMAGES = {
  home: shot('wedding-planner-home-dashboard', 'Wedding Planner home screen with a countdown to the wedding day, budget rings and next-up list'),
  budget: shot('wedding-budget-tracker-app', 'Wedding budget tracker with the photography category open, showing estimated, quoted, final and paid amounts in rand'),
  spent: shot('wedding-money-spent-who-paid', 'Money spent so far screen showing paid to date and how much each partner has paid'),
  quotes: shot('compare-wedding-vendor-quotes', 'Vendor quote comparison with the lowest quote highlighted and an Accept button'),
  tasks: shot('wedding-task-list-assign-helpers', 'Wedding task list grouped by person, with chips showing which helper each task is assigned to'),
  team: shot('invite-wedding-party-helpers', 'Team screen listing three helpers and an Invite someone form'),
  helper: shot('wedding-helper-my-tasks-view', 'A helper’s view of the planner showing only their own tasks, with no budget or guest list'),
  calendar: shot('wedding-calendar-reminders', 'Wedding calendar for a month with coloured dots for events, tasks and payments'),
  reminders: shot('wedding-email-reminder-settings', 'Email reminder settings with choices for when to be reminded and what to include'),
  guests: shot('wedding-guest-list-rsvp-tracker', 'Guest list with an RSVP summary and buttons to mark each guest as coming, maybe or not coming'),
  honeymoon: shot('honeymoon-planner-itinerary', 'Honeymoon planner day-by-day itinerary with accommodation and transport for each day'),
  currency: shot('honeymoon-currency-converter-zar-thb', 'Honeymoon currency converter between South African rand and Thai baht'),
  purchases: shot('wedding-purchases-checklist-receipts', 'Wedding shopping list with items still to buy, totals and a Mark bought button'),
  offline: shot('wedding-planner-works-offline', 'Wedding Planner showing an offline banner and the last saved plan'),
};

export const HERO_IMAGE = IMAGES.home;

export const STEPS = [
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

// Feature deep-dives. `id` doubles as the in-page anchor.
export const DEEP_DIVES = [
  {
    id: 'budget',
    title: 'A wedding budget tracker that follows the money',
    text: 'Set an overall budget, split it into categories and budget lines, then record what each supplier quoted, what they invoiced and what has actually been paid. Every amount is in rand, and the totals update as you go.',
    bullets: [
      'Quotes, invoices and payments kept apart, so you always know the balance still to pay',
      'See who paid: you, your partner or both of you jointly',
      'Attach proof of payment and the invoice itself',
      'A savings tracker and a money-spent summary by category and month',
    ],
    images: ['budget', 'spent'],
  },
  {
    id: 'quotes',
    title: 'Compare vendor quotes side by side',
    text: 'Collect quotes from several photographers, florists or caterers and see them next to each other with the lowest highlighted. When you decide, accept one and it becomes a budget line, with the supplier details kept alongside.',
    bullets: [
      'Mark quotes as requested, received, shortlisted, accepted or declined',
      'See how far each quote is above the cheapest',
      'Note what each quote includes and how long it is valid',
      'Keep supplier contact details in one place',
    ],
    images: ['quotes'],
  },
  {
    id: 'tasks',
    title: 'Wedding to-do list you can hand to your wedding party',
    text: 'Break the work into tasks and subtasks with due dates and priorities, and repeat the ones that recur. Hand a task to a bridesmaid, groomsman or family member and they get a login that shows only the tasks given to them.',
    bullets: [
      'Tasks grouped by person, with a chip showing who it is assigned to',
      'Helpers can tick tasks off or change their status',
      'Filter by person, category, priority or status',
      'Up to 10 helpers, and nobody you invite pays',
    ],
    images: ['tasks', 'team'],
  },
  {
    id: 'calendar',
    title: 'Wedding calendar with email reminders',
    text: 'Appointments, fittings, tastings, task deadlines and payment due dates all land on one calendar. Choose to get a short daily email before things are due, and send the whole calendar to your phone with an .ics export.',
    bullets: [
      'Month, week and agenda views, with colours for events, tasks and payments',
      'Reminders are optional and set per person',
      'Pick how early to be reminded, from the same day up to 30 days before',
      'Reminder emails list titles, times and payment amounts, never guest details',
    ],
    images: ['calendar', 'reminders'],
  },
  {
    id: 'guests',
    title: 'Guest list and RSVP tracking with CSV import',
    text: 'Keep every guest, their party size, dietary notes and table in one list. Bring an existing list in from a CSV, then record each answer as it comes in. The summary shows who is coming, who has not replied and how many meals to plan for.',
    bullets: [
      'Import a guest list from a CSV file',
      'RSVP summary by invited, coming, maybe, waiting and not coming',
      'Filter by side or by RSVP status',
      'You update the RSVPs yourself: the planner does not send invitations to your guests',
    ],
    images: ['guests'],
  },
  {
    id: 'honeymoon',
    title: 'Honeymoon planner with itinerary and rand-to-baht converter',
    text: 'Plan the trip next to the wedding. Build a day-by-day itinerary, keep flight and accommodation bookings with their confirmation numbers, track a separate honeymoon budget and check what a price is in rand.',
    bullets: [
      'Itinerary with city, stay, transport and booking reference for every day',
      'Bookings, a packing list and a travel documents checklist',
      'Converter between rand (ZAR) and Thai baht (THB) using a rate you set',
      'A honeymoon budget kept apart from the wedding budget',
    ],
    images: ['honeymoon', 'currency'],
  },
  {
    id: 'purchases',
    title: 'Purchase checklist with receipts',
    text: 'Decor, attire, stationery and all the small things add up. List what you still need to buy, mark items as bought with the shop and who paid, and attach the receipt. What you have bought counts towards the money you have spent.',
    bullets: [
      'To buy and Bought lists with running totals',
      'Quantity, price, needed-by date and shop for each item',
      'Receipt upload for every purchase',
      'Bought items feed into the money-spent summary',
    ],
    images: ['purchases'],
  },
  {
    id: 'offline',
    title: 'View your plan offline: install it on your phone and save it for offline',
    text: 'Add the planner to your phone’s home screen, then tap Save for offline while you have signal. After that you can view your plan without a connection, at the venue or in a shop. Changes, and receipt files, need a connection; when you are back online, changes sync live between you and your partner.',
    bullets: [
      'iPhone: install from Safari with Share, then Add to Home Screen',
      'Android: tap the Install button, or use the browser menu',
      'Tap Save for offline to keep your plan on your phone',
      'Viewing only: changes and receipts need a connection',
      'An obvious banner tells you when you are offline',
    ],
    images: ['offline'],
  },
];

export const PRIVACY_CAN = ['Only the tasks assigned to them', 'Nothing else from your plan'];
export const PRIVACY_CANNOT = [
  'Budget, quotes and payments',
  'Uploaded files and documents',
  'Guest details and RSVPs',
];

export const AUDIENCE = [
  {
    title: 'Couples planning it themselves',
    text: 'No planner, a long list of suppliers and a budget that needs watching. Everything lives in one place that you both can open.',
  },
  {
    title: 'Couples with a helping wedding party',
    text: 'Bridesmaids, groomsmen and parents who want to help. Give each of them their own tasks without sharing your finances.',
  },
  {
    title: 'Couples splitting the costs',
    text: 'Record who paid for what, so there are no awkward conversations about who has covered more.',
  },
  {
    title: 'Couples honeymooning abroad',
    text: 'Keep flights, stays, documents and a rand budget next to the wedding plan instead of in another app.',
  },
];

export const NOT_FOR = [
  'It is not a supplier directory or marketplace, so you add your own suppliers and quotes.',
  'It does not send invitations to your guests. It tracks the RSVPs you receive.',
  'It does not book or pay suppliers for you.',
];

export const COMPARISON = {
  caption: 'Wedding Planner compared with a spreadsheet',
  rows: [
    { label: 'Cost', sheet: 'Free', planner: `${PRICE} once per wedding` },
    { label: 'Layout', sheet: 'Anything you can build', planner: 'Ready made, less to design' },
    { label: 'Budget totals', sheet: 'Formulas you write and fix', planner: 'Quoted, invoiced and paid worked out for you' },
    { label: 'Delegating', sheet: 'Share the whole file or none of it', planner: 'Helpers see only their own tasks' },
    { label: 'Reminders', sheet: 'Set up yourself', planner: 'Optional daily email' },
    { label: 'Receipts and proof', sheet: 'Kept elsewhere', planner: 'Attached to the payment or purchase' },
    { label: 'On your phone', sheet: 'Works, but fiddly to edit', planner: 'Built for phones, installs to the home screen' },
  ],
  note: 'A spreadsheet is a good choice if you enjoy building your own system. The planner is for couples who would rather start with one.',
};

// A general planning guide. Adjust it to your own date and venue.
export const TIMELINE = [
  {
    when: '12 months or more to go',
    items: [
      'Agree a total budget and who is contributing what',
      'Set a date range and a rough guest count',
      'Visit and shortlist venues, then get written quotes',
      'Book your venue and a marriage officer, and ask what documents you will need',
    ],
  },
  {
    when: '9 to 12 months',
    items: [
      'Request quotes from photographers, caterers and a DJ or band',
      'Pick your wedding party and tell them early',
      'Start looking for attire and book fittings',
      'Plan the honeymoon and check passport validity for where you are going',
    ],
  },
  {
    when: '6 to 9 months',
    items: [
      'Confirm the main suppliers and pay their deposits',
      'Send save-the-dates, especially for guests who must travel',
      'Book accommodation for out-of-town guests',
      'Book flights and accommodation for the honeymoon',
    ],
  },
  {
    when: '3 to 6 months',
    items: [
      'Choose flowers, decor and stationery',
      'Arrange a cake tasting and the menu',
      'Send invitations and start tracking RSVPs',
      'Hand out tasks to your helpers',
    ],
  },
  {
    when: '1 to 3 months',
    items: [
      'Chase outstanding RSVPs and collect dietary needs',
      'Do final dress and suit fittings',
      'Confirm timings with every supplier',
      'Start the seating plan and buy the remaining small items',
    ],
  },
  {
    when: 'The last month',
    items: [
      'Give the venue your final guest count',
      'Pay final supplier balances and keep the receipts',
      'Print the seating plan, signs and the order of the day',
      'Pack for the honeymoon and collect your travel documents',
    ],
  },
  {
    when: 'Wedding week',
    items: [
      'Walk through the venue with your coordinator or helpers',
      'Confirm who is collecting the cake, flowers and decor',
      'Prepare tips and any final payments in envelopes',
      'Rest, eat well and let your helpers handle their tasks',
    ],
  },
];

export const FAQ_ITEMS = [
  {
    q: 'Is it a one-time payment?',
    a: `Yes. It is ${PRICE} once per wedding. There is no subscription and no renewal.`,
  },
  {
    q: 'What is included in the Wedding Planner?',
    a: 'The budget tracker with quotes, invoices and payments, vendor quote comparison, tasks you can assign, a calendar with optional email reminders, a guest list with RSVPs and CSV import, a honeymoon planner, a purchase checklist with receipts, data export, and viewing your saved plan offline on your phone.',
  },
  {
    q: 'Who can I invite, and do they have to pay?',
    a: 'Your partner joins with full access, and you can invite up to 10 helpers such as your wedding party or family who are pitching in. Nobody you invite has to pay: it is all included in the one price.',
  },
  {
    q: 'Can my helpers see our money?',
    a: 'No. Helpers see only the tasks assigned to them. Your budget, quotes, payments, files, guest list and calendar stay private to you and your partner.',
  },
  {
    q: 'Can I view it offline, and does it work on iPhone and Android?',
    a: 'You can view your plan offline: install it on your phone, then tap Save for offline while you are connected. Changes and receipt files need a connection, and everything syncs again when you are back online. There is no app store. On iPhone, install through Safari: tap Share, then Add to Home Screen. Android shows an Install button, or use the browser menu and choose Install app or Add to Home screen. If you opened the link inside Instagram or Facebook, open it in your browser first.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. Only the people you invite can open your plan, and access is enforced in the database, not just in the app. Uploaded files open only through short-lived links.',
  },
  {
    q: 'How do invitations work?',
    a: 'Enter the person’s email address and choose whether they are your partner or a helper. They get an email with a personal link, sign in or create an account, and join your wedding. You can resend or revoke an invitation at any time.',
  },
  {
    q: 'Can I export my data?',
    a: 'Yes. You can download your budget lines, payments, guest list, purchases and tasks as CSV files, export everything as one JSON file, and send your calendar to your phone as an .ics file.',
  },
  {
    q: 'Which currency does it use?',
    a: 'Everything is in South African rand (ZAR), with dates shown in South African time. The honeymoon page also has a converter between rand and Thai baht that uses a rate you set yourself, not a live market rate.',
  },
  {
    q: 'Is it only for South Africa?',
    a: 'It is built with South African couples in mind, with rand amounts, local payment methods such as EFT and PayShap, and South African time. Nothing stops you using it elsewhere, but amounts are always shown in rand.',
  },
  {
    q: 'Is it part of the photo gallery product?',
    a: 'It is a separate add-on from Valere. You can buy it without creating a photo event, and the photo gallery works without it.',
  },
  {
    q: 'What if I need a refund?',
    a: 'Our Refund Policy explains how refunds and cancellations work. It is written mainly around photo events, so if you have a question about a Wedding Planner payment, email us before you pay.',
    link: { to: '/refund-policy', label: 'Read the Refund Policy' },
  },
];

export const includedWith = TIERS.unlimited.name;

const OFFER_PRICE = (WEDDING_PLANNER.amountCents / 100).toFixed(2);

export const FAQ_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export const APPLICATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: `Valere ${WEDDING_PLANNER.name}`,
  '@id': `${PAGE_URL}#app`,
  url: PAGE_URL,
  description: DESCRIPTION,
  applicationCategory: 'LifestyleApplication',
  operatingSystem: 'Web, iOS, Android (PWA)',
  image: OG_IMAGE.url,
  inLanguage: 'en-ZA',
  isPartOf: { '@id': WEBSITE_ID },
  // Full Organization node (same @id as everywhere else on the site).
  publisher: organizationNode(),
  offers: {
    '@type': 'Offer',
    price: OFFER_PRICE,
    priceCurrency: WEDDING_PLANNER.currency,
    availability: 'https://schema.org/InStock',
    url: PAGE_URL,
  },
};

export const BREADCRUMB_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'Wedding Planner', item: PAGE_URL },
  ],
};
