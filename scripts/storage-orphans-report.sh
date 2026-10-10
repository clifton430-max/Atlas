#!/usr/bin/env bash
# Operator report of orphaned pin-image uploads (files with no pin_images row),
# grouped by owner folder. READ-ONLY: prints counts and sizes, deletes nothing.
# Uses the logged-in, linked Supabase CLI (no secrets needed).
# Users can remove their own orphans in Settings → Pins → Unused uploads.
set -euo pipefail
MIN_AGE="${1:-1 hour}"
supabase db query --linked "select * from public.orphaned_pin_image_report(interval '${MIN_AGE//\'/}')"
