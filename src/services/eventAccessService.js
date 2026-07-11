import { supabase } from '../supabaseClient';
import { logError } from './errorLogger';

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

  if (error) {
    logError('grantEventAccess', error, { eventId, userId, accessType });
    throw error;
  }
};

// Records the name a guest entered so the gallery can attribute their
// photos to it. Requires the "Users can update their own event access" RLS
// policy — event_access rows aren't recreated, just updated in place.
export const setGuestDisplayName = async (eventId, userId, displayName) => {
  const { error } = await supabase
    .from('event_access')
    .update({ display_name: displayName })
    .eq('event_id', eventId)
    .eq('user_id', userId)
    .eq('access_type', 'upload');

  if (error) {
    logError('setGuestDisplayName', error, { eventId, userId });
    throw error;
  }
};

// Ensures the current visitor has a session (creating an anonymous one if
// needed, mirroring the "scan and shoot, no signup" flow guests expect) and
// is granted access to the given event — unless the event's plan has a
// guest cap and it's already full, in which case new guests are turned
// away (returning guests who already have access are always let back in).
//
// Returns { user, displayName } — displayName is null the first time a
// guest joins (the caller should prompt for one), and whatever was
// previously saved on every return visit.
export const joinEventAsGuest = async (eventId, signInAsGuest) => {
  let user;

  try {
    user = await signInAsGuest();

    const { data: existingAccess, error: accessError } = await supabase
      .from('event_access')
      .select('id, display_name')
      .eq('event_id', eventId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (accessError) throw accessError;

    if (!existingAccess) {
      const { data: event, error: eventError } = await supabase
        .from('events')
        .select('guest_cap')
        .eq('id', eventId)
        .single();

      if (eventError) throw eventError;

      if (event?.guest_cap != null) {
        const { data: guestCount, error: countError } = await supabase.rpc(
          'get_event_guest_count',
          { p_event_id: eventId }
        );

        if (countError) throw countError;

        if (guestCount >= event.guest_cap) {
          throw new Error(
            "This event's guest limit has been reached. Ask the host to upgrade their plan."
          );
        }
      }
    }

    await grantEventAccess(eventId, user.id, 'upload');
    return { user, displayName: existingAccess?.display_name || null };
  } catch (error) {
    logError('joinEventAsGuest', error, { eventId, userId: user?.id });
    throw error;
  }
};
