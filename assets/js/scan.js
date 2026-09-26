/* ============================================================
   Go Events Kenya — what a scanned QR opens

   Anyone holding the link can see whether a ticket is good.
   Only a signed-in organiser can spend it.
   ============================================================ */
(async function () {
  const { $, esc, when, toast, qs } = UI;
  const view = $("#view");
  const token = qs("t");

  const ICON = {
    ok:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.7 2.6L16 9.5"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l9 15.5H3z"/><path d="M12 10v4.2M12 17.4v.1"/></svg>',
    bad:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>'
  };

  if (!token) {
    return paint("bad", ICON.bad, "Nothing to check",
      "This link has no ticket code on it. Scan the QR printed on the ticket itself.", "");
  }
  load();

  async function load() {
    const r = await PL.checkTicket(token);

    if (!r || r.result === "invalid") {
      return paint("bad", ICON.bad, "Not a valid ticket",
        "This code was not issued by Go Events Kenya. Don't let them in.", "");
    }

    const rows = `
      <div class="rows">
        <div><span class="k">Event</span><span class="v">${esc(r.event)}</span></div>
        <div><span class="k">Date</span><span class="v">${esc(when(r.date))}</span></div>
        ${r.venue ? `<div><span class="k">Venue</span><span class="v">${esc(r.venue)}</span></div>` : ""}
        <div><span class="k">Ticket</span><span class="v">${esc(r.type || "—")}</span></div>
        <div><span class="k">Code</span><span class="v"><span class="code">${esc(r.code)}</span></span></div>
      </div>`;

    if (r.result === "used") {
      return paint("warn", ICON.warn, "Already used",
        `Scanned ${esc(UI.ago(r.used_at))}. Somebody has already come in on this ticket.`, rows);
    }
    if (r.result === "void") {
      return paint("bad", ICON.bad, "Ticket cancelled",
        "The organiser cancelled this ticket. It will not admit anyone.", rows);
    }
    paint("ok", ICON.ok, "Valid ticket", "", rows, true);
  }

  function paint(kind, icon, title, note, rows, canUse) {
    view.innerHTML = `
      <div class="verify-card ${kind}">
        <div class="verify-icon">${icon}</div>
        <h2>${esc(title)}</h2>
        <p class="small muted" style="margin:0">Go Events Kenya</p>
        ${note ? `<p class="muted" style="margin:14px 0 0;font-size:.93rem">${note}</p>` : ""}
        ${rows}
        <div id="useBox">${canUse ? `
          <button class="btn btn-primary btn-block" id="useBtn">Let them in</button>
          <p class="tiny muted center" style="margin:11px 0 0">Marks the ticket used. Staff only.</p>` : ""}</div>
        <p class="tiny muted center" style="margin:18px 0 0">
          <a href="index.html" style="color:var(--orange-ink);text-decoration:none">Go Events Kenya ticketing</a>
        </p>
      </div>`;
    if (canUse) $("#useBtn").onclick = admit;
  }

  async function admit() {
    const btn = $("#useBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
    try {
      await PL.useTicket(token);
      if (navigator.vibrate) navigator.vibrate(60);
      load();                                   // repaints as "already used"
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Let them in";
      if (/sign in/i.test(e.message)) {
        $("#useBox").innerHTML = `
          <div class="panel" style="box-shadow:none;background:var(--bg-2);padding:15px;text-align:center">
            <p class="small" style="margin:0 0 12px">Only the organiser can admit someone.</p>
            <a class="btn btn-primary btn-sm btn-block" href="admin.html?next=${encodeURIComponent(location.href)}">Sign in to admit</a>
          </div>`;
      } else {
        toast(e.message, "err");
      }
    }
  }
})();
