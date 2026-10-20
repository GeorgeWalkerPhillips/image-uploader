import React from 'react';
import { RichText } from '../components/ContentChrome';
import { BUDGET_EXAMPLE_TOTAL, BUDGET_ROWS, zar } from './content';
import styles from '../components/ContentChrome.module.css';

// Renders one content block from guides/content.js.
export function Block({ block }) {
  switch (block.type) {
    case 'p':
      return (
        <p>
          <RichText text={block.text} />
        </p>
      );
    case 'h3':
      return <h3>{block.text}</h3>;
    case 'ul':
      return (
        <ul>
          {block.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol>
          {block.items.map((item) => (
            <li key={item}>
              <RichText text={item} />
            </li>
          ))}
        </ol>
      );
    case 'table':
      return (
        <>
          <p className={styles.tableHint}>Swipe sideways to see every column.</p>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={block.caption}>
            <table className={styles.table}>
              <caption>{block.caption}</caption>
              <thead>
                <tr>
                  {block.head.map((h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, i) =>
                      i === 0 ? (
                        <th scope="row" key={cell}>
                          {cell}
                        </th>
                      ) : (
                        <td key={`${row[0]}-${i}`}>{cell}</td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    case 'budgetTable':
      return (
        <>
          <p className={styles.tableHint}>Swipe sideways to see every column.</p>
          <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Example wedding budget split">
            <table className={styles.table}>
              <caption>{`Example split of a ${zar(BUDGET_EXAMPLE_TOTAL)} wedding budget (planning guide, not statistics)`}</caption>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Typical range</th>
                  <th scope="col">Example share</th>
                  <th scope="col">Example amount</th>
                </tr>
              </thead>
              <tbody>
                {BUDGET_ROWS.map((r) => (
                  <tr key={r.category}>
                    <th scope="row">{r.category}</th>
                    <td>{r.range}</td>
                    <td>{r.share}%</td>
                    <td>{zar((BUDGET_EXAMPLE_TOTAL * r.share) / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      );
    case 'product':
      return (
        <aside className={styles.product} aria-label="About our product">
          <span className={styles.productLabel}>Our product</span>
          <h3>{block.title}</h3>
          {block.paragraphs.map((t) => (
            <p key={t}>
              <RichText text={t} />
            </p>
          ))}
        </aside>
      );
    default:
      return null;
  }
}

export function Sections({ sections }) {
  return sections.map((s) => (
    <section key={s.h2} aria-labelledby={`h-${s.h2.replace(/\W+/g, '-').toLowerCase()}`}>
      <h2 id={`h-${s.h2.replace(/\W+/g, '-').toLowerCase()}`}>{s.h2}</h2>
      {s.blocks.map((b, i) => (
        <Block block={b} key={`${s.h2}-${i}`} />
      ))}
    </section>
  ));
}

export function FaqSection({ faq, heading = 'Frequently asked questions' }) {
  return (
    <section id="faq" className={styles.faq} aria-labelledby="faq-heading">
      <h2 id="faq-heading">{heading}</h2>
      {faq.map((item) => (
        <div key={item.q}>
          <h3>{item.q}</h3>
          <p>{item.a}</p>
        </div>
      ))}
    </section>
  );
}
