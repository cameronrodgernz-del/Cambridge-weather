"""Head-to-heads and blend tests. Usage: python3 -I blend.py SITE"""
import json, sys, math, random, statistics as st
site = sys.argv[1]
J = json.load(open(f'/tmp/bt/{site}_daily.json'))
T, FC = J['truth'], {m: {int(l): v for l, v in d.items()} for m, d in J['fc'].items()}
random.seed(5)
def score(p):
    n = len(p); mae = sum(abs(f - o) for f, o in p) / n; bias = sum(f - o for f, o in p) / n
    h1 = sum(1 for f, o in p if f >= 1 and o >= 1); bad1 = sum(1 for f, o in p if (f >= 1) != (o >= 1))
    h = sum(1 for f, o in p if f >= 10 and o >= 10); m = sum(1 for f, o in p if f < 10 and o >= 10); fa = sum(1 for f, o in p if f >= 10 and o < 10)
    return dict(n=n, mae=mae, bias=bias, rmse=math.sqrt(sum((f - o) ** 2 for f, o in p) / n), right=1 - bad1 / n, pod=h / max(1, h + m), far=fa / max(1, h + fa), csi=h / max(1, h + m + fa))
fmt = lambda s: f'miss {s["mae"]:.2f}  bias {s["bias"]:+.2f}  rmse {s["rmse"]:.2f}  wet/dry right {100*s["right"]:.0f}%  big caught {100*s["pod"]:.0f}%  false big {100*s["far"]:.0f}%  big score {100*s["csi"]:.0f}'

print('=== mean forecast rain (mm a day) by days ahead, to spot archive problems; gauge mean is %.2f ===' % (sum(T.values()) / len(T)))
for m in sorted(FC):
    print(f'  {m:22s}', ' '.join((f'{sum(v for d, v in FC[m][l].items() if d in T)/max(1,sum(1 for d in FC[m][l] if d in T)):5.2f}' if FC[m].get(l) else '  -  ') for l in range(0, 8)))

def h2h(a, b, leads, start=None):
    days = sorted(d for d in T if all(d in FC[a].get(l, {}) and d in FC[b].get(l, {}) for l in leads) and (start is None or d >= start))
    if len(days) < 60: return
    pa = [(FC[a][l][d], T[d]) for l in leads for d in days]; pb = [(FC[b][l][d], T[d]) for l in leads for d in days]
    dif = [sum(abs(FC[a][l][d] - T[d]) - abs(FC[b][l][d] - T[d]) for l in leads) / len(leads) for d in days]
    worse = sum(1 for _ in range(800) if sum(random.choice(dif) for _ in dif) > 0) / 800
    print(f'  {a} vs {b}, d{leads[0]}-{leads[-1]}, {len(days)} days {days[0]}..{days[-1]}:\n      {a:20s} {fmt(score(pa))}\n      {b:20s} {fmt(score(pb))}\n      first is worse in {100*worse:.0f}% of resamples')
print('\n=== head to head on shared days ===')
for leads in ((1, 2), (3, 4, 5), (6, 7)):
    h2h('ecmwf_ifs', 'ecmwf_ifs025', leads)
for leads in ((1, 2), (3, 4, 5), (6, 7)):
    h2h('ecmwf_aifs025_single', 'ecmwf_ifs025', leads)
for leads in ((1, 2), (3,)):
    h2h('meteofrance_seamless', 'ecmwf_ifs025', leads)
for leads in ((1, 2), (3, 4, 5), (6,)):
    h2h('ukmo_seamless', 'ecmwf_ifs025', leads)
for leads in ((1, 2), (3, 4), (5, 6)):
    h2h('gfs_seamless', 'gem_seamless', leads)

