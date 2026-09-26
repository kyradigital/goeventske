/* ============================================================
   Go Events Kenya — shared bits every page uses
   ============================================================ */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- money ---------- */
  function money(n, cur) {
    const v = Number(n || 0);
    if (v === 0) return "Free";
    return (cur || "KES") + " " + v.toLocaleString("en-KE", { maximumFractionDigits: 0 });
  }
  /* totals never say "Free" — a zero total is still a number */
  function amount(n, cur) {
    return (cur || "KES") + " " + Number(n || 0).toLocaleString("en-KE", { maximumFractionDigits: 0 });
  }

  /* ---------- dates ---------- */
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

  function d(x) { return x instanceof Date ? x : new Date(String(x).length <= 10 ? x + "T00:00:00" : x); }
  function dayNum(x) { return d(x).getDate(); }
  function monthShort(x) { return MONTHS[d(x).getMonth()]; }
  function prettyDate(x) {
    if (!x) return "—";
    const t = d(x);
    return `${DAYS[t.getDay()]}, ${t.getDate()} ${LONG[t.getMonth()]} ${t.getFullYear()}`;
  }
  function shortDate(x) {
    if (!x) return "—";
    const t = d(x);
    return `${t.getDate()} ${MONTHS[t.getMonth()]} ${t.getFullYear()}`;
  }
  function prettyTime(t) {
    if (!t) return "";
    const [h, m] = String(t).split(":").map(Number);
    const ap = h >= 12 ? "PM" : "AM";
    return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${ap}`;
  }
  function when(x, t) {
    return prettyDate(x) + (t ? " · " + prettyTime(t) : "");
  }
  function ago(iso) {
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 90) return "just now";
    if (s < 3600) return Math.round(s / 60) + " min ago";
    if (s < 86400) return Math.round(s / 3600) + "h ago";
    if (s < 604800) return Math.round(s / 86400) + "d ago";
    return shortDate(iso);
  }

  /* ---------- toast ---------- */
  let toastEl, toastTimer;
  function toast(msg, kind) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.className = "show " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastEl.className = kind || ""), 3600);
  }

  /* ---------- url ---------- */
  const qs = (k) => new URLSearchParams(location.search).get(k);

  /* ---------- initials + colour for placeholder art ---------- */
  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  }
  /* An organiser picks their own colour, so the initials on top can't be a fixed
     white — on a light one that reads at 2.9:1. Pick whichever passes. */
  function inkOn(colour) {
    const h = String(colour || "").replace("#", "");
    if (h.length !== 6) return "#fff";
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)));
    const L = .2126 * r + .7152 * g + .0722 * b;
    return (L + .05) / .05 > 4.5 ? "#0a0a0c" : "#fff";     // black if the colour is light
  }

  /* Placeholder art for an event with no poster: charcoal running into either the
     red or the green, so a wall of them still reads as one brand. The seed only
     decides which of the two, and nudges the depth. */
  function tint(seed) {
    let n = 0;
    for (const c of String(seed)) n = (n * 31 + c.charCodeAt(0)) % 100;
    const h = 16 + (n % 12);                      // 16-27 deg: orange, never yellow
    /* the light end stops at 38% so white initials on top always clear 4.5:1 */
    return `linear-gradient(140deg, hsl(${h} 48% ${20 + (n % 4) * 2}%) 8%, hsl(${h + 4} 82% ${29 + (n % 3) * 2}%) 96%)`;
  }

  /* ---------- pictures ----------
     There is no server here, so a picture a person picks is resized in the
     browser and kept on the record as a data URL. Nothing is ever fetched from
     somewhere else, and nothing the person picks leaves their machine.

     A real backend swaps readImage() for an upload that returns a URL — every
     caller below stores whatever string comes back, so nothing else changes. */
  const IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
  const MAX_PICK = 12 * 1024 * 1024;

  /* A picture is either one this page just encoded, or a file in our own
     Supabase storage bucket. Anything else — another site's address, a
     javascript: string, something edited into a record by hand — is dropped
     rather than put in an <img src>. */
  const IMG_DATA = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;
  function safeImage(v) {
    const s = String(v || "");
    if (!s) return "";
    if (IMG_DATA.test(s)) return s;                      // freshly picked, not uploaded yet
    try {
      const u = new URL(s);
      const home = new URL(window.GEK ? GEK.url : "https://invalid.invalid");
      if (u.protocol === "https:" && u.host === home.host &&
          u.pathname.startsWith("/storage/v1/object/public/media/")) return s;
    } catch (e) { /* not a URL at all */ }
    return "";
  }

  function readImage(file, opts) {
    const o = Object.assign({ max: 1280, square: false, quality: .78 }, opts);
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error("No picture chosen."));
      if (!IMAGE_TYPES.includes(file.type))
        return reject(new Error("That needs to be a JPG, PNG, WebP or GIF."));
      if (file.size > MAX_PICK)
        return reject(new Error("That picture is over 12 MB — pick a smaller one."));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("That file could not be read."));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("That file isn't a picture we can open."));
        img.onload = () => {
          try { resolve(shrink(img, o)); }
          catch (e) { reject(new Error("That picture could not be processed.")); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* Re-encode on a canvas: a 4 MB phone photo comes out around 100 KB, which is
     what keeps a browser's storage from filling up after three events. */
  function shrink(img, o) {
    let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight, dw, dh;
    if (!sw || !sh) throw new Error("empty image");
    if (o.square) {                                  // centre-crop, for avatars
      const side = Math.min(sw, sh);
      sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side;
      dw = dh = Math.min(side, o.max);
    } else {
      const k = Math.min(1, o.max / Math.max(sw, sh));
      dw = Math.max(1, Math.round(sw * k));
      dh = Math.max(1, Math.round(sh * k));
    }
    const cv = document.createElement("canvas");
    cv.width = dw; cv.height = dh;
    const cx = cv.getContext("2d");
    cx.fillStyle = "#ffffff";                        // a transparent logo lands on the card colour
    cx.fillRect(0, 0, dw, dh);
    cx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
    let q = o.quality, out = cv.toDataURL("image/jpeg", q);
    while (out.length > 240000 && q > .32) { q -= .12; out = cv.toDataURL("image/jpeg", q); }
    return out;
  }

  /* the same bytes as a file, for uploading */
  function dataUrlToBlob(url) {
    const [head, b64] = String(url).split(",");
    const type = (head.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    const bin = atob(b64);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return new Blob([buf], { type });
  }

  /* Wires up one upload box. The markup is `uploadBox()` below; this returns an
     object whose .value() the surrounding form reads like any other field. */
  function upload(box, opts) {
    const o = Object.assign({ max: 1280, square: false, empty: "No picture yet" }, opts);
    const pv = box.querySelector("[data-up='pv']");
    const file = box.querySelector("input[type='file']");
    const pick = box.querySelector("[data-up='pick']");
    const drop = box.querySelector("[data-up='clear']");
    let value = safeImage(box.dataset.value || "");

    function paintWith(src) {
      pv.textContent = "";
      const im = new Image();
      im.src = src; im.alt = "";
      pv.appendChild(im);
    }
    function paint() {
      pv.textContent = "";
      if (value) {
        const im = new Image();
        im.src = value; im.alt = "";
        pv.appendChild(im);
      } else {
        const sp = document.createElement("span");
        sp.className = "tiny muted";
        sp.textContent = o.empty;
        pv.appendChild(sp);
      }
      pick.textContent = value ? "Change picture" : "Upload a picture";
      drop.hidden = !value;
    }
    pick.onclick = () => file.click();
    drop.onclick = () => { value = ""; paint(); };
    file.onchange = async () => {
      const f = file.files && file.files[0];
      file.value = "";                               // so picking the same file twice still fires
      if (!f) return;
      pick.disabled = true; pick.textContent = "Working…";
      try {
        const small = await readImage(f, o);
        paintWith(small);                            // show it while the upload runs
        value = await PL.uploadImage(dataUrlToBlob(small), o.kind || "image");
      } catch (e) {
        value = "";
        toast(e.message, "err");
      } finally { pick.disabled = false; paint(); }
    };
    paint();
    return { value: () => value, set: (v) => { value = safeImage(v); paint(); } };
  }

  function uploadBox(id, current, o) {
    o = o || {};
    return `<div class="upload${o.round ? " round" : ""}" id="${id}" data-value="${esc(safeImage(current))}">
        <div class="upload-pv" data-up="pv"></div>
        <div class="upload-act">
          <button type="button" class="btn btn-ghost btn-sm" data-up="pick">Upload a picture</button>
          <button type="button" class="btn btn-ghost btn-sm" data-up="clear" hidden>Remove</button>
          <p class="tiny muted" style="margin:8px 0 0">${esc(o.hint || "JPG, PNG, WebP or GIF, up to 12 MB.")}</p>
        </div>
        <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
      </div>`;
  }

  /* ---------- confetti ----------
     Hand-rolled on a canvas rather than pulling in a library: it is forty lines,
     it runs once, and it removes itself. Anyone who has asked their system for
     less motion gets none at all. */
  function confetti(opts) {
    const o = Object.assign({ count: 90, seconds: 2.6 }, opts);
    try {
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    } catch (e) { /* older browser: carry on */ }

    const cv = document.createElement("canvas");
    cv.setAttribute("aria-hidden", "true");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:500";
    document.body.appendChild(cv);

    const cx = cv.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    function size() {
      cv.width = Math.floor(innerWidth * dpr);
      cv.height = Math.floor(innerHeight * dpr);
      cx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    addEventListener("resize", size);

    const colours = ["#f26a1b", "#c2470a", "#ffb06b", "#0f7a3a", "#17171b", "#ffd9bd"];
    const bits = Array.from({ length: o.count }, () => ({
      x: innerWidth * (.2 + Math.random() * .6),
      y: innerHeight * .28 + Math.random() * 40,
      vx: (Math.random() - .5) * 9,
      vy: -8 - Math.random() * 9,
      w: 6 + Math.random() * 6,
      h: 9 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      spin: (Math.random() - .5) * .3,
      colour: colours[(Math.random() * colours.length) | 0],
    }));

    const started = performance.now();
    (function frame(now) {
      const life = (now - started) / (o.seconds * 1000);
      if (life >= 1) {
        removeEventListener("resize", size);
        cv.remove();
        return;
      }
      cx.clearRect(0, 0, innerWidth, innerHeight);
      cx.globalAlpha = life > .75 ? (1 - life) / .25 : 1;     // fade out at the end
      for (const b of bits) {
        b.vy += .34;                                          // gravity
        b.vx *= .995;
        b.x += b.vx; b.y += b.vy; b.rot += b.spin;
        cx.save();
        cx.translate(b.x, b.y);
        cx.rotate(b.rot);
        cx.fillStyle = b.colour;
        cx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
        cx.restore();
      }
      requestAnimationFrame(frame);
    })(started);
  }

  /* ---------- motion ----------
     Two ideas only, used everywhere:

       reveal   a thing rises into place the first time it is scrolled to
       count    a number climbs to its value once it is on screen

     Both are driven by IntersectionObserver, both run exactly once, and both
     do nothing at all for anyone whose system asks for reduced motion — that
     setting is a request, not a preference to weigh up. */
  function motionOK() {
    try { return !window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return true; }
  }

  function animate(root) {
    const scope = root || document;
    const targets = $$("[data-reveal],[data-count]", scope);
    if (!targets.length) return;

    /* No motion, or an old browser: show everything immediately and leave. */
    if (!motionOK() || !("IntersectionObserver" in window)) {
      targets.forEach((el) => {
        el.classList.add("shown");
        if (el.hasAttribute("data-count")) el.textContent = el.getAttribute("data-count-text") || el.textContent;
      });
      return;
    }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target;
        io.unobserve(el);

        /* a group rises one after another rather than all at once */
        const delay = Number(el.getAttribute("data-delay") || 0);
        setTimeout(() => {
          el.classList.add("shown");
          if (el.hasAttribute("data-count")) countUp(el);
        }, delay);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: .12 });

    targets.forEach((el) => io.observe(el));
  }

  /* Climbs to the number already written in the element, keeping whatever sits
     around it — "KES 486,500" counts the digits and leaves the rest alone. */
  function countUp(el) {
    const finalText = el.textContent;
    const m = finalText.match(/-?[\d][\d,\s]*/);
    if (!m) return;
    const target = Number(m[0].replace(/[,\s]/g, ""));
    if (!isFinite(target) || target === 0) return;

    const before = finalText.slice(0, m.index);
    const after = finalText.slice(m.index + m[0].length);
    const grouped = m[0].includes(",");
    const ms = 900, started = performance.now();

    (function step(now) {
      const t = Math.min(1, (now - started) / ms);
      const eased = 1 - Math.pow(1 - t, 3);                 // fast, then settles
      const v = Math.round(target * eased);
      el.textContent = before + (grouped ? v.toLocaleString("en-KE") : String(v)) + after;
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = finalText;                      // land on the exact value
    })(started);
  }

  /* Marks the children of a container so they arrive in sequence. */
  function stagger(selector, step) {
    $$(selector).forEach((group) => {
      Array.from(group.children).forEach((child, i) => {
        if (!child.hasAttribute("data-reveal")) child.setAttribute("data-reveal", "up");
        child.setAttribute("data-delay", String(i * (step || 70)));
      });
    });
  }

  /* ---------- chrome ---------- */
  const LOGO = `<a class="logo" href="index.html" aria-label="Go Events Kenya — home">
      <img src="assets/img/logo.png" alt="Go Events Kenya, ticketing solutions">
    </a>`;

  function header(active) {
    const el = $("#siteHead");
    if (!el) return;
    const on = (n) => (active === n ? ' style="color:var(--ink)"' : "");
    el.innerHTML = `
      <div class="wrap">
        ${LOGO}
        <nav class="nav">
          <a href="discover.html" class="hide-sm"${on("discover")}>Discover events</a>
          <a href="index.html#how" class="hide-sm"${on("how")}>How it works</a>
          <a href="index.html#pricing" class="hide-sm"${on("pricing")}>Pricing</a>
          <a class="btn btn-soft btn-sm hide-sm" href="admin.html">Organiser sign in</a>
          <a class="btn btn-primary btn-sm" href="admin.html?signup=1">Start selling</a>
        </nav>
      </div>`;
  }

  function footer() {
    const el = $("#siteFoot");
    if (!el) return;
    el.innerHTML = `
      <div class="wrap">
        <div class="foot-grid">
          <div>
            ${LOGO}
            <p class="small muted" style="margin:14px 0 0;max-width:26em">
              Ticketing for anyone who puts on events. Sell online, scan at the gate, get paid after.</p>
          </div>
          <div>
            <h4>Product</h4>
            <a href="index.html#how">How it works</a>
            <a href="index.html#features">Features</a>
            <a href="index.html#pricing">Pricing</a>
            <a href="scan.html">Gate scanner</a>
          </div>
          <div>
            <h4>For buyers</h4>
            <a href="discover.html">Discover events</a>
            <a href="ticket.html">Find my ticket</a>
          </div>
          <div>
            <h4>Company</h4>
            <a href="index.html#faq">FAQ</a>
            <a href="mailto:hello@goeventskenya.co.ke">Contact</a>
          </div>
        </div>
        <div class="foot-bottom">
          <span>© ${new Date().getFullYear()} Go Events Kenya.</span>
          <span><a href="scan.html">Gate scanner</a></span>
        </div>
      </div>`;
  }

  /* ---------- QR ---------- */
  function drawQR(box, text, fallbackLabel) {
    try {
      if (typeof qrcode !== "function") throw new Error("QR encoder missing");
      const qr = qrcode(0, "M");
      qr.addData(String(text));
      qr.make();
      const n = qr.getModuleCount(), quiet = 2, size = n + quiet * 2;
      let path = "";
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          if (qr.isDark(r, c)) path += `M${c + quiet},${r + quiet}h1v1h-1z`;
      box.innerHTML =
        `<svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="Ticket QR code">` +
        `<rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#0d0d0f"/></svg>`;
    } catch (e) {
      /* never leave a buyer with an empty square — the code still gets them in */
      console.error("QR render failed:", e);
      box.classList.add("qr-fallback");
      box.innerHTML = `<div><div class="tiny muted">Show this at the gate</div>
        <b class="code" style="margin-top:6px">${esc(fallbackLabel || "")}</b></div>`;
    }
  }

  window.UI = { $, $$, esc, money, amount, inkOn, prettyDate, shortDate, prettyTime, when, ago,
                dayNum, monthShort, toast, qs, initials, tint, header, footer, drawQR, LOGO,
                readImage, safeImage, upload, uploadBox, dataUrlToBlob, confetti, animate, stagger, motionOK };
})();
