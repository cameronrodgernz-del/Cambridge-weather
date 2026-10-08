/* Tee times: the best weather window at every course near Cambridge, and the open tee times inside it.
   Weather comes from Open-Meteo for each course's own position. Open tee times come from /api/teesheet,
   which reads the public day sheets of the clubs on Golf NZ's booking system. */
(function () {
  "use strict";

  const COURSES = window.COURSES || [];
  const LIVE_IDS = COURSES.filter(c => c.live).map(c => c.live);
  const $ = id => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const K = () => window.WXCORE;

  let W = null;               // { now, nowN, dates[], byCourse: { key: { rows[], days{date:{sunrise,sunset}} } } }
  const sheets = {};          // date -> { at, data }
  let dayIdx = null, holes = 18, active = false, wxAt = 0, seq = 0;
  try { const h = +localStorage.getItem("wx-holes"); if (h === 9 || h === 18) holes = h; } catch (e) { /* storage unavailable */ }

  const minsOf = t => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const clock = m => { const h = Math.floor(m / 60), mm = m % 60; return (h % 12 === 0 ? 12 : h % 12) + (mm ? ":" + String(mm).padStart(2, "0") : "") + (h < 12 ? "am" : "pm"); };
  const money = v => v == null ? null : "$" + v;
  const weekdayOf = date => new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay();
  const dur = () => holes === 18 ? 270 : 135;

  /* ---------- data ---------- */
  function weatherUrl() {
    const q = {
      latitude: COURSES.map(c => c.lat.toFixed(4)).join(","),
      longitude: COURSES.map(c => c.lon.toFixed(4)).join(","),
      timezone: "Pacific/Auckland", forecast_days: 8, wind_speed_unit: "kmh",
      current: "temperature_2m",
      hourly: "temperature_2m,apparent_temperature,dew_point_2m,precipitation_probability,precipitation,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day",
      daily: "sunrise,sunset"
    };
    return "https://api.open-meteo.com/v1/forecast?" + Object.entries(q).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  }

  async function getJSON(url, ms) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), ms || 25000);
    try {
      const r = await fetch(url, { signal: ctl.signal });
      const j = await r.json();
      if (!r.ok || j.error) throw new Error(j.reason || j.error || "HTTP " + r.status);
      return j;
    } finally { clearTimeout(timer); }
  }

  function buildWeather(list) {
    const k = K();
    const arr = Array.isArray(list) ? list : [list];
    const byCourse = {};
    let now = null;
    COURSES.forEach((c, i) => {
      const j = arr[i];
      if (!j || !j.hourly) return;
      if (!now && j.current) now = j.current.time;
      const h = j.hourly, g = (key, n) => (h[key] ? h[key][n] : null);
      const rows = h.time.map((t, n) => ({
        t, n: k.tnum(t), date: t.slice(0, 10), hr: +t.slice(11, 13),
        temp: g("temperature_2m", n), feels: g("apparent_temperature", n), dew: g("dew_point_2m", n),
        pop: g("precipitation_probability", n), mm: g("precipitation", n) || 0, cloud: g("cloud_cover", n),
        vis: g("visibility", n), wind: g("wind_speed_10m", n), dir: g("wind_direction_10m", n), gust: g("wind_gusts_10m", n),
        isDay: g("is_day", n)
      })).filter(x => x.temp != null);
      rows.forEach(x => {
        const spread = x.dew != null ? x.temp - x.dew : 99;
        const darkish = x.hr >= 20 || x.hr <= 10;
        x.fog = darkish && x.mm < 0.2 && ((x.vis != null && x.vis <= 1000) || (spread <= 1.0 && (x.wind == null ? 99 : x.wind) <= 7));
        x.frost = x.temp <= 1 || (x.temp <= 3.5 && (x.cloud == null ? 100 : x.cloud) <= 40 && (x.wind == null ? 99 : x.wind) <= 8);
        x.play = k.playScore(x);
      });
      const days = {};
      (j.daily ? j.daily.time : []).forEach((d, n) => { days[d] = { sunrise: j.daily.sunrise[n], sunset: j.daily.sunset[n] }; });
      byCourse[c.key] = { rows, days };
    });
    const first = byCourse[COURSES[0].key] || Object.values(byCourse)[0];
    const today = now ? now.slice(0, 10) : first.rows[0].date;
    const dates = Object.keys(first.days).filter(d => d >= today).slice(0, 7);
    return { now, nowN: now ? k.tnum(now) : 0, dates, byCourse };
  }

  async function loadWeather(force) {
    if (W && !force && Date.now() - wxAt < 30 * 60000) return;
    const snap = window.FINDER_SNAPSHOT;
    const data = snap ? snap.weather : await getJSON(weatherUrl());
    W = buildWeather(data);
    wxAt = Date.now();
  }

  async function loadSheets(date, force) {
    const hit = sheets[date];
    if (hit && !force && Date.now() - hit.at < 10 * 60000) return hit.data;
    const snap = window.FINDER_SNAPSHOT;
    let data;
    if (snap) data = snap.sheets[date] || { date, clubs: {}, missing: true };
    else data = await getJSON("/api/teesheet?date=" + date + "&clubs=" + LIVE_IDS.join(","), 30000);
    sheets[date] = { at: Date.now(), data };
    return data;
  }

  /* ---------- working out each course's day ---------- */
  function inRange(date, r) { return date >= r[0] && date <= r[1]; }
  function blockedAt(c, date, m0, m1) {
    const wdN = weekdayOf(date);
    for (const r of c.closed || []) {
      if (!inRange(date, r)) continue;
      const until = r[2] ? minsOf(r[2]) : 24 * 60;
      if (m0 < until) return r[2] ? "Closed until " + clock(until) : "Closed";
    }
    for (const b of c.blocks || []) {
      if (b.days.indexOf(wdN) < 0) continue;
      if (m0 < minsOf(b.to) && m1 > minsOf(b.from)) return b.text;
    }
    return null;
  }
  function closedAllDay(c, date) { return (c.closed || []).some(r => inRange(date, r) && !r[2]); }
  function busyNotes(c, date) { const wdN = weekdayOf(date); return (c.busy || []).filter(b => b.days.indexOf(wdN) >= 0).map(b => b.text); }
  function blockNotes(c, date) {
    const wdN = weekdayOf(date), out = [];
    (c.closed || []).forEach(r => { if (inRange(date, r)) out.push(r[2] ? "Closed until " + clock(minsOf(r[2])) + " today" : "Closed today"); });
    (c.blocks || []).forEach(b => { if (b.days.indexOf(wdN) >= 0) out.push(b.text); });
    return out;
  }

  function feeFor(c, date) {
    const wdN = weekdayOf(date);
    const f = Object.assign({}, c.fees);
    let label = null;
    (c.specials || []).forEach(s => { if (s.days.indexOf(wdN) >= 0) { Object.assign(f, s); label = s.label; } });
    const aff = holes === 18 ? f.aff18 : (f.aff9 != null ? f.aff9 : null);
    const vis = holes === 18 ? f.vis18 : (f.vis9 != null ? f.vis9 : null);
    return { aff: aff != null ? aff : vis, vis, label };
  }

  // Weather score for a round starting at minute m: mean of 15-minute steps, pulled down by the worst stretch.
  function roundScore(byHour, sunsetM, m) {
    const d = dur();
    if (m + d > sunsetM + 10) return null;
    let tot = 0, n = 0, mn = 100;
    const why = new Set();
    for (let s = m; s < m + d; s += 15) {
      const r = byHour[Math.floor(s / 60)];
      if (!r || !r.play) return null;
      tot += r.play.s; n++; mn = Math.min(mn, r.play.s);
      r.play.why.forEach(w => why.add(w));
    }
    return { v: (tot / n) * 0.7 + mn * 0.3, why: Array.from(why) };
  }

  function courseDay(c, date, sheet) {
    const cw = W.byCourse[c.key];
    if (!cw || !cw.days[date]) return null;
    const rows = cw.rows.filter(x => x.date === date);
    const byHour = {};
    rows.forEach(x => { byHour[x.hr] = x; });
    const sunriseM = minsOf(cw.days[date].sunrise.slice(11)), sunsetM = minsOf(cw.days[date].sunset.slice(11));
    const isToday = date === W.now.slice(0, 10);
    const nowM = isToday ? minsOf(W.now.slice(11)) + 10 : -1;
    const out = { c, date, rows, byHour, sunriseM, sunsetM, fee: feeFor(c, date), busy: busyNotes(c, date), blocks: blockNotes(c, date) };
    if (closedAllDay(c, date)) { out.kind = "closed"; return out; }

    if (c.live) {
      const club = sheet && sheet.clubs ? sheet.clubs[c.live] : null;
      if (club && club.ok) {
        const byTime = {};
        club.slots.forEach(s => {
          const open = s.pub + s.aff;
          if (!byTime[s.t]) byTime[s.t] = { t: s.t, m: minsOf(s.t), spots: 0, tees: [] };
          if (open > 0) { byTime[s.t].spots += open; byTime[s.t].tees.push(s.tee); }
        });
        const times = Object.values(byTime).filter(x => x.spots > 0 && x.m >= nowM).sort((a, b) => a.m - b.m);
        times.forEach(x => { x.score = roundScore(byHour, sunsetM, x.m); });
        out.times = times;
        out.rated = times.filter(x => x.score).sort((a, b) => (b.score.v - a.score.v) || (a.m - b.m));
        out.best = out.rated[0] || null;
        out.kind = out.best && out.best.score.v >= 45 ? "book" : times.length ? "poor" : "full";
        out.sheetSlots = club.slots.length;
        if (!club.slots.length) out.kind = "nosheet";
        return out;
      }
      out.sheetError = club ? club.error || "no data" : (sheet && sheet.missing ? "not in this preview" : "not loaded");
    }
    // walk-up, phone or form: best start on the half hour that isn't blocked
    let best = null;
    const startFrom = Math.max(Math.ceil(sunriseM / 30) * 30, nowM > 0 ? Math.ceil(nowM / 30) * 30 : 0);
    for (let m = startFrom; m + dur() <= sunsetM + 10; m += 30) {
      if (blockedAt(c, date, m, m + dur())) continue;
      const sc = roundScore(byHour, sunsetM, m);
      if (sc && (!best || sc.v > best.score.v + 0.01)) best = { m, t: clock(m), score: sc };
    }
    out.best = best;
    out.kind = c.live ? "unknown" : (c.how || "walkup");
    if (!best) out.kind = "none";
    return out;
  }

  function regionWindow(days) {
    const hrs = {};
    days.forEach(d => d.rows.forEach(r => { if (r.play) (hrs[r.hr] = hrs[r.hr] || []).push(r.play.s); }));
    const len = holes === 18 ? 4 : 2;
    const keys = Object.keys(hrs).map(Number).sort((a, b) => a - b);
    let best = null;
    for (let i = 0; i + len <= keys.length; i++) {
      const w = keys.slice(i, i + len);
      if (w[len - 1] - w[0] !== len - 1) continue;
      const means = w.map(h => hrs[h].reduce((s, v) => s + v, 0) / hrs[h].length);
      const v = means.reduce((s, x) => s + x, 0) / len * 0.7 + Math.min.apply(null, means) * 0.3;
      if (!best || v > best.v + 0.01) best = { v, from: w[0], to: w[len - 1] + 1 };
    }
    return best;
  }

  /* ---------- rendering ---------- */
  function renderDays() {
    const k = K();
    $("daySeg").innerHTML = W.dates.map((d, i) => '<button type="button" data-day="' + i + '" aria-pressed="' + (i === dayIdx) + '">' +
      (i === 0 ? "Today" : k.wd(d).slice(0, 3) + " " + k.dnum(d)) + "</button>").join("");
    $("daySeg").querySelectorAll("button").forEach(b => b.addEventListener("click", () => { dayIdx = +b.dataset.day; renderDays(); renderDay(); }));
    document.querySelectorAll("#holesSeg button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.holes === holes)));
  }

  function groupOf(x) {
    if (x.kind === "book") return 0;
    if (["walkup", "phone", "form", "unknown"].indexOf(x.kind) >= 0 && x.best && x.best.score.v >= 45) return 1;
    return 2;
  }
  const rank = (a, b) => (groupOf(a) - groupOf(b)) || ((b.best ? b.best.score.v : -1) - (a.best ? a.best.score.v : -1)) || (a.c.drive - b.c.drive);

  async function renderDay() {
    const my = ++seq;
    const k = K();
    const date = W.dates[dayIdx];
    if (!sheets[date]) $("finderRead").innerHTML = '<p class="muted">Checking tee sheets for ' + (dayIdx === 0 ? "today" : k.wd(date)) + ".</p>";
    let sheet = null;
    try { sheet = await loadSheets(date); } catch (e) { sheet = { clubs: {}, error: e.message }; }
    if (my !== seq) return;
    const days = COURSES.map(c => courseDay(c, date, sheet)).filter(Boolean);
    days.sort(rank);
    const win = regionWindow(days);
    renderRead(date, days, win, sheet);
    renderGrid(date, days, win);
    renderList(date, days);
    const at = sheet && sheet.fetchedAt ? new Date(sheet.fetchedAt) : null;
    $("stamp").textContent = window.FINDER_SNAPSHOT ? "Preview copy with this afternoon's tee sheets. The live site checks them when you open the page."
      : (at ? "Tee sheets checked at " + at.toLocaleTimeString("en-NZ", { hour: "numeric", minute: "2-digit", timeZone: "Pacific/Auckland" }).replace(" ", "").toLowerCase() + ". Weather from the latest model runs." : "Weather from the latest model runs.");
  }

  function renderRead(date, days, win, sheet) {
    const k = K();
    const when = dayIdx === 0 ? "today" : dayIdx === 1 ? "tomorrow" : k.wd(date);
    const out = [];
    if (win && win.v >= 45) {
      const all = days.filter(d => d.rows.some(r => r.hr >= win.from && r.hr < win.to));
      const rs = [].concat.apply([], all.map(d => d.rows.filter(r => r.hr >= win.from && r.hr < win.to)));
      const mm = rs.reduce((s, r) => s + r.mm, 0) / Math.max(1, all.length);
      const tLo = Math.round(Math.min.apply(null, rs.map(r => r.temp))), tHi = Math.round(Math.max.apply(null, rs.map(r => r.temp)));
      const wMax = Math.round(Math.max.apply(null, rs.map(r => r.wind || 0)));
      const cond = (mm < 0.2 ? "dry" : mm < 1 ? "a little light rain about" : "some rain about") + ", " + tLo + "–" + tHi + "°C and " + (wMax < 10 ? "light winds" : "winds up to " + wMax + " km/h");
      out.push(k.cap(when) + "'s best golf across the area is from " + k.fmtH(win.from) + " to " + k.fmtH(win.to % 24) + ", " + cond + ".");
    } else if (win) {
      out.push(k.cap(when) + " isn't a good day for golf anywhere nearby. The least bad stretch is " + k.fmtH(win.from) + " to " + k.fmtH(win.to % 24) + ".");
    }
    const book = days.filter(d => d.kind === "book").slice(0, 4);
    if (book.length) {
      out.push("You can book " + (holes === 18 ? "18 holes" : "nine holes") + " in good conditions at " + k.listJoin(book.map(d => shortName(d.c) + " (" + clock(d.best.m) + (d.fee.aff != null ? ", " + money(d.fee.aff) : "") + ")")) + ".");
    } else if (sheet && !sheet.missing) {
      out.push("None of the clubs with online tee sheets have good-weather times free.");
    }
    const walk = days.filter(d => groupOf(d) === 1 && d.kind !== "unknown").sort((a, b) => (a.fee.aff || 999) - (b.fee.aff || 999));
    if (walk.length) {
      const cheap = walk[0];
      out.push("Without booking, " + shortName(cheap.c) + " is the cheapest at " + money(cheap.fee.aff) + (cheap.kind === "walkup" ? ", walk up and play" : ", phone first") + (cheap.best ? ", best from " + cheap.best.t : "") + ".");
    }
    const errs = days.filter(d => d.sheetError && d.sheetError !== "not in this preview");
    if (errs.length) out.push("Couldn't read the tee sheet for " + k.listJoin(errs.map(d => shortName(d.c))) + " this time.");
    if (sheet && sheet.missing) out.push("This preview only holds tee sheets for Friday to Sunday.");
    $("finderRead").innerHTML = out.length ? '<p class="lead">' + k.esc(out[0]) + "</p>" + (out.length > 1 ? "<p>" + k.esc(out.slice(1).join(" ")) + "</p>" : "") : "";
  }

  function shortName(c) { return c.name.replace(/ Golf (Club|Estate)/, "").replace(/ \(St Andrews\)/, ""); }

  let gridGeo = null;
  function renderGrid(date, days, win) {
    const svg = $("finderGrid");
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const add = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const a in attrs) e.setAttribute(a, attrs[a]); (parent || svg).appendChild(e); return e; };
    const say = (t, attrs) => { const e = add("text", attrs); e.textContent = t; return e; };
    const h0 = Math.floor(Math.min.apply(null, days.map(d => d.sunriseM)) / 60);
    const h1 = Math.floor(Math.max.apply(null, days.map(d => d.sunsetM)) / 60);
    const ncol = h1 - h0 + 1;
    const W_ = Math.max($("finderScroll").clientWidth, 800);
    const LBL = 168, RT = 156, TOP = 26, RH = 30, GAP = 3;
    const cw = (W_ - LBL - RT) / ncol;
    const HGT = TOP + days.length * (RH + GAP) + 6;
    svg.setAttribute("width", W_); svg.setAttribute("height", HGT); svg.setAttribute("viewBox", "0 0 " + W_ + " " + HGT);
    const xm = m => LBL + (m / 60 - h0) * cw;
    for (let h = h0; h <= h1; h++) if ((h - h0) % 2 === 0) say(K().fmtH(h), { x: LBL + (h - h0) * cw + 2, y: TOP - 9, class: "th" });
    say(holes === 18 ? "Best open time" : "Best for nine", { x: W_ - RT + 10, y: TOP - 9, class: "th" });
    const cells = [];
    days.forEach((d, r) => {
      const y = TOP + r * (RH + GAP);
      const label = shortName(d.c);
      say(label.length > 17 ? label.slice(0, 16) + "…" : label, { x: 0, y: y + 13, class: "rl" });
      say(d.c.drive + " min" + (d.c.holes === 9 ? ", 9 holes" : ""), { x: 0, y: y + 25, class: "rs" });
      for (let h = h0; h <= h1; h++) {
        const x = d.byHour[h], cx = LBL + (h - h0) * cw;
        if (!x || !x.play) { add("rect", { x: cx + 0.5, y, width: cw - 1, height: RH, rx: 2, class: "dark" }); continue; }
        add("rect", { x: cx + 0.5, y, width: cw - 1, height: RH, rx: 2, class: "cellbg" });
        add("rect", { x: cx + 0.5, y, width: cw - 1, height: RH, rx: 2, class: "cell", "fill-opacity": (0.06 + 0.8 * Math.pow(x.play.s / 100, 2)).toFixed(2) });
        if (d.kind === "closed" || blockedAt(d.c, date, h * 60, h * 60 + 60)) add("rect", { x: cx + 0.5, y, width: cw - 1, height: RH, rx: 2, class: "shut" });
        cells.push({ x: cx, y, w: cw, h: RH, d, row: x, hr: h });
      }
      (d.times || []).forEach(t => {
        const tx = xm(t.m), th = Math.max(5, Math.min(4, t.spots) / 4 * (RH - 6));
        add("line", { x1: tx, x2: tx, y1: y + RH - 3, y2: y + RH - 3 - th, class: "tick" + (d.best && t === d.best ? " besttick" : "") });
      });
      if (d.best) add("circle", { cx: xm(d.best.m), cy: y + 4, r: 3.2, class: "bestdot" });
      const right = d.kind === "closed" ? "Closed" : d.kind === "full" ? "Nothing free" : d.kind === "nosheet" ? "No tee sheet" :
        d.best ? (d.c.live && d.kind !== "unknown" ? clock(d.best.m) : (d.kind === "walkup" ? "Walk up " : "Phone, ") + d.best.t) + ", " + K().playWord(d.best.score.v) : "No good time";
      // keep the right-hand column inside its space
      say(right, { x: W_ - RT + 10, y: y + RH / 2 + 4, class: "rr" });
    });
    if (win) add("rect", { x: LBL + (win.from - h0) * cw + 0.5, y: TOP - 3, width: (win.to - win.from) * cw - 1, height: days.length * (RH + GAP) + 3, rx: 4, class: "winbox" });
    const hit = add("rect", { x: LBL, y: TOP, width: W_ - LBL - RT, height: HGT - TOP, class: "hit" });
    gridGeo = { cells };
    hit.addEventListener("pointermove", gridMove);
    hit.addEventListener("pointerdown", gridMove);
    hit.addEventListener("pointerleave", hideTip);
  }

  function hideTip() { const t = $("finderTip"); if (t) t.hidden = true; }
  function gridMove(ev) {
    const k = K();
    const svg = $("finderGrid"), tip = $("finderTip"), box = $("finderBox");
    const r = svg.getBoundingClientRect();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    const c = gridGeo.cells.find(q => px >= q.x && px < q.x + q.w && py >= q.y - 2 && py < q.y + q.h + 2);
    if (!c) { hideTip(); return; }
    const x = c.row, d = c.d;
    const row = (a, b) => '<div class="row"><span>' + a + "</span><span>" + b + "</span></div>";
    let html = "<b>" + k.esc(shortName(d.c)) + ", " + k.fmtH(c.hr) + "</b>" +
      row("Golf", k.playWord(x.play.s)) +
      row("Temperature", Math.round(x.temp) + "°C, feels " + Math.round(x.feels != null ? x.feels : x.temp) + "°C") +
      row("Rain", x.mm < 0.2 ? "dry, " + (x.pop || 0) + "% chance" : x.mm.toFixed(1) + " mm") +
      row("Wind", k.dir16(x.dir) + " " + Math.round(x.wind || 0) + " km/h, gusts " + Math.round(x.gust || 0));
    const here = (d.times || []).filter(t => Math.floor(t.m / 60) === c.hr);
    if (here.length) html += '<div class="flag">Open: ' + here.map(t => clock(t.m) + " (" + t.spots + ")").join(", ") + "</div>";
    else if (d.c.live && d.times) html += '<div class="flag">No open tee times this hour</div>';
    const blk = blockedAt(d.c, d.date, c.hr * 60, c.hr * 60 + 60);
    if (blk) html += '<div class="flag">' + k.esc(blk) + "</div>";
    tip.innerHTML = html;
    tip.hidden = false;
    const br = box.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = ev.clientX - br.left + 14;
    if (left + tw > br.width - 8) left = ev.clientX - br.left - tw - 14;
    left = Math.max(8, left);
    let top = ev.clientY - br.top - th - 12;
    if (top < 8) top = ev.clientY - br.top + 16;
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }

  function renderList(date, days) {
    const k = K();
    const groups = [
      ["Book online now", days.filter(d => groupOf(d) === 0)],
      ["Walk up or phone", days.filter(d => groupOf(d) === 1)],
      ["Nothing suitable", days.filter(d => groupOf(d) === 2)]
    ];
    const how = d => d.c.live ? '<a href="' + d.c.book + '" target="_blank" rel="noopener">Book online</a>' :
      d.c.how === "walkup" ? "Walk up, or phone " + k.esc(d.c.phone) :
      d.c.how === "form" ? '<a href="' + d.c.book + '" target="_blank" rel="noopener">Enquiry form</a> or phone ' + k.esc(d.c.phone) :
      "Phone " + k.esc(d.c.phone);
    const fee = d => {
      const f = d.fee;
      if (f.aff == null) return "–";
      let s = money(f.aff) + (f.vis != null && f.vis !== f.aff ? ' <span class="small">visitors ' + money(f.vis) + "</span>" : "");
      if (f.label) s += '<br><span class="small">' + k.esc(f.label) + "</span>";
      return s;
    };
    const whenTxt = d => {
      if (d.kind === "closed") return "Closed " + (dayIdx === 0 ? "today" : "this day");
      if (d.kind === "full") return "No open tee times";
      if (d.kind === "nosheet") return "No tee sheet published for this day";
      if (!d.best) return "No good time";
      if (d.c.live && d.times) {
        const good = d.rated.filter(t => t.score.v >= 45).slice(0, 6).sort((a, b) => a.m - b.m);
        const first = "<b>" + clock(d.best.m) + "</b>, " + k.playWord(d.best.score.v) + ", " + d.best.spots + (d.best.spots === 1 ? " spot" : " spots");
        const more = good.filter(t => t !== d.best).map(t => clock(t.m) + " (" + t.spots + ")");
        return first + (more.length ? '<br><span class="small">Also ' + more.join(", ") + "</span>" : "") + (d.kind === "poor" ? '<br><span class="small">Open times are all in poor weather</span>' : "");
      }
      return "<b>" + d.best.t + "</b>, " + k.playWord(d.best.score.v) + (d.sheetError ? '<br><span class="small">Tee sheet ' + k.esc(d.sheetError) + "</span>" : "");
    };
    const notes = d => {
      const n = [].concat(d.blocks, d.busy);
      if (d.c.feeNote) n.push(d.c.feeNote);
      if (d.c.note) n.push(d.c.note);
      return n.length ? '<span class="small">' + k.esc(n.join(". ").replace(/\.\./g, ".")) + "</span>" : "";
    };
    $("finderList").innerHTML = groups.filter(g => g[1].length).map(([title, list]) =>
      '<div class="fgroup"><h3>' + title + '</h3><div class="tablewrap"><table class="ftable"><thead><tr><th>Course</th><th class="n">Drive</th><th>' + (holes === 18 ? "Best tee time for 18" : "Best tee time for 9") + '</th><th class="n">Green fee</th><th>How to book</th></tr></thead><tbody>' +
      list.map(d => '<tr><td><b>' + k.esc(d.c.name) + "</b>" + (d.c.holes === 9 ? ' <span class="small">nine holes</span>' : "") + "<br>" + notes(d) + '</td><td class="n">' + d.c.drive + " min</td><td>" + whenTxt(d) + '</td><td class="n">' + fee(d) + "</td><td>" + how(d) + "</td></tr>").join("") +
      "</tbody></table></div></div>").join("");
  }

  /* ---------- public ---------- */
  async function activate() {
    active = true;
    $("findersec").hidden = false;
    $("finderRead").innerHTML = '<p class="muted">Loading the weather for ' + COURSES.length + " courses.</p>";
    try {
      await loadWeather();
    } catch (e) {
      $("finderRead").innerHTML = '<div class="errorbox"><p class="lead">The forecast didn\'t load.</p><p>Check your connection, then try again.</p><button type="button" id="finderRetry">Try again</button></div>';
      $("finderRetry").addEventListener("click", activate);
      return;
    }
    if (!active) return;
    if (dayIdx == null) dayIdx = W.now && +W.now.slice(11, 13) >= 15 ? 1 : 0;
    renderDays();
    renderDay();
  }
  function deactivate() { active = false; hideTip(); const s = $("findersec"); if (s) s.hidden = true; }
  function resize() { if (active && W) renderDay(); }
  async function refresh() { if (!active) return; await loadWeather(true); renderDays(); renderDay(); }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("#holesSeg button").forEach(b => b.addEventListener("click", () => {
      holes = +b.dataset.holes;
      try { localStorage.setItem("wx-holes", String(holes)); } catch (e) { /* storage unavailable */ }
      renderDays(); if (W) renderDay();
    }));
  });

  window.Finder = { activate, deactivate, resize, refresh };
})();
