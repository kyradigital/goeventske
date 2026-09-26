/* ============================================================
   Go Events Kenya — the data layer

   Every screen talks to `PL` and nothing else. PL talks to Supabase:
   a Postgres database with row-level security, reached over HTTPS.

   Two rules hold everywhere below:

   1. The database decides what a caller may see and change — never
      the query this file happens to send. Every table has row-level
      security on it, so a tampered-with request comes back empty
      rather than with somebody else's orders.

   2. Nothing that creates money or a ticket happens here. Checkout,
      marking an order paid, issuing tickets and spending one at the
      gate are all SECURITY DEFINER functions inside the database,
      which check who is asking before they do anything. A browser
      saying "this was paid" is not evidence of payment.
   ============================================================ */
(function () {
  if (!window.supabase || !window.GEK) {
    console.error("Go Events Kenya: Supabase client or config missing.");
    return;
  }

  const sb = window.supabase.createClient(GEK.url, GEK.key, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: "gek.auth" }
  });

  /* ---------- talking to the database ---------- */
  /* Postgres raises errors with messages written for a person. Anything that
     isn't one of ours gets a plain sentence instead of a stack trace. */
  const FRIENDLY = {
    NOT_SIGNED_IN: "You need to sign in first.",
    NOT_ALLOWED: "You don't have permission to do that.",
    ALREADY_HAS_ORG: "That account already belongs to an organisation."
  };
  function boom(error) {
    const raw = (error && (error.message || error.error_description)) || "Something went wrong.";
    if (FRIENDLY[raw]) throw new Error(FRIENDLY[raw]);
    if (/duplicate key|unique constraint/i.test(raw)) throw new Error("Something with that name already exists.");
    if (/JWT|not authenticated|invalid claim/i.test(raw)) throw new Error(FRIENDLY.NOT_SIGNED_IN);
    if (/Failed to fetch|NetworkError/i.test(raw)) throw new Error("Can't reach the server. Check your connection.");
    throw new Error(raw);
  }
  async function rpc(name, args) {
    const { data, error } = await sb.rpc(name, args || {});
    if (error) boom(error);
    return data;
  }
  async function rows(query) {
    const { data, error } = await query;
    if (error) boom(error);
    return data || [];
  }

  /* ---------- shaping ---------- */
  /* The pages were written against a flat record, so the joins Postgres
     returns get flattened back to that shape here. */
  const hhmm = (t) => (t ? String(t).slice(0, 5) : "");

  function shapeEvent(e, orgFallback) {
    const org = e.organisations || e.org || orgFallback || {};
    const types = (e.ticket_types || []).slice().sort((a, b) => a.sort - b.sort);
    const onSale = types.filter((t) => t.active && (t.quantity === 0 || t.sold < t.quantity));
    const sold = types.reduce((n, t) => n + t.sold, 0);
    const capacity = types.reduce((n, t) => n + (t.quantity || 0), 0);
    return {
      id: e.id, org_id: e.org_id, name: e.name, slug: e.slug,
      tagline: e.tagline || "", about: e.about || "", category: e.category,
      venue: e.venue || "", city: e.city || "", date: e.date,
      start_time: hhmm(e.start_time), end_time: hhmm(e.end_time),
      image: e.poster_url || "", status: e.status, featured: e.featured,
      created_at: e.created_at,
      org: { id: org.id, name: org.name, colour: org.colour, slug: org.slug,
             logo: org.logo_url || org.logo || "" },
      currency: e.currency || (org.currency || "KES"),
      sold, capacity,
      from_price: onSale.length ? Math.min(...onSale.map((t) => t.price)) : null,
      current: onSale[0] ? { name: onSale[0].name, price: onSale[0].price } : null,
      sold_out: types.length > 0 && onSale.length === 0,
      ticket_types: types
    };
  }

  const EVENT_COLS =
    "id,org_id,name,slug,tagline,about,category,venue,city,date,start_time,end_time," +
    "poster_url,status,featured,created_at," +
    "organisations(id,name,slug,colour,logo_url)," +
    "ticket_types(id,event_id,name,blurb,price,quantity,sold,active,sort)";

  /* The organisation name typed at sign-up, kept here only until the account is
     confirmed. If the project asks people to click a link in an email, the
     account exists before the organisation does, and this is what lets the app
     finish the job on their first sign-in instead of stranding them. */
  const PENDING_ORG = "gek.pending_org";
  function remember(o) {
    try { localStorage.setItem(PENDING_ORG, JSON.stringify(o)); } catch (e) { /* private window */ }
  }
  function recall() {
    try { return JSON.parse(localStorage.getItem(PENDING_ORG) || "null"); } catch (e) { return null; }
  }
  function forget() {
    try { localStorage.removeItem(PENDING_ORG); } catch (e) { /* nothing to do */ }
  }

  /* A handle is lowercase letters and digits. The auth account is held against
     a handle-shaped address that only this system uses; the organiser's real
     email lives beside their organisation, for telling them things. */
  const cleanHandle = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const handleEmail = (s) => cleanHandle(s) + "@accounts.goeventskenya.online";

  /* the signed-in organiser, cached for the life of the page */
  let mine = null;

  /* When the platform owner is looking over an organiser's shoulder, this
     holds that organisation. Everything below reads it and nothing writes
     while it is set — the database enforces the same thing independently,
     because the owner was only ever granted permission to read. */
  let watching = null;

  async function whoami() {
    if (watching) {
      const who = await realMe();
      return { ...who, org: watching };
    }
    return realMe();
  }

  async function realMe() {
    if (mine) return mine;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) throw new Error(FRIENDLY.NOT_SIGNED_IN);

    let info = await rpc("me");

    /* Signed in with no organisation: either they are waiting on approval, or
       they have not applied yet. Either way the page, not this file, decides
       what to show them. */
    if (!info) throw new Error("NEEDS_ORG");
    mine = info;
    return mine;
  }

  const PL = {
    /* ---------- who's signed in ---------- */
    async session() {
      const { data: { session } } = await sb.auth.getSession();
      return session ? { user_id: session.user.id } : null;
    },

    async me() {
      const info = await realMe();
      return { user: info.user, org: info.org, platform_admin: !!info.platform_admin };
    },

    /* An organiser signs in with their handle. The auth account is held
       against a handle-shaped address, so there is nothing to look up and no
       way to probe which emails exist. An address still works, for the
       accounts that were made before handles. */
    async signIn(who, password) {
      const raw = String(who || "").trim();
      const email = raw.includes("@") ? raw.toLowerCase() : handleEmail(raw);
      const { error } = await sb.auth.signInWithPassword({
        email, password: String(password || "")
      });
      if (error) {
        if (/invalid login/i.test(error.message))
          throw new Error("That sign-in name and password don't match.");
        boom(error);
      }
      mine = null;
      const info = await whoami();
      return { user: info.user, org: info.org, platform_admin: !!info.platform_admin };
    },

    async signUp({ org_name, handle, name, password }) {
      if (!String(org_name || "").trim()) throw new Error("What is the organisation called?");
      const h = cleanHandle(handle || org_name);
      if (h.length < 3) throw new Error("That sign-in name is too short — 3 letters or more.");
      if (String(password || "").length < 8) throw new Error("Use at least 8 characters for the password.");

      const { data, error } = await sb.auth.signUp({
        email: handleEmail(h), password: String(password),
        options: { data: { handle: h } }
      });
      if (error) {
        if (/already registered|already been/i.test(error.message))
          throw new Error("That sign-in name is taken. Try another.");
        /* Supabase is still set to send a confirmation email for every new
           account. These accounts sign in with a handle, not an address, so
           there is nothing to confirm and the attempt only burns the hourly
           send limit. Say what to do rather than repeating the raw error. */
        if (/rate limit|too many requests/i.test(error.message))
          throw new Error("Sign-ups are switched off at the moment — " +
            "email confirmation is still on in Supabase and needs turning off.");
        boom(error);
      }
      /* The account is live immediately — nothing to confirm, because these
         accounts have no email address to confirm. If a session somehow does
         not come back, say so plainly rather than carrying on. */
      remember({ org_name, name });
      if (!data.session) throw new Error("The account was made but could not be opened. Sign in with your new name and password.");

      mine = null;
      return { pending: true };
    },

    /* Selling tickets is by approval, so this asks rather than creates.
       No organisation exists until the platform owner says yes. */
    /* Creates the organisation on the signed-in account. Nobody approves
       anything — they are selling the moment this returns. */
    async createOrg({ org_name, handle, name, phone, note }) {
      if (!String(org_name || "").trim()) throw new Error("What is the organisation called?");
      if (!String(name || "").trim()) throw new Error("We need your name.");
      const r = await rpc("create_my_org", {
        p_org_name: org_name, p_person: name,
        p_handle: cleanHandle(handle || org_name) || null,
        p_phone: phone || null, p_note: note || null
      });
      forget();
      mine = null;
      return r;
    },

    /* is this sign-in name free? yes or no, nothing else */
    async handleFree(handle) {
      const h = cleanHandle(handle);
      if (h.length < 3) return false;
      return rpc("handle_free", { p_handle: h });
    },

    /* ---------- the platform owner ---------- */
    async adminOverview()     { return rpc("admin_overview"); },
    async adminOrgs()         { return rpc("admin_orgs"); },
    async adminActivity(limit, action) {
      return rpc("admin_activity", { p_limit: limit || 120, p_action: action || null });
    },
    /* ---------- looking over an organiser's shoulder ----------
       Read only, and on the record. There is no password involved and
       nothing is borrowed from the organiser's account: the owner reads
       with their own permissions, which the database grants for SELECT
       and nothing else. */
    async viewAsOrg(org_id) {
      const who = await realMe();
      if (!who.platform_admin) throw new Error("NOT_ALLOWED");
      const org = await rpc("admin_org_detail", { p_org: org_id });
      watching = org;
      await PL.logAction("platform.view_as", org.name, { org_id: org.id });
      return org;
    },

    async stopViewing() {
      const was = watching;
      watching = null;
      if (was) await PL.logAction("platform.view_as_end", was.name, { org_id: was.id });
    },

    watching() { return watching; },

    async logAction(action, detail, meta) {
      try { await rpc("log_activity", { p_action: action, p_detail: detail || null,
                                        p_org: null, p_meta: meta || {} }); }
      catch (e) { /* a record that fails must never block the thing it records */ }
    },

    async signOut() {
      mine = null;
      forget();
      await sb.auth.signOut();
      return { ok: true };
    },

    /* ---------- the public side ---------- */
    /* No sign-in needed. Row-level security lets anyone read an event that is
       live, and nothing else on this table. */
    async publicEvents({ q = "", category = "", city = "" } = {}) {
      let query = sb.from("events").select(EVENT_COLS).eq("status", "live").order("date");
      if (category) query = query.eq("category", category);
      if (city) query = query.eq("city", city);
      if (q) {
        const safe = String(q).replace(/[%,()*]/g, " ").trim();
        if (safe) query = query.or(
          ["name", "tagline", "venue", "city", "category"].map((c) => `${c}.ilike.%${safe}%`).join(","));
      }
      return (await rows(query)).map((e) => shapeEvent(e));
    },

    async publicEvent(slug) {
      const list = await rows(
        sb.from("events").select(EVENT_COLS).eq("slug", slug).eq("status", "live").limit(1));
      if (!list.length) throw new Error("We couldn't find that event.");
      return shapeEvent(list[0]);
    },

    async categories() {
      const list = await rows(sb.from("events").select("category").eq("status", "live"));
      return [...new Set(list.map((e) => e.category))].sort();
    },

    /* ---------- buying ----------
       This creates a PENDING order and nothing else. No ticket exists until a
       payment is confirmed on the server — see mark_order_paid in the database.
       The prices come from the database rows, never from this page. */
    async checkout({ event_id, buyer, items, proof }) {
      const reference = await rpc("create_order", {
        p_event: event_id,
        p_buyer: { name: buyer.name, email: buyer.email, phone: buyer.phone || null },
        p_items: (items || []).map((i) => ({ ticket_type_id: i.ticket_type_id, qty: i.quantity || i.qty })),
        p_proof: proof || null
      });
      return { reference };
    },

    /* ---------- proving the buyer owns the email ----------
       The code itself never comes back here — it goes to the inbox. All this
       page learns is whether one was sent. */
    async sendEmailCode(email) {
      const { data, error } = await sb.functions.invoke("email-code", { body: { email } });
      if (error) {
        let msg = "";
        try { msg = (await error.context.json()).error; } catch (e) { /* no body */ }
        throw new Error(msg || "Could not send the code. Try again in a moment.");
      }
      return data;
    },

    /* Hands back a short-lived proof that this browser opened that inbox.
       create_order will not take an order without one. */
    async verifyEmailCode(email, code) {
      const r = await rpc("verify_email_code", { p_email: email, p_code: code });
      if (!r || !r.ok) throw new Error((r && r.why) || "That code is not right.");
      return r.token;
    },

    /* Open a Paystack checkout for an order. The amount is not sent from here —
       the Edge Function reads it off the order row. */
    async payForOrder(reference) {
      const { data, error } = await sb.functions.invoke("paystack-init", {
        body: { reference }
      });
      if (error) {
        let msg = "";
        try { msg = (await error.context.json()).error; } catch (e) { /* no body */ }
        throw new Error(msg || "Could not reach the payment page. Try again in a moment.");
      }
      return data;
    },

    /* what the ticket page polls while the buyer is typing their PIN */
    async orderState(reference) {
      return rpc("order_state", { p_reference: String(reference || "").trim() });
    },

    /* a buyer looking up their own order by the reference they were given */
    async order(reference) {
      const o = await rpc("find_order", { p_reference: String(reference || "").trim() });
      return {
        reference: o.reference, status: o.status, total: o.total,
        buyer_name: o.buyer_name, buyer_email: o.buyer_email, buyer_phone: o.buyer_phone || "",
        created_at: o.created_at, reason: o.reason || "", receipt: o.receipt || "",
        event: o.event ? { ...o.event, start_time: hhmm(o.event.start_time) } : null,
        org: o.org || { currency: o.currency || "KES" },
        items: (o.items || []).map((i) => ({ name: i.type_name, quantity: i.qty, unit_price: i.unit_price })),
        tickets: o.tickets || []
      };
    },

    /* ---------- the gate ---------- */
    /* Anyone holding the QR may LOOK — and gets nothing about the buyer back. */
    async checkTicket(token) {
      const r = await rpc("check_ticket", { p_token: token });
      if (!r || !r.found) return { result: "invalid" };
      const ev = r.event || {};
      return {
        result: r.status === "used" ? "used" : r.status === "void" ? "void" : "valid",
        code: r.code, type: r.type_name, used_at: r.used_at, mine: r.mine,
        event: ev.name || "—", venue: [ev.venue, ev.city].filter(Boolean).join(", "),
        date: ev.date || null, org: ""
      };
    },

    /* Only a signed-in organiser may SPEND one, and the database does the
       flipping inside a locked row, so the same QR on two phones at once
       can only win once. */
    async useTicket(token) {
      return rpc("use_ticket", { p_token: token });
    },

    async voidTicket(code) {
      const found = await rows(sb.from("tickets").select("id,code,status")
        .eq("code", String(code).toUpperCase()).limit(1));
      if (!found.length) throw new Error("No ticket of yours with that code.");
      const { error } = await sb.from("tickets").update({ status: "void" }).eq("id", found[0].id);
      if (error) boom(error);
      return { code: found[0].code };
    },

    /* ---------- the organiser's own data ---------- */
    async dashboard() {
      const d = await rpc("dashboard", { p_org: watching ? watching.id : null });
      return {
        gross: d.gross, net: d.net, fee_pct: Number(d.fee_pct),
        tickets_sold: d.tickets_sold, scanned: d.scanned,
        live_events: d.live_events, total_events: d.total_events,
        daily: d.daily, by_event: d.by_event,
        recent: await PL.myOrders({ limit: 8 })
      };
    },

    async myEvents() {
      const info = await whoami();
      const list = await rows(sb.from("events").select(EVENT_COLS)
        .eq("org_id", info.org.id).order("created_at", { ascending: false }));
      return list.map((e) => shapeEvent(e, info.org))
                 .map((e) => ({ ...e, currency: info.org.currency }));
    },

    async saveEvent(ev) {
      const info = await whoami();
      const patch = {};
      const put = (k, v) => { if (v !== undefined) patch[k] = v; };
      put("name", ev.name); put("tagline", ev.tagline); put("about", ev.about);
      put("category", ev.category); put("venue", ev.venue); put("city", ev.city);
      if (ev.date !== undefined && ev.date !== "") patch.date = ev.date;
      if (ev.start_time !== undefined) patch.start_time = ev.start_time || null;
      if (ev.end_time !== undefined) patch.end_time = ev.end_time || null;
      if (ev.image !== undefined) patch.poster_url = ev.image || null;

      if (ev.id) {
        /* publishing goes through the database, which refuses an event that
           has no ticket type on it */
        if (ev.status !== undefined)
          await rpc("publish_event", { p_event: ev.id, p_live: ev.status === "live" });
        if (Object.keys(patch).length) {
          const { error } = await sb.from("events").update(patch).eq("id", ev.id);
          if (error) boom(error);
        }
        const back = await rows(sb.from("events").select(EVENT_COLS).eq("id", ev.id).limit(1));
        return shapeEvent(back[0], info.org);
      }

      if (!patch.name || !patch.date) throw new Error("An event needs a name and a date.");
      patch.org_id = info.org.id;
      patch.slug = await freeSlug(patch.name);
      const { data, error } = await sb.from("events").insert(patch).select(EVENT_COLS).single();
      if (error) boom(error);
      return shapeEvent(data, info.org);
    },

    async deleteEvent(id) {
      const paid = await rows(sb.from("orders").select("id")
        .eq("event_id", id).eq("status", "paid").limit(1));
      if (paid.length) throw new Error("People have already bought tickets — unpublish it instead of deleting it.");
      const { error } = await sb.from("events").delete().eq("id", id);
      if (error) boom(error);
      return { ok: true };
    },

    async saveTicketType(tt) {
      if (!tt.name) throw new Error("Give the ticket a name.");
      const patch = {
        name: tt.name, blurb: tt.blurb || "",
        price: Math.max(0, Math.round(Number(tt.price) || 0)),
        quantity: Math.max(0, Math.round(Number(tt.quantity) || 0)),
        active: tt.active !== false
      };
      if (tt.id) {
        const { error } = await sb.from("ticket_types").update(patch).eq("id", tt.id);
        if (error) boom(error);
        return { ...tt };
      }
      patch.event_id = tt.event_id;
      const { data, error } = await sb.from("ticket_types").insert(patch).select().single();
      if (error) boom(error);
      return data;
    },

    async deleteTicketType(id) {
      const { error } = await sb.from("ticket_types").delete().eq("id", id);
      if (error) {
        if (/violates foreign key/i.test(error.message))
          throw new Error("Tickets of this type have been sold — switch it off instead.");
        boom(error);
      }
      return { ok: true };
    },

    async myOrders({ q = "", event_id = "", limit = 200 } = {}) {
      const info = await whoami();
      let query = sb.from("orders")
        .select("id,reference,event_id,buyer_name,buyer_email,buyer_phone,total,fee,status,created_at,paid_at," +
                "events(name),order_items(type_name,qty,unit_price)," +
                "tickets(id,code,token,type_name,status,used_at)")
        .eq("org_id", info.org.id).order("created_at", { ascending: false }).limit(limit);
      if (event_id) query = query.eq("event_id", event_id);
      if (q) {
        const safe = String(q).replace(/[%,()*]/g, " ").trim();
        if (safe) query = query.or(
          ["buyer_name", "buyer_email", "buyer_phone", "reference"].map((c) => `${c}.ilike.%${safe}%`).join(","));
      }
      return (await rows(query)).map((o) => ({
        id: o.id, reference: o.reference, event_id: o.event_id,
        buyer_name: o.buyer_name, buyer_email: o.buyer_email, buyer_phone: o.buyer_phone || "",
        total: o.total, fee: o.fee, status: o.status,
        created_at: o.created_at, paid_at: o.paid_at,
        event_name: (o.events || {}).name,
        items: (o.order_items || []).map((i) => ({ name: i.type_name, quantity: i.qty, unit_price: i.unit_price })),
        tickets: o.tickets || []
      }));
    },

    /* An organiser confirming the money arrived. This is the only path that
       creates a ticket, it runs inside the database, and it is allowed only to
       a member of the organisation that owns the order. When M-Pesa is wired
       up, a Daraja callback calls this same function instead of a person. */
    async markPaid(reference, receipt) {
      return rpc("mark_order_paid", { p_reference: reference, p_receipt: receipt || null });
    },

    async cancelOrder(reference) {
      await rpc("cancel_order", { p_reference: reference });
      return { ok: true };
    },

    async payouts() {
      const info = await whoami();
      const fee = Number(info.org.fee_pct) / 100;
      const evs = await rows(sb.from("events").select("id,name,date").eq("org_id", info.org.id));
      const paid = await rows(sb.from("orders").select("event_id,total")
        .eq("org_id", info.org.id).eq("status", "paid"));
      const list = evs.map((e) => {
        const gross = paid.filter((o) => o.event_id === e.id).reduce((n, o) => n + o.total, 0);
        const over = new Date(e.date + "T23:59:59") < new Date();
        const hours = over ? (Date.now() - new Date(e.date + "T23:59:59")) / 36e5 : 0;
        return {
          event_id: e.id, event: e.name, date: e.date, gross,
          fee: Math.round(gross * fee), net: Math.round(gross * (1 - fee)),
          state: !over ? "waiting" : hours < 24 ? "clearing" : "ready"
        };
      }).filter((r) => r.gross > 0);
      return { rows: list, fee_pct: Number(info.org.fee_pct) };
    },

    async saveOrg(patch) {
      const clean = {};
      for (const k in patch) if (patch[k] !== undefined) clean[k] = patch[k];
      const info = await rpc("save_org", { p: clean });
      mine = info;
      return info.org;
    },

    /* ---------- pictures ----------
       The file goes to Supabase Storage in a folder named after the
       organisation. The storage policies only let a member write inside their
       own folder, so one organiser cannot overwrite another's poster. */
    async uploadImage(blob, kind) {
      const info = await whoami();
      const ext = (String(blob.type).split("/")[1] || "jpg").replace("jpeg", "jpg");
      const path = `${info.org.id}/${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from("media").upload(path, blob, {
        cacheControl: "31536000", upsert: false, contentType: blob.type
      });
      if (error) boom(error);
      return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    }
  };

  /* Nothing may be changed while the owner is watching. Each of these is
     wrapped once, here, so a method added later is not quietly left open —
     it simply is not on this list, and the list is the thing to read. */
  ["saveEvent", "deleteEvent", "saveTicketType", "deleteTicketType",
   "markPaid", "cancelOrder", "saveOrg", "uploadImage",
   "useTicket", "voidTicket"].forEach((name) => {
    const real = PL[name];
    PL[name] = function () {
      if (watching) throw new Error("You are viewing " + watching.name +
        " as a guest. Nothing here can be changed.");
      return real.apply(PL, arguments);
    };
  });

  async function freeSlug(name) {
    const base = String(name).toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "event";
    let slug = base;
    for (let i = 0; i < 12; i++) {
      const hit = await rows(sb.from("events").select("id").eq("slug", slug).limit(1));
      if (!hit.length) return slug;
      slug = base + "-" + Math.floor(Math.random() * 9000 + 1000);
    }
    return base + "-" + Date.now().toString(36);
  }

  window.PL = PL;
  window.PL_SB = sb;
})();
