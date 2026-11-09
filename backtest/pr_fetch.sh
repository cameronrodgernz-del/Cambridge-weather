#!/bin/bash
site=$1
for model in best_match ecmwf_ifs025 ecmwf_ifs ecmwf_aifs025_single ukmo_seamless gfs_seamless gfs_graphcast025 icon_seamless gem_seamless jma_seamless bom_access_global meteofrance_seamless cma_grapes_global kma_seamless; do
  for rng in "2024-01-01 2024-12-31" "2025-01-01 2025-12-31" "2026-01-01 2026-11-08"; do
    set -- $rng; f=/tmp/bt/pr/${site}_${model}_${1:0:4}.json
    [ -s "$f" ] && grep -q '"hourly"' "$f" && continue
    for try in 1 2 3; do
      curl -s -m 90 -o "$f" -w "$site $model ${1:0:4} %{http_code} %{size_download}\n" "https://cambridge-weather.vercel.app/api/pastruns?site=$site&model=$model&start=$1&end=$2"
      grep -q '"hourly"' "$f" && break
      head -c 200 "$f"; echo; sleep 8
    done
    sleep 2
  done
done
echo finished
