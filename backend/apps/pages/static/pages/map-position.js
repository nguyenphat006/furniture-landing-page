/*
 * Bộ chọn vị trí cờ trên bản đồ xuất khẩu (block Xuất khẩu, apps/pages/blocks.py MapPositionWidget).
 * Ô "x,y" theo đơn vị bản đồ; bấm lên bản đồ để đặt. Hiện chấm các nước trong cùng danh sách và cờ của
 * chúng để tránh chồng nhau. Block thêm sau (StreamField) được bắt bằng MutationObserver.
 */
(function () {
  let countries = null;
  const loading = {};

  function load(url) {
    if (countries) return Promise.resolve(countries);
    if (!loading[url]) {
      loading[url] = fetch(url)
        .then((r) => r.json())
        .then((data) => {
          countries = {};
          data.countries.forEach((c) => (countries[c.code] = c));
          return countries;
        });
    }
    return loading[url];
  }

  // id ô vị trí: <tiền tố>-markets-<n>-value-position; nước: ...-value-country; cờ ở: ...-value-side
  const PATTERN = /^(.*-markets-)(\d+)-value-position$/;

  function siblings(input) {
    const m = PATTERN.exec(input.id);
    if (!m) return [];
    return Array.from(document.querySelectorAll(`input[id^="${m[1]}"][id$="-value-position"]`)).filter((el) => {
      const base = el.id.replace(/-value-position$/, "");
      const deleted = document.getElementById(`${base}-deleted`);
      return PATTERN.test(el.id) && !(deleted && deleted.value === "1");
    });
  }

  function parse(value) {
    const parts = (value || "").split(",").map(Number);
    return parts.length === 2 && parts.every((n) => Number.isFinite(n)) ? parts : null;
  }

  function field(input, name) {
    return document.getElementById(input.id.replace(/position$/, name));
  }

  function render(picker) {
    const input = picker.querySelector("input");
    const w = Number(picker.dataset.width);
    const h = Number(picker.dataset.height);
    load(picker.dataset.countries).then((all) => {
      const marks = picker.querySelector(".map-position__marks");
      const lines = picker.querySelector(".map-position__lines");
      marks.innerHTML = "";
      lines.innerHTML = "";
      siblings(input).forEach((el) => {
        const code = field(el, "country")?.value;
        const c = all[code];
        if (!c) return;
        const current = el === input;
        const [px, py] = c.point;
        const at = parse(el.value) || c.point;
        const side = field(el, "side")?.value || "C";
        if (at !== c.point) {
          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", px);
          line.setAttribute("y1", py);
          line.setAttribute("x2", at[0]);
          line.setAttribute("y2", at[1]);
          line.setAttribute("stroke", current ? "#f2c230" : "#fff");
          line.setAttribute("stroke-opacity", current ? "1" : ".6");
          line.setAttribute("stroke-width", current ? ".35" : ".2");
          lines.appendChild(line);
        }
        const dot = document.createElement("span");
        dot.className = "map-position__dot" + (current ? " is-current" : "");
        dot.style.left = `${(px / w) * 100}%`;
        dot.style.top = `${(py / h) * 100}%`;
        marks.appendChild(dot);
        const flag = document.createElement("span");
        flag.className = "map-position__flag" + (current ? " is-current" : "");
        flag.dataset.side = side;
        flag.textContent = c.vi;
        flag.style.left = `${(at[0] / w) * 100}%`;
        flag.style.top = `${(at[1] / h) * 100}%`;
        marks.appendChild(flag);
      });
    });
  }

  function renderGroup(input) {
    siblings(input).forEach((el) => {
      const picker = el.closest("[data-map-position]");
      if (picker) render(picker);
    });
  }

  document.addEventListener("click", (e) => {
    const frame = e.target.closest(".map-position__frame");
    const clear = e.target.closest("[data-map-position-clear]");
    const picker = (frame || clear)?.closest("[data-map-position]");
    if (!picker) return;
    const input = picker.querySelector("input");
    if (frame) {
      const box = frame.getBoundingClientRect();
      const x = ((e.clientX - box.left) / box.width) * Number(picker.dataset.width);
      const y = ((e.clientY - box.top) / box.height) * Number(picker.dataset.height);
      input.value = `${x.toFixed(1)},${y.toFixed(1)}`;
    } else {
      input.value = "";
    }
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!el.id) return;
    const input = /-value-position$/.test(el.id)
      ? el
      : document.getElementById(el.id.replace(/-value-(country|side)$/, "-value-position"));
    if (input && input !== el.parentNode && PATTERN.test(input.id)) renderGroup(input);
  });
  document.addEventListener("input", (e) => {
    if (PATTERN.test(e.target.id || "")) renderGroup(e.target);
  });

  const seen = new WeakSet();
  function scan() {
    document.querySelectorAll("[data-map-position]").forEach((picker) => {
      if (seen.has(picker)) return;
      seen.add(picker);
      renderGroup(picker.querySelector("input"));
    });
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", scan);
  scan();
})();
