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
      const c0 = $("#count");
      if (c0) c0.textContent = "";
      grid.innerHTML = `
        <div class="empty">
          <h3>Nothing matches that</h3>
          <p>${q ? `No events for “${esc(q)}”${category ? " in " + esc(category) : ""}.` : "There are no live events in that category yet."}</p>
          <a class="btn btn-soft" href="admin.html?signup=1">Put one on yourself</a>
        </div>`;
      return;
    }

    grid.innerHTML = `<div class="ev-grid">${rows.map(UI.eventCard).join("")}</div>`;
    const c = $("#count");
    if (c) c.textContent = rows.length === 1 ? "1 event" : `${rows.length} events`;
    UI.stagger("#grid .ev-grid", 55);
    UI.animate(grid);
  }

})();
