# Model back-test

Scores each weather model's past rain forecasts against an airport rain gauge, and compares ways of blending them. Last run November 2026; the findings are in the main README under "How the rain blend was chosen".

The scripts work in `/tmp/bt`:

1. Gauge record. Daily totals (24 hours to 00:00 UTC) come from NOAA's hourly archive to August 2025 (`https://noaa-global-hourly-pds.s3.amazonaws.com/YEAR/STATION099999.csv`, saved as `/tmp/bt/isd_STATION_YEAR.csv`) and from the raw station reports on Ogimet after that (`og_fetch.sh STATION YYYYMM ...`). Stations: Hamilton Airport 93173, Auckland Airport 93110.
2. Past forecasts. `pr_fetch.sh SITE` pulls every model's forecasts, 0 to 7 days ahead, through the site's `/api/pastruns` endpoint.
3. `python3 -I load.py SITE STATION` builds daily totals for the gauge and each model.
4. `python3 -I score.py SITE` scores each model; `blend.py` and `check.py` test blends; `final.py SITE [START]` compares the blend in `app.js` with the previous one on the same days.
