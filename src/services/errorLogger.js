import { supabase } from '../supabaseClient';

// Writes to error_logs so failures (RLS rejections, failed uploads, join
// errors, uncaught crashes) can be inspected from the Supabase dashboard
// without needing DevTools on whatever device reproduced it — especially
// useful for phone-only repros.
//
// Fire-and-forget by design: logging a problem must never itself throw or
// block whatever flow triggered it.
export const logError = (source, error, context = {}) => {
  const message = error?.message || String(error);
  console.error(`[${source}]`, message, context);

  const errorDetails =
    error && typeof error === 'object'
      ? {
          code: error.code,
          details: error.details,
          hint: error.hint,
          status: error.status,
        }
      : undefined;

  supabase
    .auth.getSession()
    .then(({ data: { session } }) =>
      supabase.from('error_logs').insert({
        user_id: session?.user?.id || null,
        event_id: context.eventId || null,
        severity: context.severity || 'error',
        source,
        message: String(message).slice(0, 2000),
        context: { ...context, error: errorDetails },
        url: typeof window !== 'undefined' ? window.location.href : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      })
    )
    .catch((loggingError) => {
      console.error('Failed to write error log:', loggingError);
    });
};
