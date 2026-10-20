// Wedding invitations: create / resend / revoke. POST JSON, verify_jwt = true.
//
//   { action: "create", email, kind: "partner" | "collaborator", displayName? }
//   { action: "resend", inviteId }       (rotates the token + expiry, re-sends)
//   { action: "revoke", inviteId }
//
// Response: 200 { ok: true, inviteId }  (never contains the token or its hash)
//           400 invalid input | 401 not signed in | 403 not a couple member
//           404 invite not found | 409 limit / duplicate | 429 daily brake
//           502 email could not be sent (a just-created invite is revoked)
//
// The caller is authenticated with their JWT; authority is then checked in the
// database with the service role: the caller must be a COUPLE member
// (wedding_members), not a collaborator. The raw token appears only in the
// emailed link /hq/join#token=... (URL fragment: never sent to servers); only its sha256 hex is stored
// (wedding_invites.token_hash). Accepting is the client calling the
// accept_wedding_invite RPC directly. Logic: _shared/weddingInvite.ts.
//
// Deploy: supabase functions deploy wedding-invite --project-ref <ref>
// Secrets required: ALLOWED_ORIGIN (CORS + email link; first https value,
// fallback https://valere.co.za), RESEND_API_KEY, RESEND_FROM_EMAIL.
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeadersFor } from "../_shared/cors.ts";
import { sendEmail } from "../_shared/resend.ts";
import { siteOriginFrom } from "../_shared/weddingPlanner.ts";
import { handleInvite, type InviteRow, type InviteStore } from "../_shared/weddingInvite.ts";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const COLUMNS = "id, wedding_id, email, kind, display_name, expires_at, accepted_at, revoked_at, token_hash";

// deno-lint-ignore no-explicit-any
const toRow = (r: any): InviteRow => ({
  id: r.id, weddingId: r.wedding_id, email: r.email, kind: r.kind, displayName: r.display_name,
  expiresAt: r.expires_at, acceptedAt: r.accepted_at, revokedAt: r.revoked_at, tokenHash: r.token_hash,
});

function check(error: { message: string } | null) {
  if (error) throw error;
}

const store: InviteStore = {
  async getCoupleMembership(userId) {
    const { data, error } = await supabaseAdmin
      .from("wedding_members").select("wedding_id, display_name").eq("user_id", userId).maybeSingle();
    check(error);
    return data ? { weddingId: data.wedding_id, displayName: data.display_name } : null;
  },

  async countCouple(weddingId) {
    const { count, error } = await supabaseAdmin
      .from("wedding_members").select("user_id", { count: "exact", head: true }).eq("wedding_id", weddingId);
    check(error);
    return count ?? 0;
  },

  async countCollaborators(weddingId) {
    const { count, error } = await supabaseAdmin
      .from("wedding_collaborators").select("user_id", { count: "exact", head: true }).eq("wedding_id", weddingId);
    check(error);
    return count ?? 0;
  },

  async memberEmails(weddingId) {
    const [m, c] = await Promise.all([
      supabaseAdmin.from("wedding_members").select("user_id").eq("wedding_id", weddingId),
      supabaseAdmin.from("wedding_collaborators").select("user_id").eq("wedding_id", weddingId),
    ]);
    check(m.error);
    check(c.error);
    const ids = [...(m.data ?? []), ...(c.data ?? [])].map((r: { user_id: string }) => r.user_id);
    const emails: string[] = [];
    for (const id of ids) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(id);
      if (data?.user?.email) emails.push(data.user.email.toLowerCase());
    }
    return emails;
  },

  async listOpenInvites(weddingId) {
    const { data, error } = await supabaseAdmin
      .from("wedding_invites").select(COLUMNS)
      .eq("wedding_id", weddingId).is("accepted_at", null).is("revoked_at", null);
    check(error);
    return (data ?? []).map(toRow);
  },

  async countInvitesCreatedSince(weddingId, sinceIso) {
    const { count, error } = await supabaseAdmin
      .from("wedding_invites").select("id", { count: "exact", head: true })
      .eq("wedding_id", weddingId).gte("created_at", sinceIso);
    check(error);
    return count ?? 0;
  },

  async countInvitesByUserSince(userId, sinceIso) {
    const { count, error } = await supabaseAdmin
      .from("wedding_invites").select("id", { count: "exact", head: true })
      .eq("invited_by", userId).gte("created_at", sinceIso);
    check(error);
    return count ?? 0;
  },

  async getInvite(inviteId) {
    const { data, error } = await supabaseAdmin
      .from("wedding_invites").select(COLUMNS).eq("id", inviteId).maybeSingle();
    check(error);
    return data ? toRow(data) : null;
  },

  async insertInvite(row) {
    const { data, error } = await supabaseAdmin.from("wedding_invites").insert({
      wedding_id: row.weddingId, email: row.email, kind: row.kind, display_name: row.displayName,
      token_hash: row.tokenHash, invited_by: row.invitedBy, expires_at: row.expiresAt,
    }).select("id").single();
    check(error);
    return { id: data.id };
  },

  async setToken(inviteId, tokenHash, expiresAt) {
    const { error } = await supabaseAdmin
      .from("wedding_invites").update({ token_hash: tokenHash, expires_at: expiresAt }).eq("id", inviteId);
    check(error);
  },

  async revokeInvite(inviteId) {
    const { error } = await supabaseAdmin
      .from("wedding_invites").update({ revoked_at: new Date().toISOString() })
      .eq("id", inviteId).is("accepted_at", null).is("revoked_at", null);
    check(error);
  },

  sendEmail,

  async logError(source, message) {
    console.error(`${source}: ${message}`);
    await supabaseAdmin.from("error_logs").insert({ severity: "error", source, message }).then(() => {}, () => {});
  },
};

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: "Not authenticated" }, 401);

    const body = await req.json().catch(() => ({}));
    const result = await handleInvite(
      store,
      { siteOrigin: siteOriginFrom(Deno.env.get("ALLOWED_ORIGIN")) },
      { id: user.id, email: user.email, isAnonymous: user.is_anonymous },
      body
    );
    return json(result.body, result.status);
  } catch (error) {
    // Message only: no body, no token.
    console.error("wedding-invite failed:", ((error as Error)?.message ?? "").replace(/[^\s<>"'@,;()]+@[^\s<>"'@,;()]+/g, "[redacted-email]"));
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
