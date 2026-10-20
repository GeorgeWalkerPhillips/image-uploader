import React from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BLOG_INDEX,
  BLOG_PATH,
  BLOG_URL,
  formatDate,
  postBySlug,
  sortedPosts,
} from './content';
import { FAQ_JSON_LD_FOR, GUIDES_PATH, OG_IMAGE, guideBySlug } from '../guides/content';
import { Sections, FaqSection } from '../guides/GuideBody';
import { breadcrumbLd } from '../guides/Guides';
import { Breadcrumb, ContentFooter, ContentHeader, RichText } from '../components/ContentChrome';
import { JsonLd } from '../seo/JsonLd';
import { usePageMeta } from '../seo/usePageMeta';
import { ORG_ID, SITE_URL, WEBSITE_ID, siteGraph } from '../siteProfile';
import styles from '../components/ContentChrome.module.css';

const INDEX_META = {
  title: BLOG_INDEX.title,
  description: BLOG_INDEX.description,
  url: BLOG_URL,
  image: OG_IMAGE,
};

export function BlogIndex() {
  usePageMeta(INDEX_META);
  const posts = sortedPosts();
  const collection = {
    '@context': 'https://schema.org',
    '@type': ['CollectionPage', 'Blog'],
    '@id': `${BLOG_URL}#page`,
    url: BLOG_URL,
    name: BLOG_INDEX.h1,
    description: BLOG_INDEX.description,
    inLanguage: 'en-ZA',
    isPartOf: { '@id': WEBSITE_ID },
    publisher: { '@id': ORG_ID },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: posts.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: p.url, name: p.h1 })),
    },
  };
  return (
    <div className={styles.page}>
      <JsonLd data={siteGraph()} />
      <JsonLd data={collection} />
      <JsonLd
        data={breadcrumbLd([
          { name: 'Home', url: `${SITE_URL}/` },
          { name: 'Blog', url: BLOG_URL },
        ])}
      />
      <ContentHeader />
      <main className={styles.main}>
        <Breadcrumb trail={[{ label: 'Home', to: '/' }, { label: 'Blog' }]} />
        <h1>{BLOG_INDEX.h1}</h1>
        <p className={styles.lead}>{BLOG_INDEX.intro}</p>
        <ul className={styles.cardList}>
          {posts.map((p) => (
            <li key={p.slug}>
              <Link className={styles.card} to={p.path}>
                <strong>{p.h1}</strong>
                <span>{p.summary}</span>
                <span className={styles.cardMeta}>
                  {formatDate(p.datePublished)} · {p.readMinutes} min read
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className={styles.ctaBox}>
          <h2>About Valere</h2>
          <p>
            <RichText text="Valere is a South African wedding and event photo-sharing app and wedding planner. Read [about Valere](/about), browse the [wedding guides](/guides) or check [photo sharing prices](/#pricing)." />
          </p>
        </div>
      </main>
      <ContentFooter />
    </div>
  );
}

const NOT_FOUND_META = {
  title: 'Post not found | Valere',
  description: 'That blog post does not exist. Browse the Valere blog.',
  url: BLOG_URL,
  image: OG_IMAGE,
};

function PostNotFound() {
  usePageMeta(NOT_FOUND_META);
  return (
    <div className={styles.page}>
      <ContentHeader />
      <main className={styles.main}>
        <h1>Post not found</h1>
        <p>
          <Link to={BLOG_PATH}>Browse the blog</Link>
        </p>
      </main>
      <ContentFooter />
    </div>
  );
}

function PostArticle({ post }) {
  const meta = React.useMemo(
    () => ({
      title: post.metaTitle,
      description: post.metaDescription,
      url: post.url,
      ogType: 'article',
      image: OG_IMAGE,
    }),
    [post]
  );
  usePageMeta(meta);

  const posting = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${post.url}#post`,
    headline: post.h1,
    description: post.metaDescription,
    inLanguage: 'en-ZA',
    datePublished: post.datePublished,
    dateModified: post.dateModified,
    author: { '@id': ORG_ID },
    publisher: { '@id': ORG_ID },
    isPartOf: { '@id': `${BLOG_URL}#page` },
    mainEntityOfPage: { '@type': 'WebPage', '@id': post.url },
    image: OG_IMAGE.url,
  };
  const crumbs = breadcrumbLd([
    { name: 'Home', url: `${SITE_URL}/` },
    { name: 'Blog', url: BLOG_URL },
    { name: post.h1, url: post.url },
  ]);

  return (
    <div className={styles.page}>
      <JsonLd data={siteGraph()} />
      <JsonLd data={posting} />
      <JsonLd data={FAQ_JSON_LD_FOR(post.faq)} />
      <JsonLd data={crumbs} />
      <ContentHeader />
      <main className={styles.main}>
        <Breadcrumb trail={[{ label: 'Home', to: '/' }, { label: 'Blog', to: BLOG_PATH }, { label: post.h1 }]} />
        <h1>{post.h1}</h1>
        <p className={styles.meta}>
          By Valere. <time dateTime={post.datePublished}>{formatDate(post.datePublished)}</time> · {post.readMinutes} min read
        </p>
        <p className={styles.lead}>{post.intro}</p>
        <section className={styles.takeaways} aria-labelledby="takeaways-heading">
          <h2 id="takeaways-heading">Key takeaways</h2>
          <ul>
            {post.takeaways.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
        <Sections sections={post.sections} />
        <FaqSection faq={post.faq} />
        <section className={styles.ctaBox} aria-labelledby="more-heading">
          <h2 id="more-heading">Keep reading</h2>
          <ul>
            {post.relatedPosts.map((slug) => {
              const p = postBySlug(slug);
              return (
                <li key={slug}>
                  <Link to={p.path}>{p.h1}</Link>
                </li>
              );
            })}
            {post.relatedGuides.map((slug) => {
              const g = guideBySlug(slug);
              return (
                <li key={slug}>
                  <Link to={g.path}>{g.h1}</Link>
                </li>
              );
            })}
            <li>
              <Link to={BLOG_PATH}>All posts</Link>
            </li>
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

export function BlogPostPage() {
  const { slug } = useParams();
  const post = postBySlug(slug);
  if (!post) return <PostNotFound />;
  return <PostArticle post={post} />;
}
