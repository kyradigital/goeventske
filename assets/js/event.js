/* ============================================================
   Go Events Kenya — one event, and buying a ticket for it
   ============================================================ */
(async function () {
  const { $, $$, esc, money, amount, when, prettyTime, initials, tint, toast, qs } = UI;
  UI.header();
  UI.footer();

  const view = $("#view");
  let ev = null;
  const cart = {};                       // ticket_type_id -> qty

  try {
    ev = await PL.publicEvent(qs("e"));
  } catch (e) {
    view.innerHTML = `<div class="empty">
        <h3>We couldn't find that event</h3>
        <p>It may have been taken down, or the link may be wrong.</p>
        <a class="btn btn-primary" href="discover.html">See what's on</a></div>`;
    return;
  }
  document.title = ev.name + " — Go Events Kenya";
  paint();

  function paint() {
    const left = (t) => (t.quantity === 0 ? Infinity : t.quantity - t.sold);

    view.innerHTML = `
      <a href="discover.html" class="small muted back-link" style="text-decoration:none;gap:6px;margin-bottom:22px">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M14 6l-6 6 6 6"/></svg> All events</a>

      <div style="display:grid;gap:34px;grid-template-columns:1.25fr .95fr;align-items:start" id="cols">
        <div>
          <div class="ev-img" style="border-radius:var(--radius);aspect-ratio:16/9;background:${tint(ev.name)};margin-bottom:26px">
            ${UI.safeImage(ev.image) ? `<img src="${UI.safeImage(ev.image)}" alt="">` : `<span class="ph" style="font-size:4rem">${esc(initials(ev.name))}</span>`}
          </div>

          <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
            <span class="badge live">${esc(ev.category)}</span>
            <span class="by-org">
              ${UI.safeImage(ev.org.logo)
                ? `<img src="${UI.safeImage(ev.org.logo)}" alt="">`
                : `<i style="background:${esc(ev.org.colour || "#1f1f24")};color:${UI.inkOn(ev.org.colour)}">${esc(initials(ev.org.name))}</i>`}
              ${esc(ev.org.name)}
            </span>
          </div>

          <h1 style="font-size:clamp(1.8rem,3.6vw,2.6rem);margin-bottom:10px">${esc(ev.name)}</h1>
          <p class="muted" style="font-size:1.05rem;margin:0 0 26px">${esc(ev.tagline || "")}</p>

          <div class="panel" style="margin-bottom:22px">
            <div style="display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
              ${infoBit(
                '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z"/><path d="M8 2.5v3M16 2.5v3M4 9h16"/>',
                "Date", when(ev.date))}
              ${infoBit(
                '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
                "Time", prettyTime(ev.start_time) + (ev.end_time ? " – " + prettyTime(ev.end_time) : ""))}
              ${infoBit(
                '<path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
                "Where", esc(ev.venue) + "<br>" + esc(ev.city))}
            </div>
          </div>

          ${ev.about ? `<div class="panel">
            <h3 style="font-size:1.05rem;margin-bottom:10px">About this event</h3>
            <p class="muted" style="margin:0;white-space:pre-line">${esc(ev.about)}</p>
          </div>` : ""}
        </div>

        <div class="panel" id="buyBox" style="position:sticky;top:90px"></div>
      </div>`;

    if (window.innerWidth < 900) $("#cols").style.gridTemplateColumns = "1fr";
    paintBuy();
  }

  function infoBit(path, label, value) {
    return `<div style="display:flex;gap:11px">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--orange-ink)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" style="flex:none;margin-top:2px">${path}</svg>
      <div><div class="tiny muted" style="letter-spacing:.08em;text-transform:uppercase;font-weight:700">${label}</div>
      <div style="font-weight:600;font-size:.94rem">${value}</div></div></div>`;
  }

  function paintBuy() {
    const box = $("#buyBox");
    const types = ev.ticket_types || [];
    const onSale = types.filter((t) => t.active);

    if (!onSale.length || ev.sold_out) {
      box.innerHTML = `<h3 style="margin-bottom:8px">Sold out</h3>
        <p class="muted small" style="margin:0 0 16px">Every ticket for this one has gone.</p>
        <a class="btn btn-soft btn-block" href="discover.html">Find something else</a>`;
      return;
    }

    box.innerHTML = `
      <h3 style="margin-bottom:16px">Get your tickets</h3>
      ${onSale.map(ticketRow).join("")}
      <div class="total-line"><span class="muted">Total</span><b id="total">${amount(0, ev.currency)}</b></div>
      <button class="btn btn-primary btn-block" id="buyBtn" disabled>Select tickets</button>
      <p class="tiny muted center" style="margin:12px 0 0">You'll get a QR ticket straight away, and a copy by email.</p>`;

    $$("#buyBox [data-step]").forEach((b) => (b.onclick = () => step(b.dataset.tt, Number(b.dataset.step))));
    $("#buyBtn").onclick = openCheckout;
  }

  function ticketRow(t) {
    const left = t.quantity === 0 ? Infinity : t.quantity - t.sold;
    const gone = left <= 0;
    const n = cart[t.id] || 0;
    return `
      <div class="tt ${gone ? "sold" : ""}">
        <div class="tt-top">
          <div style="min-width:0">
            <h4>${esc(t.name)}</h4>
            ${t.blurb ? `<div class="small muted">${esc(t.blurb)}</div>` : ""}
            <div style="font-weight:700;margin-top:6px">${esc(money(t.price, ev.currency))}</div>
            ${left !== Infinity && left > 0 && left <= 20
              ? `<div class="tiny" style="color:var(--amber);font-weight:600;margin-top:3px">Only ${left} left</div>` : ""}
          </div>
          ${gone
            ? `<span class="badge bad">Gone</span>`
            : `<div class="qty">
                 <button data-tt="${t.id}" data-step="-1" aria-label="one fewer">−</button>
                 <b>${n}</b>
                 <button data-tt="${t.id}" data-step="1" aria-label="one more">+</button>
               </div>`}
        </div>
      </div>`;
  }

  function step(id, by) {
    const t = ev.ticket_types.find((x) => x.id === id);
    const left = t.quantity === 0 ? Infinity : t.quantity - t.sold;
    const next = Math.max(0, Math.min(10, (cart[id] || 0) + by));
    if (next > left) return toast(`Only ${left} of those left.`, "err");
    cart[id] = next;
    if (!next) delete cart[id];
    paintBuy();
    const total = cartTotal();
    $("#total").textContent = amount(total, ev.currency);
    const btn = $("#buyBtn");
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    btn.disabled = !count;
    btn.textContent = !count ? "Select tickets"
      : total === 0 ? `Get ${count} free ticket${count > 1 ? "s" : ""}`
      : `Buy ${count} ticket${count > 1 ? "s" : ""} · ${amount(total, ev.currency)}`;
  }

  const cartTotal = () =>
    Object.entries(cart).reduce((n, [id, q]) => {
      const t = ev.ticket_types.find((x) => x.id === id);
      return n + (t ? t.price * q : 0);
    }, 0);

  /* ---------- checkout ---------- */
  function openCheckout() {
    const total = cartTotal();
    const lines = Object.entries(cart).map(([id, q]) => {
      const t = ev.ticket_types.find((x) => x.id === id);
      return `<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0">
        <span>${esc(t.name)} × ${q}</span><b>${esc(amount(t.price * q, ev.currency))}</b></div>`;
    }).join("");

    $("#modalHost").innerHTML = `
      <div class="backdrop" id="bd">
        <div class="modal">
          <div class="modal-head"><h3>Your details</h3><button class="x" data-close>&times;</button></div>
          <div class="modal-body">
            <div class="panel" style="box-shadow:none;background:var(--bg-2);padding:16px;margin-bottom:20px">
              <div style="font-weight:700;margin-bottom:8px">${esc(ev.name)}</div>
              ${lines}
              <div class="total-line" style="padding:12px 0 0"><span class="muted">Total</span><b>${esc(amount(total, ev.currency))}</b></div>
            </div>
            <div class="field"><label>Full name</label><input id="bName" placeholder="As it should read on the ticket" autocomplete="name"></div>
            <div class="field"><label>M-Pesa number</label>
              <input id="bPhone" inputmode="tel" placeholder="07XX XXX XXX" autocomplete="tel">
              <p class="tiny muted" style="margin:6px 0 0">We send the payment request straight to this number.</p></div>
            <div class="field"><label>Email</label>
              <div style="display:flex;gap:8px;align-items:stretch;flex-wrap:wrap">
                <input id="bEmail" type="email" placeholder="you@example.com" autocomplete="email" style="flex:1;min-width:180px">
                <button type="button" class="btn btn-soft btn-sm" id="sendCode" style="flex:none">Send code</button>
              </div>
              <div id="codeRow" class="hidden" style="margin-top:10px">
                <div style="display:flex;gap:8px;align-items:stretch;flex-wrap:wrap">
                  <input id="bCode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
                         placeholder="6-digit code" style="flex:1;min-width:150px;letter-spacing:.3em;font-weight:700">
                  <button type="button" class="btn btn-primary btn-sm" id="checkCode" style="flex:none">Confirm</button>
                </div>
                <p class="tiny muted" id="codeHint" style="margin:7px 0 0"></p>
              </div>
              <p class="tiny" id="emailState" style="margin:7px 0 0;color:var(--muted)">
                We email your ticket here, so we check the address first.</p>
            </div>
            ${total > 0 ? `<div class="mpesa-note">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 2.5h10a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5z"/><path d="M10.5 18.5h3"/></svg>
              <div><b>Pay with M-Pesa</b><br><span class="muted">Your phone will buzz with a request for
                ${esc(amount(total, ev.currency))}. Enter your PIN on the phone — never type it here or tell it to anyone.</span></div>
            </div>` : ""}
            <p class="tiny muted" style="margin:14px 0 0">
              Your ticket is emailed to that address. ${esc(ev.org.name)} can see your name and contact details for this event only.</p>
          </div>
          <div class="modal-foot">
            <button class="btn btn-soft" data-close>Cancel</button>
            <button class="btn btn-primary" id="payBtn">${total === 0 ? "Get my ticket" : "Pay " + amount(total, ev.currency) + " by M-Pesa"}</button>
          </div>
        </div>
      </div>`;

    const close = () => ($("#modalHost").innerHTML = "");
    $$("[data-close]").forEach((b) => (b.onclick = close));
    $("#bd").addEventListener("click", (e) => { if (e.target.id === "bd") close(); });
    $("#bName").focus();
    $("#payBtn").onclick = pay;

    /* ---------- proving the email ---------- */
    let proof = null, proofFor = "";

    function setState(msg, kind) {
      const el = $("#emailState");
      el.textContent = msg;
      el.style.color = kind === "ok" ? "var(--green)" : kind === "err" ? "var(--red)" : "var(--muted)";
    }
    /* Changing the address after confirming it throws the proof away — it was
       only ever proof of the address it was sent to. */
    $("#bEmail").addEventListener("input", () => {
      if (proof && $("#bEmail").value.trim().toLowerCase() !== proofFor) {
        proof = null;
        $("#codeRow").classList.add("hidden");
        setState("We email your ticket here, so we check the address first.");
      }
    });

    $("#sendCode").onclick = async () => {
      const email = $("#bEmail").value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) return setState("That email doesn't look right.", "err");
      const b = $("#sendCode");
      b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
      try {
        await PL.sendEmailCode(email);
        $("#codeRow").classList.remove("hidden");
        $("#bCode").value = ""; $("#bCode").focus();
        $("#codeHint").textContent = "It expires in 10 minutes. Check spam if it's slow.";
        setState("Code sent to " + email + ".", "ok");
        b.textContent = "Resend";
        /* the server enforces the wait too; this just stops pointless clicks */
        b.disabled = true;
        setTimeout(() => { b.disabled = false; }, 60000);
      } catch (e) {
        b.disabled = false; b.textContent = "Send code";
        setState(e.message, "err");
      }
    };

    $("#checkCode").onclick = async () => {
      const email = $("#bEmail").value.trim();
      const code = $("#bCode").value.trim();
      if (!/^\d{6}$/.test(code)) return ($("#codeHint").textContent = "The code is six digits.");
      const b = $("#checkCode");
      b.disabled = true; b.innerHTML = '<span class="spinner"></span>';
      try {
        proof = await PL.verifyEmailCode(email, code);
        proofFor = email.toLowerCase();
        $("#codeRow").classList.add("hidden");
        setState("Email confirmed \u2713", "ok");
        $("#bName").value.trim() ? $("#payBtn").focus() : $("#bName").focus();
      } catch (e) {
        b.disabled = false; b.textContent = "Confirm";
        $("#codeHint").textContent = e.message;
      }
    };

    function currentProof() {
      return $("#bEmail").value.trim().toLowerCase() === proofFor ? proof : null;
    }
    window.__gekProof = currentProof;
  }

  async function pay() {
    const buyer = {
      name: $("#bName").value.trim(),
      email: $("#bEmail").value.trim(),
      phone: $("#bPhone").value.trim()
    };
    if (!buyer.name) return toast("We need a name for the ticket.", "err");
    if (!/^\S+@\S+\.\S+$/.test(buyer.email)) return toast("That email doesn't look right.", "err");

    /* The server refuses an unproved address anyway; this is just a clearer
       message than the one the database would give. */
    const proof = window.__gekProof ? window.__gekProof() : null;
    if (!proof) {
      $("#bEmail").focus();
      return toast("Confirm your email first — tap Send code.", "err");
    }
    /* a paid ticket has to reach a real Kenyan mobile — the STK push goes there */
    if (cartTotal() > 0) {
      const digits = buyer.phone.replace(/\D/g, "");
      if (!/^(?:254|0)?7\d{8}$|^(?:254|0)?1\d{8}$/.test(digits))
        return toast("Put in the M-Pesa number, like 0712 345 678.", "err");
    }

    const btn = $("#payBtn");
    btn.disabled = true;
    btn.innerHTML = cartTotal() > 0
      ? '<span class="spinner"></span> Check your phone…'
      : '<span class="spinner"></span> Getting your ticket…';

    try {
      /* The order is created first, so the money is always attached to something
         the server already knows the price of. */
      const order = await PL.checkout({
        event_id: ev.id,
        buyer, proof,
        items: Object.entries(cart).map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }))
      });

      if (cartTotal() > 0) {
        try {
          await PL.payByMpesa(order.reference, buyer.phone);
        } catch (err) {
          /* the order is safe — the ticket page explains what to do next */
          toast(err.message, "err");
        }
      }
      location.href = "ticket.html?ref=" + encodeURIComponent(order.reference);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "Try again";
      toast(e.message, "err");
    }
  }
})();
