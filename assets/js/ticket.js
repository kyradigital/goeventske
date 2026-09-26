/* ============================================================
   Go Events Kenya — the buyer's ticket wallet
   ============================================================ */
(async function () {
  const { $, $$, esc, amount, when, prettyTime, toast, qs, drawQR } = UI;
  let polling = null;                 // the "check your phone" poll, while one is running
  UI.header();
  UI.footer();

  const view = $("#view");
  const ref = qs("ref");

  if (!ref) return lookup();
  show(ref);

  function lookup(msg) {
    view.innerHTML = `
      <div class="panel" style="max-width:440px;margin:0 auto">
        <h2 style="font-size:1.3rem;margin-bottom:6px">Find my ticket</h2>
        <p class="muted small" style="margin:0 0 18px">Type the reference from your confirmation email — it looks like <span class="code">GEA1B2C3</span>.</p>
        ${msg ? `<p class="small" style="color:var(--red);margin:0 0 14px">${esc(msg)}</p>` : ""}
        <div class="field"><label>Order reference</label><input id="refIn" placeholder="GEA1B2C3" autocomplete="off"></div>
        <button class="btn btn-primary btn-block" id="go">Show my ticket</button>
      </div>`;
    $("#go").onclick = () => {
      const v = $("#refIn").value.trim();
      if (v) location.href = "ticket.html?ref=" + encodeURIComponent(v);
    };
    $("#refIn").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#go").click(); });
  }

  async function waitForPayment(reference) {
    clearInterval(polling);
    const started = Date.now();
    polling = setInterval(async () => {
      if (Date.now() - started > 120000) {          // two minutes is long enough
        clearInterval(polling);
        const w = $("#waiting");
        if (w) w.innerHTML = `<h2 style="font-size:1.2rem;margin-bottom:4px">Still waiting</h2>
          <p class="small" style="margin:0">No word from M-Pesa yet. Your order is safe under
          <b class="code">${esc(reference)}</b> — refresh this page, or ask the organiser to confirm it.</p>`;
        return;
      }
      let st;
      try { st = await PL.orderState(reference); } catch (e) { return; }
      if (st.status !== "pending") { clearInterval(polling); show(reference); }
    }, 4000);
  }

  async function show(reference) {
    clearInterval(polling);
    let o;
    try { o = await PL.order(reference); }
    catch (e) { return lookup(e.message); }

    const base = location.origin + location.pathname.replace(/[^/]*$/, "");
    const cur = (o.org && o.org.currency) || "KES";
    const paid = o.status === "paid";

    /* A ticket exists only once the money has been confirmed on the server, so
       until then this page says so plainly rather than showing an empty QR. */
    view.innerHTML = `
      ${paid ? `
      <div class="panel" style="border-color:rgba(47,211,106,.42);background:var(--green-soft);margin-bottom:22px">
        <div style="display:flex;align-items:center;gap:13px">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#12b76a" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none"><circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.7 2.6L16 9.5"/></svg>
          <div>
            <h2 style="font-size:1.25rem;margin-bottom:2px">You're in</h2>
            <p class="small muted" style="margin:0">Show the QR at the gate. Screenshot it — it works with no signal.</p>
          </div>
        </div>
      </div>` : o.status === "failed" ? `
      <div class="panel" style="border-color:rgba(255,68,85,.45);background:var(--red-soft);margin-bottom:22px">
        <h2 style="font-size:1.25rem;margin-bottom:4px">That payment didn't go through</h2>
        <p class="small" style="margin:0 0 6px">${esc(o.reason || "The prompt was cancelled or timed out.")}
          Nothing was taken. Start again from the event page and we'll send a fresh prompt.</p>
        <a class="btn btn-primary btn-sm" href="${esc(o.event ? "event.html?e=" + o.event.slug : "discover.html")}">Try again</a>
      </div>` : `
      <div class="panel" id="waiting" style="border-color:rgba(255,192,70,.45);background:var(--amber-soft);margin-bottom:22px">
        <div style="display:flex;align-items:center;gap:13px">
          <span class="spinner" style="flex:none"></span>
          <div>
            <h2 style="font-size:1.25rem;margin-bottom:2px">Check your phone</h2>
            <p class="small" style="margin:0">An M-Pesa prompt is on its way. Enter your PIN and this page
              turns into your ticket by itself — don't close it.</p>
          </div>
        </div>
        <p class="tiny muted" style="margin:12px 0 0">
          Order <b class="code">${esc(o.reference)}</b>. If nothing arrives, keep this reference — the
          organiser can confirm the payment by hand.</p>
      </div>`}

      <div id="stubs"></div>

      <div class="panel">
        <div class="panel-head" style="margin-bottom:12px"><h3>Order</h3><span class="code">${esc(o.reference)}</span></div>
        ${o.items.map((i) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0">
            <span>${esc(i.name)} × ${i.quantity}</span><b>${esc(amount(i.unit_price * i.quantity, cur))}</b></div>`).join("")}
        <div class="total-line"><span class="muted">${paid ? "Total paid" : "Total due"}</span><b>${esc(amount(o.total, cur))}</b></div>
        <div class="small muted">${esc(o.buyer_name)} · ${esc(o.buyer_email)}${o.buyer_phone ? " · " + esc(o.buyer_phone) : ""}</div>
      </div>

      <div class="center no-print" style="margin-top:24px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
        <button class="btn btn-soft" id="printBtn">Print or save as PDF</button>
        <a class="btn btn-ghost" href="discover.html">Find another event</a>
      </div>`;

    $("#stubs").innerHTML = (o.tickets || []).map((t, i) => `
      <div class="stub">
        <div class="stub-top">
          <div class="ev">${esc(o.event.name)}</div>
          <div class="mt">${esc(when(o.event.date))} · ${esc(prettyTime(o.event.start_time))} · ${esc(o.event.venue)}, ${esc(o.event.city)}</div>
        </div>
        <div class="perf"></div>
        <div class="stub-mid">
          <div class="qr" data-qr="${esc(base + "scan.html?t=" + t.token)}" data-code="${esc(t.code)}"></div>
          <div class="stub-info">
            <div><div class="lbl">Ticket ${i + 1} of ${o.tickets.length}</div><div class="val">${esc(t.type_name)}</div></div>
            <div><div class="lbl">Name</div><div class="val">${esc(o.buyer_name)}</div></div>
            <div><div class="lbl">Code</div><span class="code">${esc(t.code)}</span></div>
            <div>${t.status === "used"
              ? `<span class="badge warn">Already scanned</span>`
              : t.status === "void" ? `<span class="badge bad">Cancelled</span>`
              : `<span class="badge ok">Valid</span>`}</div>
          </div>
        </div>
      </div>`).join("");

    $$("[data-qr]").forEach((b) => drawQR(b, b.dataset.qr, b.dataset.code));

    /* While the buyer is typing their PIN, ask the server every few seconds
       whether it has heard from Safaricom yet. The server decides; this page
       only redraws. It gives up after two minutes so it isn't polling forever. */
    if (!paid && o.status === "pending") waitForPayment(o.reference);
    $("#printBtn").onclick = () => window.print();
  }
})();
