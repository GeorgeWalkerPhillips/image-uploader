// ENTIRELY FICTIONAL sample data for the Wedding Planner marketing screenshots.
//
// Used only by scripts/generate-planner-screenshots.js (never by the app, the
// build or the tests). Every name, vendor, amount and date here is invented:
// the couple is "Ada & Ben", the venue is "Riverside Hall", and the only
// e-mail addresses use the reserved example.com domain. Do NOT paste real
// couple, guest or supplier data into this file: the repository is public.

// "Today" for the screenshots, so the countdown, the calendar month and the
// "next up" list look the same every time the script is re-run.
const TODAY = '2026-10-05';
const NOW_ISO = `${TODAY}T09:30:00+02:00`;

const DAY = 86400000;
const dateOnly = (offsetDays) => new Date(Date.parse(`${TODAY}T12:00:00Z`) + offsetDays * DAY).toISOString().slice(0, 10);

const WID = 'w-demo';
const W = (o) => ({ wedding_id: WID, ...o });

const wedding = {
  id: WID,
  name: 'Ada & Ben',
  wedding_date: `${dateOnly(131)}T10:00:00+00:00`, // 13 Feb 2027
  venue: 'Riverside Hall',
  guest_count: 80,
  budget_cents: 45000000, // R 450 000
  honeymoon_budget_cents: 6500000,
  honeymoon_start: dateOnly(145),
  honeymoon_days: 10,
  fx_thb_per_zar: 1.85,
  currency: 'ZAR',
  timezone: 'Africa/Johannesburg',
  updated_at: `${dateOnly(-3)}T08:00:00Z`,
};

const people = [
  { user_id: 'u-1', display_name: 'Ada', kind: 'partner', role: 'groom' },
  { user_id: 'u-2', display_name: 'Ben', kind: 'partner', role: 'bride' },
  { user_id: 'u-3', display_name: 'Sam', kind: 'collaborator', role: null },
  { user_id: 'u-4', display_name: 'Priya', kind: 'collaborator', role: null },
  { user_id: 'u-5', display_name: 'Noor', kind: 'collaborator', role: null },
];

const FAR = '2099-01-01T00:00:00Z';
const invites = [
  { id: 'i1', wedding_id: WID, email: 'lee@example.com', kind: 'collaborator', display_name: 'Lee', expires_at: FAR, accepted_at: null, revoked_at: null, created_at: `${dateOnly(-1)}T10:00:00Z` },
  { id: 'i2', wedding_id: WID, email: 'sam@example.com', kind: 'collaborator', display_name: 'Sam', expires_at: FAR, accepted_at: `${dateOnly(-9)}T10:00:00Z`, revoked_at: null, created_at: `${dateOnly(-10)}T10:00:00Z` },
];

const categories = [
  W({ id: 'c1', scope: 'wedding', name: 'Venue', color: '#7a8fb8', sort_order: 1 }),
  W({ id: 'c2', scope: 'wedding', name: 'Catering', color: '#c98f6e', sort_order: 2 }),
  W({ id: 'c3', scope: 'wedding', name: 'Photography', color: '#8f7ab8', sort_order: 3 }),
  W({ id: 'c4', scope: 'wedding', name: 'Flowers and decor', color: '#e58fb0', sort_order: 4 }),
  W({ id: 'c5', scope: 'wedding', name: 'Attire', color: '#6fa58c', sort_order: 5 }),
  W({ id: 'c6', scope: 'wedding', name: 'Music', color: '#d6b25e', sort_order: 6 }),
  W({ id: 'h1', scope: 'honeymoon', name: 'Flights', color: '#7a8fb8', sort_order: 1 }),
  W({ id: 'h2', scope: 'honeymoon', name: 'Accommodation', color: '#6fa58c', sort_order: 2 }),
  W({ id: 'h3', scope: 'honeymoon', name: 'Food and activities', color: '#e58fb0', sort_order: 3 }),
];

const vendors = [
  W({ id: 'v1', name: 'Riverside Hall', category_id: 'c1', phone: null, whatsapp: null, email: 'bookings@example.com', website: null, notes: null }),
  W({ id: 'v2', name: 'Golden Hour Studio', category_id: 'c3', phone: null, whatsapp: null, email: null, website: null, notes: null }),
  W({ id: 'v3', name: 'Fernleaf Films', category_id: 'c3', phone: null, whatsapp: null, email: null, website: null, notes: null }),
  W({ id: 'v4', name: 'Lantern and Lace Photo', category_id: 'c3', phone: null, whatsapp: null, email: null, website: null, notes: null }),
  W({ id: 'v5', name: 'Wild Meadow Florals', category_id: 'c4', phone: null, whatsapp: null, email: null, website: null, notes: null }),
  W({ id: 'v6', name: 'Table and Thyme Catering', category_id: 'c2', phone: null, whatsapp: null, email: null, website: null, notes: null }),
];

