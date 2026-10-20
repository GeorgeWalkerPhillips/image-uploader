// Copy, FAQ and SEO data for /guides and the five guide pages. Kept apart from
// the components so the rendered page, the JSON-LD, llms-full.txt and the tests
// all read the same data. Claims here must stay honest: no ratings, reviews,
// user counts, awards, or statements about named companies. Budget percentages
// are a planning guide, not statistics. Every figure about Valere is derived
// from services/pricingTiers.js, never typed in.
//
// Inline links in body text use [label](/path) and are turned into router
// links by GuideBody. FAQ answers are plain text (they also go into JSON-LD).
import { TIERS, TIER_ORDER, WEDDING_PLANNER } from '../services/pricingTiers';
import { SITE_URL } from '../siteProfile';

export const GUIDES_PATH = '/guides';
export const GUIDES_URL = `${SITE_URL}${GUIDES_PATH}`;
export const DATE_PUBLISHED = '2026-10-20';
export const DATE_MODIFIED = '2026-10-20';
export const UPDATED_LABEL = '20 October 2026';

export const GUIDES_INDEX = {
  title: 'Wedding Guides for South African Couples | Valere',
  description:
    'Practical guides on collecting guest photos, comparing photo sharing options, wedding budgets, planning timelines and delegating tasks.',
  h1: 'Wedding planning guides for South African couples',
  intro:
    'Plain, practical guides on the parts of a wedding couples often get stuck on: getting photos from your guests, working out a budget, keeping to a timeline and handing jobs to your wedding party. Valere is mentioned where it is a practical option, and labelled as our product when it is.',
};

// "R179", "R1 500": rand with a non-breaking space as the thousands separator.
export const zar = (rand) =>
  `R${Math.round(rand)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}`;
const tierPrice = (key) => zar(TIERS[key].amountCents / 100);
const plannerPrice = zar(WEDDING_PLANNER.amountCents / 100);
const { free, starter, growth, unlimited } = TIERS;

// Prices and caps for the photo plans, from the one pricing source.
export const PLAN_SUMMARY = TIER_ORDER.map((key) => {
  const t = TIERS[key];
  return `${t.name} (${t.amountCents === 0 ? 'free' : tierPrice(key)}): up to ${t.guestCap} guests, ${t.photosPerGuest} photos each`;
});
const planSentence = `${free.name} is free (up to ${free.guestCap} guests); ${starter.name} is ${tierPrice('starter')} (up to ${starter.guestCap} guests); ${growth.name} is ${tierPrice('growth')} (up to ${growth.guestCap} guests); ${unlimited.name} is ${tierPrice('unlimited')} (up to ${unlimited.guestCap} guests and it includes the ${WEDDING_PLANNER.name}).`;
const valereFacts = `Each event is a one-time price set by guest count, not a subscription. ${planSentence}`;

// Budget framework. Shares are a planning guide, not statistics. They sum to 100.
export const BUDGET_EXAMPLE_TOTAL = 150000;
export const BUDGET_ROWS = [
  { category: 'Venue, food and drinks', range: '40% to 50%', share: 45 },
  { category: 'Photography and video', range: '8% to 12%', share: 10 },
  { category: 'Attire, hair and make-up', range: '6% to 10%', share: 8 },
  { category: 'Decor, flowers and hire', range: '6% to 10%', share: 8 },
  { category: 'Music and entertainment', range: '4% to 8%', share: 6 },
  { category: 'Stationery, cake and small items', range: '3% to 6%', share: 5 },
  { category: 'Transport and guest accommodation', range: '2% to 5%', share: 4 },
  { category: 'Marriage officer and admin', range: '1% to 2%', share: 1 },
  { category: 'Contingency', range: '5% to 10%', share: 8 },
  { category: 'Tips, gifts and last-minute costs', range: '2% to 5%', share: 5 },
];

