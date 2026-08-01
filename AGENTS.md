# Calendar Plus — conventions for agents

General Obsidian plugin knowledge (API patterns, the 36 `eslint-plugin-obsidianmd`
rules, CSS/theme rules, submission requirements, the CLI dev loop) lives in the
`obsidian-plugin-dev` skill. **Read that skill first.** This file covers only what
is specific to this project.

## What this plugin is

A calendar for periodic notes, extensible by other plugins. It is a
reimplementation of Liam Cain's Calendar plugin (MIT, unmaintained since 2024),
written from scratch in plain TypeScript.

Two goals, in order:

1. **Parity.** Anything the original does, this does — same interactions, same
   feel. A user switching over should not miss anything.
2. **Extensibility.** Other plugins contribute per-cell information through a
   public API instead of us hardcoding every feature.

Deliberate non-goals:

- **No Svelte, no Rollup, no framework.** Plain TS with `createEl`, which is the
  idiomatic Obsidian approach and the reason this rewrite exists.
- **No `obsidian-calendar-ui` or `obsidian-daily-notes-interface`.** Both are
  unmaintained. Periodic note configuration is read directly from core Daily
  notes and the Periodic Notes plugin's data.
- **Zero runtime dependencies.**

## Environment

- Package manager: **pnpm**. Never `npm install` or `yarn`.
- `pnpm dev` watches, rebuilds and reloads the plugin in the running Obsidian
  through the official CLI. `OBSIDIAN_VAULT` picks the vault (default
  `my-obsidian-plugins`), `OBSIDIAN_RELOAD=0` disables the reload.
- The repo is symlinked into the test vault at
  `~/dev/my-obsidian-plugins/.obsidian/plugins/calendar-plus`.
- The **original `calendar` plugin is installed in the test vault on purpose**, as
  the reference for parity. Open both side by side and compare.
- **Never develop against the real vault** (`DiarioZK`).

## Architecture

```
src/
  main.ts            # lifecycle only
  api/
    types.ts         # THE PUBLIC CONTRACT — see below
    calendar-api.ts  # implementation of the source registry and events
  calendar/          # the view and its rendering, plain TS
  periodic/          # config reading, date ⇄ file resolution, creation
  sources/           # built-in sources, written against the public API
  settings.ts
```

### `api/types.ts` is a contract, not an implementation detail

It is copied verbatim by consumer plugins. Therefore:

- **Do not change its shape without bumping `CalendarPlusApi.version`.** Adding
  an optional field is fine; renaming or removing anything is not.
- Keep it free of imports from the rest of `src/`. Only `obsidian` types.
- Every exported member needs a doc comment. This file is the documentation.

### Sources are called on every render

`getMetadata` runs once per visible cell, per source, on every repaint. It must
read from memory. If a built-in source needs vault data, it maintains its own
cached index and calls `refresh(id)` when that index changes — it does not read
files inside `getMetadata`.

### Dogfooding is mandatory

The three built-in sources (notes-exist, word-count, tags) are written **against
the public API**, exactly as an external plugin would. If something is awkward to
express there, the API is wrong and the API gets fixed — not worked around with
privileged internal access.

## Parity checklist

Verify each of these against the original plugin in the test vault before
considering the calendar done:

- [ ] Month grid, weekday headers, week numbers (toggleable)
- [ ] Previous/next month navigation and a "today" affordance
- [ ] Click a day → open its note; create it if missing (respecting the
      "confirm before create" setting)
- [ ] `Cmd/Ctrl+click` → open in a new tab
- [ ] Click a week number → weekly note, same behavior
- [ ] Hover a day → Obsidian's native page preview
- [ ] Right-click a day → context menu
- [ ] The day of the currently active note is highlighted
- [ ] Week start setting, plus locale override
- [ ] "Today" advances at midnight without a reload (1-minute heartbeat)
- [ ] Dots for existing notes, word count, tags

## Verification

```bash
pnpm build && pnpm lint
obsidian vault="my-obsidian-plugins" dev:errors      # must be empty
obsidian vault="my-obsidian-plugins" dev:screenshot path=/tmp/cal.png
obsidian vault="my-obsidian-plugins" eval code="app.plugins.plugins['calendar-plus'].api.version"
```

## Styling

`styles.css` uses **only** Obsidian CSS variables — no literal colors, ever. The
original plugin's class names are worth mirroring where practical, so users'
existing CSS snippets keep working. Verify in both light and dark themes.
