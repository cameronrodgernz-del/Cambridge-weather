"""Does the blend hold at another gauge? Each model's average miss on a day's rain beside the blend's.
Usage: python3 -I sites.py SITE [START]"""
import json, sys, statistics as st
site = sys.argv[1]; start = sys.argv[2] if len(sys.argv) > 2 else '2025-10-01'
J = json.load(open(f'/tmp/bt/{site}_daily.json'))
T, FC = J['truth'], {m: {int(l): v for l, v in d.items()} for m, d in J['fc'].items()}
names = {'ecmwf_ifs': 'European 9 km', 'ecmwf_aifs025_single': 'European AI', 'ukmo_seamless': 'UK', 'gfs_seamless': 'US', 'icon_seamless': 'German', 'gem_seamless': 'Canadian'}
def blend(l, d):
    v = sorted(FC[m][l][d] for m in names if d in FC.get(m, {}).get(l, {}) and not (m == 'gfs_seamless' and l >= 5))
    if len(v) < 4: return None
    return sum(v[1:-1]) / (len(v) - 2) if len(v) >= 5 else st.median(v)
days = sorted(d for d in T if d >= start)
print(f'{site}: {len(days)} gauge days since {start}, mean {st.mean(T[d] for d in days):.2f} mm a day, {sum(1 for d in days if T[d] >= 10)} with 10 mm+')
for leads in ((1, 2, 3), (4, 5, 6)):
    rows = [(l, d) for l in leads for d in days if blend(l, d) is not None and all(d in FC.get(m, {}).get(l, {}) for m in names)]
    out = {'blend': sum(abs(blend(l, d) - T[d]) for l, d in rows) / len(rows)}
    for m, nm in names.items(): out[nm] = sum(abs(FC[m][l][d] - T[d]) for l, d in rows) / len(rows)
    big = [(l, d) for l, d in rows if T[d] >= 10]
    print(f'  {leads[0]}-{leads[-1]} days ahead ({len(rows)} forecasts): ' + ', '.join(f'{k} {v:.2f}' for k, v in sorted(out.items(), key=lambda kv: kv[1])) +
          f' | 10 mm+ days caught: blend {100*sum(1 for l, d in big if blend(l, d) >= 10)/max(1, len(big)):.0f}%, European 9 km {100*sum(1 for l, d in big if FC["ecmwf_ifs"][l][d] >= 10)/max(1, len(big)):.0f}%')
