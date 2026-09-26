# Go Events Kenya — Ticketing Solutions

Ticketing for anyone who puts on events. Organisations sign up, create events, sell
tickets from a public page, take M-Pesa, scan QR codes at the gate, and get paid 24 hours after.

Plain HTML, CSS and JavaScript — no build step, no npm. The data lives in a
**Supabase** Postgres database, so an event one organiser publishes is visible to
everyone, on every device.

---

## Open it

Double-click `index.html`. It needs an internet connection, because the events come
from the database.

To put it online, drag the whole folder onto [netlify.com/drop](https://app.netlify.com/drop),
or push it to GitHub and switch Pages on. Nothing needs configuring — the database
address is already in `assets/js/config.js`.

---

## The pages

```
index.html      the product site — what it is, how it works, what it costs
discover.html   every live event, from every organisation
event.html      one event: details, ticket types, checkout
ticket.html     the buyer's QR ticket (also "find my ticket" by reference)
scan.html       the gate — what a scanned QR opens
admin.html      the organiser: sign in / sign up, then the whole dashboard
```

```
assets/css/style.css       the whole design
assets/js/config.js        which database to talk to (public values only)
assets/js/store.js         the data layer — see below
assets/js/common.js        shared helpers, header, footer, QR drawing
assets/js/discover.js      the listing
assets/js/event.js         event page + checkout
assets/js/ticket.js        the ticket wallet
assets/js/scan.js          the gate
assets/img/logo.png        the brand mark (logo-sm.png is the small one)
assets/js/admin.js         the organiser dashboard
assets/js/vendor/          the QR encoder, self-hosted (MIT)
```

---

## Try it

**As an organiser:** Start selling → make an account → create an event → add a ticket
type → publish. It appears on Discover immediately, for everyone — open it on your
phone and it is there.

**As a buyer:** Discover → pick an event → add tickets → buy. The order is saved and
sits as *awaiting payment* until the organiser confirms the money arrived; the QR
ticket appears the moment they do.

---

## Money

Buyers pay by **M-Pesa**. The site takes a phone number at checkout and the STK push goes to it —
the buyer types their PIN on their own handset and nowhere else.

**Go Events Kenya takes 10% of each ticket sold.** That is the whole bill: no setup fee, no monthly
charge, nothing for an event that never happens. The organiser's share lands on their M-Pesa number
24 hours after the event ends, and the split is shown on the Payouts page from the first sale.

## How the gate works

Every ticket carries its own 32-character random token. The QR holds a link to
`scan.html?t=<token>` — no name, no email, no order reference, nothing about the buyer.

- Anyone holding the link can **look** — valid, already used, or cancelled.
- Only a signed-in organiser can **spend** one. A punter scanning their own ticket
  gets asked to sign in.
- An organiser can only admit tickets belonging to **their own** organisation.
- The first scan spends it. A forwarded screenshot gets an amber screen.

---

## The data layer

Every screen talks to one object, `PL`, in `assets/js/store.js`. Nothing else
touches data. `PL` talks to **Supabase** — a Postgres database reached over HTTPS.

`assets/js/config.js` holds the project URL and the publishable key. Both are meant
to be public: neither grants any access on its own. What a caller may read or write
is decided inside the database. The service-role key and anything to do with M-Pesa
never appear in this folder.

### How it is kept safe

1. **Row-level security on every table.** An organiser is handed their own events,
   orders and tickets because the database filters them, not because the page asked
   nicely. A tampered request comes back empty.
2. **Money and tickets are server-side only.** `create_order` makes a *pending*
   order and nothing more. A ticket exists only after `mark_order_paid` runs inside
   the database, and that function checks the caller owns the order first. A browser
   claiming a payment succeeded is not evidence of anything.
3. **Prices come from the database.** The browser sends ticket type ids and
   quantities; Postgres looks up the prices itself.
4. **Stock is held under a row lock,** so two people buying the last ticket at the
   same moment cannot both win.
5. **Payout details are a separate table** only the owner can read. The public
   `organisations` row has a name, a colour and a logo, and nothing else.
6. **The QR carries a 32-character random token and nothing else** — no name, no
   email, no order reference. Anyone holding it can check a ticket's status; only a
   signed-in organiser of that event can spend one, and only once.

### Paying

The M-Pesa flow is built and deployed — it only needs your Daraja keys in Supabase.
The setup checklist is kept outside the repository, with your keys.

The order of events never changes: order created → STK push with the amount read
from the database → buyer types their PIN → Safaricom calls back → **the callback
asks Daraja whether that really happened** → tickets exist. A forged callback gets
nowhere, because the function that issues tickets cannot be called by a browser at
all.

**Payment received** in the Orders tab stays as a fallback, for a payment made by
hand or a callback that goes missing.

## The public copy

The landing page promises six things. Five are built in the demo; the sixth is named
below under what is missing.

1. **A unique QR code on every ticket** — built. 32 random hex characters per ticket.
2. **A ticket scanner built in** — built. `scan.html`, opened by pointing a camera at the QR.
3. **Tickets emailed to every buyer** — built. Needs a Resend key, configured in Supabase.
4. **Analytics** — built. Revenue by day, per event, scanned against sold.
5. **Team logins** — *not* built. The owner account is the only one.
6. **M-Pesa in, M-Pesa out** — *not* built. See below.

## What isn't built yet

Named honestly, so nobody is surprised:

- **M-Pesa is built but needs your keys.** The STK push and the callback are
  deployed as Supabase Edge Functions. Put your Daraja credentials into Supabase's
  secrets and it works — the checklist lives outside the repository. Until then, orders sit as awaiting
  payment and the organiser confirms them by hand.
- **Email is built but needs your Resend key.** A buyer confirms their address with
  a 6-digit code before they can order, and the ticket is emailed the moment payment
  clears. You need a verified domain in Resend to send as Go Events Kenya. Setup notes
  for this are kept outside the repository.
- **Team logins** are described in Settings, but only the owner account exists. The
  database already has a `staff` role ready for it.
- **Refunds** are mentioned in the FAQ and aren't built.
- **Withdrawals** show the right numbers and the 24-hour rule, but the button only
  explains the rule.
- **The 10% is calculated and recorded on every order** but nothing collects it.

## Before you open it

In the Supabase dashboard, under **Authentication → Sign In / Providers → Email**,
decide whether "Confirm email" is on. If it is, a new organiser has to click a link
in their inbox before they can sign in. Turning it off lets people in straight away,
which is easier while you are testing.
