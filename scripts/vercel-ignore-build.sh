#!/bin/sh
# Vercel's Ignored Build Step (vercel.json ignoreCommand runs this; that field
# is capped at 256 characters). Exit 0 = skip the build, exit 1 = build.

# Production always builds.
[ "$VERCEL_GIT_COMMIT_REF" = main ] && exit 1

# Dependabot branches never need a preview.
case "$VERCEL_GIT_COMMIT_REF" in dependabot/*) exit 0;; esac

# The end-session changelog commit.
echo "$VERCEL_GIT_COMMIT_MESSAGE" | grep -q '^docs(changelog)' && exit 0

# Skip when nothing a build uses changed since the last deployed commit on this
# branch: docs, scripts, translated locales (en still builds, copy fixes show on
# preview) and root markdown. An unknown or missing previous commit builds.
P="$VERCEL_GIT_PREVIOUS_SHA"
[ -n "$P" ] && git cat-file -e "$P^{commit}" 2>/dev/null && git diff --quiet "$P" HEAD -- . \
  ':(exclude)docs' ':(exclude)scripts' \
  ':(exclude)lib/i18n/locales/de' ':(exclude)lib/i18n/locales/es' ':(exclude)lib/i18n/locales/fr' \
  ':(exclude)lib/i18n/locales/ja' ':(exclude)lib/i18n/locales/no' ':(exclude)lib/i18n/locales/qa' \
  ':(exclude)lib/i18n/locales/zh' ':(exclude,glob)*.md' && exit 0

exit 1
