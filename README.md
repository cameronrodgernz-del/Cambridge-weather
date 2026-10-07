# Cambridge Weather

Hour-by-hour weather for Cambridge, Waikato. The page pulls fresh model data from Open-Meteo every time it loads and every 30 minutes while it's open, so there's nothing to run each day.

## What's on the page

- Conditions right now, and a plain-English read of today, tonight, tomorrow and the week, written from the data on each load
- Seven-day ledger with sky, highs and lows, rain amount and how likely it is, wind, and fog or frost flags
- Hour-by-hour chart on one time line: temperature and dew point, chance of rain, wind and gusts, cloud cover, and a fog and frost risk strip, with a 48 hour, 4 day or 7 day view
- Detail for any day: overnight, morning, afternoon and evening, sunrise and sunset, UV and sun protection hours
- How firm the forecast is: rain each day from six weather models (ECMWF, UK Met Office, GFS, ICON, GEM, JMA) and the 51-run ECMWF ensemble
- The past week's rain and temperatures

## Hosting

It's a plain static site: `index.html`, `styles.css`, `app.js`. No build step and no keys. On Vercel, import the GitHub repository and deploy with the default settings (Framework preset: Other).

## Making a copy for another town

Change `PLACE` at the top of `app.js` (name, region, latitude, longitude and the MetService link), update the `<title>` in `index.html`, and deploy the copy as its own Vercel project.

## Data

Weather data from [Open-Meteo](https://open-meteo.com/) under CC BY 4.0. Open-Meteo's free service is for non-commercial use. If the site is ever used commercially, it needs an Open-Meteo API subscription.

Fog risk is flagged for night and early-morning hours when the air is close to saturation (temperature within 1°C of the dew point) and winds are light, or when the models show visibility under 1 km. Frost risk is flagged when the temperature is 1°C or below, or 3.5°C or below under clear, calm skies.
