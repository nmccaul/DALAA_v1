#!/bin/zsh
# The bug loop (D-030): one fresh headless Claude pass per production feedback
# report (ralph/BUG-PROMPT.md), until no report is left without a fix row.
# Passes work in their own git worktree on `main` (../DALAA_v1-bugs), so the
# build loop's branch here is never touched.
# Stops when nothing is waiting, after MAX_PASSES, or when ralph/STOP exists.
# Run with:  caffeinate -i ralph/bugs.sh
set -u
cd "${0:A:h}/.."
REPO=$PWD
TREE=${BUGS_TREE:-${REPO:h}/DALAA_v1-bugs}

MAX_PASSES=${MAX_PASSES:-40}
LOGS=ralph/logs
mkdir -p "$LOGS"

# Reports nobody has picked up: `list` prints one line per open report and
# ends a claimed one with its status (in_progress = a PR waiting for Nathan).
waiting() {
  local out
  out=$(npm run -s feedback -- list --prod 2>&1) || { echo "feedback list failed:" >&2; echo "$out" | tail -n 3 >&2; return 2; }
  print -r -- "$out" | grep -v '^No open reports\.$' | grep -cv $'\tin_progress$'
}

if [[ ! -d $TREE ]]; then
  git fetch -q origin main && git worktree add --detach "$TREE" origin/main || exit 1
  ln -s "$REPO/.env.local" "$TREE/.env.local"
  (cd "$TREE" && npm ci --silent) || exit 1
fi

pass=0
while (( pass < MAX_PASSES )); do
  [[ -f ralph/STOP ]] && { echo "STOP file found; stopping."; break; }
  n=$(waiting); code=$?
  if (( code == 2 )); then echo "Pausing 2 minutes."; sleep 120; continue; fi
  (( n == 0 )) && { echo "No reports waiting."; break; }
  (( pass++ ))

  (cd "$TREE" && git fetch -q origin main && git checkout -q --detach origin/main) || exit 1
  log="$LOGS/bugs-$(date -u +%Y%m%dT%H%M%SZ).log"
  echo "=== bug pass $pass ($n waiting)  $(date)  → $log"
  (cd "$TREE" && claude -p "$(cat "$REPO/ralph/BUG-PROMPT.md")" --permission-mode auto) > "$log" 2>&1
  code=$?
  tail -n 3 "$log"

  if grep -qiE "usage limit|limit reached|rate limit|resets at|resets [0-9]|hit your .*limit|out of (extra )?usage" "$log" \
     && ! grep -q "BUG RESULT:" "$log"; then
    echo "Usage limit hit; sleeping 30 minutes (not counted as a pass)."
    (( pass-- ))
    sleep 1800
  elif [[ $code -ne 0 ]] && ! grep -q "BUG RESULT:" "$log"; then
    echo "Pass exited $code without a result; pausing 2 minutes."
    sleep 120
  fi
done
