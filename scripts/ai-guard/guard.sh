#!/bin/sh
# AI guard: one script shared by every AI tool's hooks (Claude Code, Codex, Cursor, Copilot).
#   1. BEFORE an edit: block it until this session has read README.md, PROGRESS.md and
#      design-system/DESIGN_SYSTEM.md (and re-read any that another agent changed since).
#   2. AFTER an edit: remember that project files changed.
#   3. On STOP: if files changed but PROGRESS.md wasn't updated, and/or UI files changed (design
#      checklist), send the agent back ONCE.
# Usage: guard.sh <claude|codex|cursor|copilot> <pre|post|read|edited|stop>
# Fails open (allows) if jq is missing so a broken hook never bricks the project.
TOOL=$1; EV=$2
command -v jq >/dev/null 2>&1 || exit 0
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
IN=$(cat)
j() { printf '%s' "$IN" | jq -r "$1" 2>/dev/null; }

SID=$(j '.session_id // .conversation_id // .sessionId // "default"' | tr -cd 'A-Za-z0-9_.-' | cut -c1-80)
[ -n "$SID" ] || SID=default
ST="$ROOT/.ai-state/$TOOL-$SID"
mkdir -p "$ST"

NAME=$(j '.tool_name // .toolName // ""' | tr 'A-Z' 'a-z')
CMD=$(j '.tool_input.command // .tool_input.input // .tool_input.patch // .tool_input.cmd // .command // ""')
PATHS=$(j '[.tool_input.file_path, .tool_input.path, .tool_input.filePath, .tool_input.target_file, .tool_input.notebook_path, .file_path] | map(select(type=="string")) | .[]')

case "$EV" in
  read) KIND=read ;;
  edited) KIND=edit ;;
  stop) KIND=stop ;;
  *) case "$NAME" in
       *patch*|*edit*|*write*|*create*|*replace*|*insert*|*delete*) KIND=edit ;;
       *read*|*view*|*open*) KIND=read ;;
       *bash*|*shell*|*terminal*|*exec*|*command*) KIND=shell ;;
       *) KIND=other ;;
     esac ;;
esac

# File paths named inside an apply_patch body (Codex, Copilot).
if [ "$KIND" = edit ]; then
  PP=$(printf '%s\n' "$CMD" | sed -n -E 's/^\*\*\* (Update|Add|Delete) File: (.*)$/\2/p; s/^\*\*\* Move to: (.*)$/\1/p')
  PATHS=$(printf '%s\n%s\n' "$PATHS" "$PP")
fi

