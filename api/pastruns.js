// Past forecasts for scoring the weather models against what actually fell.
// Passes one request through to Open-Meteo's Previous Runs archive: for one gauge site and one model, the rain each
// model forecast for every hour, as it stood 0 to 7 days beforehand. Only the gauge sites and models listed here are
// allowed, so this can't be used as a general relay. Used by the model back-test (see README), not by the pages.

const SITES = {
  hamilton: [-37.865, 175.336],     // Hamilton Airport gauge (WMO 93173), the nearest long official record to Te Rapa
  auckland: [-37.008, 174.789],     // Auckland Airport gauge (WMO 93119)
  pukekohe: [-37.206, 174.864]      // Pukekohe gauge (WMO 93124)
};
const MODELS = new Set([
  "best_match", "ecmwf_ifs025", "ecmwf_ifs", "ecmwf_aifs025_single", "ukmo_seamless", "gfs_seamless", "gfs_graphcast025",
  "icon_seamless", "gem_seamless", "jma_seamless", "bom_access_global", "meteofrance_seamless", "cma_grapes_global", "kma_seamless"
]);

async function handler(req, res) {
  const q = req.query || Object.fromEntries(new URL(req.url, "http://x").searchParams);
  const site = SITES[String(q.site || "")], model = String(q.model || ""), start = String(q.start || ""), end = String(q.end || "");
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const send = (code, body, cache) => {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    if (cache) res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.end(body);
  };
  if (!site || !MODELS.has(model) || !day.test(start) || !day.test(end) || end < start || Date.parse(end) - Date.parse(start) > 370 * 86400000) {
    send(400, JSON.stringify({ error: "Pass site, model, start=YYYY-MM-DD and end=YYYY-MM-DD (up to a year apart)" }));
    return;
  }
  const vars = ["precipitation"].concat([1, 2, 3, 4, 5, 6, 7].map(n => "precipitation_previous_day" + n)).join(",");
  const url = "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=" + site[0] + "&longitude=" + site[1] +
    "&timezone=GMT&start_date=" + start + "&end_date=" + end + "&hourly=" + vars + (model === "best_match" ? "" : "&models=" + model);
  try {
    const r = await fetch(url);
    const text = await r.text();
    send(r.status, text, r.ok);
  } catch (e) {
    send(502, JSON.stringify({ error: "Couldn't reach the forecast archive" }));
  }
}

module.exports = handler;
