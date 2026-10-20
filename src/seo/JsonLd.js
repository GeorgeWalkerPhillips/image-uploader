import React from 'react';

// One JSON-LD block. Rendered in the body; the prerender step saves it into the
// static HTML. "<" is escaped so content can never close the script tag.
export function JsonLd({ data }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}
