// Reads the public day sheets that clubs on Golf NZ's booking system publish, and returns
// the open spots at each tee time. Only fetched when someone opens the Tee times tab, and
// cached for ten minutes, so the club sites see a handful of requests at most.

const CLUBS = new Set([127, 176, 405, 283, 199, 268, 252, 473]);
const HOST = "https://www.golf.co.nz";

function decode(s) {
  return s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

// One row per tee time on one tee: time, tee, then four player spots.
// Spots are open to the public (xavail), open to affiliated golfers only, booked, or held
// (home members only, competitions, not bookable online).
function parse(html) {
  const out = [];
  const rowRe = /<tr style="height:48px;">([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const cells = [];
    const cellRe = /<td([^>]*)>([\s\S]*?)<\/td>/g;
    let c;
    while ((c = cellRe.exec(m[1]))) cells.push({ attrs: c[1], inner: c[2] });
    if (cells.length < 3) continue;
    const time = decode(cells[0].inner.replace(/<[^>]+>/g, "")).trim();
    const tee = decode(cells[1].inner.replace(/<[^>]+>/g, "")).trim();
    if (!/^\d{1,2}:\d{2}$/.test(time)) continue;
    const slot = { t: time.padStart(5, "0"), tee, pub: 0, aff: 0, booked: 0, held: 0 };
    cells.slice(2).forEach(cell => {
      const cls = (cell.attrs.match(/class="([^"]+)"/) || [])[1] || "";
      const title = decode((cell.attrs.match(/title="([^"]*)"/) || [])[1] || "");
      if (/\bxavail\b/.test(cls)) slot.pub++;
      else if (/\bxbooked\b/.test(cls)) slot.booked++;
      else if (/\bxunavail\b/.test(cls) && /^Only affiliated members/i.test(title)) slot.aff++;
      else slot.held++;
    });
    out.push(slot);
  }
  return out;
}

async function fetchClub(id, date) {
  const url = HOST + "/Teebooking/SearchSlots.aspx?ClubId=" + id + "&CourseId=null&Date=" + date;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": "Mozilla/5.0 (personal tee time finder; low volume)" } });
    const html = await r.text();
    if (!r.ok) return { ok: false, error: "HTTP " + r.status };
    return { ok: true, slots: parse(html) };
  } catch (e) {
    return { ok: false, error: e.name === "AbortError" ? "timed out" : String(e.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const date = String(q.date || "");
  const ids = String(q.clubs || "").split(",").map(Number).filter(n => CLUBS.has(n));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !ids.length) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Pass date=YYYY-MM-DD and clubs=id,id" }));
    return;
  }
  const d = Date.parse(date + "T12:00:00Z"), now = Date.now();
  if (!(d > now - 2 * 86400000 && d < now + 16 * 86400000)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Date must be within the next fortnight" }));
    return;
  }
  const results = await Promise.all(ids.map(id => fetchClub(id, date)));
  const clubs = {};
  ids.forEach((id, i) => { clubs[id] = results[i]; });
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1200");
  res.end(JSON.stringify({ date, fetchedAt: new Date().toISOString(), clubs }));
}

module.exports = handler;
module.exports.parse = parse;
