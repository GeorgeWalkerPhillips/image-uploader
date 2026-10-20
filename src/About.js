import React from 'react';
import { Block, FaqSection } from './guides/GuideBody';
import { Breadcrumb, ContentFooter, ContentHeader, RichText } from './components/ContentChrome';
import { JsonLd } from './seo/JsonLd';
import { usePageMeta } from './seo/usePageMeta';
import { FAQ_JSON_LD_FOR, GUIDES, GUIDES_PATH } from './guides/content';
import {
  ABOUT_DESCRIPTION,
  ABOUT_H1,
  ABOUT_INTRO,
  ABOUT_JSON_LD,
  ABOUT_TITLE,
  ABOUT_URL,
  AUDIENCE,
  CONTACT,
  FAQ_ITEMS,
  PRICING_LINES,
  PRIVACY_TEXT,
  PRODUCTS,
  STEPS,
  WHERE,
} from './aboutContent';
import { OG_IMAGE } from './guides/content';
import { SITE_URL, siteGraph } from './siteProfile';
import { Link } from 'react-router-dom';
import styles from './components/ContentChrome.module.css';

const META = { title: ABOUT_TITLE, description: ABOUT_DESCRIPTION, url: ABOUT_URL, image: OG_IMAGE };

const BREADCRUMB_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'About', item: ABOUT_URL },
  ],
};

function About() {
  usePageMeta(META);
  return (
    <div className={styles.page}>
      <JsonLd data={siteGraph()} />
      <JsonLd data={ABOUT_JSON_LD} />
      <JsonLd data={FAQ_JSON_LD_FOR(FAQ_ITEMS)} />
      <JsonLd data={BREADCRUMB_JSON_LD} />
      <ContentHeader />
      <main className={styles.main}>
        <Breadcrumb trail={[{ label: 'Home', to: '/' }, { label: 'About' }]} />
        <h1>{ABOUT_H1}</h1>
        <p className={styles.lead}>{ABOUT_INTRO}</p>

        <section aria-labelledby="products-heading">
          <h2 id="products-heading">What Valere is</h2>
          {PRODUCTS.map((p) => (
            <React.Fragment key={p.title}>
              <h3>{p.title}</h3>
              <Block block={{ type: 'p', text: p.text }} />
            </React.Fragment>
          ))}
        </section>

        <section aria-labelledby="how-heading">
          <h2 id="how-heading">How it works</h2>
          <ol>
            {STEPS.map((s) => (
              <li key={s.title}>
                <strong>{s.title}.</strong> {s.text}
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="who-heading">
          <h2 id="who-heading">Who it is for</h2>
          <ul>
            {AUDIENCE.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="where-heading">
          <h2 id="where-heading">Where Valere operates and what it costs</h2>
          <p>{WHERE}</p>
          <ul>
            {PRICING_LINES.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
          <p>
            <a href="/#pricing">See the full pricing</a>. Each event is a one-time price, not a subscription.
          </p>
        </section>

        <section aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">Our approach to privacy</h2>
          <p>
            <RichText text={PRIVACY_TEXT} />
          </p>
        </section>

        {/* TODO(owner): add a short "Who is behind Valere" / team section here
            once you are happy to publish names and a line about yourselves.
            Nothing about the founders is stated on purpose: do not add details
            that are not true or that you do not want public. */}

        <section aria-labelledby="contact-heading">
          <h2 id="contact-heading">How to contact us</h2>
          <p>
            Email <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>. The same address is in our{' '}
            <Link to="/privacy">privacy policy</Link>.
          </p>
        </section>

        <section aria-labelledby="guides-heading">
          <h2 id="guides-heading">Wedding guides</h2>
          <ul>
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link to={g.path}>{g.h1}</Link>
              </li>
            ))}
            <li>
              <Link to={GUIDES_PATH}>All guides</Link>
            </li>
          </ul>
        </section>

        <FaqSection faq={FAQ_ITEMS} heading="Frequently asked" />
      </main>
      <ContentFooter />
    </div>
  );
}

export default About;
