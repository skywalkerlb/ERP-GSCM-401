#!/bin/sh
# Design-system lint (Glazed). Flags hard-coded design values in UI code outside design-system/.
#   sh scripts/check-design.sh         check only lines ADDED in staged files (used by .githooks/pre-commit)
#   sh scripts/check-design.sh --all   check every UI file in the project
# Flags: raw hex colors, rgb()/rgba()/hsl()/hsla(), px values above 2px, literal font families.
# Use var(--token) from design-system/tokens.css instead. Allowed: 0px-2px (hairlines, focus rings).
# A line containing "ds-exception:" is skipped. Use it ONLY when the user explicitly asked for a
# one-off, and log it in README.md §8.1 "Design exceptions".
cd "$(dirname "$0")/.." || exit 0

is_ui() {
  case "$1" in
    design-system/*|scripts/*|node_modules/*|dist/*|build/*|.ai-state/*|*.d.ts|*.min.*) return 1 ;;
    *.css|*.scss|*.ts|*.tsx|*.js|*.jsx|*.html) return 0 ;;
  esac
  return 1
}

CHECK='
index($0, "ds-exception:") { next }
{ t = $0; sub(/^[^\t]*\t[^\t]*\t/, "", t); why = "" }
t ~ /(^|[^&0-9A-Za-z_])#([0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]|[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]|[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]|[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F])([^0-9A-Za-z_]|$)/ { why = why "raw hex color; " }
t ~ /(rgba?|hsla?)\(/ { why = why "raw rgb/hsl color; " }
t ~ /(^|[^0-9.A-Za-z_])([3-9]|[1-9][0-9]+|[0-9]*\.[0-9]+|2\.[0-9]+)px/ { why = why "hard-coded px size (use --space-*/--radius-*/--control-* etc.); " }
t ~ /(font-family|fontFamily)/ && t !~ /var\(--font/ && t !~ /inherit/ { why = why "literal font family (use var(--font-sans|display|mono)); " }
why != "" { split($0, f, "\t"); printf "%s:%s: %s\n    %s\n", f[1], f[2], why, t; bad = 1 }
END { exit bad }
'

if [ "$1" = "--all" ]; then
  { git ls-files -co --exclude-standard 2>/dev/null || find . -type f | sed 's|^\./||'; } | sort -u |
  while IFS= read -r f; do
    is_ui "$f" && [ -f "$f" ] && awk -v F="$f" '{ printf "%s\t%d\t%s\n", F, NR, $0 }' "$f"
  done | awk "$CHECK"
else
  git diff --cached --name-only --diff-filter=ACMR |
  while IFS= read -r f; do
    is_ui "$f" || continue
    git diff --cached -U0 -- "$f" | awk -v F="$f" '
      /^@@/ { s = $0; sub(/.*\+/, "", s); sub(/[ ,].*/, "", s); n = s + 0; next }
      /^\+\+\+/ { next }
      /^\+/ { printf "%s\t%d\t%s\n", F, n, substr($0, 2); n++; next }'
  done | awk "$CHECK"
fi
rc=$?
if [ $rc -ne 0 ]; then
  cat >&2 <<'EOF'

Design-system check failed: the lines above hard-code design values.
Replace them with var(--token) values from design-system/tokens.css (or Glazed components).
If a value you need has no token, ask the user before adding one (design-system/DESIGN_SYSTEM.md > Rules for AI agents).
Only if the user explicitly asked for this one-off: add a "ds-exception: <reason>" comment on the line and log it in README.md §8.1.
EOF
fi
exit $rc
