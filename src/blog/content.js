// Copy, FAQ and SEO data for /blog and its posts. Kept apart from the components
// so the rendered page, the JSON-LD, llms-full.txt and the tests all read the
// same data. Adding a post is a content-only change: add one object to POSTS
// (newest first is handled by sortedPosts), add its slug to scripts/prerender.js
// and its URL to public/sitemap.xml and public/llms.txt, then run
// `node scripts/generate-llms-full.js`. src/blog/Blog.test.js and
// src/seoFiles.test.js fail if any of those are missed.
//
// Rules, same as the guides: no ratings, reviews, user counts, awards or
// statements about named companies. Every figure about Valere is derived from
// services/pricingTiers.js, never typed in. Body blocks use the same types as
// the guides (p, h3, ul, ol, table, product); inline links are [label](/path).
// FAQ answers are plain text (they also go into JSON-LD).
import { TIERS } from '../services/pricingTiers';
import { zar } from '../guides/content';
import { SITE_URL } from '../siteProfile';

export const BLOG_PATH = '/blog';
export const BLOG_URL = `${SITE_URL}${BLOG_PATH}`;

export const BLOG_INDEX = {
  title: 'Wedding Photo Ideas and Plans for Couples | Valere Blog',
  description:
    'Short, practical posts for South African couples on getting guests to share their wedding photos: sign wording, timing and what to say on the day.',
  h1: 'The Valere blog',
  intro:
    'Short, practical posts for couples who want their guests’ photos as well as the professional ones. Valere is mentioned where it is a practical option, and labelled as our product when it is.',
};

const { free, starter, unlimited } = TIERS;
const price = (t) => zar(t.amountCents / 100);

// One honest sentence about the product, with every figure from pricingTiers.
const valerePrice = `Your first event is free for up to ${free.guestCap} guests, and bigger events are a one-time price by guest count, from ${price(starter)} to ${price(unlimited)}, with no subscription. See [pricing](/#pricing).`;

