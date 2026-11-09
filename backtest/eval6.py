"""How best to get a six-hour rain figure from the models. Usage: python3 -I eval6.py SITE START"""
import json, sys, math, statistics as st, datetime as dt
site, start = sys.argv[1], sys.argv[2]
S = json.load(open(f'/tmp/bt/{site}_6h.json')); T6, F6 = S['truth'], {m: {int(l): v for l, v in d.items()} for m, d in S['fc'].items()}
Dd = json.load(open(f'/tmp/bt/{site}_daily.json')); FD = {m: {int(l): v for l, v in d.items()} for m, d in Dd['fc'].items()}
E9, E25, AI, UK, US, DE, CA = 'ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'gfs_seamless', 'icon_seamless', 'gem_seamless'
eu = E9 if start >= '2025-10-01' else E25
six = [eu, AI, UK, US, DE, CA]
def trim(v):
    v = sorted(v)
    return sum(v[1:-1]) / (len(v) - 2) if len(v) >= 5 else st.median(v)
def utc_day(key):   # the UTC day a window ending at key falls in
    d = dt.date.fromisoformat(key[:10])
    return (d - dt.timedelta(days=1)).isoformat() if key[11:13] == '00' else d.isoformat()
def methods(key, l):
    mem = [m for m in six if not (m == US and l >= 5)]
    w = {m: F6[m][l][key] for m in mem if key in F6[m].get(l, {})}
    day = utc_day(key)
    dd = {m: FD[m][l][day] for m in w if day in FD[m].get(l, {})}
    if len(w) < len(mem) - 1 or eu not in w or len(dd) != len(w): return None
    mean_w = sum(w.values()) / len(w); mean_d = sum(dd.values()) / len(dd); blend_d = trim(list(dd.values()))
    out = {'European model alone (as before)': w[eu], 'average of the models': mean_w, 'drop high and low, average the rest': trim(list(w.values())),
           'average shape, scaled to the day blend': mean_w * blend_d / mean_d if mean_d > 0 else 0.0,
           'European shape, scaled to the day blend': (w[eu] * blend_d / dd[eu]) if dd[eu] > 0.2 else (mean_w * blend_d / mean_d if mean_d > 0 else 0.0)}
    return out
def sc(p):
    n = len(p); h = sum(1 for f, o in p if f >= 5 and o >= 5); m = sum(1 for f, o in p if f < 5 and o >= 5); fa = sum(1 for f, o in p if f >= 5 and o < 5)
    return f'miss {sum(abs(f-o) for f,o in p)/n:.3f}  bias {sum(f-o for f,o in p)/n:+.3f}  rmse {math.sqrt(sum((f-o)**2 for f,o in p)/n):.2f}  wet/dry right {100*(1-sum(1 for f,o in p if (f>=1)!=(o>=1))/n):.0f}%  5 mm+ caught {100*h/max(1,h+m):.0f}%  false 5 mm+ {100*fa/max(1,h+fa):.0f}%', sum(abs(f-o) for f,o in p)/n
keys = sorted(k for k in T6 if k[:10] >= start)
print(f'{site} since {start}: mean six-hour rain {st.mean(T6[k] for k in keys):.2f} mm')
for leads in ((1, 2), (3, 4), (5, 6)):
    acc = {}
    for l in leads:
        for k in keys:
            r = methods(k, l)
            if r:
                for name, v in r.items(): acc.setdefault(name, []).append((v, T6[k]))
    print(f'  {leads[0]}-{leads[1]} days ahead, {len(next(iter(acc.values())))//2} windows:')
    for name, p in sorted(acc.items(), key=lambda kv: sc(kv[1])[1]): print(f'     {name:42s} {sc(p)[0]}')
