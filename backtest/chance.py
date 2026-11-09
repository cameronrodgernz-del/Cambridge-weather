"""Chance of at least T mm in a window, from how many models have it and how far the blend is from T.
Fits on one gauge and checks on the other, then fits on both. Usage: python3 -I chance.py"""
import json, math, statistics as st, datetime as dt, numpy as np
E9, E25, AI, UK, US, DE, CA = 'ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'gfs_seamless', 'icon_seamless', 'gem_seamless'
START = '2025-02-18'
def trim(v):
    v = sorted(v)
    return sum(v[1:-1]) / (len(v) - 2) if len(v) >= 5 else st.median(v)
def load(site):
    S = json.load(open(f'/tmp/bt/{site}_6h.json')); D = json.load(open(f'/tmp/bt/{site}_daily.json'))
    return S['truth'], {m: {int(l): v for l, v in d.items()} for m, d in S['fc'].items()}, D['truth'], {m: {int(l): v for l, v in d.items()} for m, d in D['fc'].items()}
def member(F, m, l, key):       # the 9 km European model where its archive exists, the 25 km one before that
    if m == E9:
        v = F[E9].get(l, {}).get(key)
        return v if v is not None else F[E25].get(l, {}).get(key)
    return F[m].get(l, {}).get(key)
def utc_day(key):
    d = dt.date.fromisoformat(key[:10])
    return (d - dt.timedelta(days=1)).isoformat() if key[11:13] == '00' else d.isoformat()
def rows(site):
    T6, F6, TD, FD = load(site)
    out = {'sub': [], 'day': [], 'multi': []}       # each row: (lead, blend, [member totals], observed)
    six = [E9, AI, UK, US, DE, CA]
    for l in range(1, 7):
        mem = [m for m in six if not (m == US and l >= 5)]
        for day in sorted(d for d in TD if d >= START):
            dd = [member(FD, m, l, day) for m in mem]
            if sum(v is not None for v in dd) < len(mem) - 1: continue
            dd = [v for v in dd if v is not None]
            out['day'].append((l, trim(dd), dd, TD[day]))
        for key in sorted(k for k in T6 if k[:10] >= START):
            day = utc_day(key)
            w = [(member(F6, m, l, key), member(FD, m, l, day)) for m in mem]
            w = [(a, b) for a, b in w if a is not None and b is not None]
            if len(w) < len(mem) - 1: continue
            mean_w = sum(a for a, _ in w) / len(w); mean_d = sum(b for _, b in w) / len(w)
            blend = mean_w * trim([b for _, b in w]) / mean_d if mean_d > 0 else 0.0
            out['sub'].append((l, blend, [a for a, _ in w], T6[key]))
    days = sorted(d for d in TD if d >= START)
    for k in (2, 3, 4, 5, 6):                         # runs of k days, forecast the day before the run starts
        mem = [m for m in six if not (m == US and k >= 5)]
        for d0 in days:
            ds = [(dt.date.fromisoformat(d0) + dt.timedelta(days=j)).isoformat() for j in range(k)]
            if any(d not in TD for d in ds): continue
            per = []
            for m in mem:
                v = [member(FD, m, j + 1, d) for j, d in enumerate(ds)]
                if all(x is not None for x in v): per.append(v)
            if len(per) < len(mem) - 1: continue
            blend = sum(trim([p[j] for p in per] + ([member(FD, US, j + 1, ds[j])] if (k >= 5 and j + 1 < 5 and member(FD, US, j + 1, ds[j]) is not None) else [])) for j in range(k))
            out['multi'].append((k, blend, [sum(p) for p in per], sum(TD[d] for d in ds)))
    return out
TH = {'sub': (1, 5, 10, 20), 'day': (1, 5, 10, 20), 'multi': (1, 5, 10, 20, 40)}
def feats(lead, blend, mem, T, cls):
    f = sum(1 for v in mem if v >= T) / len(mem)
    r = max(-3.0, min(3.0, math.log((blend + 0.5) / (T + 0.5))))
    # the squared term is for part-day windows only: without it the highest chances there ran about 8 points too confident
    return [1.0, f, r, lead / 6.0, math.log(T)] + ([r * r] if cls == 'sub' else [])
def design(rs, cls):
    X, y = [], []
    for lead, blend, mem, obs in rs:
        for T in TH[cls]:
            X.append(feats(lead, blend, mem, T, cls)); y.append(1.0 if obs >= T else 0.0)
    return np.array(X), np.array(y)
def fit(X, y, ridge=1.0):
    w = np.zeros(X.shape[1])
    for _ in range(60):
        p = 1 / (1 + np.exp(-X @ w)); g = X.T @ (p - y) + ridge * np.r_[0, w[1:]]
        H = (X * (p * (1 - p))[:, None]).T @ X + ridge * np.diag(np.r_[0, np.ones(len(w) - 1)])
        step = np.linalg.solve(H, g); w -= step
        if np.abs(step).max() < 1e-8: break
    return w
def report(name, X, y, w):
    p = 1 / (1 + np.exp(-X @ w)); base = y.mean(); frac = np.clip(X[:, 1], 0.02, 0.98)
    bs = lambda q: float(((q - y) ** 2).mean())
    print(f'   {name}: n={len(y)}, happened {100*base:.0f}% of the time; error score (lower is better): always-the-average {bs(np.full_like(y, base)):.4f}, share of models {bs(frac):.4f}, fitted chance {bs(p):.4f}')
    line = []
    for lo, hi in ((0, .05), (.05, .2), (.2, .4), (.4, .6), (.6, .8), (.8, .95), (.95, 1.01)):
        m = (p >= lo) & (p < hi)
        if m.sum() >= 25: line.append(f'said {100*p[m].mean():.0f}% -> happened {100*y[m].mean():.0f}% (n={int(m.sum())})')
    print('      ' + '; '.join(line))
R = {s: rows(s) for s in ('hamilton', 'auckland')}
coef = {}
for cls in ('sub', 'day', 'multi'):
    print(f'\n=== {cls} windows ===')
    for train, test in (('hamilton', 'auckland'), ('auckland', 'hamilton')):
        w = fit(*design(R[train][cls], cls)); Xt, yt = design(R[test][cls], cls)
        report(f'fitted on {train}, checked on {test}', Xt, yt, w)
        for T in TH[cls]:
            m = np.isclose(Xt[:, 4], math.log(T))
            p = 1 / (1 + np.exp(-Xt[m] @ w))
            hi = p >= 0.6; lo = p < 0.1
            print(f'        {T:>2} mm+: happened {100*yt[m].mean():4.1f}%; when chance was 60%+ it happened {100*yt[m][hi].mean() if hi.sum() else float("nan"):.0f}% of {int(hi.sum())}; when under 10% it happened {100*yt[m][lo].mean() if lo.sum() else float("nan"):.1f}% of {int(lo.sum())}')
    X = np.vstack([design(R[s][cls], cls)[0] for s in R]); y = np.concatenate([design(R[s][cls], cls)[1] for s in R])
    coef[cls] = [round(float(v), 4) for v in fit(X, y)]
    print('   both gauges together, coefficients [constant, share of models, blend against the mark, days ahead/6, ln(mark), and for part-day windows the blend term squared]:', coef[cls])
json.dump(coef, open('/tmp/bt/chance_coef.json', 'w'))