const POST_QR_SIGN = {
  slug: 'wedding-qr-code-sign-wording',
  metaTitle: 'Wedding QR Code Sign Wording: 12 Ideas to Copy | Valere',
  metaDescription:
    'What to write on a wedding QR code sign so guests scan it: 12 wording ideas, where to put them and how big to print the code. Copy and adapt.',
  h1: 'What to write on your wedding QR code sign: 12 wording ideas and where to put them',
  summary: 'Twelve sign wordings from short to funny to formal, where to place them, and how to print a code that scans.',
  datePublished: '2026-10-20',
  dateModified: '2026-10-20',
  readMinutes: 5,
  intro:
    'The words on your sign decide whether guests scan the code. Say what to do, that there is no app, where the photos go, and ask them to scan now, in two lines a guest can read in five seconds. Here are 12 wordings to copy, and where to put them.',
  takeaways: [
    'A good sign says what to do, that no app is needed, where the photos go, and to scan now.',
    'Keep it to two short lines: guests read signs with a drink in their hand.',
    'Change the wording to suit the spot: the bar, the kids’ table and the welcome table each suit a different tone.',
    'Print the code at least 3 to 4 cm wide, test it on two phones first, and print the web link underneath.',
  ],
  sections: [
    {
      h2: 'Why the words matter',
      blocks: [
        { type: 'p', text: 'Guests glance at signs. A bare QR code looks like an advert or a menu, so many people walk past it. A line such as “Scan to share your photos with us” tells them what happens next and why it is worth ten seconds.' },
      ],
    },
    {
      h2: 'What every good sign includes',
      blocks: [
        { type: 'ul', items: [
          'What to do: “Scan to add your photos.”',
          'No app: “No app, no sign-up.”',
          'Where the photos go: “to our wedding gallery.”',
          'A nudge: “Scan now”, or “Scan before the cake”.',
        ] },
      ],
    },
    {
      h2: '12 wording ideas',
      blocks: [
        { type: 'h3', text: 'Short and sweet' },
        { type: 'ul', items: [
          '“Scan to share your photos with us.”',
          '“Got photos? Scan and add them to our gallery. No app needed.”',
          '“Our day, your photos. Scan here.”',
        ] },
        { type: 'h3', text: 'Funny' },
        { type: 'ul', items: [
          '“We will forget half of today. Scan and upload your photos so we don’t.”',
          '“Be our paparazzi. Scan, snap, send. No app, no forms.”',
          '“What happens on the dance floor stays in the gallery. Scan to add yours.”',
        ] },
        { type: 'h3', text: 'Traditional' },
        { type: 'ul', items: [
          '“Help us remember today. Scan the code with your phone camera to add your photos to our wedding gallery. There is nothing to download.”',
          '“[Name] and [Name] would love to see the day through your eyes. Please scan and share your photos.”',
          '“Skandeer en deel jou foto’s met ons. Scan and share your photos with us.”',
        ] },
        { type: 'h3', text: 'For the bar' },
        { type: 'ul', items: [
          '“Waiting for your drink? Scan and add a photo while you wait. No app.”',
          '“Had a lekker time so far? Scan and add your photos to the gallery.”',
        ] },
        { type: 'h3', text: 'For the kids’ table' },
        { type: 'ul', items: [
          '“Little photographers: ask a grown-up to help you scan and add your best pictures.”',
        ] },
        { type: 'p', text: 'There is no isiZulu line above because it should be written, or at least checked, by a first-language speaker. Ask a relative to do that for any language you add.' },
      ],
    },
    {
      h2: 'Where to put the signs',
      blocks: [
        { type: 'ul', items: [
          'Welcome table: one larger sign, so guests see it on arrival.',
          'Each guest table: a small standing card. Most scans happen when people sit down.',
          'The bar: guests queue here with their phones out.',
          'Toilets or powder room: a small card at eye level.',
          'Photo corner or dance floor.',
          'Order of service: one line and the code.',
          'A small card at each place setting, if the budget allows.',
        ] },
      ],
    },
    {
      h2: 'Size and format that scan',
      blocks: [
        { type: 'p', text: 'These are rules of thumb. Test your own print.' },
        { type: 'ul', items: [
          'Print the code at least 3 to 4 cm per side on table cards, and larger on signs people read from a metre or more away.',
          'Use dark ink on a plain light background, with an empty margin around the code.',
          'Choose matt paper. Glossy card and candle glare make scanning harder.',
          'Scan a printed test with two different phones, ideally an iPhone and an Android, before you order the full run.',
          'Print the web link under the code in case scanning fails. Valere’s event link is long, so make a short link with a shortener you trust and check that it opens the upload page.',
        ] },
      ],
    },
    {
      h2: 'What guests do with Valere',
      blocks: [
        { type: 'ol', items: [
          'They point the phone camera at the code and tap the link that appears.',
          'The upload page opens in the browser. There is no app to install and no account to create.',
          'They take a photo with the built-in camera, or choose photos from their camera roll.',
          'The photos go to your shared gallery. Each guest has a photo limit, a bit like a disposable camera.',
        ] },
      ],
    },
    {
      h2: 'A checklist for the print shop',
      blocks: [
        { type: 'ul', items: [
          'Send the QR code as a PDF or high-resolution file, not a screenshot.',
          'Ask for a proof, and scan the proof.',
          'Ask for a matt finish with no foil or gloss over the code.',
          'Ask them not to crop, stretch or recolour the code.',
          'Order a few extra cards for the bar, the toilets and breakages.',
        ] },
      ],
    },
    {
      h2: 'Where Valere fits (our product)',
      blocks: [
        { type: 'product', title: 'Valere is one way to do this', paragraphs: [
          `Valere gives you a printable QR code (download it as a PDF from your event) that opens an upload page with no app or account. ${valerePrice} For more on setting it up, read the [guide to collecting guest photos with a QR code](/guides/collect-wedding-guest-photos-qr-code).`,
        ] },
      ],
    },
  ],
  faq: [
    { q: 'How big should a wedding QR code be?', a: 'As a rule of thumb, at least 3 to 4 cm per side on a table card, and larger on signs read from further away. Test your own print on two phones, because paper, ink and lighting all matter.' },
    { q: 'How many QR code signs do I need?', a: 'One per guest table, plus the welcome table, the bar and the toilets, and a larger sign wherever guests queue. Add a line and the code to the order of service too.' },
    { q: 'Should the sign say that no app is needed?', a: 'Yes. Many guests assume they must install something, and that stops them. With Valere it is true: the page opens in the phone browser.' },
    { q: 'What if a guest cannot scan the code?', a: 'Print the web link under the code so it can be typed in, and ask your photo helper to assist anyone who struggles. Test the printed link before the print run.' },
    { q: 'Can the sign be in more than one language?', a: 'Yes. Keep each line short, put the languages on separate lines, and have a first-language speaker check anything you did not write yourself.' },
    { q: 'Do guests get unlimited photos?', a: `No. Each guest has a photo limit that depends on the plan, from ${free.photosPerGuest} on the free plan to ${unlimited.photosPerGuest} on the largest, a bit like a disposable camera.` },
  ],
  relatedPosts: ['wedding-day-guest-photo-plan'],
  relatedGuides: ['collect-wedding-guest-photos-qr-code', 'wedding-photo-sharing-options-compared'],
};