const GUIDE_A = {
  slug: 'collect-wedding-guest-photos-qr-code',
  title: 'How to Collect Wedding Guest Photos With a QR Code',
  description:
    'Step-by-step: set up a QR code photo upload, where to place table cards, what guests see, and tips so more guests actually upload their photos.',
  h1: 'How to collect wedding guest photos with a QR code',
  intro:
    'The simplest way to collect wedding guest photos is a QR code on every table that opens an upload page in the guest’s phone browser. Guests scan it, take or choose photos and send them to one shared gallery, with no app and no account. After the wedding you download everything in one go.',
  takeaways: [
    'A QR code that opens a web page is the lowest-effort option for guests: no app, no sign-up.',
    'Print a code for every table and the bar, and test it on an iPhone and an Android phone first.',
    'People upload when they are reminded: ask your MC to announce it, and put a line on the programme.',
    'Give one helper the job of nudging guests and checking the gallery during the day.',
    'Download the full set soon after the wedding and keep two copies.',
  ],
  sections: [
    {
      h2: 'What you need before you start',
      blocks: [
        { type: 'ul', items: [
          'An estimate of how many guests will take part (not only how many are invited).',
          'A way to print small cards, or a venue or stationer who can do it.',
          'One reliable helper, such as a bridesmaid, cousin or friend, to remind guests on the day.',
        ] },
      ],
    },
    {
      h2: 'Step by step: set it up',
      blocks: [
        { type: 'ol', items: [
          'Create the event. Give it a name and the date, and say roughly how many guests will join.',
          'Pick a plan that fits your guest count. With Valere your first event is free for up to ' + free.guestCap + ' guests, which is enough to test the whole flow before you pay for a bigger one.',
          'Download the QR code. Valere gives you a printable QR code as soon as the event exists.',
          'Test it. Scan the code with the phone camera on an iPhone and an Android phone, take a photo, and check it lands in the gallery.',
          'Print your table cards (see the next section).',
          'Tell guests about it, then download the photos as a ZIP after the wedding.',
        ] },
      ],
    },
    {
      h2: 'Where to put the QR code',
      blocks: [
        { type: 'p', text: 'People will only scan what they see at the moment they are holding their phone. A rough guide:' },
        { type: 'ul', items: [
          'One card on every guest table, standing up where people can see it from their seat.',
          'A larger sign at the bar and the welcome table, where people queue with their phones out.',
          'A line and the code on the programme or order of service.',
          'A small sign near the dance floor or photo corner, so late-night photos are collected too.',
        ] },
        { type: 'p', text: 'Print the code at least 4 cm wide with dark ink on a light, matte background. Glossy card and candle glare make codes harder to scan. Add one plain sentence, such as "Scan to add your photos to our wedding gallery."' },
      ],
    },
    {
      h2: 'What your guests experience',
      blocks: [
        { type: 'ol', items: [
          'They point the phone camera at the code and tap the link that appears.',
          'The upload page opens in the phone’s browser. There is nothing to install and nothing to sign up for.',
          'They take a photo with the built-in camera, or choose photos from their camera roll.',
          'The photos upload to the shared gallery, which guests can browse as it fills up.',
        ] },
        { type: 'p', text: `Valere gives each guest a set number of photos, a bit like a disposable camera. That ranges from ${free.photosPerGuest} on the free plan to ${unlimited.photosPerGuest} on the largest. If a guest opens the link inside another app, such as Instagram, and the camera will not start, they can pick photos from their camera roll or open the link in their phone’s browser.` },
      ],
    },
    {
      h2: 'Do guests need an app?',
      blocks: [
        { type: 'p', text: 'Not with a browser-based QR page. The guest scans, the page opens, and they upload. Some disposable-camera style apps do ask every guest to install an app first, which many people skip. See [the comparison of photo sharing options](/guides/wedding-photo-sharing-options-compared) for the trade-offs.' },
      ],
    },
    {
      h2: 'Tips that get more guests uploading',
      blocks: [
        { type: 'ul', items: [
          'Assign a helper. Ask one person to nudge tables, check that uploads are arriving and help older guests.',
          'Remind people at the speeches. Ask the MC to mention it when people are seated and relaxed, and again before the dancing starts.',
          'Open the event early. Getting-ready photos and the lead-up are often the ones nobody else captures.',
          'Keep a backup. After the wedding, download the full ZIP and keep it on two devices or drives.',
        ] },
      ],
    },
    {
      h2: 'Privacy: who can see and add photos',
      blocks: [
        { type: 'p', text: 'Treat the QR code like a key. Anyone who has the code or link can add photos, so share it with your guests rather than posting it publicly. Read our [privacy policy](/privacy) and [terms](/terms) to see how Valere handles photos.' },
      ],
    },
    {
      h2: 'Where Valere fits (our product)',
      blocks: [
        { type: 'product', title: 'Valere photo sharing', paragraphs: [
          `Guests scan a QR code, upload from their phone with no app or account, and you download every photo as one ZIP. ${valereFacts} See [pricing](/#pricing) for the details.`,
        ] },
      ],
    },
  ],
  faq: [
    { q: 'Do guests need to download an app to upload wedding photos?', a: 'Not with a QR upload page. Guests scan the code with their phone camera and the page opens in their browser. Valere needs no app and no account for guests.' },
    { q: 'How many guests can use one QR code?', a: `Everyone you invite can use the same code, up to the guest limit of your plan. On Valere that is ${free.guestCap} guests on the free plan, up to ${unlimited.guestCap} on the largest.` },
    { q: 'What if the venue has poor signal?', a: 'Tell guests early that uploads need a connection. On Valere, a photo that does not finish uploading is kept on the phone and retried when the guest is back online with the page open, so guests can often upload later from the accommodation Wi-Fi.' },
    { q: 'How do we get all the photos afterwards?', a: 'Download them from your event dashboard as a single ZIP file, then keep a second copy somewhere else.' },
    { q: 'Is it safe to share the QR code online?', a: 'Anyone with the code or link can add photos to the gallery, so share it only with your guests, for example on table cards and the programme, rather than posting it publicly.' },
    { q: 'How long do we have access to the gallery?', a: 'Valere keeps your gallery available for at least 30 days after your event ends. Download your ZIP well within that window.' },
  ],
  related: ['wedding-photo-sharing-options-compared', 'delegate-wedding-tasks-wedding-party'],
};

