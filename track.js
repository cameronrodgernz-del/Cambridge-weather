/* Racecourses (Te Rapa, Ellerslie, Pukekohe): the next meeting, the rain radar and the "On the track" section.
   Each course's name, direction of running, home straight, soil note and race dates sit on its entry in PLACES.
   Built from the same forecast as the rest of the page (app.js hands it over in Track.render),
   plus RainViewer's radar frames on an OpenStreetMap base. Shows only on places with track: true or radar: true. */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); parent.appendChild(e); return e; };
  const say = (s, attrs, parent) => { const e = el("text", attrs, parent); e.textContent = s; return e; };
  const clear = node => { while (node.firstChild) node.removeChild(node.firstChild); };
  const pad = n => String(n).padStart(2, "0");
  const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const word = n => WORDS[n] || String(n);

  let C = null;      // shared helpers from app.js
  let S = null;      // the current forecast
  let P = null;      // the current place

  const para = lines => lines.length ? '<p class="lead">' + C.esc(lines[0]) + "</p>" + (lines.length > 1 ? "<p>" + C.esc(lines.slice(1).join(" ")) + "</p>" : "") : "";
  const dayCount = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / 86400000);
  const longDate = date => C.wd(date) + " " + C.dnum(date) + " " + C.mon(date);
  const shortDate = date => C.wd(date).slice(0, 3) + " " + C.dnum(date) + " " + C.mon(date).slice(0, 3);
  const mmFig = v => v < 0.2 ? "0 mm" : v < 1 ? "under 1 mm" : C.r0(v) + " mm";
  const hourRow = n => S.H.find(x => x.n === Math.floor(n));
  const hoursBetween = (a, b) => S.H.filter(x => x.n >= a && x.n < b);
  const thunder = x => x.code != null && x.code >= 95;
  // The hourly rain here is an average across the models, which flattens a sharp burst. So bursts, and how many hours
  // count as wet, are read from the hourly feed's own figure (the 9 km European model) where there is one.
  const burst = x => Math.max(x.mm, x.one || 0);
  const wetHour = x => (x.one != null ? x.one : x.mm) >= 0.2;

  /* ---------- chance of rain ---------- */
  // The chance of at least so many millimetres falling in a stretch of hours. It goes on two things: the share of the
  // models whose total for the stretch reaches the mark, and how far the blended total sits from it. The weights were
  // fitted to what fell at the Hamilton and Auckland airport gauges from February 2025 to November 2026, fitting on
  // one gauge and checking on the other (backtest/chance.py). There is a set for part of a day, for about a day and
  // for several days. Each is [constant, share of models, blend against the mark, days ahead / 6, ln(mark), and for
  // part of a day the blend term squared].
  const CHANCE = {
    sub: [-1.6336, 1.1753, 1.4247, 0.114, 0.4221, -0.2172],
    day: [-1.392, 0.7725, 1.7535, 0.0264, 0.3837, 0],
    multi: [-1.3799, 0.8142, 2.1947, -0.0222, 0.3576, 0]
  };
  const MARKS = [1, 5, 10, 20];
  function chances(a, b) {
    const rows = hoursBetween(a, b);
    if (rows.length < 3 || rows.some(x => !x.mods)) return null;
    const tot = [];
    rows[0].mods.forEach((v, j) => { if (rows.every(x => x.mods[j] != null)) tot.push(C.sum(rows.map(x => x.mods[j]))); });
    if (tot.length < 3) return null;
    const blend = C.sum(rows.map(x => x.mm));
    const cls = rows.length < 15 ? "sub" : rows.length <= 36 ? "day" : "multi";
    const lead = cls === "multi" ? Math.round(rows.length / 24) : Math.max(1, dayCount(S.todayDate, rows[rows.length - 1].date));
    const w = CHANCE[cls];
    return { blend, models: tot.length, p: MARKS.map(T => {
      const f = tot.filter(v => v >= T).length / tot.length;
      const r = Math.max(-3, Math.min(3, Math.log((blend + 0.5) / (T + 0.5))));
      return 1 / (1 + Math.exp(-(w[0] + w[1] * f + w[2] * r + w[3] * lead / 6 + w[4] * Math.log(T) + w[5] * r * r)));
    }) };
  }
  const CHANCE_NOTE = "The chances come from how many of the models reach each amount and how close the blended forecast is to it, set against 21 months of readings at the Hamilton and Auckland airport rain gauges. When this said 70%, that much rain fell about 7 times in 10.";
  const pct = p => p < 0.05 ? "<5%" : p > 0.95 ? ">95%" : Math.round(p * 20) * 5 + "%";
  // A table of chances for a list of stretches, each [label, from, to]. Empty if the models' hourly rain didn't load.
  function chanceTable(list) {
    const rows = list.map(([label, a, b]) => {
      const c = chances(a, b);
      return c ? '<tr><td class="part">' + C.esc(label) + '</td><td class="n">' + mmFig(c.blend) + "</td>" + c.p.map(p => '<td class="n">' + pct(p) + "</td>").join("") + "</tr>" : "";
    }).join("");
    return rows ? '<div class="tablewrap"><table class="chance"><thead><tr><th></th><th class="n">Forecast</th>' + MARKS.map(T => '<th class="n">' + T + " mm</th>").join("") + "</tr></thead><tbody>" + rows + "</tbody></table></div>" : "";
  }

  // When a stretch of hours falls, as words: "from 3pm to 9pm" or "at 7pm".
  function span(rows) {
    if (!rows.length) return "";
    const a = rows[0], b = rows[rows.length - 1];
    return a === b ? "at " + C.fmtH(a.hr) : "from " + C.fmtH(a.hr) + " to " + C.fmtH((b.hr + 1) % 24);
  }
  // Group hours that pass a test into runs, day by day, allowing a one-hour break inside a run.
  function runs(rows, test) {
    const out = [];
    let cur = null;
    rows.forEach(x => {
      if (!test(x)) return;
      if (cur && cur.date === x.date && x.n - cur.rows[cur.rows.length - 1].n <= 2) cur.rows.push(x);
      else { cur = { date: x.date, rows: [x] }; out.push(cur); }
    });
    return out;
  }

  /* ---------- meetings ---------- */
  const FROM = 11, TO = 18;
  function meetings() {
    return (P.meetings || []).map(m => {
      const from = m.from != null ? m.from : FROM, to = m.to != null ? m.to : TO;
      return Object.assign({}, m, { from, to, timed: m.from != null, start: C.tnum(m.date + "T" + pad(from) + ":00"), end: C.tnum(m.date + "T" + pad(to) + ":00"), morning: C.tnum(m.date + "T06:45") });
    });
  }
  function dayWord(date) {
    const k = dayCount(S.todayDate, date);
    if (k === 0) return "today";
    if (k === 1) return "tomorrow";
    if (k < 7) return C.wd(date);
    return longDate(date);
  }
  function meetingRef(m) {
    const w = dayWord(m.date);
    if (w === "today") return "Today's meeting";
    if (w === "tomorrow") return "Tomorrow's meeting";
    if (w.indexOf(" ") < 0) return w + "'s meeting";
    return "The meeting on " + w;
  }

  // Which way the wind blows down the home straight, from the horses' point of view.
  function straightWord(x) {
    if (x.wind == null || x.dir == null || P.straight == null) return "–";
    if (x.wind < 8) return "Light";
    return straightDir(x.dir);
  }
  // diff is 0 when the wind blows straight down the track into the horses' faces, and negative when it comes from
  // their left. The inside rail is on their left on a left-handed track and on their right on a right-handed one.
  function straightKind(dir) {
    const diff = ((dir - P.straight + 540) % 360) - 180;
    const a = Math.abs(diff), side = (diff < 0) === (P.hand !== "right") ? "inside" : "outside";
    if (a <= 30) return { short: "Headwind", prose: "a headwind" };
    if (a <= 65) return { short: "Headwind, angled", prose: "a headwind angled across the track" };
    if (a < 115) return { short: "Crosswind from the " + side, prose: "a crosswind from the " + side };
    if (a < 150) return { short: "Tailwind, angled", prose: "a tailwind angled across the track" };
    return { short: "Tailwind", prose: "a tailwind" };
  }
  const straightDir = dir => straightKind(dir).short;

  function checks(m) {
    return [
      { key: "48", n: m.start - 48, name: "48 hours out", short: "48 hours" },
      { key: "24", n: m.start - 24, name: "24 hours out", short: "24 hours" },
      { key: "am", n: m.morning, name: "Race morning", short: "6:45am" }
    ];
  }

  function writeRace(m, day, race) {
    const out = [];
    const ref = meetingRef(m);
    const raceMM = C.sum(race.map(x => x.mm));
    const storms = race.filter(thunder);
    const stormTxt = !storms.length ? "" : storms.length >= race.length - 1 ? "thunderstorms possible right through racing" : "thunderstorms possible " + span(storms);
    const wet = day.mmMid >= 5 || raceMM >= 3;
    if (wet) {
      let line = ref + " looks wet, with " + C.amountPhrase(day) + " forecast on the day";
      line += raceMM >= 1 ? ", about " + C.r0(raceMM) + " mm of it during racing" : ", most of it outside racing hours";
      out.push(line + (stormTxt ? ", and " + stormTxt : "") + ".");
    } else if (day.mmMid >= 0.5 || raceMM >= 0.5 || storms.length) {
      out.push(ref + " looks mostly dry, with " + (raceMM >= 0.5 ? "a few showers during racing" : "only a few light showers") + " and a high of " + C.r0(day.hi) + "°C" + (stormTxt ? ", and " + stormTxt : "") + ".");
    } else {
      out.push(ref + " looks dry, " + C.sky(0, 0, C.avg(race.map(x => x.cloud)), false).prose + " with a high of " + C.r0(day.hi) + "°C.");
    }

    // between now and race morning
    if (m.morning > S.nowN + 1) {
      const pre = hoursBetween(S.nowN, m.morning);
      const mm = C.sum(pre.map(x => x.mm)), et = C.sum(pre.map(x => x.et0));
      if (mm >= 1) {
        const byDay = {};
        pre.forEach(x => { byDay[x.date] = (byDay[x.date] || 0) + x.mm; });
        const top = Object.keys(byDay).sort((a, b) => byDay[b] - byDay[a])[0];
        const most = byDay[top] >= mm * 0.6 ? ", most of the rain " + (dayWord(top) === "today" ? "today" : dayWord(top) === "tomorrow" ? "tomorrow" : "on " + dayWord(top)) : "";
        out.push("Between now and race morning, about " + C.r0(mm) + " mm of rain is forecast against about " + C.r0(et) + " mm of evaporation" + most + ".");
      } else {
        out.push("It stays mostly dry between now and race morning" + (et >= 1 ? ", with about " + C.r0(et) + " mm lost to evaporation" : "") + ".");
      }
    }

    // how far the models agree on race day
    const ms = day.models.filter(x => x.mm != null);
    if (ms.length >= 4) {
      const lo = C.minOf(ms.map(x => x.mm)), hi = C.maxOf(ms.map(x => x.mm));
      const rng = (lo < 1 ? "under 1" : C.r0(lo)) + " to " + C.r0(hi) + " mm";
      if (ms.every(x => x.mm >= 5)) out.push("All " + word(ms.length) + " weather models bring rain on race day" + (wet ? "" : ", from " + rng) + ".");
      else if (ms.every(x => x.mm < 1)) out.push("All " + word(ms.length) + " weather models keep race day dry.");
      else if (hi >= 5 && hi - lo >= 5) out.push("The models are split on race day, from " + rng + ".");
    }

    // wind in the straight
    const winds = race.filter(x => x.wind != null);
    if (winds.length && P.straight != null) {
      const w = C.avg(winds.map(x => x.wind)), lo = C.r0(C.minOf(winds.map(x => x.wind))), hi = C.r0(C.maxOf(winds.map(x => x.wind))), g = C.r0(C.maxOf(winds.map(x => x.gust)));
      if (w < 8) out.push("Winds are light in the straight during racing.");
      else {
        const dir = C.meanDir(winds), dl = C.dirLong(dir);
        out.push("In the straight it's mostly " + straightKind(dir).prose + ", " + (/^[aeiou]/.test(dl) ? "an " : "a ") + dl + " of " + (lo === hi ? hi : lo + "–" + hi) + " km/h" + (g >= 30 ? " gusting to " + g : "") + ".");
      }
    }

    // dew and fog on race morning
    if (m.morning > S.nowN) {
      const morn = S.H.filter(x => x.date === m.date && x.hr >= 4 && x.hr <= 7);
      const nightMM = C.sum(hoursBetween(m.morning - 9, m.morning).map(x => x.mm));
      if (morn.some(x => x.fog)) out.push("Fog is possible early on race morning.");
      else if (nightMM < 0.3 && morn.some(x => x.dew != null && x.temp - x.dew <= 1 && (x.wind || 0) <= 7 && (x.cloud == null ? 100 : x.cloud) <= 60))
        out.push("A heavy dew is likely on race morning, which can make the surface ride softer early on.");
    }
    return out;
  }

  function renderRace() {
    const all = meetings();
    const next = all.find(m => m.end > S.nowN);
    const box = $("raceBox"), detail = $("raceDetail");
    if (!next) {
      $("raceEyebrow").textContent = P.short + " race days";
      $("h-race").textContent = "No more meetings this season";
      $("raceRead").innerHTML = "<p>The meetings listed for this season are all done. Next season's dates go in once NZTR publishes them.</p>";
      box.hidden = true; detail.innerHTML = ""; $("raceSeason").innerHTML = "";
      return;
    }
    const k = dayCount(S.todayDate, next.date);
    $("raceEyebrow").textContent = k === 0 ? "Racing at " + P.short + " today" : "Next meeting at " + P.short + ", " + (k === 1 ? "tomorrow" : "in " + k + " days");
    $("h-race").textContent = longDate(next.date) + (next.name ? ", " + next.name : "");
    const day = S.days.find(d => d.date === next.date);
    const race = hoursBetween(next.start, next.end);
    const covered = day && race.length >= next.to - next.from;
    if (!covered) {
      const reach = new Date(Date.UTC(+next.date.slice(0, 4), +next.date.slice(5, 7) - 1, +next.date.slice(8, 10) - 7)).toISOString().slice(0, 10);
      $("raceRead").innerHTML = para(["The next meeting is " + longDate(next.date) + ", " + k + " days away.",
        "The forecast reaches it on " + longDate(reach) + ", and this section fills in with the race-day outlook, the rain before each track check and the wind in the straight from then."]);
      box.hidden = true; detail.innerHTML = "";
    } else {
      box.hidden = false;
      $("raceRead").innerHTML = para(writeRace(next, day, race));
      renderRaceChart(next);
      renderRaceDetail(next, day, race);
    }
    renderSeason(all, next);
  }

  /* the drawing: rain each hour and the running total from now to the end of racing */
  let raceGeo = null, raceNext = null;
  function renderRaceChart(m) {
    raceNext = m;
    const svg = $("raceChart"), scroll = $("raceScroll");
    clear(svg);
    const first = S.H[S.nowIdx];
    const rows = S.H.filter(x => x.n >= first.n && x.n < m.end);
    if (rows.length < 2) { $("raceBox").hidden = true; return; }
    const t0 = rows[0].n, N = rows.length;
    const minW = N <= 48 ? 640 : N <= 100 ? 780 : 940;
    const W = Math.max(scroll.clientWidth, minW);
    const L = 38, R = 64;
    const p1 = { y0: 66, h: 100 }, p2 = {};
    p1.y1 = p1.y0 + p1.h; p2.y0 = p1.y1 + 40; p2.h = 78; p2.y1 = p2.y0 + p2.h;
    const HGT = p2.y1 + 24;
    svg.setAttribute("width", W); svg.setAttribute("height", HGT); svg.setAttribute("viewBox", "0 0 " + W + " " + HGT);
    const x = n => L + (W - L - R) * (n - t0) / N;
    const pxh = (W - L - R) / N;
    const hMax = Math.max(2, Math.ceil(C.maxOf(rows.map(r => r.mm)) || 0));
    let run = 0;
    const cum = rows.map(r => { run += Math.max(0, r.n + 1 > S.nowN ? r.mm * Math.min(1, r.n + 1 - S.nowN) : 0); return run; });
    const total = cum[cum.length - 1];
    const cMax = Math.max(5, Math.ceil(total / 5) * 5);
    const y1 = v => p1.y1 - v / hMax * p1.h, y2 = v => p2.y1 - v / cMax * p2.h;

    // night
    S.days.forEach((d, k) => {
      const nx = S.days[k + 1];
      if (!d.sunset) return;
      const a = Math.max(t0, C.tnum(d.sunset)), b = Math.min(t0 + N, nx && nx.sunrise ? C.tnum(nx.sunrise) : 1e9);
      if (b > a) el("rect", { x: x(a), y: p1.y0 - 6, width: x(b) - x(a), height: p2.y1 - p1.y0 + 6, class: "night" }, svg);
    });
    // racing band
    const rs = Math.max(t0, m.start);
    el("rect", { x: x(rs), y: p1.y0 - 6, width: x(m.end) - x(rs), height: p2.y1 - p1.y0 + 6, class: "racing" }, svg);
    // grids and titles
    say("Rain each hour, mm", { x: L, y: p1.y0 - 14, class: "clabel" }, svg);
    say("Total from now, mm", { x: L, y: p2.y0 - 12, class: "clabel" }, svg);
    [0, hMax].forEach(v => { el("line", { x1: L, x2: W - R, y1: y1(v), y2: y1(v), class: "grid" }, svg); say(String(v), { x: L - 6, y: y1(v) + 3.5, "text-anchor": "end" }, svg); });
    [0, cMax / 2, cMax].forEach(v => { el("line", { x1: L, x2: W - R, y1: y2(v), y2: y2(v), class: "grid" }, svg); say(String(v), { x: L - 6, y: y2(v) + 3.5, "text-anchor": "end" }, svg); });
    // days
    rows.forEach(r => { if (r.hr === 0 && r.n > t0) el("line", { x1: x(r.n), x2: x(r.n), y1: 4, y2: p2.y1, class: "daysep" }, svg); });
    const dayStarts = rows.filter(r => r.hr === 0 && r.n > t0);
    if (!dayStarts.length || x(dayStarts[0].n) - x(t0) > 70) say(rows[0].date === S.todayDate ? "Today" : C.wd(rows[0].date), { x: x(t0) + 4, y: 16, class: "dlabel" }, svg);
    dayStarts.forEach(r => say((pxh * 24 < 90 ? C.wd(r.date).slice(0, 3) : C.wd(r.date)) + " " + C.dnum(r.date), { x: x(r.n) + 5, y: 16, class: "dlabel" }, svg));
    // checks and racing labels
    checks(m).forEach(c => {
      if (c.n < t0 || c.n > t0 + N) return;
      el("line", { x1: x(c.n), x2: x(c.n), y1: 26, y2: p2.y1, class: "chk" }, svg);
      say(c.short, { x: x(c.n) + 4, y: 36, class: "clabel" }, svg);
    });
    say("Racing", { x: x(rs) + 4, y: p2.y1 - 6, class: "clabel" }, svg);
    // hourly bars and thunder
    rows.forEach(r => {
      if (r.mm >= 0.05) { const yy = y1(Math.min(hMax, r.mm)); el("rect", { x: x(r.n) + 0.75, y: yy, width: Math.max(1.2, pxh - 1.5), height: Math.max(1, p1.y1 - yy), rx: 1, class: "hbar" }, svg); }
      if (thunder(r)) el("circle", { cx: x(r.n) + pxh / 2, cy: p1.y0 + 4, r: Math.min(3.2, Math.max(2.2, pxh / 2.6)), class: "thring" }, svg);
    });
    // running total
    const pts = ["M" + x(t0).toFixed(1) + " " + y2(0).toFixed(1)].concat(rows.map((r, k) => "L" + x(r.n + 1).toFixed(1) + " " + y2(cum[k]).toFixed(1)));
    el("path", { d: pts.join(" "), class: "cum" }, svg);
    const label = (n, v, txt, left) => {
      el("circle", { cx: x(n), cy: y2(v), r: 3.5, class: "cdot" }, svg);
      say(txt, left ? { x: x(n) - 7, y: y2(v) - 11, "text-anchor": "end", class: "cumv" } : { x: x(n) + 7, y: y2(v) + 4, class: "cumv" }, svg);
    };
    if (m.start > t0 + 3) { const k = rows.findIndex(r => r.n + 1 >= m.start); if (k >= 0) label(m.start, cum[k], C.r0(cum[k]) + " mm by racing", true); }
    label(t0 + N, total, C.r0(total) + " mm");
    // hour labels and now
    const hStep = pxh * 3 >= 40 ? 3 : pxh * 6 >= 40 ? 6 : 12;
    rows.forEach(r => { if (r.hr % hStep === 0 && r.n > t0) say(C.fmtH(r.hr), { x: x(r.n), y: HGT - 6, "text-anchor": "middle" }, svg); });
    const nx = x(Math.max(t0, S.nowN));
    el("line", { x1: nx, x2: nx, y1: p1.y0 - 6, y2: p2.y1, class: "now" }, svg);
    const cross = el("line", { x1: 0, x2: 0, y1: p1.y0 - 6, y2: p2.y1, class: "cross", visibility: "hidden" }, svg);
    const hit = el("rect", { x: L, y: 0, width: W - L - R, height: HGT, class: "hit" }, svg);
    raceGeo = { rows, cum, x, pxh, L, cross, svg };
    hit.addEventListener("pointermove", raceMove);
    hit.addEventListener("pointerdown", raceMove);
    hit.addEventListener("pointerleave", () => { $("raceTip").hidden = true; cross.setAttribute("visibility", "hidden"); });
  }
  function raceMove(ev) {
    const g = raceGeo, r = g.svg.getBoundingClientRect();
    const k = Math.max(0, Math.min(g.rows.length - 1, Math.floor((ev.clientX - r.left - g.L) / g.pxh)));
    const row = g.rows[k];
    const cx = g.x(row.n) + g.pxh / 2;
    g.cross.setAttribute("x1", cx); g.cross.setAttribute("x2", cx); g.cross.setAttribute("visibility", "visible");
    const line = (a, b) => '<div class="row"><span>' + a + "</span><span>" + b + "</span></div>";
    let html = "<b>" + (row.date === S.todayDate ? "Today" : C.wd(row.date).slice(0, 3)) + " " + C.fmtH(row.hr) + "</b>" +
      line("Rain", row.mm < 0.05 ? "none" : row.mm.toFixed(1) + " mm") +
      (row.pop != null ? line("Chance of rain", row.pop + "%") : "") +
      line("Total from now", C.r0(g.cum[k]) + " mm") +
      (row.wind != null ? line("Wind", C.dir16(row.dir) + " " + C.r0(row.wind) + " km/h") : "") +
      (row.et0 != null ? line("Evaporation", row.et0.toFixed(2) + " mm") : "");
    if (thunder(row)) html += '<div class="flag">Thunderstorm possible</div>';
    showTip($("raceTip"), $("raceBox"), ev, html);
  }

  function renderRaceDetail(m, day, race) {
    const rows = race.map(x => {
      const sk = thunder(x) ? "Thunderstorms possible" : C.sky(x.mm, x.mm >= 0.2 ? 1 : 0, x.cloud, !x.isDay).word;
      const rain = x.mm < 0.2 ? (x.pop != null && x.pop >= 20 ? "Dry, " + x.pop + "%" : "Dry") : x.mm.toFixed(1) + " mm";
      const wind = x.wind == null ? "–" : (x.wind < 6 ? "Light" : C.dir16(x.dir) + " " + C.r0(x.wind)) + (x.gust >= 25 ? ", gusts " + C.r0(x.gust) : "");
      return "<tr" + (thunder(x) ? ' class="storm"' : "") + '><td class="part">' + C.fmtH(x.hr) + "</td><td>" + C.esc(sk) + '</td><td class="n">' + C.r0(x.temp) + "°</td><td>" + C.esc(rain) + "</td><td>" + C.esc(wind) + "</td><td>" + C.esc(straightWord(x)) + "</td></tr>";
    }).join("");
    const when = dayWord(m.date);
    const dayName = when === "today" ? "today" : C.wd(m.date);

    // rain between each check and the next
    const cs = checks(m);
    const stops = cs.concat([{ key: "race", n: m.start, name: "Racing" }]);
    const crow = cs.map((c, k) => {
      const nxt = stops[k + 1];
      const passed = c.n <= S.nowN;
      const at = hourRow(c.n);
      const sk = at ? (thunder(at) ? "Thunder possible" : C.sky(at.mm, at.mm >= 0.2 ? 1 : 0, at.cloud, !at.isDay).word) + ", " + C.r0(at.temp) + "°" : "–";
      const mm = C.sum(hoursBetween(Math.max(c.n, S.nowN), nxt.n).map(x => x.mm));
      const until = nxt.key === "race" ? "before racing" : nxt.key === "am" ? "before race morning" : "before the 24 hour check";
      const rainTxt = !passed ? mmFig(mm) + " " + until : nxt.n <= S.nowN ? "–" : mmFig(mm) + " still to come " + until;
      const tm = C.wd(new Date((Math.floor(c.n) * 3600000)).toISOString().slice(0, 10)).slice(0, 3) + " " + (c.key === "am" ? "6:45am" : C.fmtH(Math.round(c.n) % 24));
      return '<tr><td class="part">' + c.name + '</td><td class="n">' + tm + "</td><td" + (passed ? ' class="past"' : "") + ">" + (passed ? "Done" : C.esc(sk)) + "</td><td>" + C.esc(rainTxt) + "</td></tr>";
    }).join("");
    const raceMM = C.sum(race.map(x => x.mm));
    const raceSky = race.some(thunder) ? "Thunder possible" : C.sky(raceMM, race.filter(wetHour).length, C.avg(race.map(x => x.cloud)), false).word;
    const racingRow = '<tr><td class="part">Racing</td><td class="n">' + C.fmtH(m.from) + "–" + C.fmtH(m.to) + "</td><td>" + C.esc(raceSky) + ", " + C.r0(C.maxOf(race.map(x => x.temp))) + "°</td><td>" + C.esc(mmFig(raceMM) + " during racing") + "</td></tr>";

    // the chance of the rain reaching each amount, for the stretches that matter before and on the day
    const stretches = [];
    if (m.morning > S.nowN + 3) stretches.push(["Now to race morning", S.nowN, m.morning]);
    if (m.date > S.todayDate) stretches.push(["Race day, all day", C.tnum(m.date + "T00:00"), C.tnum(m.date + "T00:00") + 24]);
    if (m.start > S.nowN) stretches.push(["During racing", m.start, m.end]);
    else if (m.end > S.nowN + 3) stretches.push(["Rest of racing", S.nowN, m.end]);
    const ct = chanceTable(stretches);

    // last seven days, for the track information sheet
    const past = S.days.slice(Math.max(0, S.ti - 7), S.ti);
    const pmm = C.sum(past.map(d => d.mm)), pet = C.sum(past.map(d => d.et0));

    $("raceDetail").innerHTML =
      '<div class="col"><h3>Racing hours, ' + C.esc(dayName) + '</h3><div class="tablewrap"><table class="racehours"><thead><tr><th></th><th>Sky</th><th class="n">Temp</th><th>Rain</th><th>Wind (km/h)</th><th>In the straight</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="small">Racing hours are taken as ' + C.fmtH(m.from) + " to " + C.fmtH(m.to) + (m.timed ? ", from the club's listed first race and number of races" : "") + ', so check the times for the day. "In the straight" is the wind as the horses meet it running to the post, and inside and outside are the rails.</p></div>' +
      '<div class="col"><h3>Track checks</h3><div class="tablewrap"><table class="checks"><thead><tr><th></th><th class="n">When</th><th>Weather</th><th>Rain to the next check</th></tr></thead><tbody>' + crow + racingRow + "</tbody></table></div>" +
      '<p class="small">The 48 and 24 hour checks are timed from the start of racing.</p>' +
      (ct ? "<h3>Chance of at least this much rain</h3>" + ct + '<p class="small">How the chances are worked out is under On the track, below.</p>' : "") +
      "<h3>The last seven days</h3><p>About " + C.esc(mmFig(pmm)) + " of rain and " + C.r0(pet) + " mm of evaporation, from the weather models. Check the rain against the course gauge before it goes on the track information sheet.</p></div>";
  }

  function renderSeason(all, next) {
    const ahead = all.filter(m => m.end > S.nowN);
    const gaps = ahead.map(m => { const i = all.indexOf(m); return i > 0 ? dayCount(all[i - 1].date, m.date) : null; });
    let longest = -1;
    gaps.forEach((g, i) => { if (g != null && (longest < 0 || g > gaps[longest])) longest = i; });
    const SHOW = 6;
    const rows = ahead.map((m, i) => {
      const k = dayCount(S.todayDate, m.date);
      const away = k === 0 ? "Today" : k === 1 ? "Tomorrow" : k + " days";
      const cls = [m === next ? "next" : "", i >= SHOW && !seasonOpen ? "more" : ""].filter(Boolean).join(" ");
      return "<tr" + (cls ? ' class="' + cls + '"' : "") + (i >= SHOW && !seasonOpen ? " hidden" : "") + '><td class="part">' + shortDate(m.date) + " " + m.date.slice(0, 4) + (m.name ? '</td><td>' + C.esc(m.name) : "</td><td>") + '</td><td class="n">' + away + '</td><td class="n">' + (gaps[i] != null ? gaps[i] + " days" : "–") + "</td></tr>";
    }).join("");
    let lead = (ahead.length === 1 ? "One meeting" : cap1(word(ahead.length)) + " meetings") + " left at " + P.short + " this season.";
    if (longest >= 0 && ahead.length > 2) {
      const m = ahead[longest], prev = all[all.indexOf(m) - 1];
      lead += " The longest break is " + gaps[longest] + " days, from " + C.dnum(prev.date) + " " + C.mon(prev.date) + " to " + C.dnum(m.date) + " " + C.mon(m.date) + ".";
    }
    $("raceSeason").innerHTML = "<h3>The rest of the season</h3><p>" + C.esc(lead) + '</p><div class="tablewrap"><table class="season"><thead><tr><th>Date</th><th></th><th class="n">Away</th><th class="n">Break</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      (ahead.length > SHOW && !seasonOpen ? '<button type="button" class="morebtn" id="seasonMore">Show all ' + ahead.length + " meetings</button>" : "") +
      '<p class="small">' + C.esc(P.calendarNote || "") + "</p>";
    const btn = $("seasonMore");
    if (btn) btn.addEventListener("click", () => { seasonOpen = true; renderSeason(all, next); });
  }
  let seasonOpen = false;
  const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- on the track ---------- */
  function writeTrack() {
    const out = [];
    const ahead = S.days.slice(S.ti, S.ti + 7);
    const ar = C.sum(ahead.map(d => d.mmMid != null ? d.mmMid : d.mm)), ae = C.sum(ahead.map(d => d.et0));
    if (ae > 0) {
      const lead = ar - ae > 15 ? "The track should get a good deal wetter this week" : ar - ae > 5 ? "The track should get a little wetter this week"
        : ar - ae < -15 ? "The track should dry out steadily this week" : ar - ae < -5 ? "The track should dry a little this week" : "The track should hold about where it is this week";
      out.push(lead + ", with around " + C.r0(ar) + " mm of rain forecast against " + C.r0(ae) + " mm of evaporation.");
    }
    // the last day with 5 mm or more, counting today's rain so far
    const pastDays = S.days.slice(0, S.ti + 1);
    let last = null;
    for (let k = pastDays.length - 1; k >= 0; k--) {
      const d = pastDays[k];
      const mm = d.i === S.ti ? C.sum(d.hrs.filter(x => x.n < S.nowN).map(x => x.mm)) : d.mm;
      if (mm >= 5) { last = { d, mm }; break; }
    }
    if (last && last.d.i === S.ti) {
      out.push("About " + C.r0(last.mm) + " mm of rain has fallen at the track today so far.");
    } else if (last) {
      const after = S.H.filter(x => x.date > last.d.date && x.n < S.nowN);
      const et = C.sum(after.map(x => x.et0)), mm = C.sum(after.map(x => x.mm));
      const when = last.d.i === S.ti - 1 ? "yesterday" : "on " + longDate(last.d.date);
      out.push("Since the last decent rain, " + C.r0(last.mm) + " mm " + when + ", the track has lost about " + C.r0(et) + " mm to evaporation and had " + (mm < 1 ? "almost none" : "about " + C.r0(mm) + " mm") + " back.");
    } else {
      const span14 = S.H.filter(x => x.n >= S.nowN - 14 * 24 && x.n < S.nowN);
      out.push("There hasn't been a day with 5 mm of rain or more in the past fortnight. Over that time the track has lost about " + C.r0(C.sum(span14.map(x => x.et0))) + " mm to evaporation against " + C.r0(C.sum(span14.map(x => x.mm))) + " mm of rain.");
    }
    if (ae > 0) {
      const ets = ahead.map(d => d.et0).filter(v => v != null);
      const lo = C.minOf(ets), hi = C.maxOf(ets);
      if (hi - lo < 1) out.push("Evaporation is steady at about " + C.r0(C.avg(ets)) + " mm a day.");
      else out.push("Evaporation runs from about " + C.r0(lo) + " mm a day on the wet or dull days to " + C.r0(hi) + " mm on the drying ones.");
    }
    // thunderstorms and downpours in the next seven days
    const nextH = S.H.filter(x => x.n >= Math.floor(S.nowN) && x.n < S.nowN + 168);
    const storms = runs(nextH, thunder);
    if (storms.length) {
      // one phrase per day, so two spells on the same day read "tomorrow from 2pm to 4pm and at 8pm"
      const dates = [];
      storms.forEach(r => { if (dates.indexOf(r.date) < 0) dates.push(r.date); });
      const bits = dates.slice(0, 4).map(date => {
        const w = dayWord(date);
        return (w === "today" || w === "tomorrow" ? w : "on " + w) + " " + storms.filter(r => r.date === date).map(r => span(r.rows)).join(" and ");
      });
      out.push("Thunderstorms are possible " + C.listJoin(bits) + (dates.length > 4 ? ", and on other days later in the week" : "") + ".");
    }
    const pours = nextH.filter(x => burst(x) >= 5);
    if (pours.length) {
      const top = pours.slice().sort((a, b) => burst(b) - burst(a))[0];
      out.push("The heaviest burst looks like about " + C.r0(burst(top)) + " mm in an hour, at " + C.fmtH(top.hr) + " " + (dayWord(top.date) === "today" ? "today" : dayWord(top.date) === "tomorrow" ? "tomorrow" : "on " + dayWord(top.date)) + ".");
    } else if (!storms.length) {
      out.push("No thunderstorms or heavy downpours are forecast in the next seven days.");
    }
    return out;
  }

  function soilChart() {
    const rows = S.H.filter(x => x.n >= S.nowN - 168 && x.n <= S.nowN + 168 && (x.smTop != null || x.smRoot != null));
    if (rows.length < 24) return '<p class="small">Soil moisture didn\'t load this time.</p>';
    const vals = rows.map(x => x.smTop).concat(rows.map(x => x.smRoot)).filter(v => v != null).map(v => v * 100);
    const lo = Math.max(0, Math.floor((Math.min.apply(null, vals) - 2) / 5) * 5), hi = Math.ceil((Math.max.apply(null, vals) + 2) / 5) * 5;
    const W = 600, H = 210, L = 34, R = 10, T = 16, B = 30;
    const t0 = rows[0].n, N = rows[rows.length - 1].n - t0;
    const sx = n => L + (W - L - R) * (n - t0) / N, sy = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let g = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Soil moisture in the top 9 cm and from 9 to 27 cm, past week and week ahead">';
    const mid = Math.round((lo + hi) / 10) * 5;
    [lo, mid, hi].forEach(v => { g += '<line class="sgrid" x1="' + L + '" x2="' + (W - R) + '" y1="' + sy(v) + '" y2="' + sy(v) + '"/><text x="' + (L - 6) + '" y="' + (sy(v) + 3.5) + '" text-anchor="end">' + v + "%</text>"; });
    const xn = sx(S.nowN);
    g += '<line class="stoday" x1="' + xn + '" x2="' + xn + '" y1="' + T + '" y2="' + (H - B + 4) + '"/><text x="' + (xn + 4) + '" y="' + (T + 8) + '">week ahead</text><text x="' + (xn - 4) + '" y="' + (T + 8) + '" text-anchor="end">past week</text>';
    const line = (k, cls) => { const pts = rows.filter(x => x[k] != null).map((x, i) => (i ? "L" : "M") + sx(x.n).toFixed(1) + " " + sy(x[k] * 100).toFixed(1)); return pts.length ? '<path class="' + cls + '" d="' + pts.join(" ") + '"/>' : ""; };
    g += line("smRoot", "sroot") + line("smTop", "stop");
    rows.forEach(x => { if (x.hr === 12) g += '<text x="' + sx(x.n) + '" y="' + (H - 10) + '" text-anchor="middle">' + (x.date === S.todayDate ? "Tod" : C.wd(x.date).slice(0, 2)) + "</text>"; });
    return '<div class="soilchart">' + g + "</svg></div>";
  }

  function writeSoil() {
    const nowRow = S.H[S.nowIdx], week = S.H.find(x => x.n === nowRow.n - 168);
    const ahead = S.H.filter(x => x.n > S.nowN && x.n <= S.nowN + 168 && x.smTop != null);
    if (!nowRow || nowRow.smTop == null || !ahead.length) return "";
    const pc = v => C.r0(v * 100) + "%";
    let t = "The top 9 cm is at about " + pc(nowRow.smTop);
    if (week && week.smTop != null && Math.abs(week.smTop - nowRow.smTop) >= 0.02) t += ", " + (week.smTop > nowRow.smTop ? "down" : "up") + " from " + pc(week.smTop) + " a week ago";
    const peak = ahead.slice().sort((a, b) => b.smTop - a.smTop)[0], low = ahead.slice().sort((a, b) => a.smTop - b.smTop)[0];
    if (peak.smTop - nowRow.smTop >= 0.03) t += ", and wets up to about " + pc(peak.smTop) + " by " + (dayWord(peak.date) === "today" ? "tonight" : dayWord(peak.date)) + ".";
    else if (nowRow.smTop - low.smTop >= 0.03) t += ", and dries to about " + pc(low.smTop) + " by " + (dayWord(low.date) === "today" ? "tonight" : dayWord(low.date)) + ".";
    else t += ", and stays about there for the week.";
    return t;
  }

  function grassFacts() {
    const today = S.H.filter(x => x.date === S.todayDate);
    const t6 = C.avg(today.map(x => x.soilT)), t18 = C.avg(today.map(x => x.soilT18));
    if (t6 == null) return "";
    const wk = C.avg(S.H.filter(x => x.n > S.nowN + 144 && x.n <= S.nowN + 168).map(x => x.soilT));
    const kv = [];
    let t = C.r0(t6) + "°C today";
    if (wk != null && Math.abs(wk - t6) >= 1.5) t += ", " + (wk > t6 ? "warming" : "cooling") + " to about " + C.r0(wk) + "°C in a week";
    kv.push(["Soil at 6 cm", t]);
    if (t18 != null) kv.push(["Soil at 18 cm", C.r0(t18) + "°C"]);
    kv.push(["Growth", t6 < 6 ? "Very little growth" : t6 < 10 ? "Growing, but slowly" : t6 < 22 ? "Good growth when there's moisture" : "Warm enough that ryegrass growth slows in the heat"]);
    kv.push(["Oversowing", t6 < 8 ? "Too cold for ryegrass seed to strike well" : t6 < 10 ? "Ryegrass seed will strike, but slowly" : "Warm enough for ryegrass seed to strike well"]);
    const frosts = S.days.slice(S.ti + 1, S.ti + 7).filter(d => d.frost);
    kv.push(["Frost", frosts.length ? "Possible on " + C.listJoin(frosts.map(d => d.name)) + " morning" + (frosts.length > 1 ? "s" : "") : "None in the next week"]);
    return '<dl class="kv">' + kv.map(([k, v]) => "<dt>" + k + "</dt><dd>" + C.esc(v) + "</dd>").join("") + "</dl>";
  }

  function renderTrack() {
    $("trackRead").innerHTML = para(writeTrack());
    const ct = chanceTable([["Next 24 hours", S.nowN, S.nowN + 24], ["Next 3 days", S.nowN, S.nowN + 72], ["Next 7 days", S.nowN, S.nowN + 168]]);
    $("trackWater").innerHTML = "<h3>Rain in, evaporation out</h3>" + C.waterChart(S) +
      (ct ? "<h3>Chance of at least this much rain</h3>" + ct + '<p class="small">' + CHANCE_NOTE + "</p>" : "");
    const soilTxt = writeSoil();
    $("trackSoil").innerHTML = "<h3>Soil moisture</h3>" + (soilTxt ? "<p>" + C.esc(soilTxt) + "</p>" : "") + soilChart() +
      '<p class="small"><span class="keyline"></span>Top 9 cm <span class="keyline dash" style="margin-left:10px"></span>9 to 27 cm, as a share of the soil\'s volume. This is the weather model\'s estimate for the area, not a reading from the track. ' + C.esc(P.soilNote || "") + "</p>" +
      "<h3>Grass</h3>" + grassFacts();
    renderStorm();
  }

  let stormGeo = null;
  function renderStorm() {
    const svg = $("stormGrid"), scroll = $("stormScroll");
    clear(svg);
    const days = S.days.slice(S.ti, S.ti + 7);
    const W = Math.max(scroll.clientWidth, 620);
    const LBL = 70, RT = 6, TOP = 20, RH = 26, GAP = 4;
    const cw = (W - LBL - RT) / 24;
    const HGT = TOP + days.length * (RH + GAP);
    svg.setAttribute("width", W); svg.setAttribute("height", HGT); svg.setAttribute("viewBox", "0 0 " + W + " " + HGT);
    for (let h = 0; h < 24; h += 3) say(C.fmtH(h), { x: LBL + h * cw + 2, y: TOP - 7 }, svg);
    const cells = [];
    days.forEach((d, r) => {
      const y = TOP + r * (RH + GAP);
      say(d.i === S.ti ? "Today" : d.name.slice(0, 3) + " " + C.dnum(d.date), { x: 0, y: y + RH / 2 + 4, class: "rl" }, svg);
      for (let h = 0; h < 24; h++) {
        const x = d.hrs.find(q => q.hr === h);
        if (!x) continue;
        const cx = LBL + h * cw;
        const past = x.n + 1 <= S.nowN;
        const grp = el("g", { opacity: past ? 0.3 : 1 }, svg);
        el("rect", { x: cx + 1, y, width: cw - 2, height: RH, rx: 2.5, class: "cellbg" }, grp);
        if (!x.isDay) el("rect", { x: cx + 1, y, width: cw - 2, height: RH, rx: 2.5, class: "dark" }, grp);
        if (x.mm >= 0.2) el("rect", { x: cx + 1, y, width: cw - 2, height: RH, rx: 2.5, class: "scell", "fill-opacity": (x.mm >= 5 ? 0.92 : x.mm >= 3 ? 0.7 : x.mm >= 1 ? 0.45 : 0.2).toFixed(2) }, grp);
        if (burst(x) >= 5) el("rect", { x: cx + 1, y, width: cw - 2, height: RH, rx: 2.5, class: "pourbox" }, grp);
        if (thunder(x)) el("circle", { cx: cx + cw / 2, cy: y + RH / 2, r: Math.min(3.4, cw / 4), class: "thring" }, grp);
        cells.push({ x: cx, y, w: cw, h: RH, d, row: x });
      }
    });
    const hit = el("rect", { x: LBL, y: TOP, width: W - LBL - RT, height: HGT - TOP, class: "hit" }, svg);
    stormGeo = { cells, svg };
    hit.addEventListener("pointermove", stormMove);
    hit.addEventListener("pointerdown", stormMove);
    hit.addEventListener("pointerleave", () => { $("stormTip").hidden = true; });
  }
  function stormMove(ev) {
    const r = stormGeo.svg.getBoundingClientRect();
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    const c = stormGeo.cells.find(k => px >= k.x && px < k.x + k.w && py >= k.y - 2 && py < k.y + k.h + 2);
    if (!c) { $("stormTip").hidden = true; return; }
    const x = c.row;
    const line = (a, b) => '<div class="row"><span>' + a + "</span><span>" + b + "</span></div>";
    let html = "<b>" + (c.d.i === S.ti ? "Today" : c.d.name.slice(0, 3)) + " " + C.fmtH(x.hr) + "</b>" +
      line("Rain", x.mm < 0.05 ? "none" : x.mm.toFixed(1) + " mm") +
      (x.pop != null ? line("Chance of rain", x.pop + "%") : "") +
      (x.wind != null ? line("Wind", C.dir16(x.dir) + " " + C.r0(x.wind) + " km/h") : "") +
      (x.gust != null ? line("Gusts", C.r0(x.gust) + " km/h") : "");
    if (thunder(x)) html += '<div class="flag">Thunderstorm possible</div>';
    if (x.mm >= 5) html += '<div class="flag">5 mm or more in the hour</div>';
    else if (burst(x) >= 5) html += '<div class="flag">One model has a burst of ' + C.r0(burst(x)) + " mm in this hour</div>";
    showTip($("stormTip"), $("stormBox"), ev, html);
  }

  function showTip(tip, box, ev, html) {
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

  /* ---------- rain radar ---------- */
  // The map is drawn at zoom 8 from OpenStreetMap tiles. RainViewer's free radar stops at zoom 7,
  // so each radar tile is drawn at twice its size to sit on the zoom 8 map.
  const MAPZ = 8, RADZ = 7, FRAME_MS = 650, HOLD_MS = 1600;
  const R = { place: null, host: "", frames: [], idx: 0, playing: false, playTimer: null, refreshTimer: null, w: 0, h: 0, loaded: false };
  const worldPx = (lat, lon, z) => {
    const n = 256 * Math.pow(2, z), s = Math.sin(lat * Math.PI / 180);
    return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
  };
  const clock = t => {
    try { return new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(t * 1000)).replace(/\s/g, "").toLowerCase(); }
    catch (e) { return ""; }
  };

  function radarOrigin() {
    const map = $("radarMap");
    const w = map.clientWidth, h = map.clientHeight;
    const c = worldPx(P.lat, P.lon, MAPZ);
    return { w, h, ox: Math.round(c.x - w / 2), oy: Math.round(c.y - h / 2) };
  }

  function drawBase() {
    const o = radarOrigin(), base = $("radarBase");
    R.w = o.w; R.h = o.h;
    base.innerHTML = "";
    for (let tx = Math.floor(o.ox / 256); tx <= Math.floor((o.ox + o.w - 1) / 256); tx++) {
      for (let ty = Math.floor(o.oy / 256); ty <= Math.floor((o.oy + o.h - 1) / 256); ty++) {
        const img = new Image(256, 256);
        img.alt = ""; img.decoding = "async";
        img.style.left = (tx * 256 - o.ox) + "px"; img.style.top = (ty * 256 - o.oy) + "px";
        img.src = "https://tile.openstreetmap.org/" + MAPZ + "/" + tx + "/" + ty + ".png";
        base.appendChild(img);
      }
    }
    // rings at 25 and 50 km, and the track
    const over = $("radarOver"), mpp = 156543.03392 * Math.cos(P.lat * Math.PI / 180) / Math.pow(2, MAPZ);
    clear(over);
    over.setAttribute("viewBox", "0 0 " + o.w + " " + o.h);
    const cx = o.w / 2, cy = o.h / 2;
    [25, 50].forEach(km => {
      const r = km * 1000 / mpp;
      el("circle", { cx, cy, r, class: "ring" }, over);
      say(km + " km", { x: cx + 4, y: cy - r - 4, class: "ringl" }, over);
    });
    el("circle", { cx, cy, r: 5.5, class: "pin" }, over);
    say(P.short, { x: cx + 10, y: cy + 4.5, class: "pinl" }, over);
  }

  function frameDiv(f, o) {
    const div = document.createElement("div");
    div.dataset.path = f.path;
    const sz = 512;   // a zoom 7 tile covers 512 pixels of the zoom 8 map
    let first = true;
    for (let rx = Math.floor(o.ox / sz); rx <= Math.floor((o.ox + o.w - 1) / sz); rx++) {
      for (let ry = Math.floor(o.oy / sz); ry <= Math.floor((o.oy + o.h - 1) / sz); ry++) {
        const img = new Image(sz, sz);
        img.alt = ""; img.decoding = "async";
        img.style.left = (rx * sz - o.ox) + "px"; img.style.top = (ry * sz - o.oy) + "px";
        img.style.width = sz + "px"; img.style.height = sz + "px";
        if (first) { img.onload = () => { f.ready = true; if (R.frames[R.frames.length - 1] === f) $("radarWait").hidden = true; }; first = false; }
        img.onerror = () => { if (R.frames[R.frames.length - 1] === f && !f.ready) { $("radarWait").hidden = false; $("radarWait").textContent = "The radar isn't responding right now. It usually comes back within a few minutes."; } };
        img.src = R.host + f.path + "/256/" + RADZ + "/" + rx + "/" + ry + "/2/1_1.png";
        div.appendChild(img);
      }
    }
    return div;
  }

  function drawFrames(rebuild) {
    const o = radarOrigin(), holder = $("radarFrames");
    if (rebuild) holder.innerHTML = "";
    const have = {};
    Array.prototype.forEach.call(holder.children, d => { have[d.dataset.path] = d; });
    const keep = {};
    // newest first, so the latest picture arrives before the older ones
    R.frames.slice().reverse().forEach(f => {
      keep[f.path] = true;
      if (!have[f.path]) { f.div = frameDiv(f, o); holder.appendChild(f.div); }
      else f.div = have[f.path];
    });
    Object.keys(have).forEach(p => { if (!keep[p]) holder.removeChild(have[p]); });
    const sl = $("radarSlider");
    sl.max = String(Math.max(0, R.frames.length - 1));
    if (!R.playing) R.idx = R.frames.length - 1;
    showFrame(R.idx);
  }

  function showFrame(i) {
    if (!R.frames.length) return;
    R.idx = Math.max(0, Math.min(R.frames.length - 1, i));
    R.frames.forEach((f, k) => { if (f.div) f.div.classList.toggle("on", k === R.idx); });
    $("radarSlider").value = String(R.idx);
    const f = R.frames[R.idx];
    const mins = Math.max(0, Math.round((Date.now() / 1000 - f.time) / 60));
    const ago = mins < 1 ? "" : mins < 60 ? mins + " min ago" : Math.floor(mins / 60) + " hr " + (mins % 60 ? mins % 60 + " min " : "") + "ago";
    $("radarTime").textContent = clock(f.time) + (R.idx === R.frames.length - 1 ? ", latest" : "") + (ago ? ", " + ago : "");
  }

  function stopPlay() {
    R.playing = false;
    if (R.playTimer) { clearTimeout(R.playTimer); R.playTimer = null; }
    $("radarPlay").textContent = "Play";
  }
  function step() {
    if (!R.playing) return;
    const last = R.frames.length - 1;
    const nxt = R.idx >= last ? 0 : R.idx + 1;
    showFrame(nxt);
    R.playTimer = setTimeout(step, nxt === last ? HOLD_MS : FRAME_MS);
  }
  function startPlay() {
    if (R.frames.length < 2) return;
    R.playing = true;
    $("radarPlay").textContent = "Pause";
    if (R.idx >= R.frames.length - 1) showFrame(0);
    R.playTimer = setTimeout(step, FRAME_MS);
  }

  async function loadFrames() {
    const place = P;
    try {
      const r = await fetch("https://api.rainviewer.com/public/weather-maps.json", { cache: "no-store" });
      const j = await r.json();
      if (place !== P || R.place !== P) return;
      const past = (j.radar && j.radar.past) || [];
      if (!past.length) throw new Error("no frames");
      const was = R.frames.map(f => f.path).join();
      R.host = j.host || "https://tilecache.rainviewer.com";
      const byPath = {};
      R.frames.forEach(f => { byPath[f.path] = f; });
      R.frames = past.map(f => byPath[f.path] || { time: f.time, path: f.path });
      if (R.frames.map(f => f.path).join() !== was) drawFrames(false);
      else showFrame(R.idx);
      R.loaded = true;
    } catch (e) {
      if (!R.frames.length) { $("radarWait").hidden = false; $("radarWait").textContent = "The radar didn't load. It usually comes back within a few minutes."; }
    }
  }

  function startRadar() {
    R.place = P; R.frames = []; R.idx = 0; R.loaded = false;
    stopPlay();
    $("radarFrames").innerHTML = "";
    $("radarWait").hidden = false; $("radarWait").textContent = "Loading the radar.";
    $("radarTime").textContent = "";
    drawBase();
    loadFrames();
    if (R.refreshTimer) clearInterval(R.refreshTimer);
    R.refreshTimer = setInterval(() => { if (!document.hidden) loadFrames(); }, 5 * 60000);
  }
  function stopRadar() {
    stopPlay();
    if (R.refreshTimer) { clearInterval(R.refreshTimer); R.refreshTimer = null; }
    R.place = null; R.frames = [];
    $("radarFrames").innerHTML = ""; $("radarBase").innerHTML = "";
  }

  $("radarPlay").addEventListener("click", () => { if (R.playing) stopPlay(); else startPlay(); });
  $("radarSlider").addEventListener("input", ev => { stopPlay(); showFrame(+ev.target.value); });
  document.addEventListener("visibilitychange", () => {
    if (!R.place) return;
    if (document.hidden) stopPlay();
    else loadFrames();
  });

  /* ---------- hooks for app.js ---------- */
  window.Track = {
    setup(place) {
      C = window.WXCORE || C;
      P = place;
      $("radarsec").hidden = !place.radar;
      if (place.radar) { if (R.place !== place) startRadar(); }
      else if (R.place) stopRadar();
    },
    render(state, place) {
      C = window.WXCORE; S = state; P = place;
      if (!place.track) return;
      renderRace();
      renderTrack();
    },
    resize() {
      if (!S || !P || !P.track) return;
      $("raceTip").hidden = true; $("stormTip").hidden = true;
      if (raceNext && !$("raceBox").hidden) renderRaceChart(raceNext);
      renderStorm();
      if (R.place) {
        const map = $("radarMap");
        if (map.clientWidth !== R.w || map.clientHeight !== R.h) { drawBase(); drawFrames(true); }
      }
    }
  };
})();
