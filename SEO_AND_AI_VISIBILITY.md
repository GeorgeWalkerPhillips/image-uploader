# SEO and AI visibility for Valere

Last updated 2026-10-20. Scope: frontend and static files only (no database, SQL or Edge Function changes).

## The problem this addresses

Searching for "Valere wedding photo app" returned nothing from the site. Two reasons: the site is not indexed yet, and "Valere" is an ambiguous word (other businesses use the name). Search engines and AI assistants need (1) to be allowed in, (2) to find the pages, (3) to understand who Valere is and tell it apart from the others, and (4) to see the wider web say the same thing. This work covers 1 to 3. Number 4 can only be done by the owner (see the checklist).

## What was implemented

**Entity clarity**
- `src/siteProfile.js` is the single source for the Organization and WebSite data. The description is the disambiguation sentence: "Valere is a South African wedding and event photo-sharing app and wedding planner."
- `public/index.html` now has one `@graph` with stable ids: `https://www.valere.co.za/#organization`, `#website` and `#photo-app` (the photo product). The old photo offer said "additional events R50 flat", which was out of date; offers are now one per plan from `pricingTiers.js`.
- Every other page links to the Organization by `@id` (Article author and publisher, AboutPage `about`, planner publisher). `sameAs` is emitted only when `SOCIAL_PROFILES` has entries (it is empty).
- Home title, description and Open Graph/Twitter titles now say "Valere ... (South Africa)".
- Brand audit: the public pages said "Capture by Val" in two places on `/wedding-planner` (now "Valere photo events" and "Valere photo sharing"), and the demo photo text in `scripts/seed-paystack-demo-account.js` (now "Valere"). Internal names (CLAUDE.md, code comments, an IndexedDB name, the demo account's email domain) were left alone on purpose.

**New pages** (prerendered into static HTML at build, in `sitemap.xml`, linked from the landing page nav and footer)
- `/about`: what Valere is, two products, how it works, who it is for, where it operates, privacy, contact, FAQ.
- `/guides` and five guides (collect guest photos with a QR code; photo sharing options compared; wedding budget breakdown in rand; 12-month checklist; delegating tasks to your wedding party). Each has a short answer-first intro, key takeaways, FAQ with FAQPage JSON-LD, Article and BreadcrumbList JSON-LD, and links to the planner, pricing and About. Copy is in `src/guides/content.js` and `src/aboutContent.js`.
- Budget percentages are labelled a planning guide, not statistics. Home Affairs and marriage-officer points are phrased as "check current requirements". No named competitors, ratings, reviews, user counts or awards.

**Blog** (added 2026-10-20; `/blog` and `/blog/<slug>`, prerendered, in `sitemap.xml` and `llms.txt`, linked from the landing nav/footer and the content-page header/footer)
- Two posts: `wedding-qr-code-sign-wording` and `wedding-day-guest-photo-plan`. All post data is in `src/blog/content.js` (an array of post objects); rendering reuses the guides components. Each post emits BlogPosting, FAQPage and BreadcrumbList JSON-LD (author/publisher = the Organization `@id`); the index emits CollectionPage/Blog with an ItemList.
- To add a post: add an object to `POSTS`, add its slug to `scripts/prerender.js`, its URL to `public/sitemap.xml` and `public/llms.txt`, run `node scripts/generate-llms-full.js`, then `node scripts/indexnow.js` after deploying. `src/blog/Blog.test.js` and `src/seoFiles.test.js` fail if a step is missed.
- The guides link to the posts in a "Related reading" line (driven by each post's `relatedGuides`). Product facts in the posts (prices, guest and photo limits, 30-day gallery, upload retry) come from `pricingTiers.js`, the landing page FAQ and `CameraCapture.js`/`pendingUploadStore.js`; nothing is invented.

**Crawler access and discovery**
- `public/robots.txt`: the existing rules stay, plus explicit allow groups for Googlebot, Bingbot, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, anthropic-ai, PerplexityBot, Perplexity-User, Google-Extended, Applebot, Applebot-Extended, CCBot, Amazonbot, DuckAssistBot and MistralAI-User. Each group repeats the same Disallows (a crawler that matches its own group ignores the `*` group). Note this also allows AI training crawlers; remove a group if you do not want that.
- IndexNow: key file `public/<key>.txt` and `scripts/indexnow.js`.
- `public/llms.txt` rewritten (disambiguation, both products, prices, every guide). `public/llms-full.txt` is generated from the content modules by `scripts/generate-llms-full.js`; a test fails if it is stale.
- `public/sitemap.xml` lists every new page with `lastmod` 2026-10-20. `/hq`, `/admin` and the login pages are not in any public file.

**Tests**: `src/About.test.js`, `src/guides/Guides.test.js`, `src/seoFiles.test.js` (sitemap, robots, IndexNow, llms files, index.html graph consistency, no `/hq`, brand).

## What only the owner can do (in priority order)

1. **Get indexed.** Verify the domain in Google Search Console and Bing Webmaster Tools, for both `www.valere.co.za` and `valere.co.za`. Submit `https://www.valere.co.za/sitemap.xml` in both. Use "Request indexing" in Search Console for `/`, `/about`, `/guides`, `/wedding-planner`, the five guides, `/blog` and the two posts. Bing matters because ChatGPT search uses Bing's index. After each deploy, run `node scripts/indexnow.js` (it must be after the deploy finishes, because the engines fetch the key file from the live site; `--dry-run` shows what would be sent).
2. **One canonical host.** In Vercel domain settings, make `valere.co.za` 301 redirect to `www.valere.co.za` (everything on the site already uses www as canonical).
3. **Brand profiles.** Create Instagram, Facebook, LinkedIn, TikTok and (if you have a business address/service area) a Google Business Profile, all named "Valere", with the same one-line description as the site ("Valere is a South African wedding and event photo-sharing app and wedding planner.") and a link to https://www.valere.co.za. Then put the real profile URLs in `SOCIAL_PROFILES` in `src/siteProfile.js` and the same URLs in the `sameAs` of the Organization in `public/index.html` (`src/seoFiles.test.js` fails until both match). Never guess URLs.
4. **Earn real third-party mentions.** AI assistants cite what the wider web says. Ask venue and photographer partners to link to the site, get listed in South African wedding blogs and directories, collect genuine reviews from real customers (Google, HelloPeter), pitch press, and answer questions honestly in Reddit and Facebook wedding groups without spamming. Nothing on the site claims any of this yet and nothing should until it is true.
5. **Put the link everywhere.** In every social bio, and on printed QR table cards: "Powered by Valere – valere.co.za".
6. **Monthly AI-visibility check.** Ask ChatGPT, Claude, Gemini and Perplexity these prompts and record whether Valere appears and what it says: (1) best way to collect wedding guest photos South Africa; (2) wedding photo QR code app South Africa; (3) South African wedding planner app; (4) what is Valere; (5) Valere wedding photo app; (6) how do guests share photos at a wedding without an app; (7) shared album vs QR code for wedding photos; (8) wedding budget breakdown South Africa; (9) wedding planning checklist South Africa 12 months; (10) how to delegate wedding tasks to bridesmaids; (11) disposable camera app alternative for weddings; (12) wedding planner app with budget tracker in rand.
7. **Replace the contact email.** The only public address in the repo is a personal Gmail used on the Privacy, Terms and Refund pages. It now also appears on `/about` and in the Organization JSON-LD. When you have an address on the valere.co.za domain, change `CONTACT_EMAIL` in `src/siteProfile.js` (and `public/index.html`'s contactPoint) and every page follows.
8. **Optional: a team section.** `src/About.js` has a marked TODO where a "who is behind Valere" section can go. Nothing about people is stated today on purpose.

## Honest expectations

- No one can force an AI assistant to mention a brand. This work makes the site easy to find, read and quote; it cannot guarantee a mention.
- `llms.txt` has unproven impact: some crawlers read it, major assistants mostly do not yet. It is cheap and harmless, so it is kept accurate.
- Expect weeks to months after indexing before anything changes, and longer for AI answers.

## What could NOT be verified

- The live site was not reachable from the build sandbox, so deployed headers, redirects and the IndexNow key file URL were not checked on production. IndexNow was only dry-run.
- Google Search Console and Bing Webmaster Tools are not accessible from here, so indexing status, rich-result validity and coverage are unchecked. Run the Rich Results Test and Schema Markup Validator on the new pages after deploy.
- Whether other businesses called Valere outrank this site is not something static files can change.
