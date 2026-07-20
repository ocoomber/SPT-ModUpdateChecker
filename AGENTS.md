# AGENTS.md

## Project

Single-file HTML app (`index.html`) that checks SPT (Single Player Tarkov) mod updates via the SPT Forge API. No build step, no dependencies, no tests. All CSS and JS are embedded in the one file.

## Architecture

- `index.html` — the entire app (HTML + embedded CSS + embedded JS)
- Data stored in browser `localStorage` (key: `spt_mod_checker`)
- Fetches from `https://forge.sp-tarkov.com/api/v0` (public, no auth, ~300 req/min)
- Date format: DD-MM-YYYY
- Also fetches SPT release data from GitHub API (`sp-tarkov/build`)

## API

- Mod details: `GET /api/v0/mod/{id}?include=versions`
- Search: `GET /api/v0/mods?query={q}&per_page=10`
- Addons: `GET /api/v0/addons?filter[mod_id]={id}&include=versions&per_page=50`
- SPT releases: `GET /api.github.com/repos/sp-tarkov/build/releases/latest`
- Use `versions[0].published_at` for the real update date (not `mod.updated_at`)

## Key behaviors

- Page auto-checks for updates on load
- SPT release panel shows current vs latest version with "Got this version" button
- "I have this" button records confirmation date; next check compares mod update date vs confirmation date
- Addons are auto-discovered per parent mod, displayed as collapsible children under a parent row
- Addons excluded from "Need Update" count unless confirmed by user
- `removeMod` also removes child addons
- `sortTable` groups parent+addons before sorting to avoid breaking hierarchy
- `filterTable` uses CSS class (`filtered-out`) not inline styles to avoid overriding addon visibility
- Export/import backs up localStorage to JSON; export filename is `mods.json`

## CI / daily checks

- `.github/workflows/check-updates.yml` — GitHub Actions workflow, runs daily at 8 AM
- `scripts/check.js` — Node.js script (no npm deps) called by the workflow
- Reads `mods.json` (app export format) and `state.json` (last known versions)
- Checks SPT release (via `gh` CLI) + every tracked mod + addons (Forge API) in batches of 5
- Writes `result.json` with change summary; creates a GitHub Issue only if `.changed` is true
- `state.json` committed back to repo automatically on every run
- To set up: export from app (Export button) → save as `mods.json` in repo root
- No SMTP or external services needed — notifications come via GitHub Issues

## Files

- `index.html` — the app
- `.github/workflows/check-updates.yml` — daily cron workflow
- `scripts/check.js` — headless checker script
- `mods.json` — user-managed mod list (exported from app)
- `state.json` — auto-managed last-known-versions cache
- `result.json` — ephemeral check output (gitignored)

## Conventions

- All code (app) lives in one file; keep it that way
- No external libraries or frameworks
- Dark theme (GitHub-inspired palette)
