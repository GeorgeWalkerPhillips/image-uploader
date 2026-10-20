// Wedding invite logic (create / resend / revoke), PURE and store-injected so
// it runs under Node tests without Deno or Supabase. The wedding-invite Edge
// Function supplies a service-role-backed InviteStore and Resend sender.
//
// Contract: WEDDING_PLANNER_CONTRACT.md (wedding_invites). The token is 32
// random bytes, base64url; ONLY its sha256 hex (of the UTF-8 token string,
// matching accept_wedding_invite) is stored. The raw token exists in memory and
// in the emailed link only: never in a response body, never in a log. The link
// carries it in the URL FRAGMENT (/hq/join#token=...), which browsers never send
// to servers, so it cannot reach server logs or Referer headers.

import { wrapEmail, emailHeading, emailButton, emailFootnote } from "./emailTemplate.ts";
import { escapeHtml, redactEmails } from "./weddingReminders.ts";

export const INVITE_TTL_DAYS = 14;
export const MAX_COLLABORATORS = 10;
export const MAX_COUPLE = 2;
export const MAX_INVITES_PER_DAY = 20; // per wedding AND per inviting user, rolling 24h (revoked rows still count)
const DAY_MS = 86_400_000;

export type InviteKind = "partner" | "collaborator";

export interface InviteRow {
  id: string;
  weddingId: string;
  email: string;
  kind: InviteKind;
  displayName: string | null;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  tokenHash: string;
}

export interface InviteStore {
  /** Couple (wedding_members) membership of the caller; collaborators do NOT count. */
  getCoupleMembership(userId: string): Promise<{ weddingId: string; displayName: string } | null>;
  countCouple(weddingId: string): Promise<number>;
  countCollaborators(weddingId: string): Promise<number>;
  /** Auth emails (lowercased) of every couple member and collaborator. */
  memberEmails(weddingId: string): Promise<string[]>;
  /** Invites that are neither accepted nor revoked (expired ones included). */
  listOpenInvites(weddingId: string): Promise<InviteRow[]>;
  countInvitesCreatedSince(weddingId: string, sinceIso: string): Promise<number>;
  /** Invites created by this user (any wedding, any state incl. revoked) since the instant. */
  countInvitesByUserSince(userId: string, sinceIso: string): Promise<number>;
  getInvite(inviteId: string): Promise<InviteRow | null>;
  /** Throws an error with code "23505" when the open-invite unique index is hit. */
  insertInvite(row: {
    weddingId: string; email: string; kind: InviteKind; displayName: string | null;
    tokenHash: string; invitedBy: string; expiresAt: string;
  }): Promise<{ id: string }>;
  setToken(inviteId: string, tokenHash: string, expiresAt: string): Promise<void>;
  revokeInvite(inviteId: string): Promise<void>;
  sendEmail(m: { to: string; subject: string; html: string }): Promise<unknown>;
  logError(source: string, message: string): Promise<void>;
}

export interface Caller { id: string; email: string | null | undefined; isAnonymous?: boolean }
export interface Reply { status: number; body: Record<string, unknown> }

const reply = (status: number, body: Record<string, unknown>): Reply => ({ status, body });
const fail = (status: number, error: string): Reply => reply(status, { error });

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes as base64url (43 chars; within the RPC's 16..200 bounds). */
export function generateToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** sha256 hex (64 lowercase chars) of the UTF-8 token: same as accept_wedding_invite. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const EMAIL_RE = /^[^\s@<>"',;()\\[\]]+@[^\s@<>"',;()\\[\]]+\.[^\s@<>"',;()\\[\]]{2,}$/;

/** Lowercased, trimmed email or null if not acceptable (<=254 chars, local part <=64). */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length < 3 || email.length > 254 || !EMAIL_RE.test(email)) return null;
  const [local, domain] = email.split("@");
  if (local.length > 64 || email.includes("..") || domain.startsWith(".") || domain.endsWith(".")) return null;
  return email;
}

function cleanDisplayName(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (v.length > 80) return undefined;
  return v === "" ? null : v;
}

const isExpired = (inv: InviteRow, now: Date) => Date.parse(inv.expiresAt) <= now.getTime();

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

export const INVITE_SUBJECT = "You've been invited to a wedding planner on Valere";