const budgetLines = [
  W({ id: 'l1', category_id: 'c1', name: 'Venue hire', vendor_id: 'v1', estimated_cents: 9500000, quoted_cents: 9200000, final_cents: 9200000, notes: null, sort_order: 1 }),
  W({ id: 'l2', category_id: 'c1', name: 'Marquee and chairs', vendor_id: null, estimated_cents: 1800000, quoted_cents: 1650000, final_cents: null, notes: null, sort_order: 2 }),
  W({ id: 'l3', category_id: 'c2', name: 'Dinner for 80 guests', vendor_id: 'v6', estimated_cents: 16000000, quoted_cents: 15200000, final_cents: null, notes: null, sort_order: 1 }),
  W({ id: 'l4', category_id: 'c2', name: 'Wedding cake', vendor_id: null, estimated_cents: 1200000, quoted_cents: null, final_cents: null, notes: null, sort_order: 2 }),
  W({ id: 'l5', category_id: 'c3', name: 'Photographer, full day', vendor_id: 'v2', estimated_cents: 1800000, quoted_cents: 1750000, final_cents: 1750000, notes: null, sort_order: 1 }),
  W({ id: 'l6', category_id: 'c3', name: 'Engagement shoot', vendor_id: 'v2', estimated_cents: 350000, quoted_cents: 320000, final_cents: 320000, notes: null, sort_order: 2 }),
  W({ id: 'l7', category_id: 'c4', name: 'Bouquets and ceremony arch', vendor_id: 'v5', estimated_cents: 1400000, quoted_cents: 1250000, final_cents: null, notes: null, sort_order: 1 }),
  W({ id: 'l8', category_id: 'c5', name: 'Wedding dress', vendor_id: null, estimated_cents: 1500000, quoted_cents: null, final_cents: 1420000, notes: null, sort_order: 1 }),
  W({ id: 'l9', category_id: 'c5', name: 'Suit', vendor_id: null, estimated_cents: 800000, quoted_cents: null, final_cents: 780000, notes: null, sort_order: 2 }),
  W({ id: 'l10', category_id: 'c6', name: 'DJ and sound', vendor_id: null, estimated_cents: 900000, quoted_cents: 850000, final_cents: null, notes: null, sort_order: 1 }),
  W({ id: 'hl1', category_id: 'h1', name: 'Return flights', vendor_id: null, estimated_cents: 2200000, quoted_cents: 2400000, final_cents: null, notes: null, sort_order: 1 }),
  W({ id: 'hl2', category_id: 'h2', name: 'Beach resort, 7 nights', vendor_id: null, estimated_cents: 2500000, quoted_cents: null, final_cents: 2650000, notes: null, sort_order: 1 }),
  W({ id: 'hl3', category_id: 'h3', name: 'Boat trips and meals', vendor_id: null, estimated_cents: 800000, quoted_cents: null, final_cents: null, notes: null, sort_order: 1 }),
];

const quote = (id, vendorId, name, categoryId, lineId, amount, status, extra = {}) =>
  W({ id, vendor_id: vendorId, vendor_name: name, category_id: categoryId, budget_line_id: lineId, amount_cents: amount,
    received_on: dateOnly(-20), valid_until: dateOnly(30), status, notes: null, attachment_path: null, created_at: `${dateOnly(-20)}T10:00:00Z`, ...extra });
const quotes = [
  quote('q1', 'v2', 'Golden Hour Studio', 'c3', 'l5', 1750000, 'accepted', { notes: '10 hours, second shooter, online gallery' }),
  quote('q2', 'v3', 'Fernleaf Films', 'c3', null, 1600000, 'received', { notes: '8 hours, no second shooter' }),
  quote('q3', 'v4', 'Lantern and Lace Photo', 'c3', null, 1950000, 'shortlisted', { notes: '10 hours, printed album included' }),
  quote('q4', 'v5', 'Wild Meadow Florals', 'c4', 'l7', 1250000, 'shortlisted'),
  quote('q5', null, 'Petal and Post', 'c4', null, 1380000, 'received'),
  quote('q6', null, 'Evergreen Event Hire', 'c4', null, 1100000, 'received', { notes: 'Arch only, no bouquets' }),
  quote('q7', 'v1', 'Riverside Hall', 'c1', 'l1', 9200000, 'accepted'),
];

