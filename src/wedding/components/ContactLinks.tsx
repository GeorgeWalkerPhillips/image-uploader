import { mailtoHref, safeWebsiteHref, telHref, whatsappHref } from '../lib/contact';
import x from '../extras.module.css';

interface Props {
  // Used in the accessible names, e.g. "Call Ada".
  label: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
}

// Tap-to-call / WhatsApp / email / website buttons. Each is rendered only when
// the stored value validates, and the href is built from the normalised value,
// never from the raw text. The raw text is always shown separately as plain text.
export function ContactLinks({ label, phone, whatsapp, email, website }: Props) {
  const tel = telHref(phone);
  const wa = whatsappHref(whatsapp || phone);
  const mail = mailtoHref(email);
  const web = safeWebsiteHref(website);
  if (!tel && !wa && !mail && !web) return null;
  return (
    <div className={x.contactLinks}>
      {tel && <a className={x.contactLink} href={tel} aria-label={`Call ${label}`}>Call</a>}
      {wa && (
        <a className={x.contactLink} href={wa} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${label}`}>WhatsApp</a>
      )}
      {mail && <a className={x.contactLink} href={mail} aria-label={`Email ${label}`}>Email</a>}
      {web && (
        <a className={x.contactLink} href={web} target="_blank" rel="noopener noreferrer" aria-label={`Open website for ${label}`}>Website</a>
      )}
    </div>
  );
}
