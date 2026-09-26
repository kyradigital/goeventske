/* ============================================================
   Go Events Kenya — the organiser's dashboard
   ============================================================ */
(function () {
  const { $, $$, esc, money, amount, when, shortDate, prettyTime, ago, toast, qs, initials, inkOn } = UI;

  let me = null, org = null, tab = "home";
  let logoBox = null;                 // the profile-picture upload, while Settings is open
  let cache = {};
  let orderSearch = "", orderEvent = "";

  /* ==========================================================
     WAY IN
     ========================================================== */
  function authView(mode) {
    const signup = mode === "signup";
    $("#authCard").innerHTML = `
      <div style="text-align:center;margin-bottom:22px">${UI.LOGO}</div>
      <h2>${signup ? "Start selling tickets" : "Welcome back"}</h2>
      <p class="muted small" style="margin:0 0 22px">
        ${signup ? "Tell us about your events. We check every organiser by hand before they can sell."
                 : "Sign in to your organiser dashboard."}</p>

      ${signup ? `
        <div class="field"><label>Organisation name</label>
          <input id="aOrg" placeholder="e.g. Nyali Beach Club" autocomplete="organization"></div>` : ""}
      <div class="field"><label>${signup ? "Your name" : "Email"}</label>
        <input id="${signup ? "aName" : "aEmail"}" placeholder="${signup ? "Jane Mwangi" : "you@example.com"}"
               type="${signup ? "text" : "email"}" autocomplete="${signup ? "name" : "email"}"></div>
      ${signup ? `<div class="field"><label>Phone <span class="muted small">(optional)</span></label>
          <input id="aPhone" inputmode="tel" placeholder="07XX XXX XXX" autocomplete="tel"></div>
        <div class="field"><label>What kind of events do you put on?</label>
          <textarea id="aNote" rows="3" placeholder="A line or two — the sort of events, roughly how often, where."></textarea></div>
        <div class="field"><label>Email</label>
          <input id="aEmail" type="email" placeholder="you@example.com" autocomplete="email"></div>` : ""}
      <div class="field"><label>Password</label>
        <input id="aPass" type="password" placeholder="${signup ? "At least 8 characters" : "••••••••"}"
               autocomplete="${signup ? "new-password" : "current-password"}"></div>

      <button class="btn btn-primary btn-block btn-lg" id="aGo">${signup ? "Apply to sell tickets" : "Sign in"}</button>

      <p class="auth-switch">
        ${signup ? "Already selling with us?" : "Want to sell tickets?"}
        <a id="aSwitch">${signup ? "Sign in" : "Apply for an account"}</a>
      </p>

`;

    $("#aGo").onclick = () => (signup ? doSignUp() : doSignIn());
    $("#aSwitch").onclick = () => authView(signup ? "signin" : "signup");
    $("#aPass").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#aGo").click(); });
  }

  async function doSignIn() {
    const btn = $("#aGo");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const r = await PL.signIn($("#aEmail").value, $("#aPass").value);
      me = r.user; org = r.org;
      enter();
    } catch (e) {
      btn.disabled = false; btn.textContent = "Sign in";
      toast(e.message, "err");
    }
  }

  async function doSignUp() {
    const btn = $("#aGo");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      await PL.signUp({
        org_name: $("#aOrg").value, name: $("#aName").value,
        email: $("#aEmail").value, password: $("#aPass").value
      });
      /* the account exists; now ask permission to sell with it */
      await PL.applyForOrg({
        org_name: $("#aOrg").value, name: $("#aName").value,
        phone: $("#aPhone") ? $("#aPhone").value : "",
        note: $("#aNote") ? $("#aNote").value : ""
      });
      waitView();
    } catch (e) {
      if (e.message === "CONFIRM_EMAIL") return confirmView($("#aEmail").value.trim());
      btn.disabled = false; btn.textContent = "Apply to sell tickets";
      toast(e.message, "err");
    }
  }

  /* Some projects ask people to click a link in an email before they can sign
     in. Say so on the page — a red toast reads like something went wrong. */
  function confirmView(email) {
    $("#authCard").innerHTML = `
      <div style="text-align:center;margin-bottom:22px">${UI.LOGO}</div>
      <h2>Check your email</h2>
      <p class="muted small" style="margin:0 0 18px">
        We've sent a confirmation link to <b>${esc(email)}</b>. Click it, then come back here
        and sign in — everything else is already saved.</p>
      <div class="panel" style="box-shadow:none;background:var(--card-2);margin-bottom:18px">
        <p class="tiny muted" style="margin:0">If the link opens a page that won't load, don't worry:
          the confirmation still went through. Just sign in below.</p>
      </div>
      <button class="btn btn-primary btn-block" id="cGo">Go to sign in</button>`;
    $("#cGo").onclick = () => authView("signin");
  }

  function enter() {
    /* somebody was sent here from the gate — put them back */
    const next = qs("next");
    if (next && /^https?:\/\//.test(next) && new URL(next).origin === location.origin) {
      location.href = next;
      return;
    }
    $("#authScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    paintPill();
    go("home");
  }

  /* start: already signed in? */
  (async function boot() {
    try {
      const r = await PL.me();
      me = r.user; org = r.org;
      enter();
    } catch (e) {
      /* Signed in, but no organisation: they are waiting on a decision, were
         turned down, or never finished applying. */
      if (e.message === "NEEDS_ORG") return waitView();
      authView(qs("signup") ? "signup" : "signin");
    }
  })();

  async function waitView() {
    let app = null;
    try { app = await PL.myApplication(); } catch (e) { /* treat as never applied */ }

    const signOutLink = `<p class="auth-switch"><a id="wOut">Sign out</a></p>`;
    const wireOut = () => {
      $("#wOut").onclick = async () => { await PL.signOut(); location.reload(); };
    };

    if (app && app.status === "pending") {
      $("#authCard").innerHTML = `
        <div style="text-align:center;margin-bottom:20px">${UI.LOGO}</div>
        <div class="await-mark"><span></span></div>
        <h2 class="center">Waiting on approval</h2>
        <p class="muted small center" style="margin:0 0 18px">
          Your application for <b>${esc(app.org_name)}</b> is with us. Every organiser is checked by
          hand, so this usually takes a day or so. You'll get an email either way.</p>
        <div class="panel" style="box-shadow:none;background:var(--bg-2)">
          <p class="tiny muted" style="margin:0">Applied ${esc(ago(app.created_at))}. Nothing more to do —
            you can close this page.</p>
        </div>
        ${signOutLink}`;
      return wireOut();
    }

    if (app && app.status === "rejected") {
      $("#authCard").innerHTML = `
        <div style="text-align:center;margin-bottom:20px">${UI.LOGO}</div>
        <h2>Not approved</h2>
        <p class="muted small" style="margin:0 0 14px">
          We weren't able to approve <b>${esc(app.org_name)}</b> to sell tickets.</p>
        ${app.reason ? `<div class="panel" style="box-shadow:none;background:var(--bg-2);margin-bottom:16px">
          <p class="small" style="margin:0">${esc(app.reason)}</p></div>` : ""}
        <p class="tiny muted" style="margin:0 0 18px">Your account still works for buying tickets.
          If things have changed since, you can apply again.</p>
        <button class="btn btn-primary btn-block" id="wAgain">Apply again</button>
        ${signOutLink}`;
      wireOut();
      $("#wAgain").onclick = () => applyView();
      return;
    }

    return applyView();
  }

  /* The application form, for an account that has one but no organisation. */
  function applyView(msg) {
    $("#authCard").innerHTML = `
      <div style="text-align:center;margin-bottom:20px">${UI.LOGO}</div>
      <h2>Apply to sell tickets</h2>
      <p class="muted small" style="margin:0 0 20px">
        Your account is ready. Tell us who you are and we'll take a look — every organiser is checked
        by hand before they can take money.</p>
      <div class="field"><label>Organisation name</label>
        <input id="oName" placeholder="e.g. Nyali Beach Club" autocomplete="organization"></div>
      <div class="field"><label>Your name</label>
        <input id="oPerson" placeholder="Jane Mwangi" autocomplete="name"></div>
      <div class="field"><label>Phone <span class="muted small">(optional)</span></label>
        <input id="oPhone" inputmode="tel" placeholder="07XX XXX XXX" autocomplete="tel"></div>
      <div class="field"><label>What kind of events do you put on?</label>
        <textarea id="oNote" rows="3" placeholder="A line or two — the sort of events, roughly how often, where."></textarea></div>
      ${msg ? `<p class="tiny" style="color:var(--red);margin:0 0 12px">${esc(msg)}</p>` : ""}
      <button class="btn btn-primary btn-block" id="oGo">Send application</button>
      <p class="auth-switch"><a id="wOut">Sign out instead</a></p>`;

    $("#oName").focus();
    $("#wOut").onclick = async () => { await PL.signOut(); location.reload(); };
    $("#oGo").onclick = async () => {
      const btn = $("#oGo");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        await PL.applyForOrg({
          org_name: $("#oName").value, name: $("#oPerson").value,
          phone: $("#oPhone").value, note: $("#oNote").value
        });
        waitView();
      } catch (e) {
        applyView(e.message);
      }
    };
  }

  $("#signOut").onclick = async () => {
    await PL.signOut();
    location.href = "index.html";
  };

  $$("#nav button").forEach((b) => (b.onclick = () => go(b.dataset.tab)));

  async function go(t) {
    tab = t;
    $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    $("#main").innerHTML = `<div class="panel center"><span class="spinner"></span></div>`;
    try {
      if (t === "home")     cache.home = await PL.dashboard();
      if (t === "events")   cache.events = await PL.myEvents();
      if (t === "orders")   cache.orders = await PL.myOrders({ q: orderSearch, event_id: orderEvent });
      if (t === "gate")     cache.events = await PL.myEvents();
      if (t === "payouts")  cache.payouts = await PL.payouts();
    } catch (e) { return toast(e.message, "err"); }
    render();
  }

  function render() {
    const m = $("#main");
    if (tab === "home")     m.innerHTML = viewHome();
    if (tab === "events")   m.innerHTML = viewEvents();
    if (tab === "orders")   m.innerHTML = viewOrders();
    if (tab === "gate")     m.innerHTML = viewGate();
    if (tab === "payouts")  m.innerHTML = viewPayouts();
    if (tab === "settings") m.innerHTML = viewSettings();
    wire();
    UI.stagger(".kpis", 55);
    UI.animate(m);
    logoBox = $("#sLogo") ? UI.upload($("#sLogo"), { max: 512, square: true, empty: "No picture yet", kind: "logo" }) : null;
  }

  /* ==========================================================
     OVERVIEW
     ========================================================== */
  function viewHome() {
    const d = cache.home;
    const cur = org.currency;
    const peak = Math.max(1, ...d.daily.map((x) => x.revenue));

    return `
      <div class="app-head">
        <div><h1>Overview</h1><p>How ${esc(org.name)} is doing.</p></div>
        <button class="btn btn-primary" data-act="new-event">+ New event</button>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="k">Gross sales</div><div class="v">${esc(amount(d.gross, cur))}</div></div>
        <div class="kpi green"><div class="k">Yours after fees</div><div class="v">${esc(amount(d.net, cur))}</div>
          <div class="tiny muted" style="margin-top:3px">after our ${d.fee_pct}%</div></div>
        <div class="kpi"><div class="k">Tickets sold</div><div class="v">${d.tickets_sold}</div></div>
        <div class="kpi"><div class="k">Scanned in</div><div class="v">${d.scanned}</div></div>
        <div class="kpi"><div class="k">Live events</div><div class="v">${d.live_events}<span class="small muted" style="font-size:.95rem"> / ${d.total_events}</span></div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Sales, last 30 days</h3>
          <span class="small muted">${esc(amount(d.daily.reduce((n, x) => n + x.revenue, 0), cur))}</span></div>
        <div style="display:flex;align-items:flex-end;gap:3px;height:120px">
          ${d.daily.map((x) => `<div title="${esc(shortDate(x.d))} · ${esc(amount(x.revenue, cur))}"
             style="flex:1;border-radius:4px 4px 0 0;background:${x.revenue ? "var(--orange)" : "var(--card-2)"};
             height:${Math.max(3, Math.round((x.revenue / peak) * 100))}%"></div>`).join("")}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px" class="tiny muted">
          <span>${esc(shortDate(d.daily[0].d))}</span><span>${esc(shortDate(d.daily[d.daily.length - 1].d))}</span>
        </div>
      </div>

      ${d.by_event.length ? `
      <div class="panel">
        <div class="panel-head"><h3>Where the money came from</h3></div>
        ${d.by_event.map((e) => {
          const top = Math.max(1, ...d.by_event.map((x) => x.revenue));
          return `<div class="bar-row">
            <span class="nm" title="${esc(e.name)}">${esc(e.name)}</span>
            <span class="bar-track"><span class="bar-fill" style="width:${Math.round((e.revenue / top) * 100)}%"></span></span>
            <span class="vl">${esc(amount(e.revenue, cur))}</span></div>`;
        }).join("")}
      </div>` : ""}

      <div class="panel">
        <div class="panel-head"><h3>Latest orders</h3>
          <button class="btn btn-soft btn-sm" data-act="go-orders">See all</button></div>
        ${d.recent.length ? ordersTable(d.recent, true) : `<p class="muted small" style="margin:0">Nothing yet.</p>`}
      </div>`;
  }

  /* ==========================================================
     EVENTS
     ========================================================== */
  function viewEvents() {
    const rows = cache.events;
    return `
      <div class="app-head">
        <div><h1>Events</h1><p>Create it, add tickets, then publish.</p></div>
        <button class="btn btn-primary" data-act="new-event">+ New event</button>
      </div>
      ${!rows.length ? `
        <div class="empty">
          <h3>No events yet</h3>
          <p>Make your first one — you can save it as a draft and publish when you're ready.</p>
          <button class="btn btn-primary" data-act="new-event">Create an event</button>
        </div>`
        : rows.map(eventPanel).join("")}`;
  }

  /* The organisation's picture if it has one, its initials on its brand colour
     if it doesn't. Every avatar in the dashboard goes through here. */
  function orgMark(extra) {
    const logo = UI.safeImage(org.logo);
    return logo
      ? `<div class="org-mark has-img" style="${extra || ""}"><img src="${logo}" alt=""></div>`
      : `<div class="org-mark" style="background:${esc(org.colour)};color:${inkOn(org.colour)};${extra || ""}">${esc(initials(org.name))}</div>`;
  }

  /* An event's poster if it has one, its initials on generated art if it doesn't. */
  function eventMark(e, extra) {
    const img = UI.safeImage(e.image);
    return img
      ? `<div class="org-mark has-img" style="${extra || ""}"><img src="${img}" alt=""></div>`
      : `<div class="org-mark" style="background:${UI.tint(e.name)};${extra || ""}">${esc(initials(e.name))}</div>`;
  }

  function paintPill() {
    $("#orgPill").innerHTML = orgMark() + `
      <div style="min-width:0">
        <div class="nm" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(org.name)}</div>
        <div class="sb">${esc(me.name)}</div>
      </div>`;
  }

  function eventPanel(e) {
    const cur = org.currency;
    const url = location.origin + location.pathname.replace(/[^/]*$/, "") + "event.html?e=" + e.slug;
    return `
      <div class="panel">
        <div class="panel-head">
          <div style="display:flex;gap:14px;align-items:center;min-width:0">
            ${eventMark(e, "width:44px;height:44px;border-radius:12px;font-size:.95rem")}
            <div style="min-width:0">
              <h3 style="margin-bottom:3px">${esc(e.name)}</h3>
              <div class="small muted">${esc(when(e.date))} · ${esc(prettyTime(e.start_time))} · ${esc(e.venue)}, ${esc(e.city)}</div>
            </div>
          </div>
          <div style="display:flex;gap:7px;align-items:center;flex-wrap:wrap">
            <span class="badge ${e.status === "live" ? "live" : ""}">${e.status === "live" ? "Live" : "Draft"}</span>
            <button class="icon-btn" data-act="edit-event" data-id="${e.id}" title="Edit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button>
            <button class="icon-btn danger" data-act="del-event" data-id="${e.id}" title="Delete">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>
          </div>
        </div>

        <div style="display:flex;gap:22px;flex-wrap:wrap;margin-bottom:16px" class="small">
          <span><b>${e.sold}</b> <span class="muted">sold</span></span>
          ${e.capacity ? `<span><b>${Math.max(0, e.capacity - e.sold)}</b> <span class="muted">left of ${e.capacity}</span></span>` : ""}
          <span><b>${esc(amount((e.ticket_types || []).reduce((n, t) => n + t.price * t.sold, 0), cur))}</b> <span class="muted">taken</span></span>
        </div>

        ${e.status !== "live" ? `
          <div class="panel" style="box-shadow:none;margin:0 0 14px;background:var(--amber-soft);border-color:rgba(255,192,70,.45)">
            <b style="display:block;margin-bottom:3px">This event is a draft — nobody can see it yet.</b>
            <span class="small">${(e.ticket_types || []).some((t) => t.active)
              ? `Press <b>Publish</b> below and it goes live on the public site straight away.`
              : `Add a ticket type first — an event can't go on sale with nothing to sell — then press <b>Publish</b>.`}</span>
          </div>` : ""}

        ${!(e.ticket_types || []).length ? `
          <div class="small muted" style="padding:10px 0">No ticket types yet.</div>` : ""}

        ${(e.ticket_types || []).map((t) => `
          <div class="tt">
            <div class="tt-top">
              <div style="min-width:0">
                <h4>${esc(t.name)} ${!t.active ? `<span class="badge">Off</span>` : ""}</h4>
                ${t.blurb ? `<div class="small muted">${esc(t.blurb)}</div>` : ""}
                <div class="small" style="margin-top:5px">
                  <b>${esc(money(t.price, cur))}</b>
                  <span class="muted"> · ${t.sold} sold${t.quantity ? " of " + t.quantity : " · unlimited"}</span>
                </div>
              </div>
              <div class="row-actions">
                <button class="icon-btn" data-act="edit-tt" data-id="${t.id}" data-ev="${e.id}" title="Edit">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button>
                <button class="icon-btn danger" data-act="del-tt" data-id="${t.id}" title="Remove">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg></button>
              </div>
            </div>
          </div>`).join("")}

        <div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:14px">
          <button class="btn ${e.status !== "live" && !(e.ticket_types || []).some((t) => t.active)
            ? "btn-primary" : "btn-soft"} btn-sm" data-act="new-tt" data-ev="${e.id}">+ Add ticket type</button>
          <button class="btn ${e.status !== "live" && (e.ticket_types || []).some((t) => t.active)
            ? "btn-green" : "btn-soft"} btn-sm" data-act="toggle-live" data-id="${e.id}">
            ${e.status === "live" ? "Unpublish" : "Publish so people can buy"}</button>
          ${e.status === "live" ? `<button class="btn btn-ghost btn-sm" data-act="copy-link" data-url="${esc(url)}">Copy share link</button>` : ""}
        </div>
      </div>`;
  }

  /* ==========================================================
     ORDERS
     ========================================================== */
  function viewOrders() {
    const rows = cache.orders;
    return `
      <div class="app-head">
        <div><h1>Orders</h1><p>Everyone who has bought from you.</p></div>
        <button class="btn btn-soft" data-act="export">Export CSV</button>
      </div>
      <div style="display:flex;gap:11px;flex-wrap:wrap;margin-bottom:20px">
        <div class="search-bar" style="flex:1;min-width:230px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
          <input id="oSearch" type="search" placeholder="Name, email, phone or reference" value="${esc(orderSearch)}">
        </div>
        <select id="oEvent" style="width:auto;min-width:180px">
          <option value="">All events</option>
          ${(cache.events || []).map((e) => `<option value="${e.id}" ${e.id === orderEvent ? "selected" : ""}>${esc(e.name)}</option>`).join("")}
        </select>
      </div>
      ${rows.length ? ordersTable(rows) : `<div class="empty"><h3>Nothing here</h3>
        <p>${orderSearch ? "No orders match that search." : "Orders appear the moment someone buys."}</p></div>`}`;
  }

  function ordersTable(rows, compact) {
    const cur = org.currency;
    return `<div class="table-wrap"><table>
      <thead><tr>
        <th>Reference</th><th>Buyer</th>${compact ? "" : "<th>Event</th>"}
        <th>Tickets</th><th>Amount</th><th>State</th><th>When</th>
      </tr></thead>
      <tbody>${rows.map((o) => `
        <tr>
          <td><span class="code">${esc(o.reference)}</span></td>
          <td><div style="font-weight:600">${esc(o.buyer_name)}</div>
              <div class="tiny muted">${esc(o.buyer_email)}</div></td>
          ${compact ? "" : `<td class="small">${esc(o.event_name || "—")}</td>`}
          <td class="small">${o.items.map((i) => esc(i.name) + " × " + i.quantity).join("<br>")}</td>
          <td><b>${esc(amount(o.total, cur))}</b></td>
          <td>${o.status === "paid"
              ? `<span class="badge live">Paid</span>`
              : o.status === "pending"
                ? `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                     <span class="badge">Awaiting payment</span>
                     ${compact ? "" : `<button class="btn btn-soft btn-sm" data-act="mark-paid" data-ref="${esc(o.reference)}">Payment received</button>`}
                   </div>`
                : `<span class="badge">${esc(o.status)}</span>`}</td>
          <td class="small muted">${esc(ago(o.created_at))}</td>
        </tr>`).join("")}</tbody></table></div>`;
  }

  /* ==========================================================
     DOOR
     ========================================================== */
  function viewGate() {
    return `
      <div class="app-head">
        <div><h1>Gate</h1><p>Check a ticket by code, or cancel one that shouldn't work.</p></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Check a ticket</h3></div>
        <p class="small muted" style="margin:0 0 14px">
          On the night, most people just point a phone camera at the QR — it opens the gate page by itself.
          This is for when a code has to be typed in by hand.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <input id="dCode" placeholder="GE-XXXXXXXX" style="flex:1;min-width:190px;text-transform:uppercase">
          <button class="btn btn-primary" data-act="check">Check</button>
        </div>
        <div id="dOut" style="margin-top:16px"></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Cancel a ticket</h3></div>
        <p class="small muted" style="margin:0 0 14px">
          Stops it working at the gate but keeps the order and the money on record. Use this rather than
          deleting anything.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <input id="vCode" placeholder="GE-XXXXXXXX" style="flex:1;min-width:190px;text-transform:uppercase">
          <button class="btn btn-danger" data-act="void">Cancel it</button>
        </div>
      </div>`;
  }

  /* ==========================================================
     PAYOUTS
     ========================================================== */
  function viewPayouts() {
    const { rows, fee_pct } = cache.payouts;
    const cur = org.currency;
    const ready = rows.filter((r) => r.state === "ready").reduce((n, r) => n + r.net, 0);

    const label = { waiting: ["Event hasn't happened", ""], clearing: ["Clearing", "warn"], ready: ["Ready", "ok"] };

    return `
      <div class="app-head">
        <div><h1>Payouts</h1><p>Money lands 24 hours after an event finishes.</p></div>
        <button class="btn btn-primary" data-act="withdraw">Withdraw ${esc(amount(ready, cur))}</button>
      </div>

      <div class="kpis">
        <div class="kpi green"><div class="k">Ready to withdraw</div><div class="v">${esc(amount(ready, cur))}</div></div>
        <div class="kpi"><div class="k">Still clearing</div>
          <div class="v">${esc(amount(rows.filter((r) => r.state === "clearing").reduce((n, r) => n + r.net, 0), cur))}</div></div>
        <div class="kpi"><div class="k">Upcoming events</div>
          <div class="v">${esc(amount(rows.filter((r) => r.state === "waiting").reduce((n, r) => n + r.net, 0), cur))}</div></div>
      </div>

      ${rows.length ? `<div class="panel"><div class="table-wrap"><table>
        <thead><tr><th>Event</th><th>Date</th><th>Gross</th><th>Fee (${fee_pct}%)</th><th>You get</th><th>State</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td style="font-weight:600">${esc(r.event)}</td>
          <td class="small muted">${esc(shortDate(r.date))}</td>
          <td>${esc(amount(r.gross, cur))}</td>
          <td class="small muted">−${esc(amount(r.fee, cur))}</td>
          <td><b>${esc(amount(r.net, cur))}</b></td>
          <td><span class="badge ${label[r.state][1]}">${label[r.state][0]}</span></td>
        </tr>`).join("")}</tbody></table></div></div>`
        : `<div class="empty"><h3>No money in yet</h3><p>As soon as a ticket sells, it shows up here with the fee broken out.</p></div>`}

      <div class="panel">
        <div class="panel-head"><h3>Where it goes</h3></div>
        <div class="field"><label>M-Pesa number for payouts</label>
          <input id="payoutTill" value="${esc(org.payout_till || "")}" placeholder="07XX XXX XXX — the number that receives the money"></div>
        <p class="tiny muted" style="margin:-6px 0 14px">Must be registered to ${esc(org.name)} or to whoever signs for it.</p>
        <button class="btn btn-soft btn-sm" data-act="save-till">Save number</button>
      </div>`;
  }

  /* ==========================================================
     SETTINGS
     ========================================================== */
  function viewSettings() {
    return `
      <div class="app-head"><div><h1>Settings</h1><p>Your organisation as buyers see it.</p></div></div>

      <div class="panel">
        <div class="panel-head"><h3>Organisation</h3></div>
        <div class="field"><label>Profile picture</label>
          ${UI.uploadBox("sLogo", org.logo || "", { round: true,
            hint: "Square works best. It shows on your events and beside your name here." })}</div>
        <div class="field"><label>Name</label><input id="sName" value="${esc(org.name)}"></div>
        <div class="row-2">
          <div class="field"><label>Contact email</label><input id="sEmail" type="email" value="${esc(org.email || "")}"></div>
          <div class="field"><label>Phone</label><input id="sPhone" value="${esc(org.phone || "")}"></div>
        </div>
        <div class="row-2">
          <div class="field"><label>Currency</label>
            <select id="sCur">${["KES","USD","GBP","EUR","TZS","UGX"].map((c) => `<option ${c === org.currency ? "selected" : ""}>${c}</option>`).join("")}</select></div>
          <div class="field"><label>Brand colour</label>
            <input id="sColour" type="color" value="${esc(org.colour)}" style="height:44px;padding:5px"></div>
        </div>
        <button class="btn btn-primary btn-sm" data-act="save-org">Save changes</button>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Your team</h3></div>
        <p class="small muted" style="margin:0 0 14px">
          Gate staff get a login that scans tickets and sees the guest list — never your payouts or your
          bank details.</p>
        <div style="display:flex;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line)">
          <div class="org-mark" style="background:${esc(org.colour)};color:${inkOn(org.colour)}">${esc(initials(me.name))}</div>
          <div style="flex:1"><div style="font-weight:600">${esc(me.name)}</div>
            <div class="tiny muted">${esc(me.email)}</div></div>
          <span class="badge live">Owner</span>
        </div>
        <button class="btn btn-soft btn-sm" style="margin-top:14px" data-act="soon">+ Invite someone</button>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Taking payment</h3></div>
        <p class="small muted" style="margin:0 0 14px">
          Buyers pay by M-Pesa. The STK push goes out from our paybill, so you never hold a Daraja account
          yourself — and you never see a customer's PIN. We take ${cacheFee()}% of each ticket sold and send you
          the rest 24 hours after the event.</p>
        <div class="mpesa-note">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.7 2.6L16 9.5"/></svg>
          <div><b>M-Pesa is on</b><br><span class="muted">Nothing for you to set up. Just add the number the money should land on, under Payouts.</span></div>
        </div>
      </div>`;
  }

  const cacheFee = () => (cache.home ? cache.home.fee_pct : 3.5);

  /* ==========================================================
     WIRING
     ========================================================== */
  function wire() {
    $$("#main [data-act]").forEach((el) => (el.onclick = () => handle(el.dataset.act, el.dataset)));

    const s = $("#oSearch");
    if (s) {
      let t;
      s.addEventListener("input", () => {
        clearTimeout(t);
        t = setTimeout(async () => {
          orderSearch = s.value.trim();
          cache.orders = await PL.myOrders({ q: orderSearch, event_id: orderEvent });
          render();
          const again = $("#oSearch");
          if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
        }, 220);
      });
    }
    const oe = $("#oEvent");
    if (oe) oe.onchange = async () => {
      orderEvent = oe.value;
      cache.orders = await PL.myOrders({ q: orderSearch, event_id: orderEvent });
      render();
    };
  }

  async function handle(act, d) {
    try {
      if (act === "new-event")  return eventModal(null);
      if (act === "edit-event") return eventModal(cache.events.find((e) => e.id === d.id));
      if (act === "go-orders")  return go("orders");
      if (act === "soon")       return toast("Team invites are on the way.", "");

      if (act === "del-event") {
        if (!confirm("Delete this event for good?")) return;
        await PL.deleteEvent(d.id);
        toast("Deleted.", "ok");
        return go("events");
      }
      if (act === "toggle-live") {
        const e = cache.events.find((x) => x.id === d.id);
        if (e.status !== "live" && !(e.ticket_types || []).length)
          return toast("Add a ticket type before you publish.", "err");
        await PL.saveEvent({ id: e.id, status: e.status === "live" ? "draft" : "live" });
        toast(e.status === "live" ? "Unpublished." : "Live — share the link.", "ok");
        return go("events");
      }
      if (act === "copy-link") {
        try { await navigator.clipboard.writeText(d.url); toast("Link copied.", "ok"); }
        catch (e) { prompt("Copy this link:", d.url); }
        return;
      }

      if (act === "new-tt")  return ttModal(null, d.ev);
      if (act === "edit-tt") {
        const ev = cache.events.find((e) => e.id === d.ev);
        return ttModal(ev.ticket_types.find((t) => t.id === d.id), d.ev);
      }
      if (act === "del-tt") {
        if (!confirm("Remove this ticket type?")) return;
        await PL.deleteTicketType(d.id);
        toast("Removed.", "ok");
        return go("events");
      }

      if (act === "check") {
        const code = $("#dCode").value.trim().toUpperCase();
        if (!code) return;
        const rows = await PL.myOrders({ q: "" });
        let hit = null;
        rows.forEach((o) => (o.tickets || []).forEach((t) => { if (t.code.toUpperCase() === code) hit = { t, o }; }));
        $("#dOut").innerHTML = !hit
          ? `<div class="panel" style="box-shadow:none;background:var(--red-soft);border-color:rgba(255,68,85,.4)">
               <b style="color:var(--red)">No ticket of yours with that code.</b></div>`
          : `<div class="panel" style="box-shadow:none;background:${hit.t.status === "valid" ? "var(--green-soft);border-color:rgba(47,211,106,.42)" : "var(--amber-soft);border-color:rgba(255,192,70,.42)"}">
               <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
                 <div>
                   <b>${esc(hit.o.buyer_name)}</b> — ${esc(hit.t.type_name)}<br>
                   <span class="small muted">${esc(hit.o.event_name || "")}</span>
                 </div>
                 <span class="badge ${hit.t.status === "valid" ? "ok" : hit.t.status === "used" ? "warn" : "bad"}">
                   ${hit.t.status === "valid" ? "Valid" : hit.t.status === "used" ? "Already scanned" : "Cancelled"}</span>
               </div>
             </div>`;
        return;
      }

      if (act === "void") {
        const code = $("#vCode").value.trim();
        if (!code) return;
        if (!confirm("Cancel ticket " + code.toUpperCase() + "? It will stop working at the gate.")) return;
        const r = await PL.voidTicket(code);
        $("#vCode").value = "";
        return toast(r.code + " cancelled.", "ok");
      }

      if (act === "withdraw")
        return toast("Withdrawals can only be made 24 hours after the event.", "");

      if (act === "save-till") {
        org = await PL.saveOrg({ payout_till: $("#payoutTill").value.trim() });
        return toast("M-Pesa number saved.", "ok");
      }

      if (act === "save-org") {
        org = await PL.saveOrg({
          logo: logoBox ? logoBox.value() : undefined,
          name: $("#sName").value.trim() || org.name,
          email: $("#sEmail").value.trim(),
          phone: $("#sPhone").value.trim(),
          currency: $("#sCur").value,
          colour: $("#sColour").value
        });
        paintPill();
        toast("Saved.", "ok");
        return render();
      }

      /* Confirming the money arrived is what issues the tickets — and the
         database, not this page, is where that happens and where it is checked
         that the caller owns the order. When Daraja is wired up, the M-Pesa
         callback calls the very same function and this button goes away. */
      if (act === "mark-paid") {
        const ref = d.ref;
        if (!confirm("Confirm that payment for " + ref + " has arrived?\n\nThis issues the tickets and emails cannot be undone.")) return;
        try {
          const r = await PL.markPaid(ref);
          toast(r.already ? "That one was already paid." : "Tickets issued for " + ref + ".", "ok");
        } catch (e) { return toast(e.message, "err"); }
        cache.orders = await PL.myOrders({ q: orderSearch, event_id: orderEvent });
        return render();
      }

      if (act === "export") {
        const rows = [["Reference", "Buyer", "Email", "Phone", "Event", "Tickets", "Amount", "When"]];
        cache.orders.forEach((o) => rows.push([
          o.reference, o.buyer_name, o.buyer_email, o.buyer_phone, o.event_name || "",
          o.items.map((i) => `${i.name} x${i.quantity}`).join(" | "), o.total, o.created_at
        ]));
        const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
        a.download = "go-events-kenya-orders.csv";
        a.click();
        return toast("Exported.", "ok");
      }
    } catch (e) {
      toast(e.message, "err");
    }
  }

  /* ---------- modals ---------- */
  function modal(title, body, footer) {
    $("#modalHost").innerHTML = `
      <div class="backdrop" id="bd">
        <div class="modal">
          <div class="modal-head"><h3>${esc(title)}</h3><button class="x" data-close>&times;</button></div>
          <div class="modal-body">${body}</div>
          <div class="modal-foot">${footer}</div>
        </div>
      </div>`;
    const close = () => ($("#modalHost").innerHTML = "");
    $$("[data-close]").forEach((b) => (b.onclick = close));
    $("#bd").addEventListener("click", (e) => { if (e.target.id === "bd") close(); });
    return close;
  }

  function eventModal(e) {
    const v = e || { name: "", tagline: "", about: "", category: "Music", venue: "", city: "",
                     date: "", start_time: "19:00", end_time: "" };
    const cats = ["Music", "Festival", "Comedy", "Sport", "Theatre", "Food & drink", "Conference", "Community", "Other"];

    const close = modal(e ? "Edit event" : "New event", `
      <div class="field"><label>Event name</label><input id="eName" value="${esc(v.name)}" placeholder="Sundowner Sessions Vol. 9"></div>
      <div class="field"><label>One-line hook <span class="muted small">(optional)</span></label>
        <input id="eTag" value="${esc(v.tagline || "")}" placeholder="Afro house on the sand, golden hour till late"></div>
      <div class="row-2">
        <div class="field"><label>Date</label><input id="eDate" type="date" value="${esc(v.date)}"></div>
        <div class="field"><label>Category</label>
          <select id="eCat">${cats.map((c) => `<option ${c === v.category ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      </div>
      <div class="row-2">
        <div class="field"><label>Starts</label><input id="eStart" type="time" value="${esc(v.start_time || "")}"></div>
        <div class="field"><label>Ends <span class="muted small">(optional)</span></label><input id="eEnd" type="time" value="${esc(v.end_time || "")}"></div>
      </div>
      <div class="row-2">
        <div class="field"><label>Venue</label><input id="eVenue" value="${esc(v.venue)}" placeholder="Nyali Beach Club"></div>
        <div class="field"><label>Town or city</label><input id="eCity" value="${esc(v.city)}" placeholder="Mombasa"></div>
      </div>
      <div class="field"><label>About <span class="muted small">(optional)</span></label>
        <textarea id="eAbout" placeholder="What should someone know before they buy?">${esc(v.about || "")}</textarea></div>
      <div class="field"><label>Poster <span class="muted small">(optional)</span></label>
        ${UI.uploadBox("ePoster", v.image || "", { hint: "Landscape works best — it sits at the top of your event page." })}</div>`,
      `<button class="btn btn-soft" data-close>Cancel</button>
       <button class="btn btn-primary" id="eSave">${e ? "Save changes" : "Create event"}</button>`);

    const poster = UI.upload($("#ePoster"), { max: 1400, empty: "No poster yet", kind: "poster" });

    $("#eName").focus();
    $("#eSave").onclick = async () => {
      const btn = $("#eSave");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        await PL.saveEvent({
          id: e ? e.id : undefined,
          name: $("#eName").value.trim(), tagline: $("#eTag").value.trim(),
          about: $("#eAbout").value.trim(), category: $("#eCat").value,
          venue: $("#eVenue").value.trim(), city: $("#eCity").value.trim(),
          date: $("#eDate").value, start_time: $("#eStart").value, end_time: $("#eEnd").value,
          image: poster.value()
        });
        close();
        toast(e ? "Saved." : "Event created — now add a ticket type.", "ok");
        go("events");
      } catch (err) {
        btn.disabled = false; btn.textContent = "Try again";
        toast(err.message, "err");
      }
    };
  }

  function ttModal(t, eventId) {
    const v = t || { name: "", blurb: "", price: "", quantity: "", active: true };
    const close = modal(t ? "Edit ticket type" : "New ticket type", `
      <div class="field"><label>Name</label><input id="tName" value="${esc(v.name)}" placeholder="Early Bird"></div>
      <div class="field"><label>Description <span class="muted small">(optional)</span></label>
        <input id="tBlurb" value="${esc(v.blurb || "")}" placeholder="Limited release — entry only"></div>
      <div class="row-2">
        <div class="field"><label>Price (${esc(org.currency)})</label>
          <input id="tPrice" inputmode="decimal" value="${v.price === "" ? "" : esc(String(v.price))}" placeholder="0 for a free ticket"></div>
        <div class="field"><label>How many exist</label>
          <input id="tQty" inputmode="numeric" value="${v.quantity === "" ? "" : esc(String(v.quantity))}" placeholder="0 = unlimited"></div>
      </div>
      <label style="display:flex;gap:10px;align-items:center;cursor:pointer;margin-top:4px">
        <input type="checkbox" id="tActive" ${v.active ? "checked" : ""} style="width:auto">
        <span class="small">On sale — untick to hide it from the public page</span>
      </label>
      ${t && t.sold ? `<p class="tiny muted" style="margin:14px 0 0">${t.sold} of these have sold. You can change the price, but it won't change what people already paid.</p>` : ""}`,
      `<button class="btn btn-soft" data-close>Cancel</button>
       <button class="btn btn-primary" id="tSave">${t ? "Save" : "Add ticket type"}</button>`);

    $("#tName").focus();
    $("#tSave").onclick = async () => {
      const btn = $("#tSave");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        await PL.saveTicketType({
          id: t ? t.id : undefined, event_id: eventId,
          name: $("#tName").value.trim(), blurb: $("#tBlurb").value.trim(),
          price: Number(String($("#tPrice").value).replace(/[^\d.]/g, "")) || 0,
          quantity: Number(String($("#tQty").value).replace(/[^\d]/g, "")) || 0,
          active: $("#tActive").checked
        });
        close();
        toast("Saved.", "ok");
        go("events");
      } catch (err) {
        btn.disabled = false; btn.textContent = "Try again";
        toast(err.message, "err");
      }
    };
  }
})();
