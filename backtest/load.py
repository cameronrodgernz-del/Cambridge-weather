"""Load the gauge record and each model's past forecasts into daily totals for UTC days.
Usage: python3 -I load.py SITE STATION  -> writes /tmp/bt/SITE_daily.json"""
import csv, glob, json, re, sys, datetime as dt
site, station = sys.argv[1], sys.argv[2]
D = lambda s: dt.date.fromisoformat(s)

# ---- gauge: rain in the 24 hours ending 00:00 UTC, filed under the UTC day it fell in ----
truth, src = {}, {}
for f in sorted(glob.glob(f'/tmp/bt/isd_{station}_*.csv')):
    for r in csv.DictReader(open(f)):
        if r['DATE'][11:16] != '00:00': continue
        for col in ('AA1', 'AA2', 'AA3'):
            v = r.get(col) or ''
            p = v.split(',')
            if len(p) >= 4 and p[0] == '24' and p[1] != '9999' and p[3] in ('1', '5', '9', '0', '4'):
                day = D(r['DATE'][:10]) - dt.timedelta(days=1)
                truth[day] = int(p[1]) / 10; src[day] = 'isd'
def synop_24h(body):
    toks = body.replace('=', ' ').split()
    if '333' in toks:
        i = toks.index('333'); s1, s3 = toks[:i], toks[i + 1:]
    else: s1, s3 = toks, []
    for stop in ('444', '555'):
        if stop in s3: s3 = s3[:s3.index(stop)]
    for t in s3:                       # 7RRRR: 24-hour total in tenths of a mm
        if re.fullmatch(r'7\d{4}', t):
            v = int(t[1:]); return 0.0 if v == 9999 else v / 10
    for t in s1[4:]:                   # 6RRRt with t=4: 24-hour total in whole mm (990 trace, 991-999 tenths)
        if re.fullmatch(r'6\d{3}4', t):
            v = int(t[1:4]); return 0.0 if v == 990 else (v - 990) / 10 if v > 990 else float(v)
    return None
og = {}
for f in sorted(glob.glob(f'/tmp/bt/og/{station}_*.txt')):
    for line in open(f, errors='ignore'):
        p = line.strip().split(',', 6)
        if len(p) < 7 or p[0] != station or p[4] != '00' or 'NIL' in p[6]: continue
        v = synop_24h(p[6])
        if v is None: continue
        og[dt.date(int(p[1]), int(p[2]), int(p[3])) - dt.timedelta(days=1)] = v
both = [(d, truth[d], og[d]) for d in og if d in truth]
if both:
    diff = [abs(a - b) for _, a, b in both]
    print(f'gauge cross-check, {len(both)} days in both archives: identical on {sum(1 for x in diff if x < 0.05)}, worst gap {max(diff):.1f} mm')
for d, v in og.items():
    if d not in truth: truth[d] = v; src[d] = 'synop'
days = sorted(truth)
print(f'gauge: {len(days)} days from {days[0]} to {days[-1]}, total {sum(truth.values()):.0f} mm, wet days (>=1 mm) {sum(1 for v in truth.values() if v >= 1)}, big days (>=10 mm) {sum(1 for v in truth.values() if v >= 10)}')
span = (days[-1] - days[0]).days + 1
print(f'  missing days in span: {span - len(days)}')

# ---- forecasts: sum each UTC day (hours stamped 01:00 to 00:00 next day), per model and days ahead ----
fc = {}
for f in sorted(glob.glob(f'/tmp/bt/pr/{site}_*.json')):
    model = re.match(rf'.*/{site}_(.+)_\d{{4}}\.json', f).group(1)
    h = json.load(open(f))['hourly']
    for lead in range(8):
        key = 'precipitation' if lead == 0 else f'precipitation_previous_day{lead}'
        vals = h.get(key)
        if not vals: continue
        acc = {}
        for t, v in zip(h['time'], vals):
            ts = dt.datetime.fromisoformat(t) - dt.timedelta(hours=1)   # the hour this value covers starts here
            a = acc.setdefault(ts.date(), [0.0, 0])
            if v is not None: a[0] += v; a[1] += 1
        for day, (s, n) in acc.items():
            if n == 24: fc.setdefault(model, {}).setdefault(lead, {})[day.isoformat()] = round(s, 2)
print('\nforecast days available, by model and days ahead (first day with a 1-day-ahead forecast):')
for m in sorted(fc):
    first = min(fc[m].get(1, {'-': 0}))
    print(f'  {m:24s}', ' '.join(f'{len(fc[m].get(l, {})):5d}' for l in range(8)), ' from', first)
json.dump({'truth': {d.isoformat(): v for d, v in truth.items()}, 'fc': fc}, open(f'/tmp/bt/{site}_daily.json', 'w'))
