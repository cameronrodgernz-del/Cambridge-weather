#!/bin/bash
# fetch raw reports for one station, a month at a time; usage: og_fetch.sh STATION YYYYMM...
st=$1; shift
for ym in "$@"; do
  y=${ym:0:4}; m=${ym:4:2}
  ny=$y; nm=$((10#$m + 1)); if [ $nm -gt 12 ]; then nm=1; ny=$((y + 1)); fi
  f=/tmp/bt/og/${st}_$ym.txt
  [ -s "$f" ] && grep -q "^$st," "$f" && continue
  for try in 1 2 3; do
    curl -s -m 90 -A "Mozilla/5.0 (track-weather back-test)" -o "$f" "https://www.ogimet.com/cgi-bin/getsynop?block=$st&begin=${y}${m}010000&end=$(printf '%04d%02d' $ny $nm)010000"
    grep -q "^$st," "$f" && break
    sleep 40
  done
  sleep 12
done
echo done > /tmp/bt/og/${st}_finished
