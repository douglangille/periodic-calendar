# Contributing to Periodic Calendar

Thanks for taking the time. Bug reports are as welcome as code — and for a
calendar, a report that names your periodic-note setup is worth more than a
patch that guesses at it.

## Reporting a bug

Open an issue with:

- what you did and what happened instead;
- **how your periodic notes are configured**: the Periodic Notes plugin or the
  core Daily notes one, which granularities you have enabled, and the folder and
  date format of the period that misbehaved;
- your Obsidian version, your platform (desktop or mobile), and your locale if
  the problem is about week numbers, the first day of the week, or a month name.

If a cell opened or created the wrong note, say so in the title. Creating a note
where the user did not ask for one is the worst thing this plugin can do.

## Setting up

Node 22+ and [pnpm](https://pnpm.io) (via corepack). npm and yarn are not used
here — the lockfile is pnpm's.

```bash
pnpm install
pnpm dev      # esbuild in watch mode; writes main.js at the repo root
```

To try it in Obsidian, symlink the repo into a **test** vault rather than your
real one, and let [Hot Reload](https://github.com/pjeby/hot-reload) pick up each
build:

```bash
ln -sfn "$PWD" ~/my-test-vault/.obsidian/plugins/periodic-calendar
```

## Before opening a pull request

```bash
pnpm test     # unit tests of the pure domain, under node --test
pnpm lint     # eslint-plugin-obsidianmd, the same ruleset the directory scans
pnpm build    # type check plus a production bundle
```

All three have to pass. `pnpm lint` must be **clean of warnings**, not just of
errors: the community directory publishes those warnings on the plugin's
scorecard.

## What the code expects of a change

- **The domain stays pure.** Anything under `src/domain/` must not import a
  runtime value from `obsidian`, touch `app` or the DOM. `purity.test.ts`
  enforces it, and that is what keeps the rest testable with `node --test`.
- **Dates go through Obsidian's own `moment`**, never through a hand-rolled week
  calculation: the first day of the week and the week-number rules are the
  user's locale's business, not ours.
- **A cell never creates a note on its own.** Creation is a user action, from a
  click, and it goes through the configured template.
- **Only Obsidian CSS variables** in `styles.css`; no literal colors, ever, and
  check both light and dark themes. Class names mirror the original Calendar
  plugin (`day`, `week-num`, `today`, `active`, …) so snippets written for it
  keep working — renaming one is a breaking change for somebody's snippet.
- **The public API is a contract.** `src/api/` is what other plugins consume;
  changing it incompatibly means bumping its `version`, and the types in
  `docs/api.md` are the documentation.
- **User-visible strings live in `src/i18n/`**, in both `en.ts` and `es.ts`, in
  sentence case.

`AGENTS.md` is the long version of all of this, and `dev-docs/` records why
things are the way they are. Reading the file you are about to change is usually
faster than asking.

## Commits

Conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `style:`), a
subject that says what changed, and a body that says **why** when the why is not
obvious. Present tense, no trailing period.

## License

By contributing you agree that your work is licensed under this repository's
[MIT license](LICENSE).
