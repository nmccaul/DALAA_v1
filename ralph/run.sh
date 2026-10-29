#!/bin/zsh
# The overnight loop: one fresh headless Claude pass per task (ralph/PROMPT.md).
# Stops when ralph/STATUS says DONE, after MAX_PASSES, or when a STOP file exists.
# Usage limits: if a pass ends because tokens ran out, sleep and try again.
# Run with:  caffeinate -i ralph/run.sh
set -u
cd "${0:A:h}/.."

MAX_PASSES=${MAX_PASSES:-80}
LOGS=ralph/logs
mkdir -p "$LOGS"

pass=0
while (( pass < MAX_PASSES )); do
  (( pass++ ))
  [[ -f ralph/STOP ]] && { echo "STOP file found; stopping."; break; }
  [[ "$(cat ralph/STATUS 2>/dev/null)" == DONE* ]] && { echo "All tasks done."; break; }

  log="$LOGS/pass-$(date -u +%Y%m%dT%H%M%SZ).log"
  echo "=== pass $pass  $(date)  → $log"
  claude -p "$(cat ralph/PROMPT.md)" --permission-mode auto > "$log" 2>&1
  code=$?
  tail -n 3 "$log"

  if grep -qiE "usage limit|limit reached|rate limit|resets at|resets [0-9]|hit your .*limit|out of (extra )?usage" "$log" \
     && ! grep -q "PASS RESULT:" "$log"; then
    echo "Usage limit hit; sleeping 30 minutes (not counted as a pass)."
    (( pass-- ))
    sleep 1800
  elif [[ $code -ne 0 ]] && ! grep -q "PASS RESULT:" "$log"; then
    echo "Pass exited $code without a result; pausing 2 minutes."
    sleep 120
  fi
done
