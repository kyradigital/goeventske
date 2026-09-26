/* ============================================================
   Go Events Kenya — one event, and buying a ticket for it
   ============================================================ */
(async function () {
  const { $, $$, esc, money, amount, when, prettyTime, initials, tint, toast, qs } = UI;

  const TICK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5.2 5L20 6.5"/></svg>';

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

      <div class="ev-cols" id="cols">
        <div>
          ${UI.safeImage(ev.image)
            ? `<div class="ev-hero">
                 <div class="ev-art-bg" style="background-image:url('${UI.safeImage(ev.image).replace(/'/g, "%27")}')"></div>
                 <img src="${UI.safeImage(ev.image)}" alt="Poster for ${esc(ev.name)}">
               </div>`
            : `<div class="ev-hero is-ph" style="background:${tint(ev.name)}">
                 <span class="ph ph-lg">${esc(initials(ev.name))}</span>
               </div>`}

          <div class="ev-chips">
            <span class="badge live">${esc(ev.category)}</span>
            <span class="by-org">
              ${UI.safeImage(ev.org.logo)
                ? `<img src="${UI.safeImage(ev.org.logo)}" alt="">`
                : `<i style="background:${esc(ev.org.colour || "#1f1f24")};color:${UI.inkOn(ev.org.colour)}">${esc(initials(ev.org.name))}</i>`}
              ${esc(ev.org.name)}
            </span>
          </div>

          <h1 class="ev-title">${esc(ev.name)}</h1>
          <p class="muted ev-tagline">${esc(ev.tagline || "")}</p>

          <div class="panel" style="margin-bottom:22px">
            <div class="ev-facts">
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
            <h3 class="buy-head">About this event</h3>
            <p class="muted" style="margin:0;white-space:pre-line">${esc(ev.about)}</p>
          </div>` : ""}
        </div>

        <div class="panel buy-panel" id="buyBox" style="position:sticky;top:90px"></div>
      </div>

      <div class="buy-bar" id="buyBar" hidden>
        <div class="bb-price">${esc(fromLine())}</div>
        <button class="btn btn-primary" id="bbGo" ${ev.sold_out ? "disabled" : ""}>
          ${ev.sold_out ? "Sold out" : "Get tickets"}</button>
      </div>`;

    if (window.innerWidth < 900) $("#cols").style.gridTemplateColumns = "1fr";
    paintBuy();
    watchBuyBar();
    UI.stagger("#cols > div:first-child", 70);
    $("#buyBox").setAttribute("data-reveal", "up");
    UI.animate(view);
  }

  function fromLine() {
    if (ev.sold_out) return "No tickets left";
    if (ev.from_price === null) return "";
    return ev.from_price === 0 ? "Free entry" : "From " + money(ev.from_price, ev.currency);
  }

  /* On a phone the buy box sits below the details, so a bar follows the thumb
     until the real one is on screen. It never covers anything: the page gets
     padding at the bottom while the bar is up. */
  function watchBuyBar() {
    const bar = $("#buyBar"), box = $("#buyBox");
    if (!bar || !box) return;

    $("#bbGo").onclick = () => {
      box.scrollIntoView({ behavior: "smooth", block: "center" });
      /* if there is already something in the cart, go straight to checkout */
      if (Object.values(cart).some((n) => n > 0)) setTimeout(openCheckout, 420);
    };

    const show = (on) => {
      bar.hidden = !on;
      document.body.classList.toggle("has-buy-bar", on);
    };

    if (!("IntersectionObserver" in window)) return;         // old browser: leave it off
    new IntersectionObserver(([entry]) => {
      show(!entry.isIntersecting && window.innerWidth <= 640);
    }, { rootMargin: "-80px 0px -80px 0px" }).observe(box);

    addEventListener("resize", () => {
      if (window.innerWidth > 640) show(false);
    });
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

    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    const total = cartTotal();

    box.innerHTML = `
      <div class="buy-top">
        <h3>Get your tickets</h3>
        <div class="from">${esc(fromLine())}${ev.from_price ? " · pay with card or M-Pesa" : ""}</div>
      </div>
      <div class="buy-list">${onSale.map(ticketRow).join("")}</div>
      <div class="buy-foot">
        <div class="total-line">
          <span class="lbl">Total${count ? `<small>${count} ticket${count > 1 ? "s" : ""}</small>` : "<small>nothing chosen yet</small>"}</span>
          <b id="total">${amount(total, ev.currency)}</b>
        </div>
        <button class="btn btn-primary btn-block btn-lg" id="buyBtn" ${count ? "" : "disabled"}>${esc(buyLabel())}</button>
        <div class="buy-trust">
          <span>${TICK} QR ticket by email, instantly</span>
          <span>${TICK} Card or M-Pesa</span>
          <span>${TICK} Payment handled by Paystack</span>
        </div>
      </div>`;

    /* the whole stub is the target — tapping a small + on a phone is fiddly */
    $$("#buyBox .tt").forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest("[data-step]")) return;
        if (row.classList.contains("sold")) return;
        step(row.dataset.id, 1);
      };
    });
    $$("#buyBox [data-step]").forEach((b) => (b.onclick = (e) => {
      e.stopPropagation(); step(b.dataset.tt, Number(b.dataset.step));
    }));
    $("#buyBtn").onclick = openCheckout;
  }

  function ticketRow(t) {
    const left = t.quantity === 0 ? Infinity : t.quantity - t.sold;
    const gone = left <= 0;
    const n = cart[t.id] || 0;
    const free = t.price === 0;
    return `
      <div class="tt ${gone ? "sold" : ""}${n ? " picked" : ""}" data-id="${t.id}">
        <div class="tt-top">
          <div style="min-width:0">
            <h4>${esc(t.name)}</h4>
            ${t.blurb ? `<div class="small muted">${esc(t.blurb)}</div>` : ""}
            <div class="tt-price${free ? " free" : ""}">${free ? "Free" : esc(money(t.price, ev.currency))}</div>
            ${left !== Infinity && left > 0 && left <= 20
              ? `<div class="tt-left">Only ${left} left</div>` : ""}
          </div>
          ${gone
            ? `<span class="badge bad">Gone</span>`
            : n
              ? `<div class="qty">
                   <button data-tt="${t.id}" data-step="-1" aria-label="one fewer ${esc(t.name)}">−</button>
                   <b>${n}</b>
                   <button data-tt="${t.id}" data-step="1" aria-label="one more ${esc(t.name)}"
                     ${n >= Math.min(10, left) ? "disabled" : ""}>+</button>
                 </div>`
              : `<button class="tt-add" data-tt="${t.id}" data-step="1">Add</button>`}
        </div>
      </div>`;
  }

  function buyLabel() {
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    const total = cartTotal();
    if (!count) return "Choose your tickets";
    if (total === 0) return `Get ${count} free ticket${count > 1 ? "s" : ""}`;
    return `Buy ${count} ticket${count > 1 ? "s" : ""} · ${amount(total, ev.currency)}`;
  }

  function step(id, by) {
    const t = ev.ticket_types.find((x) => x.id === id);
    const left = t.quantity === 0 ? Infinity : t.quantity - t.sold;
    const next = Math.max(0, Math.min(10, (cart[id] || 0) + by));
    if (next > left) return toast(`Only ${left} of those left.`, "err");
    if (next === (cart[id] || 0)) return;
    cart[id] = next;
    if (!next) delete cart[id];

    paintBuy();

    /* a small nudge on the total, so the change is felt and not just seen */
    const tot = $("#total");
    if (tot) { tot.classList.remove("bump"); void tot.offsetWidth; tot.classList.add("bump"); }
    paintBuyBar();
  }

  /* the phone bar carries the same numbers as the panel */
  function paintBuyBar() {
    const bar = $("#buyBar");
    if (!bar) return;
    const count = Object.values(cart).reduce((a, b) => a + b, 0);
    const price = $(".bb-price", bar);
    const go = $("#bbGo");
    if (price) price.innerHTML = count
      ? `<b>${esc(amount(cartTotal(), ev.currency))}</b><small>${count} ticket${count > 1 ? "s" : ""}</small>`
      : esc(fromLine());
    if (go && !ev.sold_out) go.textContent = count ? "Checkout" : "Get tickets";
  }

  /* a declaration, not a const: paintBuy runs before this point in the file */
  function cartTotal() {
    return Object.entries(cart).reduce((n, [id, q]) => {
      const t = ev.ticket_types.find((x) => x.id === id);
      return n + (t ? t.price * q : 0);
    }, 0);
  }

  /* ---------- checkout ----------
     Three steps, one modal: who you are, prove the inbox is yours, then pay.
     Nothing sensitive is typed here — the code arrives by email and the card
     details are entered on Paystack's own page. */
  function openCheckout() {
    const total = cartTotal();
    const lines = Object.entries(cart).map(([id, q]) => {
      const t = ev.ticket_types.find((x) => x.id === id);
      return `<div class="ck-line">
        <span><i>${q}×</i> ${esc(t.name)}</span><b>${esc(amount(t.price * q, ev.currency))}</b></div>`;
    }).join("");

    /* the order, shown as the thing they are buying rather than a table */
    const summary = `
      <div class="ck-order">
        <div class="ck-order-top">
          <div class="ck-when">
            <div class="d">${UI.dayNum(ev.date)}</div>
            <div class="m">${UI.monthShort(ev.date)}</div>
          </div>
          <div style="min-width:0">
            <div class="ck-ev">${esc(ev.name)}</div>
            <div class="ck-where">${esc(ev.venue)}, ${esc(ev.city)} · ${esc(prettyTime(ev.start_time))}</div>
          </div>
        </div>
        <div class="ck-lines">${lines}</div>
        <div class="ck-total"><span>Total</span><b>${esc(amount(total, ev.currency))}</b></div>
      </div>`;

    $("#modalHost").innerHTML = `
      <div class="backdrop" id="bd">
        <div class="modal">
          <div class="modal-head">
            <div>
              <h3 id="ckTitle">Your details</h3>
              <div class="ck-steps" id="ckDots"></div>
            </div>
            <button class="x" data-close>&times;</button>
          </div>
          <div class="modal-body" id="ckBody"></div>
          <div class="modal-foot" id="ckFoot"></div>
        </div>
      </div>`;

    const close = () => ($("#modalHost").innerHTML = "");
    $("#bd").addEventListener("click", (e) => { if (e.target.id === "bd") close(); });
    $$("[data-close]").forEach((b) => (b.onclick = close));

    let buyer = { name: "", email: "" };
    let proof = null;

    /* naming the steps makes a three-part process feel short rather than vague */
    const STEPS = ["Details", "Verify", "Pay"];
    const dots = (n) => ($("#ckDots").innerHTML = STEPS.map((label, i) =>
      `<span class="ck-step ${i < n - 1 ? "done" : i === n - 1 ? "now" : ""}">
         <i>${i < n - 1 ? TICK : i + 1}</i>${label}</span>`).join(""));

    /* ---------- step one: who is buying ---------- */
    function stepDetails(msg) {
      $("#ckTitle").textContent = "Your details";
      dots(1);
      $("#ckBody").innerHTML = `
        ${summary}
        <div class="field"><label for="bName">Full name</label>
          <input id="bName" value="${esc(buyer.name)}" placeholder="As it should read on the ticket" autocomplete="name"></div>
        <div class="field" style="margin-bottom:6px"><label for="bEmail">Email address</label>
          <input id="bEmail" type="email" value="${esc(buyer.email)}" placeholder="you@example.com"
                 autocomplete="email" inputmode="email"></div>
        <p class="tiny muted" style="margin:0 0 4px">
          Your ticket lands in this inbox, so check it twice. We'll send a six-digit code there
          first to make sure it's yours.</p>
        ${msg ? `<p class="tiny" style="color:var(--red);margin:10px 0 0">${esc(msg)}</p>` : ""}`;
      $("#ckFoot").innerHTML = `
        <button class="btn btn-soft" data-close>Cancel</button>
        <button class="btn btn-primary" id="ckGo">Send me the code</button>`;
      $$("[data-close]").forEach((b) => (b.onclick = close));
      $("#bName").focus();
      $("#bEmail").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#ckGo").click(); });
      $("#ckGo").onclick = sendCode;
    }

    async function sendCode() {
      buyer.name = $("#bName").value.trim();
      buyer.email = $("#bEmail").value.trim();
      if (!buyer.name) return stepDetails("We need a name for the ticket.");
      if (!/^\S+@\S+\.\S+$/.test(buyer.email)) return stepDetails("That email address doesn't look right.");

      const btn = $("#ckGo");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        await PL.sendEmailCode(buyer.email);
        stepCode();
      } catch (e) {
        stepDetails(e.message);
      }
    }

    /* ---------- step two: prove the inbox ---------- */
    function stepCode(msg) {
      $("#ckTitle").textContent = "Check your email";
      dots(2);
      $("#ckBody").innerHTML = `
        <div class="sent-note">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none">
            <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h15A1.5 1.5 0 0 1 21 7.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5z"/>
            <path d="M3.5 7.5l8.5 6 8.5-6"/></svg>
          <div>A code has been sent to <b>${esc(buyer.email)}</b></div>
        </div>
        <div class="field" style="margin-bottom:8px">
          <label for="bCode">Enter the 6-digit code</label>
          <input id="bCode" class="otp-input" inputmode="numeric" autocomplete="one-time-code"
                 maxlength="6" placeholder="000000"></div>
        <p class="tiny muted" style="margin:0">
          It expires in 10 minutes. Nothing is charged until you've entered it.</p>
        ${msg ? `<p class="tiny" style="color:var(--red);margin:10px 0 0">${esc(msg)}</p>` : ""}`;
      $("#ckFoot").innerHTML = `
        <button class="btn btn-soft" id="ckBack">Back</button>
        <button class="btn btn-primary" id="ckConfirm">Confirm and pay ${esc(amount(total, ev.currency))}</button>`;
      $("#ckBack").onclick = () => stepDetails();
      $("#ckConfirm").onclick = confirmCode;

      const box = $("#bCode");
      box.focus();
      /* digits only, and go the moment six are in */
      box.addEventListener("input", () => {
        box.value = box.value.replace(/\D/g, "").slice(0, 6);
        if (box.value.length === 6) confirmCode();
      });
      box.addEventListener("keydown", (e) => { if (e.key === "Enter") confirmCode(); });
    }

    let checking = false;
    async function confirmCode() {
      if (checking) return;
      const code = $("#bCode").value.trim();
      if (!/^\d{6}$/.test(code)) return;
      checking = true;

      const btn = $("#ckConfirm");
      btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
      try {
        proof = await PL.verifyEmailCode(buyer.email, code);
      } catch (e) {
        checking = false;
        return stepCode(e.message);
      }

      btn.innerHTML = '<span class="spinner"></span> Opening payment…';
      try {
        const order = await PL.checkout({
          event_id: ev.id,
          buyer: { name: buyer.name, email: buyer.email, phone: null },
          proof,
          items: Object.entries(cart).map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }))
        });

        if (total > 0) {
          const pay = await PL.payForOrder(order.reference);
          if (pay && pay.url) { location.href = pay.url; return; }
        }
        location.href = "ticket.html?ref=" + encodeURIComponent(order.reference);
      } catch (e) {
        checking = false;
        stepCode(e.message);
      }
    }

    stepDetails();
  }

})();
