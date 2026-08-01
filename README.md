# Calendar Plus

A calendar for your periodic notes in Obsidian — and one that other plugins can
extend.

> Status: in development (0.1.0). Not yet published to the community catalog.

This is a reimplementation of Liam Cain's excellent
[Calendar](https://github.com/liamcain/obsidian-calendar-plugin) plugin, which
has been unmaintained since 2024 and offers no way for other plugins to
contribute to it. Calendar Plus keeps the same simplicity and adds two things:
**all six periodic-note granularities**, and a **public API**.

## Features

- Month view in the sidebar: click a day to open or create its note,
  `Cmd/Ctrl+click` to open in a new tab, click a week number for the weekly note.
- Header access to the **monthly, quarterly, semestral and yearly** notes, not
  just daily and weekly.
- Hover preview, per-day context menu, and highlighting of the active note's day.
- Built-in sources: a dot for notes that exist, word count, and tags.
- Reads your existing configuration from core **Daily notes** and from the
  **Periodic Notes** plugin. No separate setup.
- Every registered source can be toggled in settings.

## For plugin developers

Calendar Plus exposes a versioned API at
`app.plugins.plugins['calendar-plus'].api`. Copy `src/api/types.ts` into your
plugin for the types, and always degrade gracefully when Calendar Plus is not
installed:

```ts
import type { CalendarPlusApi } from './calendar-plus-api';

function getCalendarPlusApi(app: App): CalendarPlusApi | null {
	// @ts-expect-error — plugins is not in the public typings
	const plugin = app.plugins.plugins['calendar-plus'];
	const api = plugin?.api as CalendarPlusApi | undefined;
	return api?.version === 1 ? api : null;
}
```

Then contribute per-cell information:

```ts
const api = getCalendarPlusApi(this.app);
if (api) {
	this.register(
		api.registerSource({
			id: 'my-plugin',
			name: 'My plugin',
			getMetadata: (date, granularity) => {
				if (granularity !== 'day') return null;
				const n = myIndex.countFor(date);
				return n ? { value: n, tooltip: `${n} items` } : null;
			},
		})
	);
}
```

`getMetadata` is called once per visible cell on every render, so read from an
in-memory index — never scan the vault there. Sources can also accept drops
(`onDrop`) and add items to a cell's context menu (`onContextMenu`).

Because Calendar Plus may be enabled *after* your plugin, re-check for the API on
`workspace.onLayoutReady` and when plugins are enabled.

## Development

Requires Node 20+, pnpm, and Obsidian 1.12+ for the CLI-based dev loop.

```bash
pnpm install
pnpm dev           # watch + auto-reload the plugin in Obsidian
pnpm build
pnpm lint
```

See `AGENTS.md` for conventions.

## Credits

Interaction design and feature set derive from
[obsidian-calendar-plugin](https://github.com/liamcain/obsidian-calendar-plugin)
by Liam Cain (MIT). Thank you.

## License

MIT