const invoices = [
  W({ id: 'i1', vendor_id: 'v1', vendor_name: 'Riverside Hall', invoice_number: 'INV-1042', total_cents: 9200000, due_on: dateOnly(12), budget_line_id: 'l1', quote_id: 'q7', attachment_path: null, notes: null, created_at: `${dateOnly(-60)}T10:00:00Z` }),
  W({ id: 'i2', vendor_id: 'v2', vendor_name: 'Golden Hour Studio', invoice_number: 'GH-0087', total_cents: 1750000, due_on: dateOnly(40), budget_line_id: 'l5', quote_id: 'q1', attachment_path: null, notes: null, created_at: `${dateOnly(-30)}T10:00:00Z` }),
  W({ id: 'i3', vendor_id: null, vendor_name: 'Bridal Atelier', invoice_number: 'BA-311', total_cents: 1420000, due_on: dateOnly(60), budget_line_id: 'l8', quote_id: null, attachment_path: null, notes: null, created_at: `${dateOnly(-25)}T10:00:00Z` }),
  W({ id: 'i4', vendor_id: null, vendor_name: 'Tailor and Co', invoice_number: 'TC-52', total_cents: 780000, due_on: dateOnly(-10), budget_line_id: 'l9', quote_id: null, attachment_path: null, notes: null, created_at: `${dateOnly(-40)}T10:00:00Z` }),
];

const payments = [
  W({ id: 'p1', invoice_id: 'i1', paid_on: dateOnly(-55), amount_cents: 4600000, method: 'eft', paid_by: 'joint', proof_path: null, notes: 'Deposit' }),
  W({ id: 'p2', invoice_id: 'i2', paid_on: dateOnly(-28), amount_cents: 875000, method: 'payshap', paid_by: 'bride', proof_path: null, notes: 'Booking fee' }),
  W({ id: 'p3', invoice_id: 'i3', paid_on: dateOnly(-22), amount_cents: 710000, method: 'card', paid_by: 'groom', proof_path: null, notes: null }),
  W({ id: 'p4', invoice_id: 'i4', paid_on: dateOnly(-9), amount_cents: 780000, method: 'eft', paid_by: 'groom', proof_path: null, notes: 'Paid in full' }),
  W({ id: 'p5', invoice_id: 'i1', paid_on: dateOnly(-8), amount_cents: 1500000, method: 'eft', paid_by: 'bride', proof_path: null, notes: 'Second instalment' }),
];

const savings = [
  W({ id: 's1', contributed_on: dateOnly(-90), amount_cents: 2000000, paid_by: 'groom', note: 'Savings kick-off' }),
  W({ id: 's2', contributed_on: dateOnly(-60), amount_cents: 1500000, paid_by: 'bride', note: null }),
  W({ id: 's3', contributed_on: dateOnly(-30), amount_cents: 1500000, paid_by: 'joint', note: null }),
];

const T = (id, title, over = {}) => W({
  id, parent_task_id: null, title, description: null, assignee: 'both', category: null, due_on: null, priority: 'medium',
  status: 'todo', catch_up: false, recurrence: null, sort_order: 1, assigned_to: null, ...over,
});
const tasks = [
  T('t1', 'Confirm the final guest count with the venue', { assignee: 'both', priority: 'high', due_on: dateOnly(9), category: 'Venue' }),
  T('t2', 'Send the save-the-dates', { assignee: 'both', due_on: dateOnly(4), assigned_to: 'u-4', category: 'Stationery' }),
  T('t3', 'Book the cake tasting', { assignee: 'bride', due_on: dateOnly(7), category: 'Catering', assigned_to: 'u-3' }),
  T('t4', 'Choose the first dance song', { assignee: 'groom', due_on: dateOnly(30), category: 'Music' }),
  T('t5', 'Collect the table runners', { assignee: 'bride', due_on: dateOnly(14), category: 'Decor', assigned_to: 'u-5' }),
  T('t6', 'Book the florist consultation', { assignee: 'bride', priority: 'high', status: 'done', category: 'Flowers' }),
  T('t7', 'Order the groomsmen gifts', { assignee: 'groom', due_on: dateOnly(21), assigned_to: 'u-3', priority: 'low' }),
];

