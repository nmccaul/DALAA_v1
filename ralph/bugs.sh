#!/bin/zsh
# The bug loop (D-030): one fresh headless Claude pass per production feedback
# report (ralph/BUG-PROMPT.md), until no report is left without a fix row.
# Passes work in their own git worktree on `main` (../DALAA_v1-bugs), so the
# build loop's branch here is never touched.
# Stops when nothing is waiting, after MAX_PASSES, or when ralph/STOP exists.
# Run with:  caffeinate -i ralph/bugs.sh
# Dry run against the local database (T37b): BUGS_PROD= MAX_PASSES=1
#   BUGS_REF=origin/<branch> BUGS_TREE=<scratch dir> ralph/bugs.sh
# drops --prod everywhere and tells the pass not to open a PR or merge.
set -u
cd "${0:A:h}/.."
REPO=$PWD
TREE=${BUGS_TREE:-${REPO:h}/DALAA_v1-bugs}

REF=${BUGS_REF:-origin/main}
PROD=${BUGS_PROD---prod}

MAX_PASSES=${MAX_PASSES:-40}
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
    notify "Stopped after $MAX_FAILS failures in a row" "bug loop"
    exit 3
  fi
}

# Reports nobody has picked up: `list` prints one line per open report and
# ends a claimed one with its status (in_progress = a PR waiting for Nathan).
waiting() {
  local out
  out=$(npm run -s feedback -- list ${=PROD} 2>&1) || { echo "feedback list failed:" >&2; echo "$out" | tail -n 3 >&2; return 2; }
  print -r -- "$out" | grep -v '^No open reports\.$' | grep -cv $'\tin_progress$'
}

if [[ ! -d $TREE ]]; then
  git fetch -q origin && git worktree add --detach "$TREE" "$REF" || exit 1
  ln -s "$REPO/.env.local" "$TREE/.env.local"
  mkdir -p "$TREE/.vercel" && cp "$REPO/.vercel/project.json" "$TREE/.vercel/"
  (cd "$TREE" && npm ci --silent) || exit 1
fi

# The prompt says --prod throughout; a dry run strips it and adds its own rules.
prompt=$(cat ralph/BUG-PROMPT.md)
if [[ -z $PROD ]]; then
  prompt="$(cat ralph/BUG-DRYRUN.md)

${prompt// --prod/}"
fi

pass=0
while (( pass < MAX_PASSES )); do
  [[ -f ralph/STOP ]] && { echo "STOP file found; stopping."; break; }
  n=$(waiting); code=$?
  if (( code == 2 )); then failed "feedback list"; sleep 60; continue; fi
  (( n == 0 )) && { echo "No reports waiting."; break; }
  (( pass++ ))

  (cd "$TREE" && git fetch -q origin && git checkout -q --detach "$REF") || exit 1
  log="$LOGS/bugs-$(date -u +%Y%m%dT%H%M%SZ).log"
  echo "=== bug pass $pass ($n waiting)  $(date)  → $log"
  with_limit $PASS_MINUTES zsh -c 'cd "$1" && claude -p "$2" --permission-mode auto' _ "$TREE" "$prompt" > "$log" 2>&1
  code=$?
  (( code == 124 )) && echo "Pass hit the ${PASS_MINUTES}-minute limit and was stopped." | tee -a "$log"
  tail -n 3 "$log"

  if grep -qiE "usage limit|limit reached|rate limit|resets at|resets [0-9]|hit your .*limit|out of (extra )?usage" "$log" \
     && ! grep -q "BUG RESULT:" "$log"; then
    echo "Usage limit hit; sleeping 30 minutes (not counted as a pass)."
    (( pass-- ))
    sleep 1800
  elif ! grep -q "BUG RESULT:" "$log"; then
    failed "pass exited $code without a result"
    sleep 60
  else
    fails=0
  fi
done
notify "Finished: $(tail -n 1 ralph/logs/bugs.out 2>/dev/null)" "bug loop"
