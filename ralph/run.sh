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

# A Mac notification when the loop ends, for whatever reason.
notify() { osascript -e "display notification \"$1\" with title \"DALAA $2\" sound name \"Glass\"" 2>/dev/null; }

# Guards (2026-10-29: a dry run retried a failing command every 2 minutes for
# 20+ minutes and a pass waited on it): every pass has a wall-clock limit, and
# the loop stops after MAX_FAILS failures in a row instead of retrying forever.
PASS_MINUTES=${PASS_MINUTES:-40}
MAX_FAILS=${MAX_FAILS:-3}
fails=0

# Kill a process and everything it started.
kill_tree() {
  local child
  for child in $(pgrep -P "$1"); do kill_tree "$child"; done
  kill "$1" 2>/dev/null
}

# Run a command with a time limit in minutes; 124 when it was killed.
with_limit() {
  local minutes=$1; shift
  "$@" &
  local pid=$! waited=0
  while kill -0 $pid 2>/dev/null; do
    sleep 10; (( waited += 10 ))
    if (( waited >= minutes * 60 )); then
      kill_tree $pid; wait $pid 2>/dev/null
      return 124
    fi
  done
  wait $pid
}

# One more failure in a row; stop the loop at MAX_FAILS.
failed() {
  (( fails++ ))
  echo "Failure $fails of $MAX_FAILS in a row: $1"
  if (( fails >= MAX_FAILS )); then
    echo "Stopping: $MAX_FAILS failures in a row. Read the last log; nothing more will run until it's fixed."
    notify "Stopped after $MAX_FAILS failures in a row" "build loop"
    exit 3
  fi
}

pass=0
while (( pass < MAX_PASSES )); do
  (( pass++ ))
  [[ -f ralph/STOP ]] && { echo "STOP file found; stopping."; break; }
  [[ "$(cat ralph/STATUS 2>/dev/null)" == DONE* ]] && { echo "All tasks done."; break; }

  log="$LOGS/pass-$(date -u +%Y%m%dT%H%M%SZ).log"
  echo "=== pass $pass  $(date)  → $log"
  with_limit $PASS_MINUTES claude -p "$(cat ralph/PROMPT.md)" --permission-mode auto > "$log" 2>&1
  code=$?
  (( code == 124 )) && echo "Pass hit the ${PASS_MINUTES}-minute limit and was stopped." | tee -a "$log"
  tail -n 3 "$log"

  if grep -qiE "usage limit|limit reached|rate limit|resets at|resets [0-9]|hit your .*limit|out of (extra )?usage" "$log" \
     && ! grep -q "PASS RESULT:" "$log"; then
    echo "Usage limit hit; sleeping 30 minutes (not counted as a pass)."
    (( pass-- ))
    sleep 1800
  elif ! grep -q "PASS RESULT:" "$log"; then
    failed "pass exited $code without a result"
    sleep 60
  else
    fails=0
  fi
done
notify "Finished: $(tail -n 1 ralph/logs/loop.out 2>/dev/null)" "build loop"
