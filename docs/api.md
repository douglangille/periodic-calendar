# The Calendar Plus API

Calendar Plus is a calendar other plugins can write on. Instead of the calendar
hardcoding every feature someone might want on a day cell, it asks the plugins
that are installed. A plugin that registers a **source** gets to put dots, a
number, CSS classes and a tooltip on every cell the user can see, add items to a
cell's context menu, accept drops on a date, and put a figure in the footer.

This document is the reference. The machine-readable version of the same thing is
[`src/api/types.ts`](../src/api/types.ts) — every member is documented in place,
and that file is the contract.

The three sources that ship with the plugin, in
[`src/sources/`](../src/sources/), are written against this API with no
privileged access. They are the reference implementation; if something here is
unclear, read them.

## Contents

- [Getting the API](#getting-the-api)
- [Registering a source](#registering-a-source)
- [What a source contributes to a cell](#what-a-source-contributes-to-a-cell)
- [Numbers, and how they are scaled](#numbers-and-how-they-are-scaled)
- [Styling what you contribute](#styling-what-you-contribute)
- [Keeping your data fresh](#keeping-your-data-fresh)
- [Resolving periodic notes](#resolving-periodic-notes)
- [Context menus and drops](#context-menus-and-drops)
- [The footer](#the-footer)
- [Opening and moving the calendar](#opening-and-moving-the-calendar)
- [Events](#events)
- [What the calendar guarantees](#what-the-calendar-guarantees)
- [Versioning](#versioning)

## Getting the API

Copy [`src/api/types.ts`](../src/api/types.ts) into your own plugin — say as
`src/calendar-plus-api.ts` — rather than importing from this repository. It
imports nothing but `obsidian` types, so it drops in anywhere, and your plugin
keeps building on a machine where Calendar Plus does not exist.

Then reach the API through one function that is allowed to return `null`:

```ts
import type { App } from 'obsidian';
import type { CalendarPlusApi } from './calendar-plus-api';

export function getCalendarPlusApi(app: App): CalendarPlusApi | null {
	const plugins = (app as App & { plugins?: { plugins?: Record<string, unknown> } }).plugins;
	const plugin = plugins?.plugins?.['calendar-plus'] as { api?: CalendarPlusApi } | undefined;
	return plugin?.api?.version === 1 ? plugin.api : null;
}
```

Two things that are not optional:

- **Check `version`.** A future contract version 2 would change shapes; a
  consumer that checked would switch its integration off, and one that did not
  would crash inside somebody else's plugin.
- **Treat `null` as a supported state**, not an error. Most users will not have
  Calendar Plus installed. Degrade visibly if you like (a notice when the user
  asks for the feature), never silently break.

**Calendar Plus may be enabled after your plugin.** `app.plugins` extends
`Events` and fires `changed` on every enable, disable and uninstall, so a lookup
that runs once in `onload` will miss it. Re-check in three places and make the
sync idempotent:

```ts
override async onload(): Promise<void> {
	this.app.workspace.onLayoutReady(() => this.syncCalendar());
	// `app.plugins` is not in the public typings, but it does extend `Events`.
	const plugins = (this.app as unknown as { plugins: Events }).plugins;
	this.registerEvent(plugins.on('changed', () => this.syncCalendar()));
	this.syncCalendar(); // catches a Calendar Plus that is already loaded
}
```

## Registering a source

```ts
const api = getCalendarPlusApi(this.app);
if (api) {
	this.register(
		api.registerSource({
			id: 'my-plugin',
			name: 'My plugin',
			getMetadata: (date, granularity) => {
				const count = this.index.countIn(date, granularity);
				if (count === 0) return null;
				return { value: count, tooltip: `${String(count)} items` };
			},
		})
	);
}
```

- **`id`** — stable and unique. Convention: your plugin's id. It namespaces every
  CSS class you contribute and it is the key the user's on/off choice is stored
  under, so changing it later resets that choice.
- **`name`** — human-readable, sentence case. It labels your toggle in the
  Calendar Plus settings, so it should read as *your* feature: the user sees it
  next to "Existing notes" and "Word count".
- **`registerSource` returns its own unregister function.** Pass it to
  `this.register()` and disabling your plugin leaves nothing behind. Registering
  an id that already exists replaces the previous source, and the superseded
  unregister function then does nothing.

The user can turn your source off from the **Sources** section of settings. A
source that is off is never queried and contributes no footer card. Your toggle
appears there even if you register long after Obsidian started.

## What a source contributes to a cell

```ts
getMetadata(date: Moment, granularity: Granularity):
	CellMetadata | null | Promise<CellMetadata | null>;
```

`date` is the **first moment of the period** — the first day of the month for a
`month` cell, the first day of the week for a `week` cell. `granularity` is one
of `day`, `week`, `month`, `quarter`, `semester`, `year`.

You are asked about **every cell on screen**, and that includes the header's
period buttons, so the same source can show a day's figure and the month's
total. Return `null` to contribute nothing to a cell.

`CellMetadata` has five optional fields:

| Field | Type | What it does |
|---|---|---|
| `dots` | `Dot[]` | Small markers in the cell. Keep it to a handful; space is tight. |
| `value` | `number` | A magnitude, rendered as a number or as a background intensity depending on the user's setting. |
| `valueScale` | `number` | The maximum `value` is measured against — see below. |
| `classes` | `string[]` | Extra classes on the cell element, for your own CSS. |
| `tooltip` | `string` | Plain text, shown on hover. No markup. |

A `Dot` is `{ className?, color?, isFilled? }`. `color` must be a CSS variable or
a value derived from one — `var(--color-green)`, never a literal hex — because
the calendar has to follow the user's theme in both light and dark mode. Filled
dots read as "present", hollow ones as "pending".

**When several sources answer for the same cell**, in registration order: dots
are concatenated, classes are concatenated, tooltips are joined with newlines,
and values are **summed**.

`getMetadata` runs **once per visible cell on every repaint** — roughly fifty
calls per paint, and a paint happens on every navigation. So it must read from an
in-memory index and must never touch the vault. If your data comes from files,
index it on vault and `metadataCache` events and call `refresh()` when the index
changes.

Returning a promise is allowed and is the right answer for a lazily built index:
contribute nothing now, queue the work, and the cell updates when it resolves. A
result from a repaint that has already been superseded is discarded rather than
painted over the current one, so a slow source cannot show last month's data.

## Numbers, and how they are scaled

Whether `value` is visible at all is the user's **Numbers from sources** setting:
hidden (the default), printed as a number, or mapped to a background intensity in
five buckets.

`valueScale` decides what the intensity is measured against, and picking right
matters:

- **Declare it when you know your own range.** A percentage is
  `valueScale: 100`; a target of ten tasks a day is `valueScale: 10`. The shading
  then means the same thing in every month, so moving between months does not
  make an ordinary day look busy.
- **Omit it and the calendar scales against the largest value on screen**, per
  granularity. Per granularity is what stops a month button holding a whole
  month's total from flattening every day cell to the palest bucket. This is the
  right choice when your numbers have no natural ceiling.

```ts
getMetadata: (date, granularity) => {
	const count = this.index.countIn(date, granularity);
	if (count === 0) return null;
	return {
		value: count,
		// A day has a known target; the period totals do not.
		valueScale: granularity === 'day' ? 10 : undefined,
		dots: count > 5 ? [{ className: 'busy', isFilled: true }] : [],
	};
},
```

## Styling what you contribute

Every class you contribute — a `Dot.className` and everything in
`CellMetadata.classes` — reaches the DOM as **`<source-id>-<class>`**, sanitized:
characters that cannot appear in a class name become hyphens, runs of hyphens
collapse, and a token that would start with a digit is prefixed with `_`. A class
that sanitizes to nothing is dropped.

So a source with `id: 'my-plugin'` contributing `className: 'busy'` styles it as:

```css
.calendar-plus-view .dot.my-plugin-busy {
	--calendar-plus-dot-color: var(--color-orange);
}
```

The namespace is why two sources can both call their dot `dot` without
colliding, and why a user's snippet can restyle or hide exactly one source's
contribution. Ship that CSS in your own plugin's `styles.css`.

## Keeping your data fresh

```ts
refresh(sourceId?: string): void;
```

Call it whenever your index changes, debounced. Pass your own id to say that only
your data changed; treat that as a hint rather than a guarantee of narrower work.
`refresh()` with no id rebuilds the grid.

It is a silent no-op when no calendar view is open, so it is cheap enough to call
unconditionally from a vault listener. Naming a source that has been sidelined
for throwing also revives it.

## Resolving periodic notes

```ts
resolveNote(date: Moment, granularity: Granularity): TFile | null;
```

The note for a period, or `null` when it does not exist or when the user has not
configured that granularity. Working this out yourself would mean re-reading core
Daily notes' settings and the Periodic Notes plugin's data file and reimplementing
the format resolution; the calendar already did it, so it answers.

Note the direction: **date → note, and not the reverse.** There is deliberately
no "is this file a periodic note?" call, because it would invite sources to sweep
the whole vault. The built-in `word-count` and `tags` sources index **lazily**
instead: the first time the calendar asks about a period they queue the read and
contribute nothing, and the answer lands on the next repaint. At most a screenful
of notes is ever read, whatever the size of the vault. Do the same.

## Context menus and drops

```ts
api.registerSource({
	id: 'my-plugin',
	name: 'My plugin',
	getMetadata: () => null,
	// Asked on dragover, so it must be synchronous and cheap. Omit it and your
	// source is assumed interested in every drag, which makes cells look
	// droppable for payloads nobody will take.
	canDrop: (date, granularity, evt) =>
		evt.dataTransfer?.types.includes('text/plain') === true,
	// The first source to return true consumes the drop.
	onDrop: (date, granularity, evt) => {
		const path = evt.dataTransfer?.getData('text/plain');
		if (!path) return false;
		void this.schedule(path, date);
		return true;
	},
	onContextMenu: (date, granularity, menu) => {
		menu.addItem((item) =>
			item.setTitle('Do my thing').onClick(() => void this.doMyThing(date))
		);
	},
});
```

Drops and context menus reach **every** cell, header period buttons included, so
check `granularity` rather than assuming a day.

## The footer

A source may contribute cards to the strip under the grid, covering the period
the calendar is displaying. `getSummary` is called **once per repaint**, not once
per cell, so it may be a little more expensive than `getMetadata` — but still
read from memory.

```ts
api.registerSource({
	id: 'my-plugin',
	name: 'My plugin',
	getMetadata: () => null,
	getSummary: (from, to) => {
		const done = this.index.countBetween(from, to);
		if (done === 0) return null; // nothing to say, no card
		return [
			{
				label: 'Done',
				value: String(done),  // already formatted for display
				icon: 'check',        // optional Lucide id
				tooltip: `${String(done)} tasks completed this month`,
				// Omit onClick and the card is not interactive — one that looks
				// pressable and does nothing is worse than a plain figure.
				onClick: () => void this.openReport(from, to),
			},
		];
	},
});
```

`from` and `to` are the **displayed month**, inclusive — not the 42 days the grid
draws. The header says "August 2026", so a figure that quietly counted three days
of July would contradict it.

Keep `value` glanceable and pre-formatted: `"23"`, `"14.2k"`, `"3 days"`. The
footer is a strip in a sidebar, not a report. The user's **Maximum cards**
setting caps how many cards are rendered in total, so a card is a request, not a
promise.

## Opening and moving the calendar

```ts
await api.openView();                    // opens it, or reveals the open one
api.revealDate(window.moment(), 'day');  // the promise guarantees this lands
```

- **`openView()`** exists so you never hardcode the view type — a string outside
  this contract that could change without a version bump. Its promise resolves
  only once the view really exists, so a `revealDate()` right after it always
  finds a calendar to move. Overlapping calls share one open, so calling it twice
  without awaiting cannot produce two calendars.
- **`revealDate(date, granularity)`** switches the calendar to the month
  containing `date`. It is a no-op when no calendar is open — `await openView()`
  first. `granularity` only decides which cell takes keyboard focus: the grid
  always displays a month, so revealing a quarter and revealing a day inside it
  land on the same view.
- **`getDisplayedMonth()`** returns the displayed month as a moment at its first
  day, answering for the first open view, or the current month when none is open.

## Events

Each `on()` returns its unsubscribe function.

```ts
this.register(api.on('cell-click', (date, granularity, evt) => { /* … */ }));
this.register(api.on('month-change', (displayedMonth) => { /* … */ }));
this.register(api.on('date-drop', (date, granularity) => { /* … */ }));
```

`cell-click` fires for mouse **and** keyboard activation, at every granularity
including the header buttons — check `granularity`. `date-drop` fires after a
drop was accepted by some source.

## What the calendar guarantees

- **Your bugs stay yours.** A `getMetadata` or `getSummary` that throws is caught
  and logged; after three consecutive throws your source stops being queried
  until it calls `refresh(id)` or registers again. Its toggle says so in
  settings. A broken source can never take the calendar down.
- **Superseded results are dropped, never painted.** Every repaint opens a
  numbered pass, and a promise only paints if its cell is still on that pass and
  still in the document.
- **Your classes cannot collide** with another source's, because of the
  namespacing above.
- **A card's click handler that throws** costs you only your card.
- **The user is in charge.** Your source has a toggle, and off means not queried
  at all.

## Versioning

`CalendarPlusApi.version` is `1`. Adding an optional field is not a breaking
change; renaming or removing anything is, and requires a version bump with the
previous shape kept working for at least one minor release.

Check for `version === 1` exactly, as in
[Getting the API](#getting-the-api), and a hypothetical version 2 will leave your
integration switched off rather than crashing it.