export function inviteEmail(opts: {
  inviterName: string; kind: InviteKind; displayName: string | null;
  token: string; expiresAt: string; siteOrigin: string;
}): { subject: string; html: string } {
  const url = `${opts.siteOrigin}/hq/join#token=${encodeURIComponent(opts.token)}`;
  const role = opts.kind === "partner"
    ? "As a partner you will have full access to plan the wedding together."
    : "As a helper you will only see the tasks assigned to you, and you can mark them done. You will not see anything else about the wedding.";
  const expires = new Date(opts.expiresAt).toLocaleDateString("en-ZA", {
    timeZone: "Africa/Johannesburg", day: "numeric", month: "long", year: "numeric",
  });
  const greeting = opts.displayName ? `Hi ${escapeHtml(opts.displayName)},` : "Hi,";
  return {
    subject: INVITE_SUBJECT,
    html: wrapEmail(`
      ${emailHeading("You're invited")}
      <p>${greeting}</p>
      <p><strong>${escapeHtml(opts.inviterName)}</strong> has invited you to help plan a wedding on Valere.</p>
      <p>${escapeHtml(role)}</p>
      <p>Sign in (or create an account) with this email address, then accept the invitation.</p>
      ${emailButton(escapeHtml(url), "Accept invitation")}
      ${emailFootnote(`This invitation link is personal and expires on ${escapeHtml(expires)}. If you were not expecting it, you can ignore this email.`)}
    `),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export interface InviteDeps { siteOrigin: string; now?: () => Date }

/** Checks partner / collaborator slots. `excludeId` leaves one invite out (resend of an expired one). */
async function checkSlots(
  store: InviteStore, weddingId: string, kind: InviteKind, now: Date, excludeId?: string
): Promise<Reply | null> {
  const open = (await store.listOpenInvites(weddingId))
    .filter((i) => i.id !== excludeId && !isExpired(i, now));
  if (kind === "partner") {
    if ((await store.countCouple(weddingId)) >= MAX_COUPLE) {
      return fail(409, "Both partners have already joined this wedding.");
    }
    if (open.some((i) => i.kind === "partner")) {
      return fail(409, "A partner invitation is already pending. Revoke it first to invite someone else.");
    }
  } else {
    const used = (await store.countCollaborators(weddingId)) + open.filter((i) => i.kind === "collaborator").length;
    if (used >= MAX_COLLABORATORS) {
      return fail(409, `A wedding can have at most ${MAX_COLLABORATORS} helpers, including pending invitations.`);
    }
  }
  return null;
}

async function deliver(
  store: InviteStore, deps: InviteDeps, inviterName: string, inv: {
    email: string; kind: InviteKind; displayName: string | null; expiresAt: string;
  }, token: string
): Promise<boolean> {
  try {
    const { subject, html } = inviteEmail({ ...inv, inviterName, token, siteOrigin: deps.siteOrigin });
    await store.sendEmail({ to: inv.email, subject, html });
    return true;
  } catch (err) {
    // Reason only; the provider may echo the address, and never the token.
    await store.logError("wedding-invite:sendEmail", redactEmails(String((err as Error)?.message ?? err)).slice(0, 500));
    return false;
  }
}

export async function handleInvite(
  store: InviteStore, deps: InviteDeps, caller: Caller, body: unknown
): Promise<Reply> {
  const now = (deps.now ?? (() => new Date()))();
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  if (!caller.id || caller.isAnonymous) return fail(403, "Please sign in with a full account.");

  // Authority: couple membership by caller id, read with the service role.
  const couple = await store.getCoupleMembership(caller.id);
  if (!couple) return fail(403, "Only the couple can manage invitations.");

  switch (b.action) {
    case "create": return create(store, deps, caller, couple, b, now);
    case "resend": return resend(store, deps, couple, b, now);
    case "revoke": return revoke(store, couple, b);
    default: return fail(400, "Unknown action.");
  }
}

type Couple = { weddingId: string; displayName: string };

async function create(
  store: InviteStore, deps: InviteDeps, caller: Caller, couple: Couple, b: Record<string, unknown>, now: Date
): Promise<Reply> {
  const email = normalizeEmail(b.email);
  if (!email) return fail(400, "Please enter a valid email address.");
  if (b.kind !== "partner" && b.kind !== "collaborator") return fail(400, "Invite kind must be partner or collaborator.");
  const kind = b.kind as InviteKind;
  const displayName = cleanDisplayName(b.displayName);
  if (displayName === undefined) return fail(400, "Name must be 80 characters or fewer.");

  const callerEmail = typeof caller.email === "string" ? caller.email.trim().toLowerCase() : "";
  if (callerEmail && email === callerEmail) return fail(400, "You can't invite yourself.");

  const members = (await store.memberEmails(couple.weddingId)).map((e) => e.trim().toLowerCase());
  if (members.includes(email)) return fail(409, "That person is already part of this wedding.");

  const sinceIso = new Date(now.getTime() - DAY_MS).toISOString();
  if ((await store.countInvitesCreatedSince(couple.weddingId, sinceIso)) >= MAX_INVITES_PER_DAY
      || (await store.countInvitesByUserSince(caller.id, sinceIso)) >= MAX_INVITES_PER_DAY) {
    return fail(429, "You've sent a lot of invitations today. Please try again tomorrow.");
  }

  // Same-email handling: a live open invite blocks; a stale (expired) one is revoked first.
  const open = await store.listOpenInvites(couple.weddingId);
  for (const inv of open.filter((i) => i.email.toLowerCase() === email)) {
    if (!isExpired(inv, now)) {
      return fail(409, "This person already has a pending invitation. Use resend instead.");
    }
    await store.revokeInvite(inv.id);
  }

  const slotProblem = await checkSlots(store, couple.weddingId, kind, now);
  if (slotProblem) return slotProblem;

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS).toISOString();
  let inserted: { id: string };
  try {
    inserted = await store.insertInvite({
      weddingId: couple.weddingId, email, kind, displayName,
      tokenHash: await hashToken(token), invitedBy: caller.id, expiresAt,
    });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return fail(409, "This person already has a pending invitation. Use resend instead.");
    }
    await store.logError("wedding-invite:insert", redactEmails(String((err as Error)?.message ?? err)).slice(0, 500));
    return fail(500, "Could not create the invitation. Please try again.");
  }

  const sent = await deliver(store, deps, couple.displayName, { email, kind, displayName, expiresAt }, token);
  if (!sent) {
    // No orphan unusable invite: revoke so the slot is free again.
    try { await store.revokeInvite(inserted.id); } catch { /* best effort */ }
    return fail(502, "We could not send the invitation email. Please try again.");
  }
  return reply(200, { ok: true, inviteId: inserted.id });
}

