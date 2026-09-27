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
        <h2 class="panel-title">Find my ticket</h2>
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
        if (w) w.innerHTML = `<h2 class="panel-title">Still waiting</h2>
          <p class="small" style="margin:0">No word from the payment yet. Your order is safe under
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
      <div class="all-set">
        <span class="tick">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
        </span>
        <h2>You're all set!</h2>
        <p>Your ${o.tickets.length === 1 ? "ticket is" : "tickets are"} below, and a copy is on its way to
          <b>${esc(o.buyer_email)}</b>.</p>
        <p class="tiny muted" style="margin:10px 0 0">Show the QR at the gate — a screenshot works with no signal.</p>
      </div>` : o.status === "failed" ? `
      <div class="panel" style="border-color:rgba(255,68,85,.45);background:var(--red-soft);margin-bottom:22px">
        <h2 class="panel-title">That payment didn't go through</h2>
        <p class="small" style="margin:0 0 6px">${esc(o.reason || "The prompt was cancelled or timed out.")}
          Nothing was taken. Start again from the event page and we'll send a fresh prompt.</p>
        <a class="btn btn-primary btn-sm" href="${esc(o.event ? "event.html?e=" + o.event.slug : "discover.html")}">Try again</a>
      </div>` : `
      <div class="panel" id="waiting" style="border-color:rgba(255,192,70,.45);background:var(--amber-soft);margin-bottom:22px">
        <div style="display:flex;align-items:center;gap:13px">
          <span class="spinner" style="flex:none"></span>
          <div>
            <h2 class="panel-title">Waiting for your payment</h2>
            <p class="small" style="margin:0">As soon as the payment clears, this page turns into your
              ticket by itself — and a copy lands in your inbox. Don't close it.</p>
          </div>
        </div>
        <p class="tiny muted" style="margin:12px 0 0">
          Order <b class="code">${esc(o.reference)}</b>. Keep this reference — if anything goes wrong the
          organiser can look the payment up with it.</p>
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
        <button class="btn btn-primary" id="pdfBtn">Download PDF</button>
        <button class="btn btn-soft" id="printBtn">Print</button>
        <a class="btn btn-ghost" href="discover.html">Find another event</a>
      </div>`;

    const poster = UI.safeImage((o.event && o.event.poster) || "");
    $("#stubs").innerHTML = (o.tickets || []).map((t, i) => `
      <div class="stub">
        ${poster ? `<div class="stub-art">
          <div class="ev-art-bg" style="background-image:url('${poster.replace(/'/g, "%27")}')"></div>
          <img src="${poster}" alt="Poster for ${esc(o.event.name)}">
        </div>` : ""}
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
    UI.stagger("#stubs", 90);
    UI.animate(view);

    /* While the buyer is typing their PIN, ask the server every few seconds
       whether it has heard from Safaricom yet. The server decides; this page
       only redraws. It gives up after two minutes so it isn't polling forever. */
    if (!paid && o.status === "pending") waitForPayment(o.reference);

    /* A small celebration the first time a buyer lands on a paid ticket.
       Kept to once per order so a refresh isn't a party every time. */
    if (paid) {
      let seen = false;
      try { seen = sessionStorage.getItem("gek.cheered." + o.reference) === "1"; } catch (e) { /* private window */ }
      if (!seen) {
        try { sessionStorage.setItem("gek.cheered." + o.reference, "1"); } catch (e) { /* nothing to do */ }
        setTimeout(() => UI.confetti(), 180);
      }
    }
    $("#printBtn").onclick = () => window.print();

    /* The browser's own print-to-PDF is what makes the file. It is the one
       route that works on every phone and desktop without shipping a PDF
       library to every visitor, and it produces a real PDF, not a picture
       of one. The print stylesheet lays out one ticket per page. */
    $("#pdfBtn").onclick = () => {
      const was = document.title;
      /* most browsers name the PDF after the page title */
      document.title = `Ticket ${o.reference} — ${o.event ? o.event.name : "Go Events Kenya"}`;
      const back = () => { document.title = was; removeEventListener("afterprint", back); };
      addEventListener("afterprint", back);
      setTimeout(() => window.print(), 60);
      setTimeout(back, 8000);
    };
  }
})();
