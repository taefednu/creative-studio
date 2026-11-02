#!/usr/bin/env bash
# Полная проверка фронта на свежем стенде: каждый сценарий тратит данные стенда, поэтому свой свежий стенд.
# Запуск из frontend/: scripts/check_all.sh <каталог для логов>. Итог: строка на шаг и код выхода.
set -u
OUT="${1:-/tmp/mcs-check}"; mkdir -p "$OUT"; fail=0
for s in lint build test:unit; do pnpm "$s" > "$OUT/${s/:/_}.log" 2>&1; rc=$?; echo "$s exit=$rc"; [ $rc = 0 ] || fail=1; done
fresh() { ./scripts/stand.sh stop > /dev/null; sleep 1; ./scripts/stand.sh > /dev/null; sleep 4; }
fresh
node scripts/design_check.cjs all > "$OUT/design.log" 2>&1; rc=$?; echo "design exit=$rc"; grep -E '^(PASS|FAIL)|\*\*' "$OUT/design.log"; [ $rc = 0 ] || fail=1
for b in 1 2 3 4 5 6; do
  fresh
  for try in 1 2 3; do
    node "scripts/click_batch$b.cjs" > "$OUT/click$b.log" 2>&1; rc=$?
    grep -qE 'Target crashed|Page crashed' "$OUT/click$b.log" || break
    echo "click$b: браузер упал по памяти, повтор"; sleep 30; fresh
  done
  echo "click$b exit=$rc pass=$(grep -c '^PASS' "$OUT/click$b.log")"; grep -E '^FAIL|^ERR' "$OUT/click$b.log" | cut -c1-170 | head -8; [ $rc = 0 ] || fail=1
done
fresh
exit $fail
