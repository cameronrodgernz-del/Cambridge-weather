"""Score each model's daily rain forecasts against the gauge. Usage: python3 -I score.py SITE"""
import json, sys, math, random, datetime as dt
site = sys.argv[1]
J = json.load(open(f'/tmp/bt/{site}_daily.json'))
T, FC = J['truth'], {m: {int(l): v for l, v in d.items()} for m, d in J['fc'].items()}
random.seed(11)
NAMES = {'best_match': "Open-Meteo default", 'ecmwf_ifs025': 'European 25 km', 'ecmwf_ifs': 'European 9 km', 'ecmwf_aifs025_single': 'European AI',
         'ukmo_seamless': 'UK Met Office', 'gfs_seamless': 'US (GFS)', 'gfs_graphcast025': 'GraphCast AI', 'icon_seamless': 'German (ICON)',
         'gem_seamless': 'Canadian (GEM)', 'jma_seamless': 'Japanese (JMA)', 'bom_access_global': 'Australian (ACCESS)',
         'meteofrance_seamless': 'French (ARPEGE)', 'cma_grapes_global': 'Chinese (GRAPES)', 'kma_seamless': 'Korean (KMA)'}

def pairs(m, lead, days=None):
    f = FC[m].get(lead, {})
    return [(f[d], T[d]) for d in (days if days is not None else f) if d in f and d in T]
def stats(p):
    n = len(p)
    if n < 60: return None
    mae = sum(abs(f - o) for f, o in p) / n
    bias = sum(f - o for f, o in p) / n
    rmse = math.sqrt(sum((f - o) ** 2 for f, o in p) / n)
    def cat(th):
        hit = sum(1 for f, o in p if f >= th and o >= th); miss = sum(1 for f, o in p if f < th and o >= th); fa = sum(1 for f, o in p if f >= th and o < th)
        return hit, miss, fa
    h1, m1, f1 = cat(1); h10, m10, f10 = cat(10)
    return dict(n=n, mae=mae, bias=bias, rmse=rmse, right=1 - (m1 + f1) / n, csi1=h1 / max(1, h1 + m1 + f1), pod10=h10 / max(1, h10 + m10), far10=f10 / max(1, h10 + f10), csi10=h10 / max(1, h10 + m10 + f10))

print(f'gauge days {len(T)}; mean rain {sum(T.values())/len(T):.2f} mm a day; calling every day dry would miss by {sum(T.values())/len(T):.2f} mm a day on average\n')
print('=== each model on every day it has (average miss in mm a day; lower is better) ===')
print(f'{"model":22s} {"days":>5s} | ' + ' '.join(f'd{l}' .rjust(5) for l in range(1, 8)) + ' | bias d1  d3  d5 | wet/dry right d1 d3 d5 | big days caught d1 d3 d5 | false big d1 d3')
for m in sorted(FC, key=lambda m: (stats(pairs(m, 2)) or {'mae': 9})['mae']):
    s = {l: stats(pairs(m, l)) for l in range(1, 8)}
    g = lambda l, k, fmt: (fmt % s[l][k]) if s[l] else '  -  '
    print(f'{NAMES[m]:22s} {s[1]["n"] if s[1] else 0:5d} | ' + ' '.join(g(l, 'mae', '%5.2f') for l in range(1, 8)) + ' | ' + ' '.join(g(l, 'bias', '%+5.2f') for l in (1, 3, 5)) +
          ' | ' + ' '.join((('%4.0f%%' % (100 * s[l]['right'])) if s[l] else '  -  ') for l in (1, 3, 5)) + ' | ' + ' '.join((('%4.0f%%' % (100 * s[l]['pod10'])) if s[l] else '  -  ') for l in (1, 3, 5)) +
          ' | ' + ' '.join((('%4.0f%%' % (100 * s[l]['far10'])) if s[l] else '  -  ') for l in (1, 3)))

def common(models, leads, start=None):
    days = None
    for m in models:
        for l in leads:
            s = set(d for d in FC[m].get(l, {}) if d in T and (start is None or d >= start))
            days = s if days is None else days & s
    return sorted(days or [])
def boot(a, b, days, lead, reps=600):
    """Paired bootstrap on the difference in average miss (a minus b); returns share of resamples where a is worse than b."""
    fa, fb = FC[a][lead], FC[b][lead]
    d = [abs(fa[x] - T[x]) - abs(fb[x] - T[x]) for x in days]
    n = len(d); worse = 0
    for _ in range(reps):
        s = sum(d[random.randrange(n)] for _ in range(n))
        if s > 0: worse += 1
    return sum(d) / n, worse / reps

for label, models, start in (
    ('long window: models with forecasts since early 2024', ['best_match', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'jma_seamless', 'cma_grapes_global'], None),
    ('from Aug 2024: adds UK Met Office', ['best_match', 'ecmwf_ifs025', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'jma_seamless', 'ukmo_seamless'], None),
    ('from Oct 2025: adds European 9 km, European AI, GraphCast, Korean', ['best_match', 'ecmwf_ifs025', 'ecmwf_ifs', 'ecmwf_aifs025_single', 'gfs_seamless', 'gfs_graphcast025', 'icon_seamless', 'gem_seamless', 'jma_seamless', 'ukmo_seamless', 'kma_seamless', 'cma_grapes_global'], '2025-10-01')):
    print(f'\n=== same days for every model: {label} ===')
    for grp, leads in (('1-2 days ahead', (1, 2)), ('3-5 days ahead', (3, 4, 5)), ('6 days ahead', (6,))):
        days = common(models, leads, start)
        if len(days) < 80: print(f'  {grp}: only {len(days)} shared days'); continue
        rows = []
        for m in models:
            p = [x for l in leads for x in pairs(m, l, days)]
            s = stats(p); rows.append((s['mae'], m, s))
        rows.sort()
        ref = 'ecmwf_ifs025'
        print(f'  {grp}: {len(days)} days from {days[0]} to {days[-1]}')
        for mae, m, s in rows:
            dif, worse = boot(m, ref, days, leads[0]) if m != ref else (0, 0.5)
            print(f'     {NAMES[m]:22s} miss {mae:5.2f}  bias {s["bias"]:+5.2f}  wet/dry right {100*s["right"]:3.0f}%  big days caught {100*s["pod10"]:3.0f}%  false big {100*s["far10"]:3.0f}%  rmse {s["rmse"]:5.2f}   vs European 25 km at d{leads[0]}: {dif:+.2f} (worse in {100*worse:.0f}% of resamples)')

# which single model is the default built from?
print('\n=== how often the Open-Meteo default equals each model (1 day ahead, within 0.1 mm, on wet-forecast days) ===')
bm = FC['best_match'][1]
for m in FC:
    if m == 'best_match': continue
    f = FC[m].get(1, {}); d = [x for x in bm if x in f and (bm[x] >= 0.5 or f[x] >= 0.5)]
    if len(d) > 50:
        recent = [x for x in d if x >= '2026-06-01']
        print(f'  {NAMES[m]:22s} all days {100*sum(1 for x in d if abs(bm[x]-f[x])<0.1)/len(d):3.0f}% of {len(d)}   since June 2026 {(100*sum(1 for x in recent if abs(bm[x]-f[x])<0.1)/len(recent)) if recent else float("nan"):3.0f}% of {len(recent)}')