const GUIDE_B = {
  slug: 'wedding-photo-sharing-options-compared',
  title: 'Wedding Photo Sharing Options Compared | Valere',
  description:
    'Shared albums, cloud folders, QR upload pages and disposable-camera apps compared on guest effort, quality, privacy, cost and downloading everything.',
  h1: 'Wedding photo sharing options compared: shared albums, QR upload pages and disposable-camera apps',
  intro:
    'There are four common ways to collect wedding guest photos: a shared album in a photo app, a cloud folder or group chat, a QR upload page that works in the browser, and a disposable-camera style app. The right one depends on how much effort you can ask of your guests, and who should end up holding the photos.',
  takeaways: [
    'Shared albums are free and familiar, but guests usually need the right account or app to add photos.',
    'Group chats and cloud folders are quick to start but get messy, and photos can be squashed or buried.',
    'QR upload pages ask the least of guests: scan, upload, done. Terms and pricing vary by product.',
    'Disposable-camera apps add charm, often with delayed reveals, but every guest has to install an app.',
    'Check three things on any option: who owns the photos, how you download everything, and what it costs.',
  ],
  sections: [
    {
      h2: 'The four options',
      blocks: [
        { type: 'h3', text: '1. Shared album in a photo app' },
        { type: 'p', text: 'Photo apps from the big phone and cloud companies let you create an album and invite people to add to it. The catch is that contributors often need to be signed in to that company’s account system, and guests on a different phone ecosystem may struggle.' },
        { type: 'h3', text: '2. Cloud folder or group chat' },
        { type: 'p', text: 'You share a folder link or ask guests to post in a chat. It is the fastest to start. It is also the messiest: photos are scattered across threads, some chat apps shrink pictures, and quieter guests never send anything.' },
        { type: 'h3', text: '3. QR upload page (browser-based)' },
        { type: 'p', text: 'A dedicated upload page opens from a QR code. Guests need no app, and the host gets a single gallery. Features, limits and pricing differ between products, so read the terms. Valere is one example of this type.' },
        { type: 'h3', text: '4. Disposable-camera style app' },
        { type: 'p', text: 'These apps mimic a film camera: a limited number of shots, and sometimes a delayed "develop" reveal. The format is fun, and it can produce a charming set. The trade-off is that each guest has to install and set up an app, which many will not do at a party.' },
      ],
    },
    {
      h2: 'Comparison at a glance',
      blocks: [
        { type: 'table',
          caption: 'Wedding photo sharing options compared on eight criteria',
          head: ['Criteria', 'Shared album', 'Cloud folder or chat', 'QR upload page', 'Camera app'],
          rows: [
            ['Guest effort', 'Medium: join the album first', 'Low to medium: find the link or thread', 'Low: scan and upload', 'Higher: install and set up'],
            ['App needed?', 'Often the photo app or an account', 'Usually a chat app or cloud login', 'No, runs in the browser', 'Yes, on every guest’s phone'],
            ['Photo quality', 'Depends on upload settings', 'Chat apps often shrink photos', 'Depends on the product; check', 'Depends on the product; check'],
            ['Who owns the photos', 'The guests and the album owner', 'The guests; you hold copies', 'Read the terms; the host should keep control', 'Read the terms; the host should keep control'],
            ['Cost model', 'Usually free', 'Usually free, storage limits apply', 'Free tiers or one-time per event', 'Varies: free, per event or subscription'],
            ['Privacy', 'Link or invite based', 'Weakest: easy to forward', 'Link or QR based; share only with guests', 'Varies; check who can see the feed'],
            ['Low signal', 'Needs a connection to add', 'Needs a connection to post', 'Depends; some retry later', 'Depends on the app'],
            ['Download everything', 'Often possible, in batches', 'Manual, one by one', 'Often a single ZIP; check', 'Varies; check the export'],
          ] },
        { type: 'p', text: 'Product details change. Treat the table as a list of questions to ask, and check the current terms of whichever option you choose.' },
      ],
    },
    {
      h2: 'How to choose',
      blocks: [
        { type: 'ul', items: [
          'Small, close group who all use the same phone ecosystem: a shared album is probably enough.',
          'Mixed ages and phones, and you want the least effort from guests: a QR upload page.',
          'Young, app-happy crowd who will enjoy the novelty: a camera app can be a good fit.',
        ] },
      ],
    },
    {
      h2: 'Questions to ask about any option',
      blocks: [
        { type: 'ul', items: [
          'Do guests need an app or an account? Try it on a phone that is not yours.',
          'Who owns the photos, and what happens to them after the event?',
          'Can I download everything in one go, at full quality?',
          'What does it cost for my guest count, and is it one-time or recurring?',
        ] },
      ],
    },
    {
      h2: 'Where Valere fits (our product)',
      blocks: [
        { type: 'product', title: 'Valere is a QR upload page', paragraphs: [
          `Guests scan a QR code and upload from their phone browser with no app and no account. There is a built-in camera, or they can pick from their camera roll, and everyone can watch the gallery fill up. You download every photo as one ZIP, and the gallery is kept for at least 30 days after the event.`,
          `${valereFacts} Compare that with your own guest count on the [pricing section](/#pricing).`,
        ] },
        { type: 'p', text: 'It is not the right fit for everyone. Each guest has a photo limit, like a disposable camera, and guests need a connection to upload. If you want a delayed-reveal film effect, a camera app does that and Valere does not.' },
      ],
    },
  ],
  faq: [
    { q: 'What is the easiest way for wedding guests to share photos?', a: 'For the least effort, a QR code that opens an upload page in the phone browser. Guests do not install anything or create an account. Shared albums and chats work too but ask more of guests.' },
    { q: 'Are shared albums or QR upload pages better?', a: 'Shared albums are free and fine for a small group on similar phones. QR upload pages suit mixed groups because they need no account, though most have a price or limits.' },
    { q: 'Do disposable-camera apps need every guest to install them?', a: 'Generally yes. Guests have to install the app and often create a profile, which is the main reason hosts get fewer photos than they hoped for.' },
    { q: 'Who owns the photos guests upload?', a: 'Usually the person who took each photo keeps the copyright, and the host collects copies. Read the terms of whichever service you use to see what rights it takes.' },
    { q: 'Can I download every guest photo at once?', a: 'It depends on the service. Valere lets you download every photo from an event as a single ZIP. With albums and chats it is often manual or in batches.' },
    { q: 'Is Valere free?', a: `Your first event is free for up to ${free.guestCap} guests. Bigger events are a one-time price by guest count, from ${tierPrice('starter')} to ${tierPrice('unlimited')}, with no subscription.` },
  ],
  related: ['collect-wedding-guest-photos-qr-code', 'delegate-wedding-tasks-wedding-party'],
};

