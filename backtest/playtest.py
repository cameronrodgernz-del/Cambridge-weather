"""Which hourly rain figure gives the better play score? Scored on six-hour gauge windows, since the gauges
don't report by the hour. Usage: python3 -I playtest.py SITE [START]"""
import json, glob, sys, statistics as st, datetime as dt
site = sys.argv[1]; start = sys.argv[2] if len(sys.argv) > 2 else '2025-10-01'
E9, E25, AI, UK, US, DE, CA = 'ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'gfs_seamless', 'icon_seamless', 'gem_seamless'
eu = E9 if start >= '2025-10-01' else E25
six = [eu, AI, UK, US, DE, CA]
T6 = json.load(open(f'/tmp/bt/{site}_6h.json'))['truth']
FD = {m: {int(l): v for l, v in d.items()} for m, d in json.load(open(f'/tmp/bt/{site}_daily.json'))['fc'].items()}
HR = {}                                   # model -> lead -> window key -> six hourly values
for m in six:
    for f in sorted(glob.glob(f'/tmp/bt/pr/{site}_{m}_*.json')):
        h = json.load(open(f))['hourly']; t = h['time']
        for lead in range(1, 7):
            vals = h.get(f'precipitation_previous_day{lead}')
            if not vals: continue
            out = HR.setdefault(m, {}).setdefault(lead, {})
            for i, ts in enumerate(t):
                if ts[11:13] in ('00', '06', '12', '18') and i >= 5 and ts[:13] in T6 and ts[:10] >= start:
                    w = vals[i - 5:i + 1]
                    if all(v is not None for v in w): out[ts[:13]] = w
def pen(v): return 80 if v >= 3 else 65 if v >= 1 else 40 if v >= 0.2 else 0
def trim(v):
    v = sorted(v); return sum(v[1:-1]) / (len(v) - 2) if len(v) >= 5 else st.median(v)
def utc_day(key):
    d = dt.date.fromisoformat(key[:10]); return (d - dt.timedelta(days=1)).isoformat() if key[11:13] == '00' else d.isoformat()
def auc(pairs, T):
    pos = [s for s, o in pairs if o >= T]; neg = [s for s, o in pairs if o < T]
    if not pos or not neg: return float('nan')
    allv = sorted(set(pos + neg)); import bisect
    neg.sort(); tot = 0.0
    for p in pos:
        lo = bisect.bisect_left(neg, p); hi = bisect.bisect_right(neg, p); tot += lo + 0.5 * (hi - lo)
    return tot / (len(pos) * len(neg))
print(f'{site} since {start}')
for leads in ((1, 2), (3, 4), (5, 6)):
    acc = {}; pick = {}
    for l in leads:
        mem = [m for m in six if not (m == US and l >= 5)]
        byday = {}
        for key in sorted(HR[eu].get(l, {})):
            w = {m: HR[m][l][key] for m in mem if key in HR.get(m, {}).get(l, {})}
            day = utc_day(key); dd = {m: FD[m][l][day] for m in w if day in FD[m].get(l, {})}
            if len(w) < len(mem) - 1 or eu not in w or len(dd) != len(w): continue
            mean_h = [sum(w[m][k] for m in w) / len(w) for k in range(6)]
            mean_d = sum(dd.values()) / len(dd); scale = trim(list(dd.values())) / mean_d if mean_d > 0 else 0
            s = {'one model (as before)': sum(pen(v) for v in w[eu]),
                 'blended hours, same cut-offs': sum(pen(v * scale) for v in mean_h),
                 'average of each model\'s score': sum(sum(pen(v) for v in w[m]) for m in w) / len(w)}
            for name, v in s.items(): acc.setdefault(name, []).append((v, T6[key]))
            byday.setdefault(day, []).append((s, T6[key]))
        for day, ws in byday.items():           # the picker: of the day's windows, take the one each score likes best
            if len(ws) < 4: continue
            for name in ws[0][0]:
                best = min(x[0][name] for x in ws); tied = [o for x, o in ws if x[name] <= best + 1e-9]
                pick.setdefault(name, []).append((sum(tied) / len(tied), sum(1 for o in tied if o >= 0.2) / len(tied)))
    n = len(next(iter(acc.values())))
    print(f'  {leads[0]}-{leads[1]} days ahead, {n} windows; picker over {len(next(iter(pick.values())))} days')
    for name, p in acc.items():
        q = pick[name]
        print(f'     {name:32s} tells wet from dry (1.0 = perfect): 0.2 mm+ {auc(p, 0.2):.3f}, 1 mm+ {auc(p, 1):.3f}, 5 mm+ {auc(p, 5):.3f} | best window of the day: {sum(a for a, _ in q)/len(q):.2f} mm fell on average, wet {100*sum(b for _, b in q)/len(q):.0f}% of the time')
