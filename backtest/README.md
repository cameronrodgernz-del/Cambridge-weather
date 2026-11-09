# Model back-test

Scores each weather model's past rain forecasts against an airport rain gauge, and compares ways of blending them. Last run November 2026; the findings are in the main README under "How the rain blend was chosen".

The scripts work in `/tmp/bt`:

1. Gauge record. Daily totals (24 hours to 00:00 UTC) come from NOAA's hourly archive to August 2025 (`https://noaa-global-hourly-pds.s3.amazonaws.com/YEAR/STATION099999.csv`, saved as `/tmp/bt/isd_STATION_YEAR.csv`) and from the raw station reports on Ogimet after that (`og_fetch.sh STATION YYYYMM ...`). Stations: Hamilton Airport 93173, Auckland Airport 93110.
2. Past forecasts. `pr_fetch.sh SITE` pulls every model's forecasts, 0 to 7 days ahead, through the site's `/api/pastruns` endpoint.
3. `python3 -I load.py SITE STATION` builds daily totals for the gauge and each model.
4. `python3 -I score.py SITE` scores each model; `blend.py` and `check.py` test blends; `final.py SITE [START]` compares the blend in `app.js` with the previous one on the same days.
5. Six-hour totals and the chance of rain. `python3 -I load6.py SITE STATION` builds six-hour totals for the gauge and each model. `eval6.py SITE START` compares ways of getting a six-hour figure from the models. `chance.py` fits the chance of reaching 1, 5, 10 and 20 mm on one gauge, checks it on the other, and prints the weights used in `track.js`.
6. Play scores and other gauges. `playtest.py SITE` compares ways of marking an hour down for rain, on six-hour gauge windows. `sites.py SITE` sets each model's average miss on a day's rain beside the blend's, for checking a new gauge. Tauranga Airport is station 93186 and Wellington Airport 93439; both are in `/api/pastruns` as `tauranga` and `wellington`.
