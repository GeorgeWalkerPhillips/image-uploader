import { useEffect } from 'react';

// Per-route head management for the indexable marketing pages (About, Guides,
// Wedding Planner). Existing tags from index.html are updated in place and
// restored on the way out; missing ones are created and removed again. The
// static JSON-LD graph in index.html describes the home page, so it is parked
// while another page is open (each page then emits its own blocks).
//
// meta: { title, description, url, keywords?, ogType?, image: {url,width,height,alt} }
export function buildMetaTags(meta) {
  const { description, url, keywords, ogType = 'website', image, title } = meta;
  const tags = [
    { sel: 'meta[name="description"]', tag: 'meta', key: { name: 'description' }, attr: 'content', value: description },
    ...(keywords ? [{ sel: 'meta[name="keywords"]', tag: 'meta', key: { name: 'keywords' }, attr: 'content', value: keywords }] : []),
    { sel: 'meta[name="robots"]', tag: 'meta', key: { name: 'robots' }, attr: 'content', value: 'index,follow,max-image-preview:large' },
    { sel: 'link[rel="canonical"]', tag: 'link', key: { rel: 'canonical' }, attr: 'href', value: url },
    { sel: 'meta[property="og:title"]', tag: 'meta', key: { property: 'og:title' }, attr: 'content', value: title },
    { sel: 'meta[property="og:description"]', tag: 'meta', key: { property: 'og:description' }, attr: 'content', value: description },
    { sel: 'meta[property="og:type"]', tag: 'meta', key: { property: 'og:type' }, attr: 'content', value: ogType },
    { sel: 'meta[property="og:url"]', tag: 'meta', key: { property: 'og:url' }, attr: 'content', value: url },
    { sel: 'meta[property="og:locale"]', tag: 'meta', key: { property: 'og:locale' }, attr: 'content', value: 'en_ZA' },
    { sel: 'meta[property="og:image"]', tag: 'meta', key: { property: 'og:image' }, attr: 'content', value: image.url },
    { sel: 'meta[property="og:image:width"]', tag: 'meta', key: { property: 'og:image:width' }, attr: 'content', value: String(image.width) },
    { sel: 'meta[property="og:image:height"]', tag: 'meta', key: { property: 'og:image:height' }, attr: 'content', value: String(image.height) },
    { sel: 'meta[property="og:image:alt"]', tag: 'meta', key: { property: 'og:image:alt' }, attr: 'content', value: image.alt },
    { sel: 'meta[name="twitter:card"]', tag: 'meta', key: { name: 'twitter:card' }, attr: 'content', value: 'summary_large_image' },
    { sel: 'meta[name="twitter:title"]', tag: 'meta', key: { name: 'twitter:title' }, attr: 'content', value: title },
    { sel: 'meta[name="twitter:description"]', tag: 'meta', key: { name: 'twitter:description' }, attr: 'content', value: description },
    { sel: 'meta[name="twitter:image"]', tag: 'meta', key: { name: 'twitter:image' }, attr: 'content', value: image.url },
    { sel: 'meta[name="twitter:image:alt"]', tag: 'meta', key: { name: 'twitter:image:alt' }, attr: 'content', value: image.alt },
  ];
  return tags;
}

export function usePageMeta(meta) {
  useEffect(() => {
    const prevTitle = document.title;
    const restores = buildMetaTags(meta).map(({ sel, tag, key, attr, value }) => {
      let el = document.head.querySelector(sel);
      const created = !el;
      if (!el) {
        el = document.createElement(tag);
        Object.entries(key).forEach(([k, v]) => el.setAttribute(k, v));
        document.head.appendChild(el);
      }
      const prev = el.getAttribute(attr);
      el.setAttribute(attr, value);
      return () => {
        if (created) el.remove();
        else el.setAttribute(attr, prev ?? '');
      };
    });
    const parked = Array.from(document.head.querySelectorAll('script[type="application/ld+json"]')).map((el) => {
      const parent = el.parentNode;
      const next = el.nextSibling;
      el.remove();
      return () => parent.insertBefore(el, next && next.parentNode === parent ? next : null);
    });
    // The home page's keywords tag does not describe other pages: drop it
    // while this page is open unless the page supplies its own.
    const kw = meta.keywords ? null : document.head.querySelector('meta[name="keywords"]');
    const kwParent = kw && kw.parentNode;
    const kwNext = kw && kw.nextSibling;
    if (kw) kw.remove();
    document.title = meta.title;
    return () => {
      document.title = prevTitle;
      restores.forEach((r) => r());
      parked.forEach((r) => r());
      if (kw) kwParent.insertBefore(kw, kwNext && kwNext.parentNode === kwParent ? kwNext : null);
    };
    // `meta` must be a stable object (a module constant per page).
  }, [meta]);
}