const GUIDE_C = {
  slug: 'wedding-budget-breakdown-south-africa',
  title: 'Wedding Budget Breakdown for South African Couples',
  description:
    'A planning framework for splitting a wedding budget in rand: category percentages, quotes vs invoices vs payments, contingency and hidden costs.',
  h1: 'Wedding budget breakdown for South African couples',
  intro:
    'Start with a total you can afford, then split it across categories with a planning guide such as 40% to 50% for venue, food and drinks and about 8% for a contingency. Track quotes, invoices and payments separately, in rand, so you always know what you have promised and what you have actually paid. The percentages below are a rough starting point, not statistics.',
  takeaways: [
    'Decide the total first, and who is contributing what, before you look at venues.',
    'Venue, food and drinks usually take the biggest share, so that decision sets the rest.',
    'A quote, an invoice and a payment are three different numbers. Track all three.',
    'Keep a contingency of roughly 5% to 10% for the things nobody quotes.',
    'Ask whether every quote includes VAT, service charges and travel.',
  ],
  sections: [
    {
      h2: 'Start with the total and who is paying',
      blocks: [
        { type: 'p', text: 'Write down one number you are comfortable spending, then note what each person is contributing: you, your partner, parents or savings. Agree it in writing between you. A budget built on "about what we can manage" gets overspent quietly.' },
      ],
    },
    {
      h2: 'A starting split',
      blocks: [
        { type: 'p', text: `These shares are a planning guide, not statistics from a survey. Real weddings differ a lot with guest count, location and priorities. The right-hand column shows what each share would be on an example budget of ${zar(BUDGET_EXAMPLE_TOTAL)}.` },
        { type: 'budgetTable' },
        { type: 'p', text: 'The example shares add up to 100%. If you want a free-spirited honeymoon or a big photography spend, move money from other categories rather than inflating the total.' },
      ],
    },
    {
      h2: 'Quotes, invoices and payments are different numbers',
      blocks: [
        { type: 'h3', text: 'Quote' },
        { type: 'p', text: 'A supplier’s price for the job before you commit. Quotes are valid for a limited time and can change if your guest count or date changes.' },
        { type: 'h3', text: 'Invoice' },
        { type: 'p', text: 'The amount the supplier actually bills you once you have agreed. It may differ from the quote after extras and changes.' },
        { type: 'h3', text: 'Payment' },
        { type: 'p', text: 'What you have paid so far, such as a deposit or a final balance. Keep the proof of payment. The number that matters at the end is invoiced minus paid.' },
        { type: 'p', text: 'If you track only one of these three you will either overspend or lose track of a balance due a week before the wedding.' },
      ],
    },
    {
      h2: 'Track everything in rand, in one place',
      blocks: [
        { type: 'p', text: `A spreadsheet works if you like building one. If you would rather start with a ready-made tracker, the [Valere Wedding Planner](/wedding-planner) keeps quotes, invoices and payments apart in rand and shows who paid for what. It costs ${plannerPrice} once per wedding, and is our product.` },
      ],
    },
    {
      h2: 'Keep a contingency',
      blocks: [
        { type: 'p', text: 'Set aside about 5% to 10% of the total and treat it as spent only when something unplanned happens. Guest numbers change, prices move and little things appear, such as extra chairs or an alteration. If you do not use the contingency, it becomes a nice surplus.' },
      ],
    },
    {
      h2: 'Common hidden costs',
      blocks: [
        { type: 'ul', items: [
          'VAT, service charges and gratuity that are not in the first quote.',
          'Corkage if you bring your own drinks, and overtime if the party runs late.',
          'Extra hire items: chairs, linen, cutlery, crockery, lighting.',
          'Power backup, if your venue does not have its own generator.',
          'Supplier travel, accommodation and set-up time for remote venues.',
          'Cake cutting or plating fees and glassware breakages.',
          'Alterations and last-minute accessories.',
          'Security, parking marshals and shuttles for guests.',
          'Marriage officer fees or travel, if the ceremony is away from an office; check with the officer.',
        ] },
      ],
    },
    {
      h2: 'Where to trim without losing what matters',
      blocks: [
        { type: 'ul', items: [
          'Trim the guest list first; every guest adds food, drink, hire and favours.',
          'Choose a weekday or off-peak date if your venue offers lower rates.',
          'Spend where guests will notice (food, music, comfort) and keep decor simple.',
          'Ask each supplier what they can adjust, such as hours or menu, before you switch.',
        ] },
        { type: 'p', text: 'Once the budget is set, build your timeline with the [12-month planning checklist](/guides/wedding-planning-checklist-12-month-timeline).' },
      ],
    },
  ],
  faq: [
    { q: 'How much of my wedding budget should go on the venue?', a: 'As a rough planning guide, venue, food and drinks together often take about 40% to 50% of the total. It is a starting point, not a rule. Your own priorities and guest count matter more.' },
    { q: 'What is the difference between a quote and an invoice?', a: 'A quote is the supplier’s offer before you commit. An invoice is the amount they actually bill after you agree, including any extras. A payment is what you have paid so far.' },
    { q: 'How much contingency should I keep?', a: 'About 5% to 10% of the total budget is a common planning guide. Treat it as spent only when something unplanned happens.' },
    { q: 'Should the honeymoon be in the wedding budget?', a: 'Keep it as a separate budget so it does not quietly absorb wedding money. Decide its total at the same time as the wedding total.' },
    { q: 'How do I make sure quotes are comparable?', a: 'Ask each supplier to quote the same hours, guest count and inclusions, and to say whether VAT, service charges and travel are included.' },
    { q: 'Is there an app for tracking a wedding budget in rand?', a: `A spreadsheet works, and there are several apps. The Valere Wedding Planner is one option: it tracks quotes, invoices and payments in rand and costs ${plannerPrice} once per wedding.` },
  ],
  related: ['wedding-planning-checklist-12-month-timeline', 'delegate-wedding-tasks-wedding-party'],
};

