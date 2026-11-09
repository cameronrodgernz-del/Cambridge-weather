# Cambridge Weather

Hour-by-hour weather for Cambridge, Waikato. The page pulls fresh model data from Open-Meteo every time it loads and every 30 minutes while it's open, so there's nothing to run each day.

## What's on the page

- Conditions right now, and a plain-English read of today, tonight, tomorrow and the week, written from the data on each load
- Seven-day ledger with sky, highs and lows, rain amount and how likely it is, wind, and fog or frost flags
- Hour-by-hour chart on one time line: temperature and dew point, chance of rain, wind and gusts, cloud cover, and a fog and frost risk strip, with a 48 hour, 4 day or 7 day view
- Detail for any day: overnight, morning, afternoon and evening, sunrise and sunset, UV and sun protection hours
- How firm the forecast is: rain each day from six weather models (ECMWF 9 km, ECMWF's AI model, UK Met Office, GFS, ICON, GEM) and the 51-run ECMWF ensemble
- The past week's rain and temperatures

## Tīeke Golf Estate

A switch at the top moves between Cambridge and Tīeke Golf Estate (72 Lochiel Road, Tamahere). Tīeke has its own link, `/tieke`, its own forecast point on the river flats, and an extra golf section:

- A written read of the best time to tee off today, tomorrow and later in the week
- A tee sheet for the next seven days, one square per daylight hour, shaded from poor to great golf, with rain, likely showers, strong gusts, fog and frost marked, and the best four-hour window for 18 holes outlined
- First light, last tee times for 18 and 9 holes, sunset and sunscreen hours for today and tomorrow
- Rain over the last 48 hours and what that means underfoot, plus booking details

Each daylight hour scores out of 100 and loses points for rain (more for heavier rain, and more the more of the models have it), a high chance of showers, wind over 15 km/h, gusts over 30 km/h, a feels-like temperature under 15°C or over 28°C, fog and frost.

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

## Ellerslie and Pukekohe Park

Tabs `/ellerslie` and `/pukekohe` work the same way as Te Rapa, from the same `track.js`. Each racecourse entry in `PLACES` carries:

- `short`: the name used in the race section and on the radar pin
- `hand`: `"left"` or `"right"`, the direction of running, which decides which rail is the inside for crosswinds in the straight
- `straight`: the bearing the horses run along the home straight to the post
- `soilNote` and `calendarNote`: the course's own line under the soil chart and under the season list
- `meetings`: the season's dates, with optional `name`, and `from` and `to` racing hours

Both Auckland courses are right-handed. Ellerslie's home straight runs west-north-west (about 299°) in front of the Ascot and Ellerslie stands, and Pukekohe's runs north-west (about 324°) in front of the stands on the Manukau Road side, both worked out from the OpenStreetMap outlines of the tracks. Their 2026/27 dates come from Auckland Thoroughbred Racing's calendar in its 2026 annual report. Racing hours come from the first race times on ATR's raceday pages, or from the NZTR and TAB racing calendar where ATR hasn't posted one, plus the number of races. The 2027/28 dates need adding before August 2027.

## How the rain blend was chosen

The daily rain figure in the summaries is a blend of six models: the European 9 km model (ECMWF IFS), the European AI model (AIFS), the UK Met Office, the US GFS, the German ICON and the Canadian GEM. With five or more models reporting, the highest and the lowest are dropped and the rest averaged; with fewer, the middle value is used. The US model's rain is left out from five days ahead. The 51-run European ensemble is used for the chance of rain, not for the amount.

That line-up came from a back-test in November 2026. Each model's past forecasts, one to seven days ahead, came from Open-Meteo's Previous Runs archive, and were scored against the 24-hour rain totals reported by the Hamilton Airport gauge (WMO 93173) and the Auckland Airport gauge (WMO 93110) from January 2024 to November 2026, about 980 days at each. What it showed:

- The Japanese model (JMA) was the least accurate of the old six at every range at both gauges, and ran wet at Hamilton. It was dropped.
- Open-Meteo's default feed for New Zealand is the European 9 km model, so the old blend counted the European model three times (the default, the 25 km version and the middle of its 51 runs). The 9 km version matched the 25 km at one to two days and beat it at three to five, so the 25 km version was dropped.
- The European AI model was the most accurate single model, or level with the best, at both gauges, and caught more of the days of 10 mm or more than the European 25 km model. It runs about 15% too wet on average, which offsets the other models running slightly dry. It was added.
- The US model's rain from five days ahead averaged around half of what fell, at both gauges and in every year of the archive, so it is left out at that range.
- The Australian (ACCESS-G), GraphCast and Korean models have stopped updating in Open-Meteo's archive. The French model was good to three days but only runs four days and didn't improve the blend. The Chinese model was among the weakest.
- Dropping the highest and lowest and averaging the rest had the lowest or near-lowest average miss of the ways tried, and ran less dry than taking the middle value.

On the same days, the new blend's average miss on a day's rain, one to six days ahead, was about 6% lower than the old blend's at Hamilton (2.40 mm down to 2.26 mm) and about 4% lower at Auckland (2.53 mm down to 2.42 mm), from February 2025 on. At five and six days ahead it caught about half the days of 10 mm or more, up from about four in ten. The blend beat every single model at one to three days ahead.

Limits: the airport gauges are about 13 km from Te Rapa and Ellerslie and 25 km from Pukekohe, this test covers daily totals (the next section covers six-hour totals), and the 51-run middle in the old blend couldn't be rebuilt from the archive. The scripts are in `backtest/`. `/api/pastruns` passes requests to the Previous Runs archive for the gauge sites, and with `live=1` returns the model comparison as the pages request it. Worth re-running once a year, or when a course has its own gauge record to score against.

## Rain by the hour, play scores and the chance of rain

On every tab the rain for each hour, from today on, is the average of the six models for that hour, scaled so the day's hours add up to the day's blend. So the hourly charts, the parts of the day, the totals before each track check and the daily figures all agree. The tee times tab does the same for each course. If the models' hours don't load, a tab falls back to Open-Meteo's default feed (the European 9 km model).

This came from a second back-test in November 2026 against the six-hour rain totals the same two airport gauges report. From October 2025, when the 9 km model's archive starts, the average miss on a six-hour total fell by 13 to 19% against the European model's hours on their own: at Hamilton from 0.86 mm to 0.75 mm at one to two days ahead and from 1.10 mm to 0.91 mm at five to six; at Auckland from 0.79 mm to 0.67 mm and from 1.01 mm to 0.86 mm. It caught about as many of the windows with 5 mm or more, with fewer false calls (at one to two days ahead, 36 to 37% of its 5 mm calls were wrong, down from 46 to 50%). It runs slightly dry, by about 0.1 mm per six hours.

Averaging flattens a sharp burst, because the models rarely put it in the same hour. So the "5 mm or more in the hour" flags and the heaviest-burst line still read the European 9 km model's own hours, and so does the count of wet hours that decides between "showers" and "rain".

The play score (golf, the beach and the tee times tab) marks an hour down for rain by scoring each model's figure for that hour on its own (0.2 mm or more, 1 mm or more, 3 mm or more) and averaging the marks. An hour only one model has wet loses a little; an hour they all have wet loses the lot. Scoring the blended hour instead would mark down every hour of a showery day, because the average is rarely zero. Set against the gauges' six-hour totals, the averaged marks told wet windows from dry ones better than the single model at every range, and the window they picked as the day's best was wet less often: at one to two days ahead, 19% of the time against 22 to 23% at Hamilton and Auckland, with a quarter to a third less rain in it. The gauges don't report by the hour, so this is tested on six-hour windows, not single hours.

Both changes were checked at two more gauges in November 2026, Tauranga Airport (WMO 93186, about 4 km from Mount Maunganui) and Wellington Airport (WMO 93439), from October 2025. The daily blend beat every single model at both, at one to three and at four to six days ahead. The blended hours' average miss on a six-hour total was 15 to 21% lower than the European model's hours at Tauranga and 8 to 14% lower at Wellington, and the play score result held at both. Royal Wellington at Heretaunga is about 25 km from the Wellington gauge and sits in different terrain, so it is the least proven of the places.

The chance tables ("Chance of at least this much rain") give the chance of 1, 5, 10 and 20 mm falling in a stretch of hours. Each chance comes from two things: the share of the models whose total for the stretch reaches the amount, and how far the blended total is from it. The weights were fitted to what fell at the gauges from February 2025 to November 2026, with one set for part of a day, one for about a day and one for several days. Fitted on one gauge and checked on the other, the chances held up: for a day or several days, 50% came in at 44 to 53%, 70% at 64 to 75% and 88% at 85 to 89%. For part of a day, 70% came in at 64 to 69%, and the 10 and 20 mm figures there rest on few cases and ran a little high in the middle of the range. The weights are in `track.js` (`CHANCE`) and the fitting is in `backtest/chance.py`.

## Hosting

It's a plain static site: `index.html`, `styles.css`, `app.js`, with `finder.js` for the tee times tab and `track.js` for the racecourse. No build step and no keys. On Vercel, import the GitHub repository and deploy with the default settings (Framework preset: Other).

## Making a copy for another town

Add an entry to `PLACES` at the top of `app.js` (name, region, latitude, longitude, path and MetService link), add a button for it in the location switch in `index.html`, and add a rewrite for its path in `vercel.json`.

## Data

Weather data from [Open-Meteo](https://open-meteo.com/) under CC BY 4.0. Open-Meteo's free service is for non-commercial use. If the site is ever used commercially, it needs an Open-Meteo API subscription. The same goes for the [RainViewer](https://www.rainviewer.com/api.html) radar, which is free for personal use with credit, and the [OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/) map tiles, which are fine for light use with credit.

Fog risk is flagged for night and early-morning hours when the air is close to saturation (temperature within 1°C of the dew point) and winds are light, or when the models show visibility under 1 km. Frost risk is flagged when the temperature is 1°C or below, or 3.5°C or below under clear, calm skies. On the coast (Mount Maunganui and Wellington) the sea keeps things warmer, so there it takes 2°C or below under clear, calm skies, or 1°C or below in any conditions.