rel() { case "$1" in "$ROOT"/*) echo "${1#"$ROOT"/}" ;; /*) echo "__outside__" ;; *) echo "${1#./}" ;; esac; }

# Pull/fetch synchronize upstream history, so they do not count as authored edits.
# Keep checking the rest of a compound command for writes.
# Does a shell command look like it changes files? (Redirects to /dev/null and fd dups don't count.)
is_write() {
  printf '%s' "$CMD" | sed -E 's/[0-9&]?>+ *\/dev\/null//g; s/[0-9]>&[0-9]//g' |
    grep -qE '>|(^|[;&|( ])(sed -i|perl -i|tee|mv|cp|rm|mkdir|touch|ln|unzip|npm|npx|yarn|pnpm|pip3?|git (apply|checkout|restore|reset|merge|stash|rebase|mv|rm)|curl .*-o)( |$)'
}
mentions() { printf '%s' "$CMD" | grep -q "$1"; }

DS="design-system/DESIGN_SYSTEM.md"
read_ok() {
  [ -f "$ST/read-README" ] && [ -f "$ST/read-PROGRESS" ] && [ -f "$ST/read-DS" ] &&
    ! [ "$ROOT/README.md" -nt "$ST/read-README" ] && ! [ "$ROOT/PROGRESS.md" -nt "$ST/read-PROGRESS" ] &&
    ! [ "$ROOT/$DS" -nt "$ST/read-DS" ]
}

MSG_READ="BLOCKED by project rule (README.md §9.1): before editing anything you must read README.md, PROGRESS.md and design-system/DESIGN_SYSTEM.md in full in this session (or re-read whichever one another agent changed since you last read it). Read all three now with your file-read tool (or: cat README.md PROGRESS.md design-system/DESIGN_SYSTEM.md), then retry this edit. For UI work, also read design-system/components/<Name>/README.md for each component you use."
MSG_STOP="Project files were edited but PROGRESS.md was not updated. Before finishing (README.md §9.2): add a changelog entry using the template in PROGRESS.md > Recent Changes; rewrite Current Status / In-flight / Next Steps / Open Questions; update README.md if how-it-works or User Preferences (§8) changed; if the user corrected you, record the rule in §8 and sweep the whole project (§9.3); keep at most 10 changelog entries (archive older ones). If this turn's edits truly need no log, say why in one line and stop."
MSG_UI="UI files changed, so run the design-system checklist (design-system/DESIGN_SYSTEM.md > Rules for AI agents): only var(--token) values (no raw hex/rgb/px; run: sh scripts/check-design.sh --all), only Glazed components and their props, both data-theme light and dark work, one primary button per view, status colors and voice rules followed, a11y (labels, focus ring, aria-label). Fix anything that fails. List any deviations (and any ds-exception the user approved, logged in README §8.1) in your final message and the PROGRESS.md entry."

allow() { [ "$TOOL" = cursor ] && echo '{"permission":"allow"}'; exit 0; }
deny() {
  if [ "$TOOL" = cursor ]; then
    jq -n --arg m "$1" '{permission:"deny", user_message:"Blocked: the agent must read README.md and PROGRESS.md first.", agent_message:$m}'
    exit 0
  fi
  echo "$1" >&2; exit 2
}

case "$EV" in
  pre)
    NEED=0
    [ "$KIND" = edit ] && NEED=1
    [ "$KIND" = shell ] && is_write && NEED=1
    [ "$NEED" = 1 ] && ! read_ok && deny "$MSG_READ"
    allow ;;

  post|read|edited)
    if [ "$KIND" = read ]; then
      printf '%s\n' "$PATHS" | while IFS= read -r p; do
        [ -n "$p" ] || continue
        case "$(rel "$p")" in README.md) touch "$ST/read-README" ;; PROGRESS.md) touch "$ST/read-PROGRESS" ;; "$DS") touch "$ST/read-DS" ;; esac
      done
    elif [ "$KIND" = shell ]; then
      if is_write; then
        if mentions PROGRESS.md; then rm -f "$ST/pending"; touch "$ST/read-PROGRESS"; else touch "$ST/pending"; fi
      else
        mentions README.md && touch "$ST/read-README"
        mentions PROGRESS.md && touch "$ST/read-PROGRESS"
        mentions DESIGN_SYSTEM.md && touch "$ST/read-DS"
      fi
    elif [ "$KIND" = edit ]; then
      PROG=0; OTHER=0; UI=0
      for p in $(printf '%s\n' "$PATHS" | tr ' ' '\037'); do
        p=$(printf '%s' "$p" | tr '\037' ' ')
        r=$(rel "$p")
        case "$r" in
          __outside__|docs/progress-archive/*|.ai-state/*) ;;
          PROGRESS.md) PROG=1 ;;
          README.md) touch "$ST/read-README"; OTHER=1 ;;
          "$DS") touch "$ST/read-DS"; OTHER=1; UI=1 ;;
          *) OTHER=1 ;;
        esac
        case "$r" in
          *.md|__outside__) ;;
          *.css|*.scss|*.tsx|*.jsx|*.html|src/*|design-system/*) UI=1 ;;
        esac
      done
      if [ "$PROG" = 1 ]; then rm -f "$ST/pending"; touch "$ST/read-PROGRESS"
      elif [ "$OTHER" = 1 ]; then touch "$ST/pending"; fi
      [ "$UI" = 1 ] && touch "$ST/pending-ui"
    fi
    [ "$EV" = read ] && allow
    exit 0 ;;

  stop)
    [ "$(j '.stop_hook_active // false')" = true ] && exit 0
    LC=$(j '.loop_count // 0'); [ "${LC:-0}" -gt 0 ] 2>/dev/null && exit 0
    find "$ROOT/.ai-state" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null
    R=""
    [ -f "$ST/pending" ] && R="$MSG_STOP"
    [ -f "$ST/pending-ui" ] && R="${R:+$R }$MSG_UI"
    [ -n "$R" ] || exit 0
    rm -f "$ST/pending" "$ST/pending-ui"
    MSG_STOP="$R"
    case "$TOOL" in
      cursor)  jq -n --arg r "$MSG_STOP" '{followup_message:$r}' ;;
      copilot) jq -n --arg r "$MSG_STOP" '{decision:"block", reason:$r, hookSpecificOutput:{hookEventName:"Stop", decision:"block", reason:$r}}' ;;
      *)       jq -n --arg r "$MSG_STOP" '{decision:"block", reason:$r}' ;;
    esac
    exit 0 ;;
esac
exit 0
