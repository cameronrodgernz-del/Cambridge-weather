/* Cambridge Weather
   Everything is computed in the browser from Open-Meteo. To make a copy of this site for another town,
   change PLACE below (name, region, coordinates and the MetService link) and redeploy. */
(function () {
  "use strict";

  const PLACE = {
    name: "Cambridge",
    region: "Waikato, New Zealand",
    lat: -37.8833,
    lon: 175.4667,
    timezone: "Pacific/Auckland",
    metservice: "https://www.metservice.com/towns-cities/locations/cambridge"
  };

  const MODELS = [
    ["ecmwf_ifs025", "European (ECMWF)"],
    ["ukmo_seamless", "UK Met Office"],
    ["gfs_seamless", "US (GFS)"],
    ["icon_seamless", "German (ICON)"],
    ["gem_seamless", "Canadian (GEM)"],
    ["jma_seamless", "Japanese (JMA)"]
  ];
  const REFRESH_MINUTES = 30;

  /* ---------- requests ---------- */
  const qs = o => Object.entries(o).map(([k, v]) => k + "=" + encodeURIComponent(v)).join("&");
  const common = { latitude: PLACE.lat, longitude: PLACE.lon, timezone: PLACE.timezone };
  const URLS = {
    main: "https://api.open-meteo.com/v1/forecast?" + qs(Object.assign({}, common, {
      forecast_days: 8, past_days: 7, wind_speed_unit: "kmh",
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day",
      hourly: "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,precipitation_probability,precipitation,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m,uv_index,weather_code,is_day",
      daily: "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,sunrise,sunset,daylight_duration,uv_index_max"
    })),
    models: "https://api.open-meteo.com/v1/forecast?" + qs(Object.assign({}, common, {
      forecast_days: 8, daily: "temperature_2m_max,temperature_2m_min,precipitation_sum",
      models: MODELS.map(m => m[0]).join(",")
    })),
    ens: "https://ensemble-api.open-meteo.com/v1/ensemble?" + qs(Object.assign({}, common, {
      forecast_days: 8, hourly: "precipitation", models: "ecmwf_ifs025"
    }))
  };

  async function getJSON(url, tries) {
    let last;
    for (let i = 0; i < (tries || 2); i++) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 20000);
      try {
        const r = await fetch(url, { signal: ctl.signal });
        const j = await r.json();
        clearTimeout(timer);
        if (!r.ok || j.error) throw new Error(j.reason || "HTTP " + r.status);
        return j;
      } catch (e) {
        clearTimeout(timer);
        last = e;
        await new Promise(res => setTimeout(res, 1500));
      }
    }
    throw last;
  }

  /* ---------- small helpers ---------- */
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const r0 = v => Math.round(v);
  const sum = a => a.reduce((s, v) => s + (v || 0), 0);
  const avg = a => { const b = a.filter(v => v != null); return b.length ? sum(b) / b.length : null; };
  const maxOf = a => { const b = a.filter(v => v != null); return b.length ? Math.max.apply(null, b) : null; };
  const minOf = a => { const b = a.filter(v => v != null); return b.length ? Math.min.apply(null, b) : null; };
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const lc = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  const tnum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13) || 0, +s.slice(14, 16) || 0) / 3600000;
  const WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const wd = date => WEEK[new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10))).getUTCDay()];
  const dnum = date => +date.slice(8, 10);
  const mon = date => MONTHS[+date.slice(5, 7) - 1];
  const fmtH = h => (h % 12 === 0 ? 12 : h % 12) + (h < 12 ? "am" : "pm");
  const fmtClock = s => { const hh = +s.slice(11, 13), mm = s.slice(14, 16); return (hh % 12 === 0 ? 12 : hh % 12) + ":" + mm + (hh < 12 ? "am" : "pm"); };
  const listJoin = a => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];

  const DIR16 = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const DIRLONG = ["northerly", "north-easterly", "easterly", "south-easterly", "southerly", "south-westerly", "westerly", "north-westerly"];
  const dir16 = d => d == null ? "" : DIR16[Math.floor(((d + 11.25) % 360) / 22.5)];
  const dirLong = d => d == null ? "" : DIRLONG[Math.floor(((d + 22.5) % 360) / 45)];
  function meanDir(rows) {
    let x = 0, y = 0;
    rows.forEach(r => { if (r.dir == null) return; const w = r.wind || 0.1, a = r.dir * Math.PI / 180; x += w * Math.sin(a); y += w * Math.cos(a); });
    if (!x && !y) return null;
    return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
  }

  function mmText(v) {
    if (v == null) return "–";
    if (v < 0.2) return "0 mm";
    if (v < 1) return "under 1 mm";
    return r0(v) + " mm";
  }
  // amount as a single figure when the estimates agree, otherwise as a range
  const agrees = d => d.mmMid >= 1 && d.mmHi - d.mmLo <= Math.max(2, 0.4 * d.mmHi);
  function amountText(d) {
    if (d.mmHi < 0.2) return "0 mm";
    if (d.mmHi < 1) return "under 1 mm";
    if (agrees(d)) return mmText(d.mmMid);
    return (d.mmLo < 1 ? "0" : r0(d.mmLo)) + "–" + r0(d.mmHi) + " mm";
  }
  function amountPhrase(d) {
    if (d.mmHi < 1) return "only light amounts";
    if (agrees(d)) return "around " + r0(d.mmMid) + " mm";
    return (d.mmLo < 1 ? "up to " + r0(d.mmHi) : r0(d.mmLo) + "–" + r0(d.mmHi)) + " mm";
  }
  function chanceWord(p) {
    if (p == null) return "";
    if (p >= 0.85) return "almost certain";
    if (p >= 0.6) return "likely";
    if (p >= 0.3) return "possible";
    if (p >= 0.1) return "unlikely";
    return "very unlikely";
  }
  function uvWord(u) {
    if (u == null) return "";
    if (u < 3) return "low";
    if (u < 6) return "moderate";
    if (u < 8) return "high";
    if (u < 11) return "very high";
    return "extreme";
  }

  /* Sky words. Day words for daylight hours, night words for the dark. */
  function sky(mm, wetHrs, cloud, night) {
    if (mm >= 25) return { word: "Heavy rain", prose: "heavy rain", icon: "rain", wet: true };
    if (mm >= 8) return wetHrs >= 8 ? { word: "Rain", prose: "rain", icon: "rain", wet: true } : { word: "Heavy showers", prose: "heavy showers", icon: "rain", wet: true };
    if (mm >= 2) return wetHrs >= 6 ? { word: "Rain at times", prose: "rain at times", icon: "rain", wet: true } : { word: "Showers", prose: "showers", icon: "showers", wet: true };
    if (mm >= 0.5) return cloud != null && cloud < 55
      ? { word: night ? "A few showers" : "Sunny spells, a few showers", prose: night ? "a few showers" : "sunny spells and a few showers", icon: "showers", wet: true }
      : { word: "Cloudy, a few showers", prose: "cloud and a few showers", icon: "showers", wet: true };
    const c = cloud == null ? 50 : cloud;
    if (night) {
      if (c < 20) return { word: "Clear", prose: "clear", icon: "moon" };
      if (c < 40) return { word: "Mostly clear", prose: "mostly clear", icon: "moon" };
      if (c < 65) return { word: "Partly cloudy", prose: "partly cloudy", icon: "cloud" };
      if (c < 85) return { word: "Mostly cloudy", prose: "mostly cloudy", icon: "cloud" };
      return { word: "Cloudy", prose: "cloudy", icon: "cloud" };
    }
    if (c < 20) return { word: "Sunny", prose: "sunny", icon: "sun" };
    if (c < 40) return { word: "Mostly sunny", prose: "mostly sunny", icon: "sun" };
    if (c < 65) return { word: "Sun and cloud", prose: "a mix of sun and cloud", icon: "suncloud" };
    if (c < 85) return { word: "Mostly cloudy", prose: "mostly cloudy", icon: "cloud" };
    return { word: "Cloudy", prose: "cloudy", icon: "cloud" };
  }

  function timing(parts, total) {
    const names = ["overnight", "morning", "afternoon", "evening"];
    const idx = parts.map((v, i) => v >= Math.max(0.3, total * 0.15) ? i : -1).filter(i => i >= 0);
    if (!idx.length) return "";
    if (idx.length >= 3) return "for much of the day";
    const label = i => i === 0 ? "overnight" : "in the " + names[i];
    if (idx.length === 1) return label(idx[0]);
    if (idx[0] === 0) return "overnight and " + label(idx[1]);
    return "in the " + names[idx[0]] + " and " + names[idx[1]];
  }

  /* ---------- build the working model from the three responses ---------- */
  function build(main, models, ens) {
    const h = main.hourly;
    const pick = (k, i) => (h[k] ? h[k][i] : null);
    const H = h.time.map((t, i) => ({
      t, n: tnum(t), date: t.slice(0, 10), hr: +t.slice(11, 13),
      temp: pick("temperature_2m", i), feels: pick("apparent_temperature", i), rh: pick("relative_humidity_2m", i),
      dew: pick("dew_point_2m", i), pop: pick("precipitation_probability", i), mm: pick("precipitation", i) || 0,
      cloud: pick("cloud_cover", i), vis: pick("visibility", i), wind: pick("wind_speed_10m", i),
      dir: pick("wind_direction_10m", i), gust: pick("wind_gusts_10m", i), uv: pick("uv_index", i),
      code: pick("weather_code", i), isDay: pick("is_day", i)
    })).filter(x => x.temp != null);

    H.forEach(x => {
      const spread = x.dew != null ? x.temp - x.dew : 99;
      const darkish = x.hr >= 20 || x.hr <= 10;
      x.fog = darkish && x.mm < 0.2 && ((x.vis != null && x.vis <= 1000) || (spread <= 1.0 && (x.wind == null ? 99 : x.wind) <= 7));
      x.frost = x.temp <= 1 || (x.temp <= 3.5 && (x.cloud == null ? 100 : x.cloud) <= 40 && (x.wind == null ? 99 : x.wind) <= 8);
    });

    const cur = main.current;
    const nowN = tnum(cur.time);
    let nowIdx = H.findIndex(x => x.n > nowN) - 1;
    if (nowIdx < 0) nowIdx = 0;
    const todayDate = cur.time.slice(0, 10);

    // ensemble, per day
    const ensDay = {};
    if (ens && ens.hourly) {
      const keys = Object.keys(ens.hourly).filter(k => k.indexOf("precipitation") === 0);
      const byDate = {};
      ens.hourly.time.forEach((t, i) => { const d = t.slice(0, 10); (byDate[d] = byDate[d] || []).push(i); });
      Object.keys(byDate).forEach(d => {
        const totals = keys.map(k => sum(byDate[d].map(i => ens.hourly[k][i]))).sort((a, b) => a - b);
        const n = totals.length;
        ensDay[d] = { n, wet: totals.filter(v => v >= 1).length, p10: totals[Math.floor(0.1 * n)], p50: totals[Math.floor(0.5 * n)], p90: totals[Math.min(n - 1, Math.floor(0.9 * n))] };
      });
    }

    // models, per day
    const modelDay = {};
    if (models && models.daily) {
      models.daily.time.forEach((d, i) => {
        modelDay[d] = MODELS.map(([key, label]) => ({
          key, label,
          mm: models.daily["precipitation_sum_" + key] ? models.daily["precipitation_sum_" + key][i] : null,
          hi: models.daily["temperature_2m_max_" + key] ? models.daily["temperature_2m_max_" + key][i] : null,
          lo: models.daily["temperature_2m_min_" + key] ? models.daily["temperature_2m_min_" + key][i] : null
        })).filter(m => m.mm != null || m.hi != null);
      });
    }

    const dl = main.daily;
    const days = dl.time.map((date, i) => {
      const hrs = H.filter(x => x.date === date);
      const day = hrs.filter(x => x.hr >= 9 && x.hr <= 17);
      const waking = hrs.filter(x => x.hr >= 6 && x.hr <= 21);
      const mm = sum(hrs.map(x => x.mm));
      const wakingMM = sum(waking.map(x => x.mm));
      const parts = [0, 6, 12, 18].map(a => sum(hrs.filter(x => x.hr >= a && x.hr < a + 6).map(x => x.mm)));
      const uvHrs = hrs.filter(x => (x.uv || 0) >= 3);
      const dd = {
        date, i, name: wd(date), hrs,
        hi: dl.temperature_2m_max[i], lo: dl.temperature_2m_min[i],
        mm, wakingMM, parts, wetHrs: hrs.filter(x => x.mm >= 0.2).length,
        popMax: dl.precipitation_probability_max ? dl.precipitation_probability_max[i] : maxOf(hrs.map(x => x.pop)),
        gust: dl.wind_gusts_10m_max ? dl.wind_gusts_10m_max[i] : maxOf(hrs.map(x => x.gust)),
        windTop: maxOf(hrs.filter(x => x.hr >= 8 && x.hr <= 20).map(x => x.wind)),
        windLow: minOf(hrs.filter(x => x.hr >= 9 && x.hr <= 18).map(x => x.wind)),
        dir: meanDir(hrs.filter(x => x.hr >= 9 && x.hr <= 20)),
        cloud: avg(day.map(x => x.cloud)),
        uvMax: dl.uv_index_max ? dl.uv_index_max[i] : maxOf(hrs.map(x => x.uv)),
        uvFrom: uvHrs.length ? uvHrs[0].hr : null, uvTo: uvHrs.length ? uvHrs[uvHrs.length - 1].hr + 1 : null,
        sunrise: dl.sunrise ? dl.sunrise[i] : null, sunset: dl.sunset ? dl.sunset[i] : null,
        daylight: dl.daylight_duration ? dl.daylight_duration[i] : null,
        fogHrs: hrs.filter(x => x.fog && x.hr <= 10).length,
        frostHrs: hrs.filter(x => x.frost && x.hr <= 9).length,
        ens: ensDay[date] || null, models: modelDay[date] || []
      };
      dd.sky = sky(wakingMM, waking.filter(x => x.mm >= 0.2).length, dd.cloud, false);
      dd.pRain = dd.ens ? dd.ens.wet / dd.ens.n : (dd.popMax != null ? dd.popMax / 100 : null);
      // rain amount: the middle of every estimate we have (blend, each model, ensemble middle)
      const est = [mm].concat(dd.models.map(m => m.mm)).concat(dd.ens ? [dd.ens.p50] : []).filter(v => v != null).sort((a, b) => a - b);
      const trimmed = est.length >= 5 ? est.slice(1, -1) : est;
      dd.mmMid = est.length ? est[Math.floor(est.length / 2)] : mm;
      dd.mmLo = trimmed[0]; dd.mmHi = trimmed[trimmed.length - 1];
      dd.dryModels = dd.models.filter(m => m.mm != null && m.mm < 1).length;
      dd.dry = dd.mmMid < 0.2 && (dd.pRain == null || dd.pRain < 0.25);
      dd.fog = dd.fogHrs >= 2;
      dd.frost = dd.frostHrs >= 1;
      return dd;
    });
    const ti = Math.max(0, days.findIndex(d => d.date === todayDate));
    return { H, days, ti, cur, nowN, nowIdx, todayDate, hasModels: !!(models && models.daily), hasEns: !!(ens && ens.hourly) };
  }

  /* ---------- writing ---------- */
  function dayRef(S, d) {
    if (d.i === S.ti) return "today";
    if (d.i === S.ti + 1) return "tomorrow";
    return d.name;
  }

  function writeRead(S) {
    const out = [];
    const today = S.days[S.ti], tom = S.days[S.ti + 1];
    const hrNow = +S.cur.time.slice(11, 13);

    // today, while there's daylight left
    if (hrNow < 17) {
      const rest = S.H.filter(x => x.n >= S.nowN - 0.5 && x.date === today.date && x.hr <= 19);
      const restMM = sum(rest.map(x => x.mm));
      const s = sky(restMM, rest.filter(x => x.mm >= 0.2).length, avg(rest.map(x => x.cloud)), false);
      const restHi = maxOf(rest.map(x => x.temp));
      let line = cap(s.prose) + " for the rest of today";
      if (restHi != null && restHi > S.cur.temperature_2m + 0.5) line += ", with a high of " + r0(restHi) + "°C";
      out.push(line + ".");
    }

    // tonight
    if (tom) {
      const night = S.H.filter(x => (x.date === today.date && x.hr >= 18) || (x.date === tom.date && x.hr <= 8));
      const low = minOf(night.map(x => x.temp));
      const nMM = sum(night.map(x => x.mm));
      const nCloud = avg(night.map(x => x.cloud));
      let line = (hrNow >= 18 ? "Overnight it gets down to " : "Tonight gets down to ") + r0(low) + "°C";
      if (nMM >= 0.5) line += nMM >= 3 ? ", with rain at times" : ", with a shower or two";
      else if (nCloud != null && nCloud < 30) line += " under clear skies";
      if (tom.fog) line += ", and fog is likely early tomorrow morning";
      else if (tom.frost) line += ", cold enough for a ground frost by dawn";
      out.push(line + ".");
    }

    // tomorrow
    if (tom) {
      let line;
      if (tom.sky.wet) {
        const when = timing(tom.parts, tom.mm);
        line = "Tomorrow brings " + tom.sky.prose + (when ? " " + when : "") + (tom.mmHi >= 1 ? ", " + amountPhrase(tom) + "," : "") + " with a high of " + r0(tom.hi) + "°C.";
      } else {
        line = "Tomorrow is " + tom.sky.prose + " with a high of " + r0(tom.hi) + "°C.";
      }
      if (tom.gust >= 45 && tom.dir != null) line += " " + cap(dirLong(tom.dir)) + " gusts reach " + r0(tom.gust) + " km/h.";
      out.push(line);
    }

    // the rest of the week
    const ahead = S.days.slice(S.ti + 1, S.ti + 7);
    const later = S.days.slice(S.ti + 2, S.ti + 7);
    const wet = later.filter(d => d.mmMid >= 4).sort((a, b) => b.mmMid - a.mmMid);
    if (wet.length) {
      const w = wet[0];
      let line = cap(w.name) + " looks the wettest day, with " + amountPhrase(w);
      if (w.models.length >= 3 && w.dryModels >= 1) line += ", though " + w.dryModels + " of the " + w.models.length + " models keep it mostly dry";
      else if (w.models.length >= 3 && agrees(w)) line += ", and the models broadly agree";
      out.push(line + ".");
    } else if (ahead.every(d => d.mmMid < 1)) {
      out.push("No rain of note is expected for the rest of the week.");
    }
    const dryDays = later.filter(d => d.mmMid < 0.5 && d.pRain != null && d.pRain < 0.4);
    const brightDry = dryDays.filter(d => d.cloud != null && d.cloud < 65);
    if (brightDry.length) {
      const best = brightDry.slice().sort((a, b) => (a.cloud - b.cloud) || (b.hi - a.hi))[0];
      out.push(cap(best.name) + " looks the best day, dry and " + best.sky.prose + " with a high of " + r0(best.hi) + "°C.");
    } else if (dryDays.length) {
      out.push(listJoin(dryDays.map(d => d.name)) + (dryDays.length > 1 ? " look" : " looks") + " dry but cloudy.");
    }
    const his = ahead.map(d => d.hi).filter(v => v != null);
    if (his.length) {
      const mn = Math.min.apply(null, his), mx = Math.max.apply(null, his);
      if (mx - mn <= 5) out.push("Highs stay between " + r0(mn) + " and " + r0(mx) + "°C.");
      else {
        const dMn = ahead.find(d => d.hi === mn), dMx = ahead.find(d => d.hi === mx);
        out.push("Highs range from " + r0(mn) + "°C on " + dayRef(S, dMn) + " to " + r0(mx) + "°C on " + dayRef(S, dMx) + ".");
      }
    }
    const fogDays = later.filter(d => d.fog).map(d => d.name);
    const frostDays = later.filter(d => d.frost).map(d => d.name);
    if (frostDays.length) out.push("Watch for frost on " + listJoin(frostDays) + " morning" + (frostDays.length > 1 ? "s" : "") + ".");
    if (fogDays.length) out.push("Morning fog is likely on " + listJoin(fogDays) + ".");
    return out;
  }

  function writeDay(S, d) {
    const out = [];
    const where = d.i === S.ti ? "Today is " : d.i === S.ti + 1 ? "Tomorrow is " : cap(d.name) + " is ";
    if (d.sky.wet) out.push(cap(d.sky.prose) + ", with a high of " + r0(d.hi) + "°C and a low of " + r0(d.lo) + "°C.");
    else out.push(where + d.sky.prose + ", with a high of " + r0(d.hi) + "°C and a low of " + r0(d.lo) + "°C.");
    if (d.mmHi >= 1 && d.mm >= 0.2) {
      const when = timing(d.parts, d.mm);
      out.push("Rain falls " + (when === "for much of the day" ? when : "mostly " + (when || "in short bursts")) + ", " + amountPhrase(d) + " in total.");
    } else if (d.mm >= 0.2 || (d.pRain != null && d.pRain >= 0.3)) out.push("Any showers are light.");
    if (d.windTop != null) {
      if (d.windTop < 8) out.push("Winds are light.");
      else out.push("Winds are " + dirLong(d.dir) + " " + ((d.windLow || 0) < 5 ? "up to " + r0(d.windTop) : r0(d.windLow) + "–" + r0(d.windTop)) + " km/h" + (d.gust >= 25 ? ", gusting to " + r0(d.gust) : "") + ".");
    }
    if (d.fog) out.push("Fog is likely in the early morning.");
    if (d.frost) out.push("A ground frost is possible around dawn.");
    return out.join(" ");
  }

  /* ---------- rendering ---------- */
  const ICON = { sun: "i-sun", suncloud: "i-suncloud", cloud: "i-cloud", showers: "i-showers", rain: "i-rain", moon: "i-moon" };
  const icon = (name, cls) => '<svg class="' + (cls || "wx") + '" aria-hidden="true"><use href="#' + ICON[name] + '"/></svg>';
  let S = null, selected = null, range = 96, snapshotMode = false;
  try { const r = +localStorage.getItem("wx-range"); if ([48, 96, 168].indexOf(r) >= 0) range = r; } catch (e) { /* storage unavailable */ }

  function renderNow() {
    const c = S.cur, today = S.days[S.ti];
    const code = c.weather_code;
    let word;
    if (code === 45 || code === 48) word = "Fog";
    else if (code >= 95) word = "Thunderstorms";
    else if (code >= 80) word = "Showers";
    else if (code >= 61) word = "Rain";
    else if (code >= 51) word = "Drizzle";
    else word = sky(0, 0, c.cloud_cover, !c.is_day).word;
    const ic = code >= 51 ? (code >= 61 && code < 80 ? "rain" : "showers") : sky(0, 0, c.cloud_cover, !c.is_day).icon;
    $("now").innerHTML =
      '<div class="big">' + icon(ic, "") + "<span>" + r0(c.temperature_2m) + "°</span></div>" +
      '<div class="nowsky">' + esc(word) + "</div>" +
      '<dl><dt>Feels like</dt><dd>' + r0(c.apparent_temperature) + "°C</dd>" +
      "<dt>Wind</dt><dd>" + dir16(c.wind_direction_10m) + " " + r0(c.wind_speed_10m) + " km/h</dd>" +
      "<dt>Gusts</dt><dd>" + r0(c.wind_gusts_10m) + " km/h</dd>" +
      "<dt>Humidity</dt><dd>" + r0(c.relative_humidity_2m) + "%</dd>" +
      "<dt>Today</dt><dd>" + r0(today.hi) + "° / " + r0(today.lo) + "°</dd></dl>";
    const when = fmtClock(c.time) + " " + wd(c.time.slice(0, 10));
    $("stamp").textContent = snapshotMode
      ? "Preview copy with data as at " + when + ". The live site refreshes itself."
      : "Conditions as at " + when + ". Refreshes every " + REFRESH_MINUTES + " minutes.";
  }

  function renderRead() {
    const lines = writeRead(S);
    $("read").innerHTML = '<p class="lead">' + esc(lines[0] || "") + "</p>" + (lines.length > 1 ? "<p>" + esc(lines.slice(1).join(" ")) + "</p>" : "");
  }

  function renderLedger() {
    const html = S.days.slice(S.ti, S.ti + 7).map(d => {
      const label = d.i === S.ti ? "Today" : d.name;
      const rain = d.dry ? "Dry" : d.mmHi < 0.2 ? "Possible shower" : amountText(d) + (d.pRain != null ? ", " + chanceWord(d.pRain) : "");
      const wind = (d.windTop != null && d.windTop < 6 ? "Light" : (dir16(d.dir) + " " + r0(d.windTop || 0) + " km/h").trim()) + ", gusts " + r0(d.gust || 0);
      const tags = [];
      if (d.frost) tags.push("Frost");
      if (d.fog) tags.push("Fog");
      if (d.gust >= 55) tags.push("Windy");
      if ((d.uvMax || 0) >= 8) tags.push("UV very high");
      return '<button type="button" class="day" data-i="' + d.i + '" aria-pressed="' + (d.i === selected) + '">' +
        '<span class="dtop"><span><span class="dname">' + label + '</span><span class="ddate">' + dnum(d.date) + " " + mon(d.date).slice(0, 3) + "</span></span>" + icon(d.sky.icon) + "</span>" +
        '<span class="sky">' + esc(d.sky.word) + "</span>" +
        '<span class="temps"><span class="hi">' + r0(d.hi) + '°</span><span class="lo">low ' + r0(d.lo) + "°</span></span>" +
        '<span class="facts"><span class="k">Rain</span><span>' + esc(rain) + '</span><span class="k">Wind</span><span>' + esc(wind) + "</span></span>" +
        '<span class="tags">' + tags.map(t => '<span class="tag">' + t + "</span>").join("") + "</span></button>";
    }).join("");
    $("ledger").innerHTML = html;
    $("ledger").querySelectorAll(".day").forEach(b => b.addEventListener("click", () => {
      selected = +b.dataset.i;
      renderLedger();
      renderDay();
    }));
  }

  function partRow(S, d, a, label) {
    const rows = d.hrs.filter(x => x.hr >= a && x.hr < a + 6);
    if (!rows.length) return "";
    const mm = sum(rows.map(x => x.mm));
    const night = rows.filter(x => !x.isDay).length > rows.length / 2;
    const s = sky(mm, rows.filter(x => x.mm >= 0.2).length, avg(rows.map(x => x.cloud)), night);
    let skyTxt = s.word;
    if (rows.filter(x => x.fog).length >= 2) skyTxt += ", fog likely";
    if (rows.filter(x => x.frost).length >= 1) skyTxt += ", frost risk";
    const tMin = minOf(rows.map(x => x.temp)), tMax = maxOf(rows.map(x => x.temp));
    const temp = r0(tMin) === r0(tMax) ? r0(tMax) + "°" : r0(tMin) + "–" + r0(tMax) + "°";
    const wMin = r0(minOf(rows.map(x => x.wind))), wMax = r0(maxOf(rows.map(x => x.wind))), g = r0(maxOf(rows.map(x => x.gust)));
    const wind = (wMax < 6 ? "Light" : dir16(meanDir(rows)) + " " + (wMin === wMax ? wMax : wMin + "–" + wMax)) + (g >= 30 ? ", gusts " + g : "");
    const pop = maxOf(rows.map(x => x.pop));
    const rain = mm < 0.2 ? (pop != null && pop >= 20 ? "Possible shower, " + pop + "%" : "Dry") : mmText(mm) + (pop != null ? ", " + pop + "%" : "");
    return '<tr><td class="part">' + label + "</td><td>" + esc(skyTxt) + '</td><td class="n">' + temp + "</td><td>" + esc(wind) + "</td><td>" + esc(rain) + "</td></tr>";
  }

  function renderDay() {
    const d = S.days[selected];
    const title = d.i === S.ti ? "Today in detail" : d.i === S.ti + 1 ? "Tomorrow in detail" : d.name + " in detail";
    $("h-day").textContent = title;
    const rows = [[0, "Overnight"], [6, "Morning"], [12, "Afternoon"], [18, "Evening"]].map(([a, l]) => partRow(S, d, a, l)).join("");
    const dlh = d.daylight != null ? Math.floor(d.daylight / 3600) + " h " + r0((d.daylight % 3600) / 60) + " min" : "–";
    const kv = [];
    if (d.sunrise) kv.push(["Sunrise", fmtClock(d.sunrise)]);
    if (d.sunset) kv.push(["Sunset", fmtClock(d.sunset)]);
    kv.push(["Daylight", dlh]);
    if (d.uvMax != null) kv.push(["Peak UV", r0(d.uvMax) + " (" + uvWord(d.uvMax) + ")"]);
    if (d.uvFrom != null) kv.push(["Sun protection", fmtH(d.uvFrom) + " to " + fmtH(d.uvTo % 24)]);
    if (d.ens) kv.push(["Rain chance", d.ens.wet + " of " + d.ens.n + " ensemble runs bring 1 mm or more"]);
    $("daydetail").innerHTML =
      '<div class="col"><h3>' + d.name + " " + dnum(d.date) + " " + mon(d.date) + "</h3><p>" + esc(writeDay(S, d)) + "</p>" +
      '<div class="tablewrap"><table><thead><tr><th></th><th>Sky</th><th class="n">Temp</th><th>Wind (km/h)</th><th>Rain</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>" +
      '<div class="col"><h3>Sun and daylight</h3><dl class="kv">' + kv.map(([k, v]) => "<dt>" + k + "</dt><dd>" + esc(v) + "</dd>").join("") + "</dl></div>";
  }

  function renderModels() {
    const days = S.days.slice(S.ti, S.ti + 7);
    const head = '<thead><tr><th>Rain (mm)</th>' + days.map(d => '<th class="n">' + (d.i === S.ti ? "Today" : d.name.slice(0, 3)) + "</th>").join("") + "</tr></thead>";
    const f = v => v == null ? "–" : v.toFixed(1);
    let body = '<tr><td>Blended forecast (hourly chart)</td>' + days.map(d => '<td class="n">' + f(d.mm) + "</td>").join("") + "</tr>";
    MODELS.forEach(([key, label]) => {
      body += "<tr><td>" + label + "</td>" + days.map(d => { const m = d.models.find(x => x.key === key); return '<td class="n">' + f(m ? m.mm : null) + "</td>"; }).join("") + "</tr>";
    });
    body += '<tr class="blend"><td>Middle of all estimates (used in the summary)</td>' + days.map(d => '<td class="n">' + f(d.mmMid) + "</td>").join("") + "</tr>";
    if (S.hasEns) body += '<tr class="ens"><td>Ensemble runs with 1 mm or more</td>' + days.map(d => '<td class="n">' + (d.ens ? d.ens.wet + "/" + d.ens.n : "–") + "</td>").join("") + "</tr>";
    body += '<tr><th>High (°C)</th>' + days.map(() => "<th></th>").join("") + "</tr>";
    body += "<tr><td>Range across the models</td>" + days.map(d => {
      const v = d.models.map(m => m.hi).filter(x => x != null);
      return '<td class="n">' + (v.length ? (r0(Math.min.apply(null, v)) === r0(Math.max.apply(null, v)) ? r0(v[0]) : r0(Math.min.apply(null, v)) + "–" + r0(Math.max.apply(null, v))) : "–") + "</td>";
    }).join("") + "</tr>";
    $("models").innerHTML = head + "<tbody>" + body + "</tbody>";

    // the written read on agreement
    const ps = [];
    const ref = d => d.i === S.ti ? "today" : d.i === S.ti + 1 ? "tomorrow" : d.name;
    const allDry = days.filter(d => d.models.length >= 3 && d.models.every(m => m.mm == null || m.mm < 1) && (!d.ens || d.ens.wet / d.ens.n < 0.2));
    const allWet = days.filter(d => d.models.length >= 3 && d.models.filter(m => m.mm != null && m.mm >= 2).length >= d.models.length - 1 && (!d.ens || d.ens.wet / d.ens.n >= 0.7));
    if (allDry.length) ps.push("Every model keeps " + listJoin(allDry.map(ref)) + " dry.");
    if (allWet.length) ps.push(cap(listJoin(allWet.map(ref))) + (allWet.length > 1 ? " look" : " looks") + " wet in nearly every model.");
    let worst = null;
    days.forEach(d => {
      const v = d.models.map(m => m.mm).filter(x => x != null);
      if (v.length < 3) return;
      const sp = Math.max.apply(null, v) - Math.min.apply(null, v);
      if (Math.max.apply(null, v) >= 3 && (!worst || sp > worst.sp)) worst = { d, sp, lo: Math.min.apply(null, v), hi: Math.max.apply(null, v) };
    });
    if (worst && worst.sp >= 4) ps.push("The models disagree most about " + ref(worst.d) + ", from " + (worst.lo < 1 ? "under 1" : r0(worst.lo)) + " mm to " + r0(worst.hi) + " mm.");
    const spreads = days.map(d => { const v = d.models.map(m => m.hi).filter(x => x != null); return v.length >= 3 ? Math.max.apply(null, v) - Math.min.apply(null, v) : null; }).filter(x => x != null).sort((a, b) => a - b);
    if (spreads.length) ps.push("Daily highs agree to within about " + Math.max(1, r0(spreads[Math.floor(spreads.length / 2)])) + "°C on most days.");
    if (!S.hasModels) ps.push("The model comparison didn't load this time. Refresh the page to try again.");
    $("agreeText").innerHTML = (ps.length ? "<p>" + esc(ps.join(" ")) + "</p>" : "") +
      '<p class="small">Each model reports for its nearest grid point, so small differences are normal. Forecasts more than four or five days out can change from one update to the next.</p>';
  }

  function renderPast() {
    const past = S.days.slice(Math.max(0, S.ti - 7), S.ti);
    if (!past.length) { $("past").innerHTML = '<p class="small">No data for the past week.</p>'; return; }
    const total = sum(past.map(d => d.mm));
    const wettest = past.slice().sort((a, b) => b.mm - a.mm)[0];
    const his = past.map(d => d.hi), los = past.map(d => d.lo);
    const coldest = past.slice().sort((a, b) => a.lo - b.lo)[0];
    let txt = total < 1 ? "Almost no rain in the past seven days." : r0(total) + " mm of rain in the past seven days" + (wettest.mm >= 1 ? ", most of it on " + wettest.name : "") + ".";
    txt += " Highs ranged from " + r0(Math.min.apply(null, his)) + " to " + r0(Math.max.apply(null, his)) + "°C, and the coldest morning was " + r0(coldest.lo) + "°C on " + coldest.name + ".";
    const W = 560, Hh = 150, L = 8, R = 8, T = 22, B = 26;
    const mx = Math.max(5, Math.ceil(Math.max.apply(null, past.map(d => d.mm)) / 5) * 5);
    const bw = (W - L - R) / past.length;
    let svg = '<svg viewBox="0 0 ' + W + " " + Hh + '" role="img" aria-label="Rain each day over the past week">';
    svg += '<line class="pbase" x1="' + L + '" x2="' + (W - R) + '" y1="' + (Hh - B) + '" y2="' + (Hh - B) + '"/>';
    past.forEach((d, k) => {
      const x = L + k * bw, h = (d.mm / mx) * (Hh - B - T), y = Hh - B - h;
      if (d.mm >= 0.1) svg += '<rect class="pb" x="' + (x + bw * 0.22) + '" y="' + y + '" width="' + bw * 0.56 + '" height="' + Math.max(1.5, h) + '" rx="2"/>';
      svg += '<text class="pv" x="' + (x + bw / 2) + '" y="' + (y - 6) + '" text-anchor="middle">' + (d.mm < 0.1 ? "0" : d.mm < 1 ? d.mm.toFixed(1) : r0(d.mm)) + "</text>";
      svg += '<text x="' + (x + bw / 2) + '" y="' + (Hh - 8) + '" text-anchor="middle">' + d.name.slice(0, 3) + " " + dnum(d.date) + "</text>";
    });
    svg += "</svg>";
    $("past").innerHTML = '<div><p>' + esc(txt) + '</p><p class="small" style="margin-top:8px">Rain in millimetres, estimated from model data rather than a rain gauge.</p></div><div>' + svg + "</div>";
  }

  /* ---------- the hour-by-hour drawing ---------- */
  const svg = $("chart"), scroll = $("chartscroll"), tip = $("tip"), box = $("chartbox");
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; };
  const txt = (s, attrs, parent) => { const e = el("text", attrs, parent); e.textContent = s; return e; };
  let geo = null;

  function renderChart() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const rows = S.H.slice(S.nowIdx, S.nowIdx + range + 1);
    if (rows.length < 2) return;
    const t0 = rows[0].n, N = rows[rows.length - 1].n - t0;
    const minW = range <= 48 ? 680 : range <= 96 ? 780 : 1000;
    const W = Math.max(scroll.clientWidth, minW);
    const L = 40, R = 14, TOP = 26;
    const temps = rows.map(r => r.temp).concat(rows.map(r => r.dew).filter(v => v != null));
    const tLo = Math.floor(Math.min.apply(null, temps) - 1), tHi = Math.ceil(Math.max.apply(null, temps) + 2);
    let tTicks = [];
    for (let v = Math.ceil(tLo / 5) * 5; v <= tHi; v += 5) tTicks.push(v);
    if (tTicks.length < 2) { tTicks = []; for (let v = Math.ceil(tLo / 2) * 2; v <= tHi; v += 2) tTicks.push(v); }
    const gMax = maxOf(rows.map(r => r.gust)) || 30;
    const wHi = Math.max(40, Math.ceil((gMax + 8) / 10) * 10);
    const wTicks = []; for (let v = 0; v <= wHi - 5; v += (wHi > 60 ? 20 : 10)) wTicks.push(v);
    const panels = [
      { key: "temp", title: "Temperature °C", h: 130, min: tLo, max: tHi, ticks: tTicks },
      { key: "rain", title: "Chance of rain %", h: 78, min: 0, max: 100, ticks: [0, 50, 100] },
      { key: "wind", title: "Wind and gusts km/h", h: 104, min: 0, max: wHi, ticks: wTicks },
      { key: "cloud", title: "Cloud cover %", h: 66, min: 0, max: 100, ticks: [0, 50, 100] },
      { key: "strip", title: "Fog and frost risk", h: 16, min: 0, max: 1, ticks: [] }
    ];
    const GAP = 30;
    let y = TOP + 40;
    panels.forEach(p => { p.y0 = y; y += p.h; p.y1 = y; y += GAP; });
    const HGT = y - GAP + 22;
    svg.setAttribute("width", W); svg.setAttribute("height", HGT); svg.setAttribute("viewBox", "0 0 " + W + " " + HGT);
    const x = hh => L + (W - L - R) * hh / N;
    const sy = (p, v) => p.y1 - (v - p.min) / (p.max - p.min) * p.h;
    const xr = r => x(r.n - t0);
    const pxh = (W - L - R) / N;

    // night bands
    const nights = [];
    S.days.forEach((d, k) => {
      if (k === 0 && d.sunrise) nights.push([-1e6, tnum(d.sunrise)]);
      const nx = S.days[k + 1];
      if (d.sunset) nights.push([tnum(d.sunset), nx && nx.sunrise ? tnum(nx.sunrise) : 1e9]);
    });
    nights.forEach(([a, b]) => {
      const A = Math.max(0, a - t0), B = Math.min(N, b - t0);
      if (B > A) el("rect", { x: x(A), y: TOP, width: x(B) - x(A), height: HGT - TOP - 18, class: "night" });
    });

    // day boundaries and labels
    const mids = [];
    rows.forEach(r => { if (r.hr === 0 && r.n > t0) mids.push(r); });
    mids.forEach(m => el("line", { x1: xr(m), x2: xr(m), y1: TOP - 4, y2: HGT - 18, class: "daysep" }));
    const shortNames = range > 96;
    const firstGap = mids.length ? xr(mids[0]) - x(0) : 1e9;
    if (firstGap > 74) txt(rows[0].date === S.todayDate ? "Today" : wd(rows[0].date), { x: x(0) + 6, y: TOP + 6, class: "dlabel" });
    mids.forEach(m => {
      const nm = m.date === S.todayDate ? "Today" : wd(m.date);
      txt((shortNames ? nm.slice(0, 3) : nm) + " " + dnum(m.date), { x: xr(m) + 6, y: TOP + 6, class: "dlabel" });
    });

    // panel titles and grids
    panels.forEach(p => {
      txt(p.title, { x: L, y: p.y0 - 9, class: "ptitle" });
      p.ticks.forEach(t => {
        el("line", { x1: L, x2: W - R, y1: sy(p, t), y2: sy(p, t), class: "grid" });
        txt(String(t), { x: L - 6, y: sy(p, t) + 3.5, "text-anchor": "end" });
      });
    });
    const [pT, pR, pW, pC, pS] = panels;
    const path = (p, f) => rows.filter(r => f(r) != null).map((r, i) => (i ? "L" : "M") + xr(r).toFixed(1) + " " + sy(p, f(r)).toFixed(1)).join(" ");

    // temperature and dew point
    el("path", { d: path(pT, r => r.dew), class: "dline" });
    el("path", { d: path(pT, r => r.temp), class: "tline" });
    const byDate = {};
    rows.forEach(r => { (byDate[r.date] = byDate[r.date] || []).push(r); });
    Object.keys(byDate).forEach(date => {
      const rs = byDate[date];
      const hiR = rs.reduce((a, b) => (b.temp > a.temp ? b : a));
      if (rs.length >= 6 && hiR !== rows[0] && hiR !== rows[rows.length - 1]) {
        el("circle", { cx: xr(hiR), cy: sy(pT, hiR.temp), r: 4, class: "tdot" });
        txt(r0(hiR.temp) + "°", { x: xr(hiR), y: sy(pT, hiR.temp) - 9, "text-anchor": "middle", class: "tval" });
      }
      const morning = rs.filter(r => r.hr <= 9);
      if (morning.length >= 4) {
        const loR = morning.reduce((a, b) => (b.temp < a.temp ? b : a));
        if (loR !== rows[0] && loR !== rows[rows.length - 1]) {
          el("circle", { cx: xr(loR), cy: sy(pT, loR.temp), r: 3.5, class: "ldot" });
          txt(r0(loR.temp) + "°", { x: xr(loR), y: sy(pT, loR.temp) + 15, "text-anchor": "middle", class: "tval" });
        }
      }
    });

    // rain chance bars and daily totals
    const bw = Math.max(1.5, pxh - 2);
    rows.forEach((r, k) => {
      if (k === rows.length - 1 || !r.pop) return;
      const yy = sy(pR, r.pop);
      el("rect", { x: xr(r) + 1, y: yy, width: bw, height: pR.y1 - yy, rx: 1, class: "rbar" });
    });

    // wind
    const top = rows.filter(r => r.gust != null).map(r => xr(r).toFixed(1) + " " + sy(pW, r.gust).toFixed(1));
    const bot = rows.filter(r => r.gust != null).map(r => xr(r).toFixed(1) + " " + sy(pW, r.wind).toFixed(1)).reverse();
    if (top.length) el("path", { d: "M" + top.join(" L") + " L" + bot.join(" L") + " Z", class: "gband" });
    el("path", { d: path(pW, r => r.wind), class: "wline" });
    const dStep = pxh * 3 >= 34 ? 3 : pxh * 6 >= 34 ? 6 : 12;
    rows.forEach(r => { if (r.hr % dStep === 0 && r !== rows[rows.length - 1] && xr(r) > L + 12) txt(dir16(r.dir), { x: xr(r), y: pW.y0 + 10, "text-anchor": "middle" }); });

    // cloud
    const cl = path(pC, r => r.cloud);
    if (cl) {
      el("path", { d: cl + " L" + x(N) + " " + pC.y1 + " L" + x(0) + " " + pC.y1 + " Z", class: "cfill" });
      el("path", { d: cl, class: "cline" });
    }

    // fog and frost strip
    el("rect", { x: L, y: pS.y0, width: W - L - R, height: pS.h, class: "stripbg" });
    rows.forEach((r, k) => {
      if (k === rows.length - 1) return;
      if (r.fog) el("rect", { x: xr(r), y: pS.y0, width: pxh, height: pS.h, class: "fog" });
      if (r.frost) el("rect", { x: xr(r), y: pS.y0, width: pxh, height: pS.h, class: "frost" });
    });

    // hour labels
    const hStep = pxh * 3 >= 40 ? 3 : pxh * 6 >= 40 ? 6 : 12;
    rows.forEach(r => { if (r.hr % hStep === 0) txt(fmtH(r.hr), { x: Math.min(xr(r), W - R - 12), y: HGT - 4, "text-anchor": "middle" }); });

    // now
    const nowX = x(Math.max(0, S.nowN - t0));
    panels.forEach(p => el("line", { x1: nowX, x2: nowX, y1: p.y0, y2: p.y1, class: "now" }));
    txt("now", { x: nowX + 4, y: pT.y0 + 10, class: "nowlbl" });

    const cross = el("line", { x1: 0, x2: 0, y1: TOP, y2: HGT - 18, class: "cross", visibility: "hidden" });
    const hit = el("rect", { x: L, y: TOP, width: W - L - R, height: HGT - TOP, class: "hit" });
    geo = { x, xr, L, R, W, N, t0, rows, cross };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", hideTip);
  }

  function hideTip() { tip.hidden = true; if (geo) geo.cross.setAttribute("visibility", "hidden"); }

  function move(ev) {
    const rect = svg.getBoundingClientRect();
    const hh = (ev.clientX - rect.left - geo.L) / (geo.W - geo.L - geo.R) * geo.N;
    let k = Math.round(hh);
    k = Math.max(0, Math.min(geo.rows.length - 1, k));
    const d = geo.rows[k];
    geo.cross.setAttribute("x1", geo.xr(d)); geo.cross.setAttribute("x2", geo.xr(d));
    geo.cross.setAttribute("visibility", "visible");
    const row = (a, b) => '<div class="row"><span>' + a + "</span><span>" + b + "</span></div>";
    let html = "<b>" + (d.date === S.todayDate ? "Today" : wd(d.date).slice(0, 3)) + " " + fmtH(d.hr) + "</b>" +
      row("Temperature", d.temp.toFixed(1) + "°C") +
      (d.feels != null ? row("Feels like", d.feels.toFixed(1) + "°C") : "") +
      (d.dew != null ? row("Dew point", d.dew.toFixed(1) + "°C") : "") +
      (d.pop != null ? row("Chance of rain", d.pop + "%") : "") +
      row("Rain", d.mm.toFixed(1) + " mm") +
      (d.wind != null ? row("Wind", dir16(d.dir) + " " + r0(d.wind) + " km/h") : "") +
      (d.gust != null ? row("Gusts", r0(d.gust) + " km/h") : "") +
      (d.cloud != null ? row("Cloud", d.cloud + "%") : "") +
      (d.rh != null ? row("Humidity", d.rh + "%") : "") +
      (d.isDay && d.uv != null ? row("UV", d.uv.toFixed(1)) : "");
    if (d.fog) html += '<div class="flag">Fog risk</div>';
    if (d.frost) html += '<div class="flag">Frost risk</div>';
    tip.innerHTML = html;
    tip.hidden = false;
    const br = box.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = ev.clientX - br.left + 14;
    if (left + tw > br.width - 8) left = ev.clientX - br.left - tw - 14;
    left = Math.max(8, left);
    let top = ev.clientY - br.top - th / 2;
    top = Math.max(8, Math.min(br.height - th - 8, top));
    tip.style.left = left + "px"; tip.style.top = top + "px";
  }

  function setRange(r) {
    range = r;
    try { localStorage.setItem("wx-range", String(r)); } catch (e) { /* storage unavailable */ }
    document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.range === r)));
    hideTip();
    if (S) renderChart();
  }
  document.querySelectorAll(".seg button").forEach(b => b.addEventListener("click", () => setRange(+b.dataset.range)));
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.range === range)));

  function renderAll() {
    $("placeName").textContent = PLACE.name;
    $("region").textContent = PLACE.region;
    $("msLink").href = PLACE.metservice;
    $("msLink").textContent = "MetService, " + PLACE.name;
    if (selected == null || selected < S.ti || selected > S.ti + 6) selected = S.ti;
    renderNow();
    renderRead();
    renderLedger();
    renderChart();
    renderDay();
    renderModels();
    renderPast();
  }

  function showError(msg) {
    $("read").innerHTML = '<div class="errorbox"><p class="lead">The forecast didn\'t load.</p><p>' + esc(msg) + ' Check your connection, then try again.</p><button type="button" id="retry">Try again</button></div>';
    $("stamp").textContent = "Couldn't reach the forecast service.";
    $("retry").addEventListener("click", load);
  }

  let lastLoad = 0, loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    try {
      let main, models, ens;
      if (window.WX_SNAPSHOT) {
        snapshotMode = true;
        ({ main, models, ens } = window.WX_SNAPSHOT);
      } else {
        const res = await Promise.allSettled([getJSON(URLS.main, 3), getJSON(URLS.models), getJSON(URLS.ens)]);
        if (res[0].status !== "fulfilled") throw res[0].reason || new Error("No data");
        main = res[0].value;
        models = res[1].status === "fulfilled" ? res[1].value : null;
        ens = res[2].status === "fulfilled" ? res[2].value : null;
      }
      S = build(main, models, ens);
      renderAll();
      lastLoad = Date.now();
    } catch (e) {
      if (!S) showError(e && e.message ? "The service said: " + e.message + "." : "");
    } finally {
      loading = false;
    }
  }

  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (S) { hideTip(); renderChart(); } }, 150); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !window.WX_SNAPSHOT && Date.now() - lastLoad > REFRESH_MINUTES * 60000) load();
  });
  if (!window.WX_SNAPSHOT) setInterval(() => { if (!document.hidden) load(); }, REFRESH_MINUTES * 60000);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (S) renderChart(); });
  load();
})();
