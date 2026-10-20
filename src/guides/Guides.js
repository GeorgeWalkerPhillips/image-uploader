import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  GUIDES,
  GUIDES_INDEX,
  GUIDES_PATH,
  GUIDES_URL,
  GUIDE_BLURBS,
  DATE_MODIFIED,
  DATE_PUBLISHED,
  OG_IMAGE,
  UPDATED_LABEL,
  FAQ_JSON_LD_FOR,
  guideBySlug,
} from './content';
import { Sections, FaqSection } from './GuideBody';
import { Breadcrumb, ContentFooter, ContentHeader, RichText } from '../components/ContentChrome';
import { JsonLd } from '../seo/JsonLd';
import { usePageMeta } from '../seo/usePageMeta';
import { ORG_ID, SITE_URL, WEBSITE_ID, siteGraph } from '../siteProfile';
import styles from '../components/ContentChrome.module.css';

const breadcrumbLd = (items) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({
    '@type': 'ListItem',
    position: i + 1,
    name: it.name,
    item: it.url,
  })),
});

const INDEX_META = {
  title: GUIDES_INDEX.title,
  description: GUIDES_INDEX.description,
  url: GUIDES_URL,
  image: OG_IMAGE,
};

export function GuidesIndex() {
  usePageMeta(INDEX_META);
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${GUIDES_URL}#page`,
    url: GUIDES_URL,
    name: GUIDES_INDEX.h1,
    description: GUIDES_INDEX.description,
    inLanguage: 'en-ZA',
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORG_ID },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: GUIDES.map((g, i) => ({ '@type': 'ListItem', position: i + 1, url: g.url, name: g.h1 })),
    },
  };
  return (
    <div className={styles.page}>
      <JsonLd data={siteGraph()} />
      <JsonLd data={collection} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Guides', url: GUIDES_URL },
        ])}
      />
      <ContentHeader />
      <main className={styles.main}>
        <Breadcrumb trail={[{ label: 'Home', to: '/' }, { label: 'Guides' }]} />
        <h1>{GUIDES_INDEX.h1}</h1>
        <p className={styles.lead}>{GUIDES_INDEX.intro}</p>
        <ul className={styles.cardList}>
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link className={styles.card} to={g.path}>
                <strong>{g.h1}</strong>
                <span>{GUIDE_BLURBS[g.slug]}</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.ctaBox}>
          <h2>About Valere</h2>
          <p>
            <RichText text="Valere is a South African wedding and event photo-sharing app and wedding planner. Read [about Valere](/about), see the [Wedding Planner](/wedding-planner) or check [photo sharing prices](/#pricing)." />
          </p>
        </div>
      </main>
      <ContentFooter />
    </div>
  );
}

const NOT_FOUND_META = {
  title: 'Guide not found | Valere',
  description: 'That guide does not exist. Browse the Valere wedding guides.',
  url: GUIDES_URL,
  image: OG_IMAGE,
};

function GuideNotFound() {
  usePageMeta(NOT_FOUND_META);
  return (
    <div className={styles.page}>
      <ContentHeader />
      <main className={styles.main}>
        <h1>Guide not found</h1>
        <p>
          <Link to={GUIDES_PATH}>Browse all guides</Link>
        </p>
      </main>
      <ContentFooter />
    </div>
  );
}

function GuideArticle({ guide }) {
  const meta = React.useMemo(
    () => ({
      title: guide.title,
      description: guide.description,
      url: guide.url,
      ogType: 'article',
      image: OG_IMAGE,
    }),
    [guide]
  );
  usePageMeta(meta);

  const article = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    '@id': `${guide.url}#article`,
    headline: guide.h1,
    description: guide.description,
    inLanguage: 'en-ZA',
    datePublished: DATE_PUBLISHED,
    dateModified: DATE_MODIFIED,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    isPartOf: { '@id': WEBSITE_ID },
    mainEntityOfPage: { '@type': 'WebPage', '@id': guide.url },
    image: OG_IMAGE.url,
  };
  const crumbs = breadcrumbLd([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Guides', url: GUIDES_URL },
    { name: guide.h1, url: guide.url },
  ]);

  return (
    <div className={styles.page}>
      <JsonLd data={siteGraph()} />
      <JsonLd data={article} />
      <JsonLd data={FAQ_JSON_LD_FOR(guide.faq)} />
      <JsonLd data={crumbs} />
      <ContentHeader />
      <main className={styles.main}>
        <Breadcrumb trail={[{ label: 'Home', to: '/' }, { label: 'Guides', to: GUIDES_PATH }, { label: guide.h1 }]} />
        <h1>{guide.h1}</h1>
        <p className={styles.meta}>
          By Valere. Updated <time dateTime={DATE_MODIFIED}>{UPDATED_LABEL}</time>
        </p>
        <p className={styles.lead}>{guide.intro}</p>
        <section className={styles.takeaways} aria-labelledby="takeaways-heading">
          <h2 id="takeaways-heading">Key takeaways</h2>
          <ul>
            {guide.takeaways.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
        <Sections sections={guide.sections} />
        <FaqSection faq={guide.faq} />
        <section className={styles.ctaBox} aria-labelledby="more-heading">
          <h2 id="more-heading">Keep reading</h2>
          <ul>
            {guide.related.map((slug) => {
              const g = guideBySlug(slug);
              return (
                <li key={slug}>
                  <Link to={g.path}>{g.h1}</Link>
                </li>
              );
            })}
            <li>
              <Link to={GUIDES_PATH}>All guides</Link>
            </li>
            <li>
              <Link to="/wedding-planner">Valere Wedding Planner</Link>
            </li>
            <li>
              <Link to="/about">About Valere</Link>
            </li>
            <li>
              <a href="/#pricing">Photo sharing pricing</a>
            </li>
          </ul>
        </section>
      </main>
      <ContentFooter />
    </div>
  );
}

export function GuidePage() {
  const { slug } = useParams();
  const guide = guideBySlug(slug);
  if (!guide) return <GuideNotFound />;
  return <GuideArticle guide={guide} />;
}
