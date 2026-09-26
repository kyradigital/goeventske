/* ============================================================
   Go Events Kenya — the public listing
   ============================================================ */
(async function () {
  const { $, esc, money, dayNum, monthShort, initials, tint, prettyTime } = UI;
  UI.header("discover");
  UI.footer();

  let category = "";
  let q = "";

  const cats = await PL.categories();
  $("#cats").innerHTML =
    [`<button class="chip on" data-c="">All events</button>`]
      .concat(cats.map((c) => `<button class="chip" data-c="${esc(c)}">${esc(c)}</button>`))
      .join("");

  $("#cats").addEventListener("click", (e) => {
    const b = e.target.closest(".chip");
    if (!b) return;
    UI.$$(".chip").forEach((x) => x.classList.toggle("on", x === b));
    category = b.dataset.c;
    draw();
  });

  let t;
  $("#q").addEventListener("input", (e) => {
    clearTimeout(t);
    t = setTimeout(() => { q = e.target.value.trim(); draw(); }, 200);
  });

  draw();

  async function draw() {
    const rows = await PL.publicEvents({ q, category });
    const grid = $("#grid");

    if (!rows.length) {
      grid.innerHTML = `
        <div class="empty">
          <h3>Nothing matches that</h3>
          <p>${q ? `No events for “${esc(q)}”${category ? " in " + esc(category) : ""}.` : "There are no live events in that category yet."}</p>
          <a class="btn btn-soft" href="admin.html?signup=1">Put one on yourself</a>
        </div>`;
      return;
    }

    grid.innerHTML = `<div class="ev-grid">${rows.map(card).join("")}</div>`;
    UI.stagger("#grid .ev-grid", 55);
    UI.animate(grid);
  }

  function card(e) {
    const left = e.capacity ? e.capacity - e.sold : null;
    const scarce = left !== null && left > 0 && left <= 20;
    return `
      <a class="ev-card" href="event.html?e=${encodeURIComponent(e.slug)}">
        <div class="ev-img" style="background:${tint(e.name)}">
          ${UI.safeImage(e.image) ? `<img src="${UI.safeImage(e.image)}" alt="">` : `<span class="ph">${esc(initials(e.name))}</span>`}
          <div class="ev-date">
            <div class="d">${dayNum(e.date)}</div>
            <div class="m">${monthShort(e.date)}</div>
          </div>
        </div>
        <div class="ev-body">
          <div class="ev-org">${esc(e.org.name)}</div>
          <h3>${esc(e.name)}</h3>
          <div class="ev-meta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>
            ${esc(e.venue)}, ${esc(e.city)}
          </div>
          <div class="ev-meta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/></svg>
            ${esc(prettyTime(e.start_time))}
          </div>
          <div class="ev-foot">
            ${e.sold_out
              ? `<span class="badge bad">Sold out</span>`
              : `<div class="ev-price"><small>${e.current ? esc(e.current.name) : "From"}</small>${esc(money(e.current ? e.current.price : e.from_price, e.currency))}</div>`}
            ${scarce ? `<span class="badge warn">${left} left</span>` : `<span class="badge live">${esc(e.category)}</span>`}
          </div>
        </div>
      </a>`;
  }
})();
