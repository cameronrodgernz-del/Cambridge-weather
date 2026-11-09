import json, sys, math, statistics as st
site = sys.argv[1]
# 1. what do the US model's long-range hours look like in the archive?
h = json.load(open(f'/tmp/bt/pr/{site}_gfs_seamless_2026.json'))['hourly']
t = h['time']
i0 = next(i for i, x in enumerate(t) if x.startswith('2026-06-2') and (h['precipitation_previous_day4'][i] or 0) > 1.0)
print('US model, one wet spell, hour by hour (forecast made 3, 4, 5, 6 days before):')
for i in range(i0 - 2, i0 + 10):
    print('  ', t[i], [h[f'precipitation_previous_day{k}'][i] for k in (3, 4, 5, 6)])
for k in range(1, 8):
    v = [x for x in h[f'precipitation_previous_day{k}'] if x is not None]
    nz = [x for x in v if x > 0]
    print(f'  d{k}: hours {len(v)}, share of hours with rain {100*len(nz)/len(v):.1f}%, mean when raining {sum(nz)/max(1,len(nz)):.2f}, total {sum(v):.0f}')
J = json.load(open(f'/tmp/bt/{site}_daily.json'))
T, FC = J['truth'], {m: {int(l): v for l, v in d.items()} for m, d in J['fc'].items()}
print('\nUS model mean forecast by year and days ahead:')
for y in ('2024', '2025', '2026'):
    print('  ', y, ' '.join(f'{st.mean([v for d, v in FC["gfs_seamless"][l].items() if d[:4] == y]):5.2f}' for l in range(1, 8)))

# 2. blends, with the amount taken different ways
def score(p):
    n = len(p); mae = sum(abs(f - o) for f, o in p) / n; bias = sum(f - o for f, o in p) / n
    bad1 = sum(1 for f, o in p if (f >= 1) != (o >= 1))
    hh = sum(1 for f, o in p if f >= 10 and o >= 10); m = sum(1 for f, o in p if f < 10 and o >= 10); fa = sum(1 for f, o in p if f >= 10 and o < 10)
    return f'miss {mae:.2f}  bias {bias:+.2f}  rmse {math.sqrt(sum((f-o)**2 for f,o in p)/n):.2f}  wet/dry right {100*(1-bad1/n):.0f}%  big caught {100*hh/max(1,hh+m):.0f}%  false big {100*fa/max(1,hh+fa):.0f}%  big score {100*hh/max(1,hh+m+fa):.0f}', mae
E9, E25, AI, UK, US, DE, CA, JP = 'ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'jma_seamless'
def amount(v, how):
    v = sorted(v); n = len(v); med = st.median(v); mean = sum(v) / n
    if how == 'median': return med
    if how == 'sitemedian': return v[n // 2]
    if how == 'mean': return mean
    if how == 'mid': return (med + mean) / 2
    if how == 'hybrid': return mean if sum(1 for x in v if x >= 1) * 2 > n else med          # average when most models are wet, else the middle
    if how == 'hybrid2': return mean if sum(1 for x in v if x >= 1) * 2 >= n else med
    if how == 'trim': return sum(v[1:-1]) / (n - 2) if n >= 5 else mean
def test(title, sets, leads, start, us_from=None):
    need = lambda mem, l: [m for m in mem if not (m == US and us_from and l >= us_from)]
    days = sorted(d for d in T if d >= start)
    print(f'\n=== {title}: d{leads[0]}-{leads[-1]} ===')
    rows = []
    for name, mem, how in sets:
        p = []
        for l in leads:
            for d in days:
                v = [FC[m][l][d] for m in need(mem, l) if d in FC[m].get(l, {})]
                if len(v) >= max(3, len(need(mem, l)) - 1): p.append((amount(v, how), T[d]))
        s, mae = score(p); rows.append((mae, f'   {name:44s} n={len(p):4d}  {s}'))
    for _, r in sorted(rows): print(r)
for start, Eu, tag in (('2025-10-01', E9, 'since Oct 2025, European 9 km'), ('2025-02-18', E25, 'since Feb 2025, European 25 km standing in')):
    new = [Eu, AI, UK, US, DE, CA]
    sets = [('NOW (upper-middle of 7 incl. both European + JP)', [E9, E25, UK, US, DE, CA, JP] if Eu == E9 else [E25, UK, US, DE, CA, JP], 'sitemedian')] + \
           [(f'new six: {how}', new, how) for how in ('median', 'mean', 'mid', 'hybrid', 'hybrid2', 'trim')] + \
           [(f'new six without US: {how}', [Eu, AI, UK, DE, CA], how) for how in ('median', 'mean', 'hybrid')]
    for leads in ((1, 2), (3, 4), (5, 6)):
        test(tag, sets, leads, start)
    test(tag + ' (US left out from day 5)', sets, (5, 6), start, us_from=5)

# 3. totals over a run of days: does the blend add up? (sum of the 1- to 5-day-ahead forecasts against the gauge total)
print('\n=== five-day totals (forecast made the day before the run starts), since Feb 2025 ===')
import datetime as dt
days = sorted(d for d in T if d >= '2025-02-18')
for name, mem, how in (('NOW', [E25, UK, US, DE, CA, JP], 'sitemedian'), ('new six: median', [E25, AI, UK, US, DE, CA], 'median'), ('new six: mean', [E25, AI, UK, US, DE, CA], 'mean'), ('new six: hybrid', [E25, AI, UK, US, DE, CA], 'hybrid'), ('new six: mid', [E25, AI, UK, US, DE, CA], 'mid')):
    p = []
    for d0 in days[::3]:
        tot_f = tot_o = 0; ok = True
        for k in range(5):
            d = (dt.date.fromisoformat(d0) + dt.timedelta(days=k)).isoformat(); l = k + 1
            v = [FC[m][l][d] for m in mem if d in FC[m].get(l, {})]
            if d not in T or len(v) < 4: ok = False; break
            tot_f += amount(v, how); tot_o += T[d]
        if ok: p.append((tot_f, tot_o))
    n = len(p)
    print(f'   {name:18s} runs {n}  mean gauge total {sum(o for _, o in p)/n:.1f} mm  mean forecast total {sum(f for f, _ in p)/n:.1f} mm  average miss {sum(abs(f-o) for f, o in p)/n:.1f} mm  wet runs (25 mm+) caught {100*sum(1 for f,o in p if f>=25 and o>=25)/max(1,sum(1 for f,o in p if o>=25)):.0f}%')
