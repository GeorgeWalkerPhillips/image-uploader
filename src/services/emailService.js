import { supabase } from '../supabaseClient';
import { logError } from './errorLogger';

// Fire-and-forget, matching the audit-logging pattern in AuthContext.js — a
// confirmation email failing to send must never block or roll back event
// creation, which already succeeded by the time this is called.
export const sendEventCreatedEmail = (eventId) => {
  supabase.functions
    .invoke('send-event-created-email', { body: { eventId } })
    .then(({ error }) => {
      if (error) logError('sendEventCreatedEmail', error, { eventId, severity: 'warning' });
    })
    .catch((error) => logError('sendEventCreatedEmail', error, { eventId, severity: 'warning' }));
};