const GUIDE_D = {
  slug: 'wedding-planning-checklist-12-month-timeline',
  title: 'Wedding Planning Checklist: 12 Months to the Day',
  description:
    'A month-by-month wedding planning checklist for South African couples, from budget and venue to the final week, with Home Affairs reminders.',
  h1: 'Wedding planning checklist and timeline: 12 months to the day',
  intro:
    'Twelve months is a comfortable runway for most weddings: book the venue and the big suppliers first, then work down to the details. This checklist runs from 12 months out to the week after the wedding. Squeeze or stretch it to fit your date, and note that popular venues and photographers can book up well beyond a year.',
  takeaways: [
    'Budget, guest count and a date range come first; everything else depends on them.',
    'Venue, photographer and caterer are usually the first bookings to lock in.',
    'Check current marriage requirements and booking lead times with Home Affairs or your marriage officer.',
    'Send save-the-dates early for guests who need to travel.',
    'Hand tasks to your wedding party early, and keep receipts for every payment.',
  ],
  sections: [
    {
      h2: '12 to 10 months to go',
      blocks: [
        { type: 'ul', items: [
          'Agree the total budget and who is contributing (see the [budget guide](/guides/wedding-budget-breakdown-south-africa)).',
          'Choose a date range and a rough guest count.',
          'Visit and shortlist venues. Ask for written quotes and the dates they have free.',
          'Book the venue, then your marriage officer or celebrant. Check current requirements and lead times with Home Affairs or your officer.',
          'If you want an antenuptial contract, speak to an attorney well ahead, as it has to be arranged before you marry.',
        ] },
      ],
    },
    {
      h2: '9 to 7 months',
      blocks: [
        { type: 'ul', items: [
          'Ask photographers, caterers and music acts for quotes, and compare them side by side.',
          'Book the main suppliers and pay their deposits. Keep the signed quotes and proof of payment.',
          'Choose your wedding party and tell them early what you would like them to help with.',
          'Start looking at attire and book fittings.',
          'Think about the honeymoon and check that passports are valid long enough for where you are going; many countries have minimum validity rules, so check the destination’s requirements.',
        ] },
      ],
    },
    {
      h2: '6 to 4 months',
      blocks: [
        { type: 'ul', items: [
          'Send save-the-dates, particularly to guests who must book flights or accommodation.',
          'Reserve accommodation for out-of-town guests and for yourselves.',
          'Choose flowers, decor, cake and stationery.',
          'Plan your photo plan: the formal shot list with your photographer, and how guests will share their own photos (see [collecting guest photos with a QR code](/guides/collect-wedding-guest-photos-qr-code)).',
          'Book the honeymoon flights and accommodation.',
        ] },
      ],
    },
    {
      h2: '3 to 2 months',
      blocks: [
        { type: 'ul', items: [
          'Send invitations and start tracking RSVPs.',
          'Hold the menu tasting and finalise the music list and do-not-play list.',
          'Plan the order of the day and share it with your wedding party.',
          'Confirm what Home Affairs or your marriage officer needs from you and when; check current requirements.',
          'Hand out tasks: who collects the cake, who looks after the gifts table, who chases RSVPs (see [delegating wedding tasks](/guides/delegate-wedding-tasks-wedding-party)).',
        ] },
      ],
    },
    {
      h2: '1 month to go',
      blocks: [
        { type: 'ul', items: [
          'Chase outstanding RSVPs and collect dietary needs.',
          'Give the venue and caterer your final guest count.',
          'Do final fittings.',
          'Confirm arrival times and contact numbers with every supplier.',
          'Start the seating plan and pay outstanding balances, keeping every receipt.',
        ] },
      ],
    },
    {
      h2: 'The last week',
      blocks: [
        { type: 'ul', items: [
          'Walk through the venue with your coordinator or helpers.',
          'Print the seating plan, signs, the order of the day and the QR table cards.',
          'Prepare tips and any final payments in labelled envelopes.',
          'Pack for the honeymoon and collect your travel documents.',
          'Check the weather and the power and water arrangements with the venue.',
        ] },
      ],
    },
    {
      h2: 'On the day',
      blocks: [
        { type: 'ul', items: [
          'Eat breakfast and drink water; assign a helper to carry your phone and essentials.',
          'Ask your MC to remind guests to upload their photos.',
          'Hand final payments and tips to a trusted person to distribute.',
          'Let your helpers handle their tasks and enjoy it.',
        ] },
      ],
    },
    {
      h2: 'After the wedding',
      blocks: [
        { type: 'ul', items: [
          'Download all guest photos and keep two copies.',
          'Send thank-you messages while the memories are fresh.',
          'If you are changing your name, check the current process with Home Affairs.',
          'Pay any remaining balances and file your receipts.',
        ] },
        { type: 'p', text: `If you would rather keep this timeline as live tasks with due dates and reminders, the [Wedding Planner](/wedding-planner) (${plannerPrice} once, our product) does that.` },
      ],
    },
  ],
  faq: [
    { q: 'How far ahead should I start planning a wedding?', a: 'Twelve months is a comfortable runway for most weddings, and popular venues and photographers can book up earlier. Shorter timelines are possible if you are flexible on date and suppliers.' },
    { q: 'What should I book first?', a: 'Usually the venue, then your marriage officer or celebrant, photographer and caterer, because their availability sets your date.' },
    { q: 'What do I need from Home Affairs?', a: 'Requirements and lead times change and depend on who marries you, so check current requirements with Home Affairs or your marriage officer. Do not rely on a general guide for this.' },
    { q: 'When should I send save-the-dates and invitations?', a: 'Send save-the-dates about six months out, earlier for guests who must travel, and invitations roughly two to three months before the wedding.' },
    { q: 'When do I need a final guest count?', a: 'Your venue and caterer will give a deadline, often around a month before. Ask when you book and put it in the calendar.' },
    { q: 'Can I turn this checklist into tasks with reminders?', a: 'Yes. You can copy it into any to-do app. The Valere Wedding Planner has tasks with due dates, a calendar and optional email reminders.' },
  ],
  related: ['wedding-budget-breakdown-south-africa', 'delegate-wedding-tasks-wedding-party'],
};

