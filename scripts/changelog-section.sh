#!/usr/bin/env bash
set -euo pipefail

# Print the CHANGELOG body for a single Code Connect version.
#
# Our CHANGELOG uses a single `#` for version headers and `##` for the sections
# within a release:
#
#   # Code Connect v2.0.0 (18 August 2026)
#
#   ## Fixed
#   - ...
#
#   # Code Connect v1.5.3 (12 August 2026)
#
# so we print everything after the matching version header up to (but not
# including) the next `# ` header. The version header itself is omitted, as
# callers (GitHub releases, Slack posts) already carry the version in a title.
#
# Exits 1 if the version has no section, so callers can `set -e` on it.
#
# Keep this script dependency free (no node, no tsx): the release workflow calls
# it before `npm install` has run.
#
#
# Usage: ./scripts/changelog-section.sh CHANGELOG.md 2.0.0

file="${1:?missing changelog file (e.g. CHANGELOG.md)}"
ver="${2:?missing version (e.g. 2.0.0)}"

section="$(
  awk -v ver="$ver" '
    BEGIN {
      found = 0
      # Escape dots so "2.0.0" cannot match "2x0y0".
      gsub(/\./, "\\.", ver)
      header = "^#[[:space:]]+Code Connect[[:space:]]+v" ver "([[:space:]]|$)"
    }
    # Single-hash lines are version headers; "## Fixed" et al. are not matched
    # here because the second character is "#" rather than whitespace.
    /^#[[:space:]]/ {
      if (found) { exit }
      if ($0 ~ header) { found = 1 }
      next
    }
    found { print }
    END { if (!found) exit 1 }
  ' "$file"
)" || {
  echo "error: no CHANGELOG section found for version ${ver} in ${file}" >&2
  exit 1
}

# Trim leading and trailing blank lines, keeping the interior intact.
printf '%s\n' "$section" | awk '
  { lines[NR] = $0 }
  END {
    first = 1
    last = NR
    while (first <= NR && lines[first] ~ /^[[:space:]]*$/) { first++ }
    while (last >= first && lines[last] ~ /^[[:space:]]*$/) { last-- }
    for (i = first; i <= last; i++) { print lines[i] }
  }
'
