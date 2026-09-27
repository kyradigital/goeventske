/* ============================================================
   Go Events Kenya — the organiser's dashboard
   ============================================================ */
(function () {
  const { $, $$, esc, money, amount, when, shortDate, prettyTime, ago, toast, qs, initials, inkOn } = UI;

  let me = null, org = null, tab = "home", myRole = "owner";
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
        ${signup ? "Set up your organisation and start selling straight away."
                 : "Sign in with your organisation's sign-in name."}</p>

      ${signup ? `
        <div class="field"><label>Organisation name</label>
          <input id="aOrg" placeholder="e.g. Nyali Beach Club" autocomplete="organization"></div>` : ""}

      <div class="field" style="margin-bottom:${signup ? "6px" : "16px"}">
        <label for="aHandle">Sign-in name</label>
        <div class="handle-field">
          <input id="aHandle" placeholder="nyalibeachclub" autocomplete="username"
                 autocapitalize="none" autocorrect="off" spellcheck="false" inputmode="text">
        </div>
        ${signup ? `<p class="tiny muted" id="aHandleNote" style="margin:6px 0 16px">
          Lowercase letters and numbers, no spaces. This is what you'll sign in with.</p>` : ""}
      </div>

      ${signup ? `
        <div class="field"><label>Your name</label>
          <input id="aName" placeholder="Jane Mwangi" autocomplete="name"></div>
        <div class="field"><label>Phone <span class="muted small">(optional)</span></label>
          <input id="aPhone" inputmode="tel" placeholder="07XX XXX XXX" autocomplete="tel"></div>
        <div class="field"><label>What kind of events do you put on? <span class="muted small">(optional)</span></label>
          <textarea id="aNote" rows="3" placeholder="A line or two — the sort of events, roughly how often, where."></textarea></div>` : ""}

      <div class="field"><label>Password</label>
        <input id="aPass" type="password" placeholder="${signup ? "At least 8 characters" : "••••••••"}"
               autocomplete="${signup ? "new-password" : "current-password"}"></div>

      <button class="btn btn-primary btn-block btn-lg" id="aGo">${signup ? "Create account" : "Sign in"}</button>

      <p class="auth-switch">
        ${signup ? "Already selling with us?" : "Want to sell tickets?"}
        <a id="aSwitch">${signup ? "Sign in" : "Create an account"}</a>
      </p>`;

    $("#aGo").onclick = () => (signup ? doSignUp() : doSignIn());
    $("#aSwitch").onclick = () => authView(signup ? "signin" : "signup");
    $("#aPass").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#aGo").click(); });

    const handle = $("#aHandle");
    /* the field only ever holds what a handle may hold */
    handle.addEventListener("input", () => {
      const clean = handle.value.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (clean !== handle.value) handle.value = clean;
      if (signup) checkHandle();
    });
    handle.focus();

    if (signup) {
      /* suggest a handle from the organisation name, until they touch it */
      let touched = false;
      handle.addEventListener("input", () => { touched = true; });
      $("#aOrg").addEventListener("input", () => {
        if (touched) return;
        handle.value = $("#aOrg").value.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 30);
        checkHandle();
      });
    }
  }

  let handleTimer;
  function checkHandle() {
    const note = $("#aHandleNote"), value = $("#aHandle").value;
    if (!note) return;
    clearTimeout(handleTimer);
    if (value.length < 3) {
      note.textContent = "Lowercase letters and numbers, no spaces. This is what you'll sign in with.";
      note.style.color = "var(--muted)";
      return;
    }
    handleTimer = setTimeout(async () => {
      let free = false;
      try { free = await PL.handleFree(value); } catch (e) { return; }
      note.textContent = free ? `“${value}” is free` : `“${value}” is taken — try another`;
      note.style.color = free ? "var(--green)" : "var(--red)";
    }, 350);
  }

  async function doSignIn() {
    const btn = $("#aGo");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const r = await PL.signIn($("#aHandle").value, $("#aPass").value);
      me = r.user; org = r.org;
      if (r.platform_admin) return platformBoot();
      myRole = (r.user && r.user.role) || "owner";
      PL.logAction("organiser.signin", org && org.name);
      enter();
    } catch (e) {
      /* the account is fine, it just has no organisation on it yet */
      if (e.message === "NEEDS_ORG") return setupView();
      btn.disabled = false; btn.textContent = "Sign in";
      toast(e.message, "err");
    }
  }

  async function doSignUp() {
    const btn = $("#aGo");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      await PL.signUp({
        org_name: $("#aOrg").value, handle: $("#aHandle").value,
        name: $("#aName").value, password: $("#aPass").value
      });
      /* the account exists; give it its organisation and let them in */
      await PL.createOrg({
        org_name: $("#aOrg").value, handle: $("#aHandle").value,
        name: $("#aName").value,
        phone: $("#aPhone") ? $("#aPhone").value : "",
        note: $("#aNote") ? $("#aNote").value : ""
      });
      const r = await PL.me();
      me = r.user; org = r.org;
      PL.logAction("organiser.signin", org && org.name);
      enter();
    } catch (e) {
      btn.disabled = false; btn.textContent = "Create account";
      toast(e.message, "err");
    }
  }

  /* Door staff see one tab. Hiding the rest is a courtesy — the database
     refuses them the underlying rows either way. */
  function trimNavForRole() {
    if (myRole !== "gate") return;
    $$("#nav button").forEach((b) => {
      if (b.dataset.tab !== "gate") b.remove();
    });
    tab = "gate";
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
    trimNavForRole();
    $$("#nav button").forEach((b) => (b.onclick = () => go(b.dataset.tab)));
    go(myRole === "gate" ? "gate" : "home");
  }

  /* start: already signed in? */
  (async function boot() {
    try {
      const r = await PL.me();
      if (r.platform_admin) { me = r.user; return platformBoot(); }
      me = r.user; org = r.org;
      myRole = (r.user && r.user.role) || "owner";
      enter();
    } catch (e) {
      /* Signed in, but no organisation: they are waiting on a decision, were
         turned down, or never finished applying. */
      if (e.message === "NEEDS_ORG") return setupView();
      authView(qs("signup") ? "signup" : "signin");
    }
  })();

  /* An account that exists but has no organisation yet — someone who
     signed up before this change, or whose sign-up was interrupted.
     They fill this in and they are straight in; nobody approves it. */
  function setupView(msg) {
    $("#authCard").innerHTML = `
      <div style="text-align:center;margin-bottom:20px">${UI.LOGO}</div>
      <h2>Set up your organisation</h2>
      <p class="muted small" style="margin:0 0 20px">
        Your account is ready. Give it a name and you can start selling right away.</p>
      <div class="field"><label>Organisation name</label>
        <input id="oName" placeholder="e.g. Nyali Beach Club" autocomplete="organization"></div>
      <div class="field"><label>Your name</label>
        <input id="oPerson" placeholder="Jane Mwangi" autocomplete="name"></div>
      <div class="field"><label>Phone <span class="muted small">(optional)</span></label>
        <input id="oPhone" inputmode="tel" placeholder="07XX XXX XXX" autocomplete="tel"></div>
      ${msg ? `<p class="tiny" style="color:var(--red);margin:0 0 12px">${esc(msg)}</p>` : ""}
      <button class="btn btn-primary btn-block" id="oGo">Create organisation</button>
      <p class="auth-switch"><a id="wOut">Sign out instead</a></p>`;

    $("#oName").focus();
    $("#wOut").onclick = async () => { await PL.signOut(); location.reload(); };
    $("#oGo").onclick = async () => {
      const btn = $("#oGo");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        await PL.createOrg({
          org_name: $("#oName").value, name: $("#oPerson").value,
          phone: $("#oPhone").value
        });
        const r = await PL.me();
        me = r.user; org = r.org;
        enter();
      } catch (e) {
        setupView(e.message);
      }
    };
  }

  $("#signOut").onclick = async () => {
    await PL.signOut();
    location.href = "index.html";
  };

  $$("#nav button").forEach((b) => (b.onclick = () => go(b.dataset.tab)));

  async function go(t) {
    if (tab === "gate" && t !== "gate") stopScan();
    tab = t;
    $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
    $("#main").innerHTML = `<div class="panel center"><span class="spinner"></span></div>`;
    try {
      if (t === "home")     cache.home = await PL.dashboard();
      if (t === "events")   cache.events = await PL.myEvents();
      if (t === "orders")   cache.orders = await PL.myOrders({ q: orderSearch, event_id: orderEvent });
      if (t === "gate")     cache.events = await PL.myEvents();
    } catch (e) { return toast(e.message, "err"); }
    render();
  }

  function render() {
    const m = $("#main");
    if (tab === "home")     m.innerHTML = viewHome();
    if (tab === "events")   m.innerHTML = viewEvents();
    if (tab === "orders")   m.innerHTML = viewOrders();
    if (tab === "gate")     m.innerHTML = viewGate();
    if (tab === "settings") m.innerHTML = viewSettings();
    wire();
    makeReadOnly();
    guestBar();
    if (tab === "settings" && $("#teamList")) paintTeam();
    UI.stagger(".kpis", 55);
    UI.animate(m);
    logoBox = (!watching && $("#sLogo"))
      ? UI.upload($("#sLogo"), { max: 512, square: true, empty: "No picture yet", kind: "logo" }) : null;
  }


  /* ==========================================================
     THE PLATFORM OWNER'S VIEW

     Everything here is fetched by functions that refuse anyone
     not in platform_admins, so an organiser opening this page
     gets an error rather than a page full of other people's
     money.
     ========================================================== */
  let pTab = "overview", pCache = {};

  /* The organiser sidebar is written into the page; the platform view
     replaces it, so keep a copy to put back. */
  let orgNavHTML = null;

  /* the organisation the owner is currently looking at, or null */
  let watching = null;

  async function platformBoot(returning) {
    if (orgNavHTML === null) orgNavHTML = $("#nav").innerHTML;
    $("#authScreen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    document.body.classList.add("platform");
    $("#orgPill").innerHTML = `
      <div class="org-mark" style="background:var(--ink);color:#fff">GE</div>
      <div style="min-width:0">
        <div class="nm">Go Events Kenya</div>
        <div class="sb">${esc(me.name || "Platform")}</div>
      </div>`;
    $("#nav").innerHTML = [
      ["overview", "Overview"], ["orgs", "Organisers"],
      ["activity", "Activity"],
    ].map(([k, label]) => `<button data-ptab="${k}">${label}</button>`).join("");
    $$("#nav button").forEach((b) => (b.onclick = () => pGo(b.dataset.ptab)));
    if (!returning) await PL.logAction("platform.signin", "Signed in to the platform view");
    pGo(returning ? "orgs" : "overview");
  }

  async function pGo(t) {
    pTab = t;
    $$("#nav button").forEach((b) => b.classList.toggle("active", b.dataset.ptab === t));
    $("#main").innerHTML = `<div class="panel center"><span class="spinner"></span></div>`;
    try {
      if (t === "overview") pCache.overview = await PL.adminOverview();
      if (t === "orgs")     pCache.orgs     = await PL.adminOrgs();
      if (t === "activity") pCache.activity = await PL.adminActivity(150);
    } catch (e) { return toast(e.message, "err"); }
    pRender();
  }

  const ksh = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");

  function pRender() {
    const m = $("#main");
    if (pTab === "overview") m.innerHTML = pOverview();
    if (pTab === "orgs")     m.innerHTML = pOrgs();
    if (pTab === "activity") m.innerHTML = pActivity();
    $$("#main [data-pact]").forEach((el) => (el.onclick = () => pHandle(el.dataset.pact, el.dataset)));
    if (pTab === "orgs") {
      const box = $("#orgQ");
      if (box) {
        let t;
        box.oninput = () => { clearTimeout(t); t = setTimeout(() => {
          orgSearch = box.value.trim(); pRender();
          const again = $("#orgQ"); if (again) { again.focus(); again.selectionStart = again.value.length; }
        }, 220); };
      }
      $$("#orgSort button").forEach((b) => (b.onclick = () => { orgSort = b.dataset.sort; pRender(); }));
    }
    UI.stagger(".kpis", 55);
    UI.animate(m);
  }

  function pOverview() {
    const d = pCache.overview;
    const peak = Math.max(1, ...d.daily.map((x) => x.revenue));
    return `
      <div class="app-head">
        <div><h1>Everything</h1><p>Across every organiser on Go Events Kenya.</p></div>
      </div>

      <div class="kpis">
        <div class="kpi"><div class="k">Money through the platform</div>
          <div class="v" data-count>${esc(ksh(d.gross))}</div></div>
        <div class="kpi green"><div class="k">Yours, after Paystack</div>
          <div class="v" data-count>${esc(ksh(d.platform_net))}</div>
          <div class="tiny muted" style="margin-top:3px">our fee minus their ${esc(d.psp_fee_pct)}%</div></div>
        <div class="kpi"><div class="k">Organisers</div><div class="v" data-count>${d.orgs}</div></div>
        <div class="kpi"><div class="k">Tickets issued</div><div class="v" data-count>${d.tickets}</div></div>
        <div class="kpi"><div class="k">Scanned in</div><div class="v" data-count>${d.scanned}</div></div>
        <div class="kpi"><div class="k">Buyers</div><div class="v" data-count>${d.buyers}</div></div>
        <div class="kpi"><div class="k">Live events</div>
          <div class="v">${d.live_events}<span class="small muted" style="font-size:.95rem"> / ${d.events}</span></div></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Where the money goes</h3></div>
        <div class="split-bar">
          <span style="flex:${Math.max(1, d.organiser_share)};background:var(--line-2)" title="Organisers"></span>
          <span style="flex:${Math.max(1, d.psp_cost)};background:var(--red)" title="Paystack"></span>
          <span style="flex:${Math.max(1, d.platform_net)};background:var(--green)" title="You"></span>
        </div>
        <table class="plain">
          <tr><td>Buyers paid</td><td class="num"><b>${esc(ksh(d.gross))}</b></td></tr>
          <tr><td><span class="sw" style="background:var(--line-2)"></span>Organisers keep</td>
              <td class="num">${esc(ksh(d.organiser_share))}</td></tr>
          <tr><td><span class="sw" style="background:var(--red)"></span>Paystack keeps (${esc(d.psp_fee_pct)}%)</td>
              <td class="num">−${esc(ksh(d.psp_cost))}</td></tr>
          <tr><td>Our 10%</td><td class="num">${esc(ksh(d.platform_fee))}</td></tr>
          <tr class="total"><td><span class="sw" style="background:var(--green)"></span><b>Yours to keep</b></td>
              <td class="num"><b>${esc(ksh(d.platform_net))}</b></td></tr>
        </table>
        <p class="tiny muted" style="margin:12px 0 0">
          Paystack's cut is set to ${esc(d.psp_fee_pct)}% — check your own rate with them and tell me if it differs.</p>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Last 30 days</h3>
          <span class="small muted">${esc(ksh(d.daily.reduce((n, x) => n + x.revenue, 0)))}</span></div>
        <div style="display:flex;align-items:flex-end;gap:3px;height:120px">
          ${d.daily.map((x) => `<div title="${esc(shortDate(x.d))} · ${esc(ksh(x.revenue))}"
             style="flex:1;border-radius:4px 4px 0 0;background:${x.revenue ? "var(--orange)" : "var(--card-2)"};
             height:${Math.max(3, Math.round((x.revenue / peak) * 100))}%"></div>`).join("")}
        </div>
      </div>`;
  }

  /* ==========================================================
     ORGANISERS

     A panel each was unreadable past three of them: you had to
     scroll to compare anyone. This is a table — one line per
     organisation, sortable, with the money in aligned columns so
     the biggest earner is obvious at a glance. Opening a row
     shows everything else about them.
     ========================================================== */
  let orgSort = "gross", orgSearch = "";

  function pOrgs() {
    const all = pCache.orgs || [];
    if (!all.length) return `<div class="app-head"><div><h1>Organisers</h1></div></div>
      <div class="empty"><h3>Nobody yet</h3><p>Organisations appear here as people sign up.</p></div>`;

    const q = orgSearch.toLowerCase();
    const rows = all.filter((o) => !q ||
      [o.name, o.handle, o.owner, o.email].some((v) => String(v || "").toLowerCase().includes(q)));

    const KEY = {
      gross:  (a, b) => b.gross - a.gross,
      fee:    (a, b) => b.our_fee - a.our_fee,
      tickets:(a, b) => b.tickets - a.tickets,
      events: (a, b) => b.events - a.events,
      newest: (a, b) => new Date(b.created_at) - new Date(a.created_at),
      name:   (a, b) => String(a.name).localeCompare(String(b.name)),
    };
    rows.sort(KEY[orgSort] || KEY.gross);

    const totalGross = all.reduce((n, o) => n + o.gross, 0);

    return `
      <div class="app-head">
        <div><h1>Organisers</h1>
          <p>${all.length} on the platform${q ? ` · ${rows.length} matching` : ""}.</p></div>
      </div>

      <div class="tbl-tools">
        <div class="search-bar sm">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
          <input id="orgQ" type="search" placeholder="Name, handle or owner…" value="${esc(orgSearch)}">
        </div>
        <div class="seg" id="orgSort">
          ${[["gross", "Revenue"], ["fee", "Our fee"], ["tickets", "Tickets"], ["newest", "Newest"], ["name", "A–Z"]]
            .map(([k, l]) => `<button data-sort="${k}" class="${orgSort === k ? "on" : ""}">${l}</button>`).join("")}
        </div>
      </div>

      ${!rows.length ? `<div class="empty"><h3>Nobody matches that</h3></div>` : `
      <div class="panel tbl-wrap">
        <table class="org-tbl">
          <thead><tr>
            <th>Organisation</th>
            <th class="num">They took</th>
            <th class="num">Our fee</th>
            <th class="num hide-sm">Tickets</th>
            <th class="num hide-sm">Events</th>
            <th class="num">Share</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${rows.map((o) => {
              const share = totalGross ? Math.round((o.gross / totalGross) * 100) : 0;
              return `
              <tr data-pact="orgopen" data-id="${o.id}">
                <td>
                  <div class="org-cell">
                    <div class="org-mark sm" style="background:${esc(o.colour || "#17171b")};color:${inkOn(o.colour || "#17171b")}">${esc(initials(o.name))}</div>
                    <div style="min-width:0">
                      <div class="org-nm">${esc(o.name)}</div>
                      <div class="org-sub"><span class="code">${esc(o.handle || "—")}</span>${o.last_seen ? " · " + esc(ago(o.last_seen)) : " · never signed in"}</div>
                    </div>
                  </div>
                </td>
                <td class="num strong">${esc(ksh(o.gross))}</td>
                <td class="num green">${esc(ksh(o.our_fee))}</td>
                <td class="num hide-sm">${o.scanned} / ${o.tickets}</td>
                <td class="num hide-sm">${o.live} / ${o.events}</td>
                <td class="num">
                  <div class="share">${share}%<span><i style="width:${Math.max(2, share)}%"></i></span></div>
                </td>
                <td class="num"><span class="row-go">›</span></td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>`}`;
  }

  /* everything about one organisation, opened from its row */
  function orgSheet(id) {
    const o = (pCache.orgs || []).find((x) => x.id === id);
    if (!o) return;
    modal(esc(o.name), `
      <div class="sheet-head">
        <div class="org-mark" style="background:${esc(o.colour || "#17171b")};color:${inkOn(o.colour || "#17171b")}">${esc(initials(o.name))}</div>
        <div style="min-width:0">
          <div class="sheet-nm">${esc(o.name)}</div>
          <div class="small muted"><span class="code">${esc(o.handle || "—")}</span> · joined ${esc(shortDate(o.created_at))}</div>
        </div>
      </div>

      <div class="kpis" style="margin:0 0 16px">
        <div class="kpi"><div class="k">They took</div><div class="v">${esc(ksh(o.gross))}</div></div>
        <div class="kpi green"><div class="k">Our fee</div><div class="v">${esc(ksh(o.our_fee))}</div></div>
        <div class="kpi"><div class="k">Events</div><div class="v">${o.live} / ${o.events}</div></div>
        <div class="kpi"><div class="k">Tickets</div><div class="v">${o.scanned} / ${o.tickets}</div></div>
      </div>

      <table class="plain" style="margin-bottom:6px">
        <tr><td>Owner</td><td class="num">${esc(o.owner || "—")}</td></tr>
        <tr><td>Email</td><td class="num">${esc(o.email || "not given")}</td></tr>
        <tr><td>Phone</td><td class="num">${esc(o.phone || "not given")}</td></tr>
        <tr><td>Payout number</td><td class="num">${esc(o.payout_till || "not set")}</td></tr>
        <tr><td>Our cut</td><td class="num">${esc(o.fee_pct)}%</td></tr>
        <tr class="total"><td>Last active</td><td class="num">${o.last_seen ? esc(ago(o.last_seen)) : "never signed in"}</td></tr>
      </table>`,
      `<button class="btn btn-soft" data-close>Close</button>
       <button class="btn btn-soft" data-pact="resetpw" data-id="${o.id}">Set password</button>
       <button class="btn btn-primary" data-pact="viewas" data-id="${o.id}">View as ${esc(o.name)}</button>`);
    $$("#modalHost [data-pact]").forEach((el) =>
      (el.onclick = () => pHandle(el.dataset.pact, el.dataset)));
  }

  /* ---------- setting a password ----------

     The platform owner types the new password themselves. Existing
     passwords cannot be read by anyone — they are one-way hashes — so
     this replaces one rather than revealing it. */
  function resetPassword(id) {
    const o = (pCache.orgs || []).find((x) => x.id === id);
    if (!o) return toast("Couldn't find that organisation — reload and try again.", "err");

    modal(`Set a password for ${o.name}`, `
      <p class="small" style="margin:0 0 16px">
        Choose what <b>${esc(o.name)}</b> will sign in with. Their current password stops working
        the moment you save this.</p>

      <div class="cred" style="margin-bottom:16px">
        <div><span>They sign in as</span><b>${esc(o.handle || "—")}</b></div>
      </div>

      <div class="field" style="margin-bottom:10px">
        <label for="pw1">New password</label>
        <input id="pw1" type="text" autocomplete="off" spellcheck="false"
               placeholder="At least 8 characters">
      </div>
      <button class="btn btn-soft btn-sm" id="pwGen" type="button">Suggest a strong one</button>
      <p class="tiny" id="pwMsg" style="margin:12px 0 0;min-height:1em"></p>`,
      `<button class="btn btn-soft" data-close>Cancel</button>
       <button class="btn btn-primary" id="pwGo">Save password</button>`);

    const box = $("#pw1");
    if (box) box.focus();

    $("#pwGen").onclick = () => {
      /* no look-alike characters, so it survives being read down a phone */
      const AB = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      const ch = Array.from(bytes, (b) => AB[b % AB.length]);
      box.value = [0, 4, 8, 12].map((i) => ch.slice(i, i + 4).join("")).join("-");
      box.focus(); box.select();
      say("");
    };

    const say = (text, bad) => {
      const m = $("#pwMsg");
      if (m) { m.textContent = text; m.style.color = bad ? "var(--red)" : "var(--muted)"; }
    };

    box.addEventListener("keydown", (e) => { if (e.key === "Enter") $("#pwGo").click(); });

    $("#pwGo").onclick = async () => {
      const pw = box.value.trim();
      if (pw.length < 8) return say("Use at least 8 characters.", true);

      const btn = $("#pwGo");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      say("Saving…");

      if (typeof PL.setOrgPassword !== "function") {
        btn.disabled = false; btn.textContent = "Save password";
        return say("This page is an old copy. Reload with Ctrl+Shift+R.", true);
      }

      try {
        const r = await PL.setOrgPassword(o.id, pw);
        modal("Password changed", `
          <p class="small" style="margin:0 0 16px">
            <b>${esc(r.org_name)}</b> can sign in with these right away.</p>
          <div class="cred">
            <div><span>Sign-in name</span><b>${esc(r.handle)}</b></div>
            <div><span>Password</span><b class="pw">${esc(pw)}</b></div>
          </div>
          ${r.repaired ? `
          <div class="warn-box" style="margin-top:14px">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" style="flex:none"><path d="M4 12.5l5.2 5L20 6.5"/></svg>
            <div>This account used to sign in as <b>${esc(r.was)}</b>, so the handle never worked for it.
              That is now fixed — it signs in as <b>${esc(r.handle)}</b>.</div>
          </div>` : ""}
          <p class="tiny muted" style="margin:14px 0 0">
            Send it by a route they already trust. The change is recorded in Activity —
            the password itself is not.</p>`,
          `<button class="btn btn-primary" data-close>Done</button>`);
      } catch (e) {
        btn.disabled = false; btn.textContent = "Save password";
        say(e.message, true);
      }
    };
  }

  /* ==========================================================
     THE TEAM

     There is no email anywhere in this product, so people are not
     invited — the owner creates their login and hands it to them.
     Three roles: the owner, staff who run the events, and door
     staff who only scan.
     ========================================================== */
  const ROLE_LABEL = { owner: "Owner", staff: "Staff", gate: "Door" };
  const ROLE_NOTE = {
    owner: "Everything, including money and settings",
    staff: "Events, orders and the gate — not settings or the team",
    gate:  "The scanner and the guest list only"
  };

  async function paintTeam() {
    const box = $("#teamList");
    if (!box) return;
    let rows = [];
    try { rows = await PL.team(); }
    catch (e) { box.innerHTML = `<p class="small muted" style="margin:0">Couldn't load your team.</p>`; return; }

    box.innerHTML = rows.map((m) => `
      <div class="team-row">
        <div class="org-mark sm" style="background:${esc(org.colour)};color:${inkOn(org.colour)}">${esc(initials(m.name || "?"))}</div>
        <div style="min-width:0;flex:1">
          <div class="team-nm">${esc(m.name || "—")}${m.is_you ? ` <span class="tiny muted">(you)</span>` : ""}</div>
          <div class="tiny muted"><span class="code">${esc(m.handle)}</span> · ${esc(ROLE_NOTE[m.role] || m.role)}</div>
        </div>
        <span class="badge ${m.role === "owner" ? "live" : ""}">${esc(ROLE_LABEL[m.role] || m.role)}</span>
        ${m.role !== "owner" && myRole === "owner"
          ? `<button class="btn btn-soft btn-sm" data-act="drop-member" data-id="${esc(m.user_id)}"
               data-name="${esc(m.name || "")}">Remove</button>` : ""}
      </div>`).join("");
    wire();
  }

  function dropMember(user_id, name) {
    modal(`Remove ${name || "them"}?`, `
      <p class="small" style="margin:0">Their login stops working straight away. Tickets they have
        already scanned are not affected.</p>`,
      `<button class="btn btn-soft" data-close>Cancel</button>
       <button class="btn btn-primary" id="dropGo">Remove</button>`);
    $("#dropGo").onclick = async () => {
      const b = $("#dropGo");
      b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
      try {
        await PL.removeTeamMember(user_id);
        $("#modalHost").innerHTML = "";
        toast(`${name || "They"} can no longer sign in.`, "ok");
        paintTeam();
      } catch (e) {
        b.disabled = false; b.textContent = "Remove";
        toast(e.message, "err");
      }
    };
  }

  function addMemberModal() {
    modal("Add someone to your team", `
      <div class="field"><label for="tmName">Their name</label>
        <input id="tmName" placeholder="Jane Mwangi" autocomplete="off"></div>

      <div class="field"><label>What can they see?</label>
        <div class="role-pick" id="tmRole">
          ${["gate", "staff"].map((r, i) => `
            <label class="role-opt${i === 0 ? " on" : ""}">
              <input type="radio" name="tmrole" value="${r}" ${i === 0 ? "checked" : ""}>
              <span class="role-nm">${ROLE_LABEL[r]}</span>
              <span class="role-sub">${ROLE_NOTE[r]}</span>
            </label>`).join("")}
        </div>
      </div>

      <div class="field" style="margin-bottom:8px"><label for="tmPass">Password for them</label>
        <input id="tmPass" type="text" autocomplete="off" spellcheck="false" placeholder="At least 8 characters"></div>
      <button class="btn btn-soft btn-sm" id="tmGen" type="button">Suggest one</button>
      <p class="tiny" id="tmMsg" style="margin:12px 0 0;min-height:1em"></p>`,
      `<button class="btn btn-soft" data-close>Cancel</button>
       <button class="btn btn-primary" id="tmGo">Create their login</button>`);

    $$("#tmRole .role-opt").forEach((l) => (l.onclick = () => {
      $$("#tmRole .role-opt").forEach((x) => x.classList.remove("on"));
      l.classList.add("on");
    }));

    $("#tmGen").onclick = () => {
      const AB = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const b = new Uint8Array(12); crypto.getRandomValues(b);
      const ch = Array.from(b, (x) => AB[x % AB.length]);
      $("#tmPass").value = [0, 4, 8].map((i) => ch.slice(i, i + 4).join("")).join("-");
      $("#tmPass").focus(); $("#tmPass").select();
    };

    const say = (t, bad) => {
      const m = $("#tmMsg");
      if (m) { m.textContent = t; m.style.color = bad ? "var(--red)" : "var(--muted)"; }
    };

    $("#tmGo").onclick = async () => {
      const name = $("#tmName").value.trim();
      const role = ($("#tmRole input:checked") || {}).value || "gate";
      const password = $("#tmPass").value.trim();
      if (name.length < 2) return say("Give them a name.", true);
      if (password.length < 8) return say("Use at least 8 characters.", true);

      const btn = $("#tmGo");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      say("Creating…");
      try {
        const r = await PL.addTeamMember({ name, role, password });
        modal(`${r.name} is on the team`, `
          <p class="small" style="margin:0 0 16px">
            Give them these. They sign in on the same page you do.</p>
          <div class="cred">
            <div><span>Sign-in name</span><b>${esc(r.handle)}</b></div>
            <div><span>Password</span><b class="pw">${esc(password)}</b></div>
          </div>
          <p class="tiny muted" style="margin:14px 0 0">
            ${esc(ROLE_NOTE[r.role])}. You can remove them at any time.</p>`,
          `<button class="btn btn-primary" data-close>Done</button>`);
        paintTeam();
      } catch (e) {
        btn.disabled = false; btn.textContent = "Create their login";
        say(e.message, true);
      }
    };
  }

  const ACTION_LABEL = {
    "platform.signin": "You signed in",
    "platform.view_as": "You viewed an organiser",
    "platform.password_reset": "You reset a password",
    "platform.view_as_end": "You stopped viewing",
    "organiser.created": "Created an organisation",
    "organiser.applied": "Applied to sell",
    "organiser.approved": "Approved",
    "organiser.rejected": "Turned down",
    "organiser.signin": "Signed in",
    "event.created": "Created an event",
    "event.published": "Published an event",
    "event.unpublished": "Unpublished an event",
    "order.started": "Started an order",
    "order.paid": "Order paid",
    "order.failed": "Order failed",
    "ticket.scanned": "Scanned a ticket",
  };

  function pActivity() {
    const rows = pCache.activity;
    if (!rows.length) return `<div class="app-head"><div><h1>Activity</h1></div></div>
      <div class="empty"><h3>Nothing yet</h3></div>`;
    return `
      <div class="app-head">
        <div><h1>Activity</h1><p>Everything that has happened, newest first.</p></div>
        <button class="btn btn-soft btn-sm" data-pact="refresh">Refresh</button>
      </div>
      <div class="panel" style="padding:0;overflow:hidden">
        ${rows.map((r) => `
          <div class="feed-row">
            <span class="feed-dot ${esc((r.action || "").split(".")[0])}"></span>
            <div style="min-width:0;flex:1">
              <div class="feed-what">${esc(ACTION_LABEL[r.action] || r.action)}
                ${r.detail ? `<span class="muted">— ${esc(r.detail)}</span>` : ""}</div>
              <div class="tiny muted">
                ${esc(r.org || "—")}${r.actor ? " · " + esc(r.actor) : ""}</div>
            </div>
            <div class="tiny muted" style="flex:none;white-space:nowrap">${esc(ago(r.at))}</div>
          </div>`).join("")}
      </div>`;
  }

  async function pHandle(act, d) {
    if (act === "refresh") return pGo(pTab);
    if (act === "viewas")  { $("#modalHost").innerHTML = ""; return startViewing(d.id, d.name); }
    if (act === "orgopen") return orgSheet(d.id);
    if (act === "resetpw") return resetPassword(d.id);
  }

  /* ==========================================================
     VIEW AS ORGANISER

     The owner sees the organiser's own dashboard, exactly as the
     organiser sees it, and can change nothing.  There is no
     password involved and nothing is borrowed from their account:
     the database grants the owner permission to read these rows
     and no permission at all to write them, so this holds even if
     somebody edits the page in front of them.
     ========================================================== */
  async function startViewing(id, name) {
    const btn = $(`[data-pact="viewas"][data-id="${id}"]`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try {
      watching = await PL.viewAsOrg(id);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = "View as"; }
      return toast(e.message, "err");
    }
    org = watching;
    document.body.classList.remove("platform");
    document.body.classList.add("guest");
    $("#nav").innerHTML = orgNavHTML;
    $$("#nav button").forEach((b) => (b.onclick = () => go(b.dataset.tab)));
    paintPill();
    cache = {};
    go("home");
  }

  async function stopViewing() {
    const wasName = watching && watching.name;
    await PL.stopViewing();
    watching = null; org = null; cache = {};
    document.body.classList.remove("guest");
    $("#guestBar") && $("#guestBar").remove();
    pCache = {};
    await platformBoot(true);
    toast("Back to the platform view — " + wasName + " was not changed.", "ok");
  }

  /* The bar across the top that makes it impossible to forget whose
     screen this is. */
  function guestBar() {
    if (!watching) { $("#guestBar") && $("#guestBar").remove(); return; }
    let bar = $("#guestBar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "guestBar";
      bar.className = "guest-bar";
      document.body.insertBefore(bar, document.body.firstChild);
    }
    bar.innerHTML = `
      <span class="guest-eye" aria-hidden="true"></span>
      <span>You are looking at <b>${esc(watching.name)}</b> as a guest.
        <span class="guest-note">Nothing on this screen can be changed, and the visit is in the activity log.</span></span>
      <button class="btn btn-sm" id="guestOut">Stop viewing</button>`;
    $("#guestOut").onclick = stopViewing;
  }

  /* Strip out everything that would change something.  The database
     refuses these anyway; taking them off the screen is so the owner is
     never left wondering why a button did nothing. */
  const GUEST_SAFE = ["go-orders", "copy-link", "export"];
  function makeReadOnly() {
    if (!watching) return;
    $$("#main [data-act]").forEach((el) => {
      if (!GUEST_SAFE.includes(el.dataset.act)) el.remove();
    });
    $$("#main input, #main select, #main textarea").forEach((el) => {
      if (el.type === "search" || el.id === "oSearch" || el.id === "oEvent") return;
      el.disabled = true;
    });
    $$("#main .upload").forEach((el) => el.remove());
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
        <div class="kpi"><div class="k">Revenue</div><div class="v">${esc(amount(d.gross, cur))}</div>
          <div class="tiny muted" style="margin-top:3px">what buyers paid</div></div>
        <div class="kpi"><div class="k">Our fee</div><div class="v">${esc(amount(d.gross - d.net, cur))}</div>
          <div class="tiny muted" style="margin-top:3px">${d.fee_pct}% of revenue</div></div>
        <div class="kpi green"><div class="k">Yours</div><div class="v">${esc(amount(d.net, cur))}</div>
          <div class="tiny muted" style="margin-top:3px">after our ${d.fee_pct}%</div></div>
        <div class="kpi"><div class="k">Tickets sold</div><div class="v">${d.tickets_sold}</div></div>
        <div class="kpi"><div class="k">Scanned in</div><div class="v">${d.scanned}</div></div>
        <div class="kpi"><div class="k">Live events</div><div class="v">${d.live_events}<span class="small muted" style="font-size:.95rem"> / ${d.total_events}</span></div></div>
      </div>

      ${d.daily.length ? `
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
      </div>` : ""}

      ${d.total_events ? "" : `
      <div class="panel center" style="padding:34px 22px">
        <h3 style="margin:0 0 6px">Nothing here yet</h3>
        <p class="muted small" style="margin:0 0 18px">Put your first event up and it goes live on the
          site straight away.</p>
        <button class="btn btn-primary" data-act="new-event">Create your first event</button>
      </div>`}

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

      <div class="panel scan-panel">
        <div class="panel-head"><h3>Scan tickets</h3>
          <button class="btn btn-primary btn-sm" data-act="scan-start" id="scanBtn">Open the scanner</button></div>
        <p class="small muted" style="margin:0 0 14px">
          Point the camera at the QR on a ticket. It admits one guest per scan and tells you
          immediately if a code has already been used.</p>
        <div class="scan-stage" id="scanStage" hidden>
          <video id="scanVid" playsinline muted></video>
          <div class="scan-frame"><i></i><i></i><i></i><i></i></div>
          <div class="scan-flash" id="scanFlash"></div>
          <button class="btn btn-soft btn-sm scan-stop" data-act="scan-stop">Stop</button>
        </div>
        <div id="scanOut" style="margin-top:14px"></div>
        <div class="scan-tally" id="scanTally" hidden></div>
      </div>

      <div class="panel">
        <div class="panel-head"><h3>Check a ticket by code</h3></div>
        <p class="small muted" style="margin:0 0 14px">
          For when a QR will not read — a cracked screen, a printed ticket that has been through
          the wash.</p>
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
     THE SCANNER

     Runs in this page, on the camera of whatever phone the door
     staff are holding. Nothing is installed.

     Each frame of the video is read for a QR. When one appears it
     is spent through the database, which decides whether that
     ticket is good — the camera only ever reports what it saw.
     A code is ignored for a few seconds after it is read, so one
     ticket held in front of the lens is not counted twice.
     ========================================================== */
  let scan = { stream: null, raf: null, busy: false, seen: new Map(), admitted: 0, refused: 0 };

  async function startScan() {
    const stage = $("#scanStage"), video = $("#scanVid"), btn = $("#scanBtn");
    if (!stage || !video) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return scanSay("bad", "No camera here",
        "This browser will not give a web page the camera. Use the code box below instead.");
    }
    if (typeof jsQR !== "function") {
      return scanSay("bad", "The scanner did not load",
        "Reload the page and try again.");
    }

    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      scan.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false
      });
    } catch (e) {
      btn.disabled = false; btn.textContent = "Open the scanner";
      const why = e && e.name === "NotAllowedError"
        ? "The camera was blocked. Allow it for this site in your browser settings, then try again."
        : "That camera could not be opened. Use the code box below instead.";
      return scanSay("bad", "No camera", why);
    }

    video.srcObject = scan.stream;
    await video.play().catch(() => {});
    stage.hidden = false;
    $("#scanTally").hidden = false;
    btn.disabled = false; btn.textContent = "Scanning…";
    scan.admitted = 0; scan.refused = 0;
    paintTally();
    readFrames();
  }

  function stopScan() {
    cancelAnimationFrame(scan.raf);
    if (scan.stream) scan.stream.getTracks().forEach((t) => t.stop());
    scan.stream = null;
    /* stopping the tracks is not enough — the element keeps a reference and
       some browsers leave the camera light on until it is let go */
    const vid = $("#scanVid");
    if (vid) { try { vid.pause(); } catch (e) { /* nothing to pause */ } vid.srcObject = null; }
    const stage = $("#scanStage"), btn = $("#scanBtn");
    if (stage) stage.hidden = true;
    if (btn) { btn.disabled = false; btn.textContent = "Open the scanner"; }
  }

  function readFrames() {
    const video = $("#scanVid");
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      if (!scan.stream) return;
      scan.raf = requestAnimationFrame(tick);
      if (scan.busy || video.readyState !== video.HAVE_ENOUGH_DATA) return;

      /* a smaller frame decodes fast enough to feel instant on an old phone */
      const w = 480;
      const h = Math.round((video.videoHeight / video.videoWidth) * w) || 360;
      canvas.width = w; canvas.height = h;
      ctx.drawImage(video, 0, 0, w, h);

      let found;
      try {
        found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
      } catch (e) { return; }
      if (!found || !found.data) return;

      const token = tokenFrom(found.data);
      if (!token) return scanSay("bad", "Not one of ours",
        "That code was not issued by Go Events Kenya.");

      /* the same ticket held in front of the lens must not count twice */
      const last = scan.seen.get(token) || 0;
      if (Date.now() - last < 4000) return;
      scan.seen.set(token, Date.now());

      spend(token);
    };
    tick();
  }

  /* The QR carries a link to this site with the ticket's token on it.
     Anything else is not ours. */
  function tokenFrom(text) {
    const raw = String(text || "").trim();
    try {
      const u = new URL(raw);
      if (u.origin !== location.origin) return null;
      const t = u.searchParams.get("t");
      return /^[A-Za-z0-9_-]{16,}$/.test(t || "") ? t : null;
    } catch (e) {
      return /^[A-Za-z0-9_-]{16,}$/.test(raw) ? raw : null;
    }
  }

  async function spend(token) {
    scan.busy = true;
    try {
      const r = await PL.useTicket(token);
      if (r && r.result === "ok") {
        scan.admitted++;
        flash("ok");
        scanSay("ok", "Let them in", `${esc(r.type_name || "Ticket")} · ${esc(r.code || "")}`);
      } else if (r && r.result === "used") {
        scan.refused++;
        flash("bad");
        scanSay("warn", "Already used",
          `This one was scanned ${r.used_at ? esc(ago(r.used_at)) : "earlier"}. Do not let them in twice.`);
      } else if (r && r.result === "void") {
        scan.refused++;
        flash("bad");
        scanSay("bad", "Cancelled ticket", "This ticket was cancelled. Do not let them in.");
      } else if (r && r.result === "not_yours") {
        scan.refused++;
        flash("bad");
        scanSay("bad", "Another organiser's ticket", "It is genuine, but not for your event.");
      } else {
        scan.refused++;
        flash("bad");
        scanSay("bad", "Not a valid ticket", "Do not let them in.");
      }
    } catch (e) {
      flash("bad");
      scanSay("bad", "Could not check it", e.message);
    } finally {
      paintTally();
      setTimeout(() => { scan.busy = false; }, 700);
    }
  }

  function flash(kind) {
    const f = $("#scanFlash");
    if (!f) return;
    f.className = "scan-flash " + kind;
    setTimeout(() => (f.className = "scan-flash"), 420);
    if (navigator.vibrate) navigator.vibrate(kind === "ok" ? 40 : [60, 50, 60]);
  }

  function scanSay(kind, title, note) {
    const out = $("#scanOut");
    if (!out) return;
    out.innerHTML = `<div class="scan-say ${esc(kind)}">
      <b>${esc(title)}</b><span>${note || ""}</span></div>`;
  }

  function paintTally() {
    const t = $("#scanTally");
    if (!t) return;
    t.innerHTML = `<span><b>${scan.admitted}</b> let in</span>
                   <span><b>${scan.refused}</b> turned away</span>`;
  }

  addEventListener("pagehide", stopScan);

  /* ==========================================================
     PAYOUTS
     ========================================================== */
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
        <div class="panel-head"><h3>Your team</h3>
          <button class="btn btn-soft btn-sm" data-act="add-member">+ Add someone</button></div>
        <p class="small muted" style="margin:0 0 4px">
          Everyone gets their own sign-in name and password. Door staff can scan and see the guest
          list; they never see what you have taken.</p>
        <div id="teamList"><div class="center" style="padding:18px 0"><span class="spinner"></span></div></div>
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
      if (act === "scan-start") return startScan();
      if (act === "scan-stop")  return stopScan();
      if (act === "add-member") return addMemberModal();
      if (act === "drop-member") return dropMember(d.id, d.name);
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