const GUIDE_E = {
  slug: 'delegate-wedding-tasks-wedding-party',
  title: 'How to Delegate Wedding Tasks to Your Wedding Party',
  description:
    'Which wedding jobs to hand to your wedding party, how to brief them, how to avoid chaos, and how to share tasks without sharing your budget.',
  h1: 'How to delegate wedding tasks to your wedding party',
  intro:
    'Give each person a small number of clear jobs with a deadline and a single point of contact, and share the tasks rather than the whole plan. Hand over anything that does not need your decision, such as collecting the cake, guest transport or chasing RSVPs. Keep money, contracts and guest details between you and your partner.',
  takeaways: [
    'Delegate jobs, not decisions: you choose the cake, a helper collects it.',
    'One owner per task, with a deadline and written instructions.',
    'Brief people early and in one place, not across five chat threads.',
    'Share tasks, not budgets: helpers rarely need to see your finances.',
    'Say thank you, and give people an exit if they are overloaded.',
  ],
  sections: [
    {
      h2: 'Roles that work well',
      blocks: [
        { type: 'table',
          caption: 'Wedding party roles and typical hand-offs',
          head: ['Role', 'Typically helps with', 'Keep with you'],
          rows: [
            ['Maid of honour or best man', 'Wedding-morning timing, keeping the party on schedule, speeches order', 'Final decisions on suppliers'],
            ['Bridesmaids and groomsmen', 'Welcoming guests, decor set-up, running errands, ushering', 'Budget and contracts'],
            ['Parents and family', 'Guest travel, accommodation for relatives, elders’ seating', 'Guest list decisions'],
            ['A trusted friend or coordinator', 'Supplier arrivals, the order of the day, problem solving', 'Payments'],
            ['A photo helper', 'Reminding guests to upload photos, checking the gallery', 'Choosing the photographer'],
          ] },
      ],
    },
    {
      h2: 'What to hand off',
      blocks: [
        { type: 'ul', items: [
          'Collecting and returning hire items, cake, flowers or decor.',
          'Chasing RSVPs and dietary requirements.',
          'Organising guest transport and parking.',
          'Greeting guests, handing out programmes and showing people to seats.',
          'Setting up and packing down table decor.',
          'Reminding guests to share their photos, and checking the gallery during the day.',
        ] },
        { type: 'p', text: 'Keep supplier contracts, payments, the seating decisions and anything with a legal side with the two of you.' },
      ],
    },
    {
      h2: 'How to avoid chaos',
      blocks: [
        { type: 'ol', items: [
          'Write each task as a sentence that starts with a verb and says what "done" looks like: "Collect the cake from the baker by 10:00 and bring it to the venue".',
          'Give every task one owner and one date. Tasks with two owners usually have none.',
          'Brief everyone in one place, in writing, with times, addresses and phone numbers.',
          'Check in two weeks and one week before, and again the day before.',
          'Have a plan B for critical jobs, such as a second driver for the cake.',
          'Tell people what they should not do, such as paying suppliers on your behalf without telling you.',
        ] },
      ],
    },
    {
      h2: 'Privacy: share tasks, not budgets',
      blocks: [
        { type: 'p', text: 'Your helpers want to help, not audit your finances. A shared spreadsheet or group chat usually exposes everything: totals, guest details, supplier prices and payments. Share only what each person needs for their own tasks.' },
        { type: 'p', text: `The [Valere Wedding Planner](/wedding-planner) is built for this: you invite up to 10 helpers, each sees only the tasks assigned to them, and the budget, quotes, files, guest list and calendar stay private to you and your partner. Helpers do not pay. It costs ${plannerPrice} once per wedding and is our product.` },
      ],
    },
    {
      h2: 'Looking after your helpers',
      blocks: [
        { type: 'ul', items: [
          'Ask first, and make it easy to say no.',
          'Keep the load small: three or four tasks per person is plenty.',
          'Cover costs. If someone is driving or buying things for you, agree how you will reimburse them.',
          'Thank them, publicly and personally, after the day.',
        ] },
        { type: 'p', text: 'For the timeline behind the hand-offs see the [12-month checklist](/guides/wedding-planning-checklist-12-month-timeline).' },
      ],
    },
  ],
  faq: [
    { q: 'What wedding tasks can I delegate?', a: 'Errands and logistics: collecting the cake and decor, chasing RSVPs, guest transport, greeting and ushering, and set-up and pack-down. Keep contracts, payments and key decisions yourselves.' },
    { q: 'How many tasks should one person get?', a: 'Three or four clear tasks is plenty for a volunteer. Spread jobs across more people rather than overloading one friend.' },
    { q: 'How do I avoid sharing my budget with helpers?', a: 'Share tasks, not the whole plan. Use a tool where helpers see only their own tasks, or send individual checklists rather than your full spreadsheet.' },
    { q: 'Do wedding party members have to pay to use the Valere Wedding Planner?', a: 'No. You invite up to 10 helpers and they see only the tasks assigned to them. The one-time price covers the wedding, your partner and your helpers.' },
    { q: 'What if someone does not do their task?', a: 'Check in a couple of weeks ahead, have a backup for critical jobs, and take a task back early rather than the night before.' },
    { q: 'Should I hire a coordinator instead?', a: 'It depends on budget and complexity. A coordinator or venue manager on the day takes a lot off the wedding party, even if you plan everything else yourselves.' },
  ],
  related: ['collect-wedding-guest-photos-qr-code', 'wedding-planning-checklist-12-month-timeline'],
};

