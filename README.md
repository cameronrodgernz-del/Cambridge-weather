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

The third tab, with its own link `/mount`. It opens with "The Mount right now": the Port of Tauranga's Mauao camera, a still picture the page reloads every two minutes, and a switch to Astrolabe's live video of Main Beach, which only loads when it's picked. The cameras are set in the `cams` list on the `mount` entry in `PLACES`, so another tab can have its own by adding the same list. The hourly chart swaps the fog and frost strip for the tide curve (LINZ predictions for Tauranga, bundled in `tides-tauranga.js` for 2026 and 2027) and a waves panel from the Open-Meteo marine model. An "At the beach" section gives the next tides, wave size and direction, the cleanest mornings for a surf (light or offshore winds, which at Main Beach come from the south round to the west), sea temperature, and tide and swell tables. The tide file needs a new year of LINZ predictions added before the end of 2027.

## Tee times

The fourth tab, link `/golf`. It works out the golf weather hour by hour at 18 courses within about 50 minutes of Cambridge (listed in `courses.js` with fees, booking details and club days), finds the best stretch across the area, and shows the open tee times inside it.

Eight clubs publish their tee sheets on Golf NZ's booking system: Cambridge, Te Awamutu, Hamilton (St Andrews), Ngāruawāhia, Huntly, Morrinsville, Matamata and Walton. `api/teesheet.js` is a small Vercel function that reads those public day sheets when the tab is opened and counts the spots open to the public or to affiliated golfers. Results are cached for ten minutes. The other courses take bookings by phone, form or walk-up, so they show the best weather window and how to book.

Green fees, club days and closures in `courses.js` were checked in October 2026 and need an occasional refresh.

## Wellington and Royal Wellington

Two more tabs. Wellington (`/wellington`) is the full weather page for the city, with the harbour tide in the hourly chart from LINZ predictions for Wellington (`tides-wellington.js`, 2026 and 2027). Royal Wellington Golf Club (`/royal-wellington`) has the golf layout: best times to play, the seven-day tee sheet, last tee times, ground after rain, bookings and green fees. The club takes visitor bookings by form or phone, so there are no live open tee times for it.

## Royal Auckland

Tab `/royal-auckland`, for Royal Auckland and Grange Golf Club at 57 Grange Road, Papatoetoe. Same golf layout as Royal Wellington: best times to play, the seven-day tee sheet, last tee times, ground after rain (every green has SubAir drainage), bookings and the summer 2026–27 visitor rates. Visitors book through the club's online portal at raggc.com, mostly on weekdays, up to 10 days ahead.

## Rich Hill Stud

Tab `/rich-hill`, for the farm at 570 Landsdowne Road, Walton. It has the full weather page plus an "On the farm" section: the roughest night of the week for mares and foals (rain, wind and feels-like low, 6pm to 8am), frost mornings, soil temperature at 6 cm for grass growth, whether paddocks are drying or getting wetter (rain against evaporation for the past week and the week ahead), and the best dry spell for paddock work.

## Te Rapa Racecourse

Tab `/te-rapa`, for the racecourse on Ken Browne Drive, Hamilton, built for the people who look after the track. The code is in `track.js`; the place, its race dates and the direction of the home straight are on the `terapa` entry in `PLACES`. On top of the full weather page it has:

- **Next meeting**: a written read of race day, then a drawing of rain each hour and the running total from now to the end of racing, with the 48 hour, 24 hour and 6:45am race-morning checks marked and thunderstorm hours flagged. Below it, racing hours hour by hour with the wind as the horses meet it in the straight (headwind, tailwind or crosswind from the inside or outside rail), the rain expected between each check and the next, and the last seven days' rain and evaporation for the track information sheet. Meetings more than a week out show the date until the forecast reaches them.
- **The rest of the season**: the remaining meetings, how far away they are and the break before each.
- **Rain radar**: the last two hours of RainViewer radar in ten-minute steps on a greyed OpenStreetMap base, with rings at 25 and 50 km. RainViewer's free feed stops at zoom 7, so the radar tiles are drawn at twice their size on a zoom 8 map.
- **On the track**: whether the track should wet up or dry out this week, the water lost to evaporation since the last day with 5 mm or more, the rain in and evaporation out chart, soil moisture in the top 9 cm and from 9 to 27 cm, soil temperature for growth and oversowing, and a seven-day grid of thunderstorm hours and downpours of 5 mm or more in an hour.

Racing hours are taken as 11am to 6pm unless a meeting in the list says otherwise (`from` and `to`). The race dates come from the NZTR 2026–27 calendar on loveracing.nz and need the 2027–28 dates added before August 2027. The home straight bearing (336°, running north-north-west to the post) comes from the OpenStreetMap outline of the track.

Soil moisture, soil temperature and evaporation come from the Open-Meteo model for the area, not from the track. Te Rapa is sand-slitted and drains faster than the soil around it, so the page uses them for direction rather than as readings.

## Hosting

It's a plain static site: `index.html`, `styles.css`, `app.js`, with `finder.js` for the tee times tab and `track.js` for the racecourse. No build step and no keys. On Vercel, import the GitHub repository and deploy with the default settings (Framework preset: Other).

## Making a copy for another town

Add an entry to `PLACES` at the top of `app.js` (name, region, latitude, longitude, path and MetService link), add a button for it in the location switch in `index.html`, and add a rewrite for its path in `vercel.json`.

## Data

Weather data from [Open-Meteo](https://open-meteo.com/) under CC BY 4.0. Open-Meteo's free service is for non-commercial use. If the site is ever used commercially, it needs an Open-Meteo API subscription. The same goes for the [RainViewer](https://www.rainviewer.com/api.html) radar, which is free for personal use with credit, and the [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) map tiles, which are fine for light use with credit.

Fog risk is flagged for night and early-morning hours when the air is close to saturation (temperature within 1°C of the dew point) and winds are light, or when the models show visibility under 1 km. Frost risk is flagged when the temperature is 1°C or below, or 3.5°C or below under clear, calm skies. On the coast (Mount Maunganui and Wellington) the sea keeps things warmer, so there it takes 2°C or below under clear, calm skies, or 1°C or below in any conditions.