const POST_PHOTO_PLAN = {
  slug: 'wedding-day-guest-photo-plan',
  metaTitle: 'Wedding Day Guest Photo Plan: When to Remind Guests | Valere',
  metaDescription:
    'A moment-by-moment plan for reminding wedding guests to upload photos, from arrival to the last dance, with short lines your MC can read out.',
  h1: 'The wedding-day guest photo plan: when to remind guests to upload, from ceremony to last dance',
  summary: 'When to remind guests to upload their photos, with ready-to-read MC lines and a one-page plan to print.',
  datePublished: '2026-10-20',
  dateModified: '2026-10-20',
  readMinutes: 5,
  intro:
    'More guests are likely to upload their photos if someone reminds them at set moments, not once at the start. Brief your MC and one helper before the day, then remind guests as they arrive, at the speeches, after the first dance and with the last song. The plan below has a line to say at each step.',
  takeaways: [
    'Remind guests at set moments: one announcement is rarely enough.',
    'Give your MC and one photo helper the lines in writing before the day.',
    'Decide on ceremony wording first: phones away or phones up.',
    'If the signal drops, photos wait on the phone and try again.',
    'The day after, send a thank-you with the link, then download everything and back it up.',
  ],
  sections: [
    {
      h2: 'Before the day',
      blocks: [
        { type: 'ul', items: [
          'Print the signs and cards (see [what to write on the sign](/blog/wedding-qr-code-sign-wording)), and scan one printed test.',
          'Upload a test photo from your own phone and check it reaches the gallery.',
          'Give your MC and one photo helper a page with the lines below.',
        ] },
      ],
    },
    {
      h2: 'From arrival to the last song',
      blocks: [
        { type: 'h3', text: 'Guests arriving' },
        { type: 'p', text: 'Say: “Welcome! Scan the code on your table to add your photos. No app needed.”' },
        { type: 'h3', text: 'The ceremony' },
        { type: 'p', text: 'Choose one. Phones away: “We would love you to be present. Please keep phones away for the ceremony. The code on your table is waiting afterwards.” Phones up: “Take as many photos as you like, quietly, from your seat.” Either way, have the officiant say it once, and put a sign at the entrance.' },
        { type: 'h3', text: 'Cocktail hour' },
        { type: 'p', text: 'People are standing with phones in hand. Your helper walks around and says: “Got any photos so far? Scan and add them.”' },
        { type: 'h3', text: 'Speeches' },
        { type: 'p', text: 'MC: “Before we begin: if you have taken photos today, scan the code on your table and add them. It takes a minute, there is no app, and the couple will see every one.”' },
        { type: 'h3', text: 'Dinner' },
        { type: 'p', text: 'Do: nothing loud. The table card does the work, and your helper checks that quiet tables have noticed it.' },
        { type: 'h3', text: 'First dance and cake cutting' },
        { type: 'p', text: 'MC: “Phones up for the first dance, then scan to add your clips.” Repeat it before the cake.' },
        { type: 'h3', text: 'The party and the last song' },
        { type: 'p', text: 'MC, as the last song starts: “Last call for photos. Scan before you leave and add tonight’s. Thank you for celebrating with us.”' },
        { type: 'h3', text: 'The day after' },
        { type: 'p', text: 'Send a thank-you message with the event link, for guests who missed the reminders. Then download every photo as a ZIP and keep two copies.' },
      ],
    },
    {
      h2: 'Getting the quiet guests to join',
      blocks: [
        { type: 'p', text: 'Elders, children and people without a smartphone are often left out. Name a friend as “photo helper” who offers to take a table’s photos on their own phone. Children can use a parent’s phone. Because each guest has a photo limit, a helper who uploads for others uses their own allowance, so check your plan.' },
      ],
    },
    {
      h2: 'Patchy signal at the venue',
      blocks: [
        { type: 'p', text: 'Tell guests that uploads need a connection. If a photo does not finish uploading, Valere keeps it on the phone and tries again when the connection returns or the guest comes back to the page. If the page was closed, opening the event link again resumes it. This may not work in private browsing, so guests can also upload from the accommodation Wi-Fi.' },
      ],
    },
    {
      h2: 'Privacy and permissions',
      blocks: [
        { type: 'p', text: 'Tell guests where the photos go: to your wedding gallery, which you control. Anyone with the link can add photos, so share it with guests only. Guests keep ownership of their own photos, and the organizer can view and download them (see the [terms](/terms) and [privacy policy](/privacy)). Respect anyone who prefers not to be photographed.' },
      ],
    },
    {
      h2: 'How long to keep the gallery',
      blocks: [
        { type: 'p', text: 'Valere keeps your gallery available for at least 30 days after your event ends, but its terms advise against relying on it as permanent storage. Download the ZIP in the first week and keep a second copy elsewhere.' },
      ],
    },
    {
      h2: 'Alongside your photographer',
      blocks: [
        { type: 'p', text: 'Guest photos complement your photographer; they do not replace one. Guests catch the candid moments and the angles a photographer cannot be in two places for. Tell your photographer about the QR code so nothing surprises them.' },
      ],
    },
    {
      h2: 'The one-page plan',
      blocks: [
        { type: 'table',
          caption: 'A printable one-page plan for guest photo reminders',
          head: ['Moment', 'Who', 'Do or say'],
          rows: [
            ['Before the day', 'You', 'Print, test two phones, brief the MC and helper'],
            ['Arrival', 'Usher', 'Welcome, point to the table code'],
            ['Ceremony', 'Officiant', 'Phones away or up, then say it once'],
            ['Cocktails', 'Helper', 'Walk around, remind guests'],
            ['Speeches', 'MC', 'Read the speeches line'],
            ['Dinner', 'Helper', 'Check quiet tables'],
            ['First dance and cake', 'MC', 'Phones up, then scan'],
            ['Last song', 'MC', 'Last call for photos'],
            ['Day after', 'You', 'Thank-you message, download, back up'],
          ] },
      ],
    },
    {
      h2: 'Where Valere fits (our product)',
      blocks: [
        { type: 'product', title: 'Valere is one way to do this', paragraphs: [
          `Guests scan a QR code and upload from their phone browser with no app or account, and you download every photo as one ZIP. ${valerePrice}`,
        ] },
      ],
    },
  ],
  faq: [
    { q: 'When is the best time to remind wedding guests to upload photos?', a: 'There is no single best moment, so use several: at arrival, during the speeches, after the first dance or cake, and with the last song. The speeches work well because everyone is seated and listening.' },
    { q: 'Should we ask guests to put their phones away at the ceremony?', a: 'It is your choice. Many couples ask guests to keep phones away during the ceremony and then point them to the QR code afterwards. If you want phones up, ask for quiet photos taken from a seat.' },
    { q: 'Who should be the photo helper?', a: 'A relaxed, sociable friend or cousin who is not in the wedding party’s busiest roles. Give them the lines and the job of checking quiet tables.' },
    { q: 'What if the venue has no signal?', a: 'Tell guests early that uploads need a connection. On Valere a photo that has not finished uploading stays on the phone and is retried when the connection returns or the guest comes back to the page.' },
    { q: 'How long can we keep the gallery?', a: 'Valere keeps your gallery available for at least 30 days after your event ends. Download the ZIP early and keep a second copy.' },
    { q: 'Do guest photos replace a professional photographer?', a: 'No. They complement a photographer by adding candid moments and different angles. Your photographer still covers portraits and the formal shots.' },
  ],
  relatedPosts: ['wedding-qr-code-sign-wording'],
  relatedGuides: ['collect-wedding-guest-photos-qr-code', 'delegate-wedding-tasks-wedding-party'],
};

export const POSTS = [POST_QR_SIGN, POST_PHOTO_PLAN].map((p) => ({
  ...p,
  path: `${BLOG_PATH}/${p.slug}`,
  url: `${SITE_URL}${BLOG_PATH}/${p.slug}`,
}));

export const postBySlug = (slug) => POSTS.find((p) => p.slug === slug);

// Newest first; posts published on the same day keep the order they have above.
export const sortedPosts = () =>
  POSTS.map((p, i) => [p, i])
    .sort((a, b) => (a[0].datePublished === b[0].datePublished ? a[1] - b[1] : a[0].datePublished < b[0].datePublished ? 1 : -1))
    .map(([p]) => p);

// Posts that list a given guide in relatedGuides (for the guides' "Related reading").
export const postsForGuide = (guideSlug) => sortedPosts().filter((p) => p.relatedGuides.includes(guideSlug));

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// '2026-10-20' -> '20 October 2026' (no Date object, so no timezone surprises).
export const formatDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