/** The invite, only if it belongs to the caller's wedding (else null: deliberately indistinguishable from missing). */
async function ownInvite(store: InviteStore, couple: Couple, b: Record<string, unknown>): Promise<InviteRow | null> {
  const id = typeof b.inviteId === "string" ? b.inviteId : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const inv = await store.getInvite(id);
  return inv && inv.weddingId === couple.weddingId ? inv : null;
}

async function resend(
  store: InviteStore, deps: InviteDeps, couple: Couple, b: Record<string, unknown>, now: Date
): Promise<Reply> {
  const inv = await ownInvite(store, couple, b);
  if (!inv) return fail(404, "Invite not found.");
  if (inv.acceptedAt) return fail(409, "This invitation has already been accepted.");
  if (inv.revokedAt) return fail(404, "Invite not found.");

  if (isExpired(inv, now)) {
    // Reviving an expired invite re-occupies a slot: re-check it.
    const slotProblem = await checkSlots(store, couple.weddingId, inv.kind, now, inv.id);
    if (slotProblem) return slotProblem;
  }

  const previous = { tokenHash: inv.tokenHash, expiresAt: inv.expiresAt };
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * DAY_MS).toISOString();
  await store.setToken(inv.id, await hashToken(token), expiresAt);

  const sent = await deliver(store, deps, couple.displayName,
    { email: inv.email, kind: inv.kind, displayName: inv.displayName, expiresAt }, token);
  if (!sent) {
    // The new link never reached them: restore the previous token and expiry.
    try { await store.setToken(inv.id, previous.tokenHash, previous.expiresAt); } catch { /* best effort */ }
    return fail(502, "We could not send the invitation email. Please try again.");
  }
  return reply(200, { ok: true, inviteId: inv.id });
}

async function revoke(store: InviteStore, couple: Couple, b: Record<string, unknown>): Promise<Reply> {
  const inv = await ownInvite(store, couple, b);
  if (!inv) return fail(404, "Invite not found.");
  if (inv.acceptedAt) return fail(409, "This invitation has already been accepted.");
  if (!inv.revokedAt) await store.revokeInvite(inv.id);
  return reply(200, { ok: true, inviteId: inv.id });
}
