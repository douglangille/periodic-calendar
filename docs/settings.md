# Settings reference

Every control in **Settings → Community plugins → Calendar Plus**, in the order
the tab shows them. What the concepts mean is in the
[user guide](user-guide.md); this page is the reference for what each control
does and what it defaults to.

<!-- SCREENSHOT: the settings tab scrolled to the Sources group, showing the three
     built-in toggles plus at least one registered by another plugin, so the
     "any plugin gets a toggle" claim is visible. -->

## Week

| Setting | Default | What it does |
|---|---|---|
| **Start week on** | Locale default | Which weekday the grid's first column is. "Locale default" follows the active `moment` locale. |
| **Override locale** | Same as Obsidian | Renders month and weekday names in another language, chosen from `moment`'s own locale list. Also changes the week numbering rules, so it affects weekly note filenames. |
| **Show week numbers** | On | The week column on the left of the grid. Clicking a week number opens that week's note. |

Overriding the locale changes more than labels: week numbering and the first day
of the week are locale rules, and weekly note filenames are built with them. Set
it to match how you want `gggg-[W]ww` resolved.

## Notes

| Setting | Default | What it does |
|---|---|---|
| **Confirm before creating a note** | On | Asks before creating a note that does not exist. Off means a click on an empty day creates it immediately. |
| **Show period shortcuts** | On | The `2026 · S2 · Q3 · Aug` row above the grid. Only configured periods appear in it. |
| **Numbers from sources** | Hidden | What to do with the numeric value sources report: **hidden**, printed as a **number** in the cell, or mapped to a background **intensity** in five buckets. Values from several sources are summed. |
| **Hovering a day shows** | The note's preview | **The note's preview** (Obsidian's page preview popover), **a summary** (a tooltip with what the sources report), or **nothing**. See [Hovering](user-guide.md#hovering). |

"Numbers from sources" defaults to hidden because the built-in sources that report
numbers ship off; turn on **Word count** and switch this to number or intensity to
see the effect.

## Sources

One toggle per registered source, built-in or not. Sources that other plugins
register appear here too, including those that register long after Obsidian
started — the list refreshes itself.

| Setting | Default | What it does |
|---|---|---|
| **Existing notes** | On | A dot on every period whose note already exists. |
| **Word count** | Off | Dots and a value from the period note's word count. |
| **Tags** | Off | A colored dot per tag on the period's note. |
| **Words per dot** | 250 | How many words each dot of the word count source stands for. |
| *(one per external source)* | On | Whatever that plugin contributes. |

A source that is **off is never queried at all**, and contributes no footer card
either. A source that broke — three consecutive errors — is described as such
under its name and stops being queried until it reports new data.

Sources from other plugins are **on** by default: installing a plugin should show
something. The two built-ins that ship off are only defaulted that way on a vault
with no stored Calendar Plus settings; an existing configuration is never
retroactively changed.

## Footer

| Setting | Default | What it does |
|---|---|---|
| **Show the summary footer** | On | The strip of source cards under the grid. A month with nothing to report shows no strip at all. |
| **Maximum cards** | 4 | How many cards the footer may render, up to 12. Cards past the limit are dropped rather than squeezed. |

The limit exists because the calendar lives in a sidebar and the strip wraps onto
more lines rather than scrolling horizontally. It is how you decide how much
vertical room the footer may take.

## Semester notes

Semesters have no Periodic Notes equivalent, so they are configured here, and they
are **off** until you turn them on.

| Setting | Default | What it does |
|---|---|---|
| **Semester notes** | Off | Enables the semester period: its shortcut button, its cells and its command. |
| **Folder** | Vault root | Where semester notes are created. |
| **Format** | `YYYY-[S]{semester}` | A `moment` format plus the `{semester}` token, which expands to `1` or `2`. |
| **Template** | None | A note used as the template for new semester notes. |

Semester 1 is January to June, semester 2 July to December. The three fields below
the toggle stay disabled until it is on.

## Where the rest of the configuration lives

Calendar Plus stores only what is on this page. Folders, formats and templates for
days, weeks, months, quarters and years belong to the plugins that own them:

- **Days** — Settings → Daily notes (core), or Periodic Notes' `daily`.
- **Weeks, months, quarters, years** — the Periodic Notes plugin.

Changes there are picked up without a reload. See
[The six periods](user-guide.md#the-six-periods) for how each one is resolved.
