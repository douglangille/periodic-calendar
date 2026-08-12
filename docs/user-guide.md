# User guide

Calendar Plus puts a month calendar in your sidebar and wires it to the periodic
notes you already keep. Click a day to open its note. Click a week number for the
weekly note. Use the row above the grid to reach the month, quarter, semester and
year.

It reads your existing configuration — core **Daily notes** and the **Periodic
Notes** plugin — so there is nothing to set up twice.

<!-- SCREENSHOT: the calendar in the right sidebar, showing the month grid with
     week numbers, the period shortcut row (2026 · S2 · Q3 · Aug) and two or three
     footer cards. Light theme. This is the one that goes in the README too. -->

## Contents

- [The view](#the-view)
- [Opening and creating notes](#opening-and-creating-notes)
- [The six periods](#the-six-periods)
- [Semester notes](#semester-notes)
- [Sources](#sources)
- [The summary footer](#the-summary-footer)
- [Hovering](#hovering)
- [Keyboard](#keyboard)
- [Commands](#commands)
- [Language](#language)
- [Styling and snippets](#styling-and-snippets)

## The view

Open it from the ribbon icon or with the **Open view** command. It is a sidebar
view, so you can drag it to either side or into a tab.

- A **month grid** of six fixed rows, so the calendar never changes height as you
  move between months.
- An optional **week number** column on the left, which opens the weekly note.
- The **period shortcut row** — `2026 · S2 · Q3 · Aug` — widest period on the
  left, narrowing to the right, which is the order a date is written in. Only the
  periods you have configured appear.
- Arrows to move a month at a time, and a **today** button that returns to the
  current month.
- An optional **summary footer**: a strip of cards with figures for the month on
  display.

The calendar adapts to how wide you keep the panel, not to the size of the window.
Drag the sidebar narrow and the weekday headers shorten to two letters, the month
name takes its own line above the arrows, and the footer settles into two columns —
down to about 190 px, where everything still fits without a sideways scrollbar — in
the light theme as well as the dark one.

On a phone or a tablet the day cells, the week numbers, the navigation arrows and
any pressable footer card grow to a 44 px touch target, so nothing needs a
fingernail.

Today's date stays correct without a reload: a one-minute heartbeat moves the
highlight across midnight, and picks up configuration changes made elsewhere.

The day of the note you are currently editing is highlighted, so the calendar
also tells you where you are.

## Opening and creating notes

| Action | Result |
|---|---|
| Click a cell | Opens that period's note, creating it if it does not exist |
| `Cmd`/`Ctrl` + click | Opens it in a new tab |
| Right-click | Context menu: open, delete, plus whatever other plugins add |
| Drag something onto a cell | Whatever the source that accepts it does |

When a note does not exist yet, Calendar Plus asks before creating it. That
confirmation is the **Confirm before creating a note** setting; turn it off and a
click on an empty day creates the note straight away.

New notes use the template configured for that period — the one in core Daily
notes or Periodic Notes, and for semesters the one in Calendar Plus settings.

## The six periods

Nothing about your file naming is duplicated in Calendar Plus. Each period is
resolved from the vault's own configuration:

| Period | Configured in | Default format | Example |
|---|---|---|---|
| Day | Periodic Notes `daily`, else core **Daily notes** | `YYYY-MM-DD` | `2026-08-09` |
| Week | Periodic Notes `weekly` | `gggg-[W]ww` | `2026-W32` |
| Month | Periodic Notes `monthly` | `YYYY-MM` | `2026-08` |
| Quarter | Periodic Notes `quarterly` | `YYYY-[Q]Q` | `2026-Q3` |
| Semester | **Calendar Plus settings** | `YYYY-[S]{semester}` | `2026-S2` |
| Year | Periodic Notes `yearly` | `YYYY` | `2026` |

Two details worth knowing:

- An **empty format** in Periodic Notes means "the default for that period", and
  the defaults above are the same ones Periodic Notes uses, so the filenames
  match what it would have created.
- A period with **no configuration is simply not offered**: its shortcut button is
  hidden and its cells do nothing rather than creating notes in a folder you did
  not ask for. If you have not enabled weekly notes in Periodic Notes, the week
  column is visible but inert.

Days only need core **Daily notes**, which Obsidian has built in. Everything
coarser than a day comes from the Periodic Notes plugin — except semesters.

## Semester notes

Periodic Notes has no semester tier, so this one is a Calendar Plus convention
and is **off by default**. Turn it on in settings and point it at a folder.

- **Semester 1** is January to June; **semester 2** is July to December.
- The format is a `moment` format plus one extra token, **`{semester}`**, which
  expands to `1` or `2`. `moment` has no semester token of its own, and `S`
  already means fractional seconds there, so a token of our own is the only
  unambiguous option.
- The default `YYYY-[S]{semester}` produces `2026-S2`.

## Sources

A **source** contributes information to calendar cells: dots, a number, CSS
classes and a tooltip. It is asked about every cell on screen — the days, the
week numbers **and the period shortcut buttons** — so the same source can show a
day's figure and the month's total.

Three ship with the plugin, each with its own on/off toggle in settings:

| Source | Default | What it shows |
|---|---|---|
| **Existing notes** | on | A dot on every period whose note already exists — the classic calendar behaviour, now optional. Footer card: days of the month with a note. |
| **Word count** | off | One dot per *n* words of the period's note, and the count as the cell's value. Footer card: words written in the month. |
| **Tags** | off | A colored dot per tag on the period's note, and a class per tag on the cell. Footer card: different tags used in the month. |

Word count and tags ship **off** because they are demonstrations of the public
API as much as features — useful, but not what most people want painted over
their month by default. Turn them on and they appear immediately.

A source that reports a **number** rather than dots is drawn as a background
shade, which is the **Values from sources** setting and defaults to intensity:
five buckets of the accent colour, so a month reads as a heatmap without any cell
having to spend room on a figure. Switch it to *number* to print the figure
instead, or to *hidden* to drop it — with the caveat that a source whose only
contribution is a number then shows nothing at all.

The shading applies to **day cells only**. Week numbers and the period buttons are
a narrow column and wide blocks; shading those alongside the days turns the grid
into stripes and makes a whole row read as selected. They still carry their
period's figure in the tooltip, and a *number* is printed on them normally.

The period whose note you have open is marked with a **ring**, not a filled cell.
A solid accent cell is indistinguishable from the darkest shade of a heatmap, so
"the note I am reading" and "my busiest day" would be the same picture; the ring
sits on top of any shade without hiding it. Today keeps its accent-coloured number
underneath, and a cell that would accept the drag in progress gets a dashed
outline, so the three states never look alike.

<!-- SCREENSHOT: the same month with all three built-in sources enabled and
     "Values from sources" set to intensity, so the dots and the shaded cells are
     both visible. Dark theme, to show the theme following. -->

**Sources are the point of the plugin.** Any plugin can register one, and when it
does you get a toggle for it in the same list — no configuration, no restart.
[Simple Tasks](https://github.com/alex-roc/simple-tasks) is one example. If you
write plugins, see [the API documentation](api.md).

Two rules about defaults, so nothing surprises you:

- A source arriving **from another plugin is on** by default. Installing a plugin
  should show something.
- Those defaults are only ever applied to a vault that has **no stored settings**
  for Calendar Plus. An existing configuration is left exactly as it is, and a
  mark is written so no later version can turn off something you switched on by
  hand.

Every class a source contributes reaches the DOM prefixed with that source's id,
so two sources that both call their dot `dot` do not collide, and a snippet can
target exactly one of them.

## The summary footer

Under the grid, each enabled source may contribute **cards** — a label, a figure,
an optional icon and an optional tooltip — for the month on display. Not for the
42 days the grid draws: the header says "August 2026", so the figures say August.

A card you can click does something; one you cannot is a plain figure, and it
looks like one.

They are drawn as **small cards** — a figure with its label under it — in a grid
that drops to fewer columns as the sidebar narrows and wraps rather than hiding
cards behind a horizontal scroller. Small on purpose: the calendar is what the
panel is for, and the first version's large numbers in roomy boxes took as much
height as two weeks of the grid. The **Maximum cards** setting bounds how many
lines the strip can ever take, and a month with nothing to report shows no footer
at all rather than an empty stripe.

## Hovering

The **Hovering a day shows** setting has three values:

- **The cell summary** (default) — no popover; the tooltip carries the period
  label plus whatever the sources reported for that cell. This is what tells you
  what a shaded cell is shaded *for*.
- **The note's preview** — Obsidian's own page preview popover, the same one you
  get hovering a link. The cell's tooltip drops back to the bare period label,
  because a tooltip under a popover is noise — so this replaces the summary rather
  than adding to it.
- **Nothing** — no popover and no tooltip.

Screen readers are not part of this trade-off: the full text is always available
as the cell's accessible name, so choosing "Nothing" costs a tooltip, never
information.

## Keyboard

The grid is a single tab stop that remembers where you were. Once inside:

| Key | Moves |
|---|---|
| Arrows | One day left or right, one week up or down |
| `Home` / `End` | First / last day of the week |
| `PageUp` / `PageDown` | Previous / next month |
| `Enter` or `Space` | Opens the focused cell's note |

Movement stops at the edges of the grid rather than wrapping around: pressing Left
in the first column steps onto that row's week number, and pressing Right in the
last column stays put. `PageDown` changes the month under you, so the focus lands
on the same day of the next one.

The period shortcut buttons are ordinary buttons in the tab order, and they come
in the order they are drawn: `2026 → S2 → Q3 → Aug`, then the grid.

## Commands

All of them are in the command palette, and all can take a hotkey:

| Command | What it does |
|---|---|
| **Open view** | Opens the calendar, or reveals it if already open |
| **Reveal active note** | Moves the calendar to the period of the note you are editing |
| **Open daily note** | Today's daily note |
| **Open weekly note** | This week's |
| **Open monthly note** | This month's |
| **Open quarterly note** | This quarter's |
| **Open semester note** | This semester's |
| **Open yearly note** | This year's |

The open commands create the note if it does not exist, respecting the
confirmation setting, exactly like clicking the cell.

## Language

The interface is in **English**, and in **Spanish** when Obsidian's language is
set to Spanish. It follows Obsidian's own setting; there is nothing to configure.
A language with no dictionary falls back to English.

Month and weekday names are not translated by the plugin: they come from `moment`
with the locale the **Override locale** setting resolves to, so they always agree
with the filenames Periodic Notes generates.

Adding a language is one file — copy `src/i18n/en.ts`, translate the values, and
register it in `src/i18n/index.ts`. The keys are typed, so a missing string is a
compile error rather than a blank label. Pull requests welcome.

## Styling and snippets

`styles.css` uses only Obsidian CSS variables, so the calendar follows the active
theme in light and dark mode without any configuration.

Class names mirror the original Calendar plugin — `container`, `calendar`, `nav`,
`title`, `day`, `week-num`, `dot`, `today`, `active`, `adjacent-month`,
`weekend`, `dot-container`, `reset-button`, `arrow` — so snippets written for it
keep working here.

The `--color-*` indirection is the intended override point:

```css
.calendar-plus-view {
	--color-background-weekend: var(--background-secondary);
	--color-dot: var(--color-green);
	--color-text-today: var(--color-orange);
}
```

To restyle one source's dots, use the namespaced class:

```css
.calendar-plus-view .dot.calendar-plus-word-count-word {
	--calendar-plus-dot-color: var(--color-blue);
}
```

Please use Obsidian variables rather than literal colors in your own snippets
too, or the calendar will stop following your theme when you switch it.