// The helper's own view: only tasks assigned to them (the database enforces this).
const helperTasks = [
  T('t3', 'Book the cake tasting', { assignee: 'bride', due_on: dateOnly(7), category: 'Catering', assigned_to: 'u-3' }),
  T('t7', 'Order the groomsmen gifts', { assignee: 'groom', due_on: dateOnly(21), assigned_to: 'u-3', priority: 'low' }),
  T('t8', 'Print the table plan', { assignee: 'both', due_on: dateOnly(35), assigned_to: 'u-3', category: 'Stationery' }),
  T('t9', 'Collect the cake', { assignee: 'both', status: 'done', assigned_to: 'u-3', category: 'Catering' }),
];

const events = [
  W({ id: 'e1', title: 'Cake tasting', kind: 'tasting', starts_at: `${dateOnly(7)}T08:00:00Z`, ends_at: null, all_day: false, location: 'Table and Thyme', notes: null }),
  W({ id: 'e2', title: 'Dress fitting', kind: 'fitting', starts_at: `${dateOnly(11)}T09:00:00Z`, ends_at: null, all_day: false, location: 'Bridal Atelier', notes: null }),
  W({ id: 'e3', title: 'Venue walkthrough', kind: 'appointment', starts_at: `${dateOnly(16)}T07:30:00Z`, ends_at: null, all_day: false, location: 'Riverside Hall', notes: null }),
  W({ id: 'e4', title: 'Florist consultation', kind: 'appointment', starts_at: `${dateOnly(21)}T10:00:00Z`, ends_at: null, all_day: false, location: null, notes: null }),
  W({ id: 'e5', title: 'Suit fitting', kind: 'fitting', starts_at: `${dateOnly(24)}T12:00:00Z`, ends_at: null, all_day: false, location: null, notes: null }),
];

const guestNames = [
  ['Maya Okafor', 'yes', 2, 'bride'], ['Jonas Meyer', 'yes', 1, 'groom'], ['Leila Haddad', 'yes', 3, 'bride'],
  ['Tom Whitfield', 'maybe', 2, 'groom'], ['Zanele Dube', 'yes', 1, 'both'], ['Chris Naidoo', 'pending', 2, 'groom'],
  ['Aisha Khan', 'yes', 2, 'bride'], ['Pieter Botha', 'no', 1, 'groom'], ['Grace Lin', 'pending', 1, 'bride'],
  ['Hugo Marais', 'yes', 2, 'both'], ['Sofia Rossi', 'yes', 1, 'bride'], ['Daniel Park', 'maybe', 1, 'groom'],
  ['Imani Clarke', 'yes', 4, 'both'], ['Lukas Visser', 'pending', 2, 'groom'], ['Nia Thompson', 'yes', 2, 'bride'],
];
const guests = guestNames.map(([name, rsvp, party, side], i) =>
  W({ id: `g${i + 1}`, name, email: null, phone: null, side, rsvp_status: rsvp, party_size: party,
    dietary_notes: i === 0 ? 'Vegetarian' : i === 4 ? 'No nuts' : null, table_label: i < 6 ? `Table ${(i % 3) + 1}` : null, notes: null }));

const itinerary = [
  ['Bangkok', 'Palm Court Hotel', 'Arrive, check in and a slow dinner by the river', 'Airport transfer'],
  ['Bangkok', null, 'Markets and a boat trip along the canals', null],
  ['Bangkok', null, 'Temples in the morning, rooftop dinner', null],
  ['Koh Samui', 'Seaside Resort', 'Fly to the island, beach afternoon', 'Domestic flight'],
  ['Koh Samui', null, 'Snorkelling day trip', null],
  ['Koh Samui', null, 'Spa morning, sunset dinner', null],
  ['Koh Samui', null, 'Cooking class', null],
  ['Koh Samui', null, 'Free day', null],
  ['Bangkok', 'Palm Court Hotel', 'Last shopping, farewell dinner', 'Ferry and flight'],
  ['Bangkok', null, 'Fly home', 'Airport transfer'],
].map(([city, accommodation, activities, transport], i) =>
  W({ id: `d${i + 1}`, day_number: i + 1, on_date: dateOnly(145 + i), city, accommodation, activities, transport,
    booking_reference: i === 0 ? 'DEMO-001' : null, cost_cents: i === 0 ? 150000 : 0, notes: null }));

