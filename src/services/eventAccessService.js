import { supabase } from '../supabaseClient';

// Grants a user (guest or organizer) upload/view access to an event.
// Relies on the "event_access" RLS policy that lets a user self-grant
// access to any event they hold a valid link/QR code for.
export const grantEventAccess = async (eventId, userId, accessType = 'upload') => {
  const { error } = await supabase.from('event_access').upsert(
    {
      event_id: eventId,
      user_id: userId,
      access_type: accessType,
    },
    { onConflict: 'event_id,user_id,access_type', ignoreDuplicates: true }
  );

  if (error) throw error;
};

// Ensures the current visitor has a session (creating an anonymous one if
// needed, mirroring the "scan and shoot, no signup" flow guests expect) and
// is granted access to the given event.
export const joinEventAsGuest = async (eventId, signInAsGuest) => {
  const user = await signInAsGuest();
  await grantEventAccess(eventId, user.id, 'upload');
  return user;
};
