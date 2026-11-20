import React, { useEffect, useRef } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { FaWhatsapp, FaLink, FaPrint } from 'react-icons/fa';
import { guestLink, whatsappShareUrl } from '../utils/eventShare';
import styles from './EventReadyPanel.module.css';

// Shown right after an event is created (free) or paid for, so the organiser's
// very next step is getting the QR code in front of guests.
export function EventReadyPanel({ event, origin, onCopy, onDownloadSheet, onClose }) {
  const link = guestLink(origin, event.id);
  const ref = useRef(null);

  // The form is below; bring the next step into view on a phone.
  useEffect(() => {
    if (ref.current && typeof ref.current.scrollIntoView === 'function') {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <section ref={ref} className={styles.panel} aria-labelledby="event-ready-heading">
      <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
        &times;
      </button>
      <p className={styles.eyebrow}>All set</p>
      <h2 id="event-ready-heading" className={styles.heading}>
        {event.name} is ready for photos
      </h2>
      <p className={styles.lead}>Share this with your guests. They scan it and upload straight from their phone. No app, no sign-up.</p>

      <div className={styles.body}>
        <div className={styles.qr}>
          <QRCodeCanvas id={`ready-qr-${event.id}`} value={link} size={200} />
        </div>
        <div className={styles.side}>
          <a
            className={`${styles.btn} ${styles.btnPrimary}`}
            href={whatsappShareUrl(event.name, link)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <FaWhatsapp aria-hidden="true" /> Share on WhatsApp
          </a>
          <button type="button" className={styles.btn} onClick={() => onCopy(event.id)}>
            <FaLink aria-hidden="true" /> Copy link
          </button>
          <button type="button" className={styles.btn} onClick={() => onDownloadSheet(event)}>
            <FaPrint aria-hidden="true" /> Printable QR sheet
          </button>
          <ol className={styles.steps}>
            <li>Send the link to your group chat, or print the sheet for the tables.</li>
            <li>Guests scan, take photos and they land in one shared gallery.</li>
            <li>Open the gallery any time to see and download everything.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