def blend(members, how, lead, d, weights=None, need=3):
    vals = [(FC[m][lead][d], (weights or {}).get(m, 1)) for m in members if d in FC[m].get(lead, {})]
    if len(vals) < need: return None
    v = sorted(x for x, _ in vals)
    if how == 'median': return st.median(v) if not weights else wmedian(vals)
    if how == 'sitemedian': return v[len(v) // 2]                       # what the site does now: the upper middle value
    if how == 'mean': return sum(x * w for x, w in vals) / sum(w for _, w in vals)
    if how == 'trim': return sum(v[1:-1]) / (len(v) - 2) if len(v) >= 5 else sum(v) / len(v)
    if how == 'mid': return 0.5 * (st.median(v) + sum(v) / len(v))     # halfway between the middle value and the average
def wmedian(vals):
    vals = sorted(vals); tot = sum(w for _, w in vals); acc = 0
    for x, w in vals:
        acc += w
        if acc >= tot / 2: return x
E9, E25, AI, UK, US, DE, CA, JP, FR = 'ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'jma_seamless', 'meteofrance_seamless'
def run(title, cands, leads, start, base_members):
    days = sorted(d for d in T if d >= start and all(sum(1 for m in base_members if d in FC[m].get(l, {})) >= len(base_members) - 1 for l in leads))
    print(f'\n=== blends, {title}: d{leads[0]}-{leads[-1]}, {len(days)} days {days[0]}..{days[-1]} ===')
    out = []
    for name, members, how, w in cands:
        p = []
        for l in leads:
            for d in days:
                b = blend(members, how, l, d, w)
                if b is not None: p.append((b, T[d]))
        if len(p) > 0.9 * len(days) * len(leads): out.append((score(p)['mae'], name, score(p)))
    for _, name, s in sorted(out, key=lambda x: x[0]): print(f'   {name:46s} {fmt(s)}')
recent = [
    ('NOW: site median of default,E25,UK,US,DE,CA,JP', [E9, E25, UK, US, DE, CA, JP], 'sitemedian', None),
    ('drop JP (median)', [E9, E25, UK, US, DE, CA], 'median', None),
    ('drop JP + one European only (median)', [E9, UK, US, DE, CA], 'median', None),
    ('  same, average', [E9, UK, US, DE, CA], 'mean', None),
    ('  same, trimmed average', [E9, UK, US, DE, CA], 'trim', None),
    ('  same, halfway median/average', [E9, UK, US, DE, CA], 'mid', None),
    ('E25 instead of E9 (median)', [E25, UK, US, DE, CA], 'median', None),
    ('E9,UK,US,DE,CA + AI (median)', [E9, AI, UK, US, DE, CA], 'median', None),
    ('  same, average', [E9, AI, UK, US, DE, CA], 'mean', None),
    ('  same, halfway median/average', [E9, AI, UK, US, DE, CA], 'mid', None),
    ('E9,AI,UK,US,DE,CA + French (median)', [E9, AI, UK, US, DE, CA, FR], 'median', None),
    ('  same, average', [E9, AI, UK, US, DE, CA, FR], 'mean', None),
    ('  same, halfway median/average', [E9, AI, UK, US, DE, CA, FR], 'mid', None),
    ('E9,AI,US,DE,CA no UK (median)', [E9, AI, US, DE, CA], 'median', None),
    ('E9,AI,DE,CA no UK no US (average)', [E9, AI, DE, CA], 'mean', None),
    ('single: European 9 km', [E9], 'mean', None), ('single: European AI', [AI], 'mean', None),
]
for leads in ((1, 2), (3, 4), (5, 6)):
    run('since Oct 2025 (all candidates live)', [(n, m, h, w) for n, m, h, w in recent], leads, '2025-10-01', [E9, UK, US, DE, CA] if leads[0] < 5 else [E9, US, DE, CA])
longer = [(n.replace('E9', 'E25').replace('default,E25', 'E25'), [E25 if x == E9 else x for x in m if not (x == E25 and E9 in m)], h, w) for n, m, h, w in recent if 'single' not in n and 'E25 instead' not in n]
for leads in ((1, 2), (3, 4), (5, 6)):
    run('since Feb 2025 (European 25 km standing in for 9 km)', longer, leads, '2025-02-18', [E25, UK, US, DE, CA] if leads[0] < 5 else [E25, US, DE, CA])
