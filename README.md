# Cambridge Weather

Hour-by-hour weather for Cambridge, Waikato. The page pulls fresh model data from Open-Meteo every time it loads and every 30 minutes while it's open, so there's nothing to run each day.

## What's on the page

- Conditions right now, and a plain-English read of today, tonight, tomorrow and the week, written from the data on each load
- Seven-day ledger with sky, highs and lows, rain amount and how likely it is, wind, and fog or frost flags
- Hour-by-hour chart on one time line: temperature and dew point, chance of rain, wind and gusts, cloud cover, and a fog and frost risk strip, with a 48 hour, 4 day or 7 day view
- Detail for any day: overnight, morning, afternoon and evening, sunrise and sunset, UV and sun protection hours
- How firm the forecast is: rain each day from six weather models (ECMWF, UK Met Office, GFS, ICON, GEM, JMA) and the 51-run ECMWF ensemble
- The past week's rain and temperatures

## Tīeke Golf Estate

A switch at the top moves between Cambridge and Tīeke Golf Estate (72 Lochiel Road, Tamahere). Tīeke has its own link, `/tieke`, its own forecast point on the river flats, and an extra golf section:

- A written read of the best time to tee off today, tomorrow and later in the week
- A tee sheet for the next seven days, one square per daylight hour, shaded from poor to great golf, with rain, likely showers, strong gusts, fog and frost marked, and the best four-hour window for 18 holes outlined
- First light, last tee times for 18 and 9 holes, sunset and sunscreen hours for today and tomorrow
- Rain over the last 48 hours and what that means underfoot, plus booking details

Each daylight hour scores out of 100 and loses points for rain (more for heavier rain), a high chance of showers, wind over 15 km/h, gusts over 30 km/h, a feels-like temperature under 15°C or over 28°C, fog and frost.

## Mount Maunganui

The third tab, with its own link `/mount`. The hourly chart swaps the fog and frost strip for the tide curve (LINZ predictions for Tauranga, bundled in `tides-tauranga.js` for 2026 and 2027) and a waves panel from the Open-Meteo marine model. An "At the beach" section gives the next tides, wave size and direction, the cleanest mornings for a surf (light or offshore winds, which at Main Beach come from the south round to the west), sea temperature, and tide and swell tables. The tide file needs a new year of LINZ predictions added before the end of 2027.

## Tee times

The fourth tab, link `/golf`. It works out the golf weather hour by hour at 18 courses within about 50 minutes of Cambridge (listed in `courses.js` with fees, booking details and club days), finds the best stretch across the area, and shows the open tee times inside it.

Eight clubs publish their tee sheets on Golf NZ's booking system: Cambridge, Te Awamutu, Hamilton (St Andrews), Ngāruawāhia, Huntly, Morrinsville, Matamata and Walton. `api/teesheet.js` is a small Vercel function that reads those public day sheets when the tab is opened and counts the spots open to the public or to affiliated golfers. Results are cached for ten minutes. The other courses take bookings by phone, form or walk-up, so they show the best weather window and how to book.

Green fees, club days and closures in `courses.js` were checked in October 2026 and need an occasional refresh.

## Hosting

It's a plain static site: `index.html`, `styles.css`, `app.js`. No build step and no keys. On Vercel, import the GitHub repository and deploy with the default settings (Framework preset: Other).

## Making a copy for another town

Add an entry to `PLACES` at the top of `app.js` (name, region, latitude, longitude, path and MetService link), add a button for it in the location switch in `index.html`, and add a rewrite for its path in `vercel.json`.

## Data

Weather data from [Open-Meteo](https://open-meteo.com/) under CC BY 4.0. Open-Meteo's free service is for non-commercial use. If the site is ever used commercially, it needs an Open-Meteo API subscription.

Fog risk is flagged for night and early-morning hours when the air is close to saturation (temperature within 1°C of the dew point) and winds are light, or when the models show visibility under 1 km. Frost risk is flagged when the temperature is 1°C or below, or 3.5°C or below under clear, calm skies.