const bookings = [
  W({ id: 'b1', kind: 'flight', name: 'Return flights', confirmation_number: 'DEMO-FL1', starts_on: dateOnly(145), ends_on: dateOnly(155), cost_cents: 2400000, attachment_path: null, notes: 'Window seats, 2 checked bags' }),
  W({ id: 'b2', kind: 'accommodation', name: 'Seaside Resort', confirmation_number: 'DEMO-RS2', starts_on: dateOnly(148), ends_on: dateOnly(153), cost_cents: 2650000, attachment_path: null, notes: null }),
  W({ id: 'b3', kind: 'insurance', name: 'Travel cover', confirmation_number: null, starts_on: null, ends_on: null, cost_cents: 185000, attachment_path: null, notes: null }),
];

const packing = [
  ['Sunscreen', 'Toiletries', true], ['Swimwear', 'Clothes', true], ['Travel adapter', 'Electronics', false],
  ['Light rain jacket', 'Clothes', false], ['Printed booking confirmations', 'Documents', false],
].map(([name, category, packed], i) => W({ id: `k${i}`, name, category, packed }));

const travelDocs = [
  W({ id: 'x1', title: 'Passport', person: 'groom', status: 'collected', due_on: null, notes: null }),
  W({ id: 'x2', title: 'Passport', person: 'bride', status: 'applied', due_on: dateOnly(30), notes: 'Appointment booked' }),
  W({ id: 'x3', title: 'Travel insurance', person: 'both', status: 'not_started', due_on: dateOnly(60), notes: null }),
];

const purchases = [
  W({ id: 'u1', name: 'Guest book', category: 'Decor', quantity: 1, needed_by: dateOnly(30), price_cents: 34900, bought: false, bought_by: null, bought_at_store: null, bought_on: null, receipt_path: null, notes: null }),
  W({ id: 'u2', name: 'Table candles', category: 'Decor', quantity: 12, needed_by: dateOnly(40), price_cents: 60000, bought: false, bought_by: null, bought_at_store: 'Candle Corner', bought_on: null, receipt_path: null, notes: 'Cream, unscented' }),
  W({ id: 'u3', name: 'Ring box', category: 'Attire', quantity: 1, needed_by: null, price_cents: 25000, bought: true, bought_by: 'bride', bought_at_store: 'Gem and Gold', bought_on: dateOnly(-4), receipt_path: `${WID}/receipts/demo-receipt.pdf`, notes: null }),
  W({ id: 'u4', name: 'Welcome signs', category: 'Decor', quantity: 2, needed_by: null, price_cents: 41000, bought: true, bought_by: 'groom', bought_at_store: 'Print and Paper', bought_on: dateOnly(-9), receipt_path: `${WID}/receipts/demo-receipt2.pdf`, notes: null }),
  W({ id: 'u5', name: 'Confetti cones', category: 'Decor', quantity: 80, needed_by: dateOnly(60), price_cents: 24000, bought: false, bought_by: null, bought_at_store: null, bought_on: null, receipt_path: null, notes: null }),
];

const activity = [
  W({ id: 'a1', actor_id: 'u-1', actor_name: 'Ada', action: 'Completed a task', subject: 'Book the florist consultation', created_at: `${TODAY}T07:20:00Z` }),
  W({ id: 'a2', actor_id: 'u-2', actor_name: 'Ben', action: 'Added a payment', subject: 'Riverside Hall', created_at: `${dateOnly(-1)}T15:00:00Z` }),
];

const reminderSettings = { wedding_id: WID, user_id: 'u-1', enabled: true, lead_days: [7, 1], include_events: true, include_tasks: true, include_payments: true };

module.exports = {
  TODAY, NOW_ISO, WID, wedding, people, invites,
  tables: {
    wedding_categories: categories, wedding_vendors: vendors, wedding_budget_lines: budgetLines, wedding_quotes: quotes,
    wedding_invoices: invoices, wedding_payments: payments, wedding_savings: savings, wedding_targets: [], wedding_tasks: tasks,
    wedding_events: events, wedding_guests: guests, wedding_itinerary_days: itinerary, wedding_bookings: bookings,
    wedding_packing_items: packing, wedding_travel_docs: travelDocs, wedding_purchase_items: purchases, wedding_activity: activity,
  },
  helperTasks, reminderSettings,
};
