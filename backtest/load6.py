"""Six-hour totals: gauge and each model, for windows ending 00, 06, 12, 18 UTC. Usage: python3 -I load6.py SITE STATION"""
import csv, glob, json, re, sys, datetime as dt
site, station = sys.argv[1], sys.argv[2]
six, day24 = {}, {}          # keyed by window end, 'YYYY-MM-DDTHH'
def code_mm(v):              # 6RRRt: whole mm, 990 trace, 991-999 tenths
    return 0.0 if v == 990 else (v - 990) / 10 if v > 990 else float(v)
for f in sorted(glob.glob(f'/tmp/bt/isd_{station}_*.csv')):
    for r in csv.DictReader(open(f)):
        hh = r['DATE'][11:16]
        if hh not in ('00:00', '06:00', '12:00', '18:00'): continue
        key = r['DATE'][:13]
        for col in ('AA1', 'AA2', 'AA3'):
            p = (r.get(col) or '').split(',')
            if len(p) >= 4 and p[1] != '9999':
                if p[0] == '06' and hh != '00:00': six[key] = int(p[1]) / 10
                if p[0] == '24' and hh == '00:00': day24[key] = int(p[1]) / 10
for f in sorted(glob.glob(f'/tmp/bt/og/{station}_*.txt')):
    for line in open(f, errors='ignore'):
        p = line.strip().split(',', 6)
        if len(p) < 7 or p[0] != station or p[4] not in ('00', '06', '12', '18') or p[5] != '00' or 'NIL' in p[6]: continue
        key = f'{p[1]}-{p[2]}-{p[3]}T{p[4]}'
        toks = p[6].replace('=', ' ').split()
        s1 = toks[:toks.index('333')] if '333' in toks else toks
        s3 = toks[toks.index('333') + 1:] if '333' in toks else []
        for t in s1[4:]:
            if re.fullmatch(r'6\d{4}', t):
                if t[-1] == '1' and p[4] != '00' and key not in six: six[key] = code_mm(int(t[1:4]))
                if t[-1] == '4' and p[4] == '00' and key not in day24: day24[key] = code_mm(int(t[1:4]))
        for t in s3:
            if re.fullmatch(r'7\d{4}', t) and p[4] == '00':
                v = int(t[1:]); day24[key] = 0.0 if v == 9999 else v / 10
# the 18-to-00 window is the day's total less the other three
for key, tot in day24.items():
    d = dt.date.fromisoformat(key[:10]) - dt.timedelta(days=1)
    parts = [six.get(f'{d.isoformat()}T{h}') for h in ('06', '12', '18')]
    if all(v is not None for v in parts): six[key] = max(0.0, round(tot - sum(parts), 1))
print(f'{site}: six-hour gauge windows {len(six)}, from {min(six)} to {max(six)}; with 1 mm+ {sum(1 for v in six.values() if v >= 1)}, with 5 mm+ {sum(1 for v in six.values() if v >= 5)}')
keep = ['ecmwf_ifs', 'ecmwf_ifs025', 'ecmwf_aifs025_single', 'ukmo_seamless', 'gfs_seamless', 'icon_seamless', 'gem_seamless', 'jma_seamless']
fc = {}
for m in keep:
    for f in sorted(glob.glob(f'/tmp/bt/pr/{site}_{m}_*.json')):
        h = json.load(open(f))['hourly']; t = h['time']
        for lead in range(1, 8):
            vals = h.get(f'precipitation_previous_day{lead}')
            if not vals: continue
            out = fc.setdefault(m, {}).setdefault(lead, {})
            for i, ts in enumerate(t):
                if ts[11:13] in ('00', '06', '12', '18') and i >= 5:
                    w = vals[i - 5:i + 1]
                    if all(v is not None for v in w) and ts[:13] in six: out[ts[:13]] = round(sum(w), 2)
json.dump({'truth': six, 'fc': fc}, open(f'/tmp/bt/{site}_6h.json', 'w'))
print('  forecast windows by model (1 day ahead):', {m.split('_seamless')[0]: len(fc[m].get(1, {})) for m in fc})