export const GUIDES = [GUIDE_A, GUIDE_B, GUIDE_C, GUIDE_D, GUIDE_E].map((g) => ({
  ...g,
  path: `${GUIDES_PATH}/${g.slug}`,
  url: `${SITE_URL}${GUIDES_PATH}/${g.slug}`,
}));

export const guideBySlug = (slug) => GUIDES.find((g) => g.slug === slug);

// Short summaries for the index and for llms-full.txt.
export const GUIDE_BLURBS = {
  'collect-wedding-guest-photos-qr-code': 'Set-up steps, where to put table cards, what guests see and tips that get more guests uploading.',
  'wedding-photo-sharing-options-compared': 'Shared albums, cloud folders, QR upload pages and disposable-camera apps compared on eight criteria.',
  'wedding-budget-breakdown-south-africa': 'A planning split in rand, quotes vs invoices vs payments, contingency and hidden costs.',
  'wedding-planning-checklist-12-month-timeline': 'A month-by-month checklist from twelve months out to the week after the wedding.',
  'delegate-wedding-tasks-wedding-party': 'Roles, what to hand off, how to avoid chaos and how to share tasks without sharing your budget.',
};

export const OG_IMAGE = {
  url: `${SITE_URL}/logo512.png`,
  width: 512,
  height: 512,
  alt: 'Valere logo',
};

export const FAQ_JSON_LD_FOR = (faq) => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faq.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
});
