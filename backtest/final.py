"""The blend as shipped against the blend as it was, on the same days. Usage: python3 -I final.py SITE [START]"""
import json, sys, math, random, statistics as st
site = sys.argv[1]; start = sys.argv[2] if len(sys.argv) > 2 else '2025-10-01'
J = json.load(open(f'/tmp/bt/{site}_daily.json'))
T, FC = J['truth'], {m: {int(l): v for l, v in d.items()} for m, d in J['fc'].items()}
random.seed(3)
E9, E25, AI, UK, US, DE, CA, JP = 'ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'jma_seamless'
eu = E9 if start >= '2025-10-01' else E25      # the 9 km model's archive of past forecasts only starts in October 2025
def old(l, d):   # default feed + six models, upper-middle value (the 51-run middle can't be rebuilt from the archive)
    v = sorted(FC[m][l][d] for m in ([eu, E25, UK, US, DE, CA, JP] if eu == E9 else [E25, E25, UK, US, DE, CA, JP]) if d in FC[m].get(l, {}))
    return v[len(v) // 2] if len(v) >= 5 else None
def new(l, d):   # as in app.js
    v = sorted(FC[m][l][d] for m in [eu, AI, UK, US, DE, CA] if d in FC[m].get(l, {}) and not (m == US and l >= 5))
    if len(v) < 4: return None
    if len(v) >= 5: t = v[1:-1]; return sum(t) / len(t)
    return st.median(v)
def sc(p):
    n = len(p); hh = sum(1 for f, o in p if f >= 10 and o >= 10); m = sum(1 for f, o in p if f < 10 and o >= 10); fa = sum(1 for f, o in p if f >= 10 and o < 10)
    return dict(n=n, mae=sum(abs(f - o) for f, o in p) / n, bias=sum(f - o for f, o in p) / n, rmse=math.sqrt(sum((f - o) ** 2 for f, o in p) / n),
                right=1 - sum(1 for f, o in p if (f >= 1) != (o >= 1)) / n, pod=hh / max(1, hh + m), far=fa / max(1, hh + fa), big=hh + m)
print(f'{site}: gauge days since {start}: {sum(1 for d in T if d >= start)}, mean {st.mean(v for d, v in T.items() if d >= start):.2f} mm a day')
print(f'{"days ahead":10s} {"days":>5s} | {"average miss was -> now":>24s} | {"change":>7s} | {"chance new is better":>20s} | bias was -> now | wet/dry right | big-rain days caught (of n) | false big')
tot = {'o': [], 'n': []}
for leads in ((1,), (2,), (3,), (4,), (5,), (6,), (1, 2, 3), (4, 5, 6), (1, 2, 3, 4, 5, 6)):
    rows = [(old(l, d), new(l, d), T[d]) for l in leads for d in sorted(T) if d >= start]
    rows = [r for r in rows if r[0] is not None and r[1] is not None]
    a, b = sc([(o, t) for o, n, t in rows]), sc([(n, t) for o, n, t in rows])
    dif = [abs(n - t) - abs(o - t) for o, n, t in rows]
    better = sum(1 for _ in range(1000) if sum(random.choice(dif) for _ in dif) < 0) / 1000
    print(f'{"-".join(map(str, leads)) if len(leads) < 4 else "1 to 6":10s} {len(rows)//len(leads):5d} | {a["mae"]:10.2f} -> {b["mae"]:5.2f} mm     | {100*(b["mae"]/a["mae"]-1):+6.1f}% | {100*better:18.0f}%  | {a["bias"]:+5.2f} -> {b["bias"]:+5.2f} | {100*a["right"]:3.0f}% -> {100*b["right"]:3.0f}% | {100*a["pod"]:3.0f}% -> {100*b["pod"]:3.0f}% of {a["big"]//len(leads):3d}        | {100*a["far"]:3.0f}% -> {100*b["far"]:3.0f}%')
print('\nsingle models on the same days (1 to 3 days ahead, then 4 to 6):')
for leads in ((1, 2, 3), (4, 5, 6)):
    ms = [eu, AI, UK, US, DE, CA, JP] + ([E25] if eu == E9 else [])
    days = [d for d in sorted(T) if d >= start and all(d in FC[m].get(l, {}) for m in ms for l in leads)]
    out = sorted((sc([(FC[m][l][d], T[d]) for l in leads for d in days])['mae'], m) for m in ms)
    print(f'  d{leads[0]}-{leads[-1]} ({len(days)} days):', ', '.join(f'{m.split("_seamless")[0]} {v:.2f}' for v, m in out))
