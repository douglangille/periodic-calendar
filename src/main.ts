import { Notice, Plugin, type Events, type Menu, type TFile } from 'obsidian';
import {
	CalendarApiRegistry,
	type CalendarApiHost,
	type CalendarSurface,
} from './api/calendar-api';
import type { PeriodicCalendarApi, Granularity, SummaryCard } from './api/types';
import { clampCardLimit, resolveDisabledSources, resolveVisualDefaults } from './domain/settings';
import {
	CALENDAR_VIEW_TYPE,
	CalendarView,
	type CalendarViewHost,
} from './calendar/calendar-view';
import type { CalendarCell, HoverMode, ValueDisplay } from './calendar/day-cell';
import { resetLanguage, t, type TranslationKey } from './i18n';
import { GRANULARITIES, PeriodicConfigStore } from './periodic/config';
import { openPeriodicNote } from './periodic/create';
import {
	applyLocalePreferences,
	getPeriodicNote,
	parsePeriodicNote,
	type Moment,
} from './periodic/resolve';
import {
	PeriodicCalendarSettingTab,
	DEFAULT_DISABLED_SOURCES,
	DEFAULT_SETTINGS,
	MAX_SUMMARY_CARDS,
	isSourceEnabled,
	type PeriodicCalendarSettings,
	type SettingsHost,
	type SourceToggle,
} from './settings';
import type { SourceContext } from './sources/context';
import { NotesExistSource } from './sources/notes-exist';
import { TagsSource } from './sources/tags';
import { WordCountSource } from './sources/word-count';

/**
 * Command ids per granularity, kept free of the plugin name and of "command".
 *
 * Ids are **never** translated: they are the stable identifier a user's hotkey
 * and another plugin's `executeCommandById` are bound to. Only the name is.
 */
const OPEN_COMMANDS: Record<Granularity, string> = {
	day: 'open-daily-note',
	week: 'open-weekly-note',
	month: 'open-monthly-note',
	quarter: 'open-quarterly-note',
	semester: 'open-semester-note',
	year: 'open-yearly-note',
};

/** Dictionary key for each open command's visible name. */
const OPEN_COMMAND_NAMES: Record<Granularity, TranslationKey> = {
	day: 'commandOpenDailyNote',
	week: 'commandOpenWeeklyNote',
	month: 'commandOpenMonthlyNote',
	quarter: 'commandOpenQuarterlyNote',
	semester: 'commandOpenSemesterNote',
	year: 'commandOpenYearlyNote',
};

export default class PeriodicCalendarPlugin
	extends Plugin
	implements CalendarViewHost, SettingsHost, CalendarApiHost
{
	settings: PeriodicCalendarSettings = { ...DEFAULT_SETTINGS };
	configs: PeriodicConfigStore = new PeriodicConfigStore(this.app, () => this.settings);

	private readonly registry = new CalendarApiRegistry(this);
	private settingTab: PeriodicCalendarSettingTab | null = null;
	/**
	 * The open in flight, if any. Two calls that overlap share it, so a consumer
	 * that fires `openView()` twice without awaiting cannot end up with two leaves.
	 */
	private opening: Promise<void> | null = null;

	/**
	 * The public API, reachable at `app.plugins.plugins['periodic-calendar-plus'].api`.
	 * See `src/api/types.ts` for the contract.
	 */
	readonly api: PeriodicCalendarApi = this.registry;

	override async onload(): Promise<void> {
		// Obsidian's language is read once and cached; clearing it here means a
		// plugin reload is enough to pick up a change, without restarting the app.
		resetLanguage();
		await this.loadSettings();
		applyLocalePreferences(this.settings.localeOverride, this.settings.weekStart);
		await this.configs.reload();

		this.registerView(CALENDAR_VIEW_TYPE, (leaf) => new CalendarView(leaf, this));
		// Page preview shows this name in its settings; taking it from the
		// manifest keeps the two in sync.
		this.registerHoverLinkSource(CALENDAR_VIEW_TYPE, {
			display: this.manifest.name,
			defaultMod: false,
		});
		// Sources before the settings tab: the tab captures the source list when
		// it is constructed, so a late source would have no toggle.
		this.addBuiltInSources();
		this.settingTab = new PeriodicCalendarSettingTab(this.app, this);
		this.addSettingTab(this.settingTab);

		this.addCommand({
			id: 'open-view',
			name: t('commandOpenView'),
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: 'reveal-active-note',
			name: t('commandRevealActiveNote'),
			callback: () => this.revealActiveNote(),
		});

		for (const granularity of GRANULARITIES) {
			this.addCommand({
				id: OPEN_COMMANDS[granularity],
				name: t(OPEN_COMMAND_NAMES[granularity]),
				callback: () =>
					void openPeriodicNote(this.app, window.moment(), granularity, this.configs, {
						confirmBeforeCreate: this.settings.confirmBeforeCreate,
					}),
			});
		}

		// Periodic Notes announces its own setting changes; picking them up avoids
		// waiting for the next heartbeat. The event is not in the public typings,
		// so it goes through the generic `Events.on` signature.
		const workspaceEvents: Events = this.app.workspace;
		this.registerEvent(
			workspaceEvents.on('periodic-notes:settings-updated', () => {
				void this.reloadConfigs();
			})
		);

		this.addRibbonIcon('calendar-days', t('ribbonOpenCalendar'), () => void this.activateView());

		// The view is deliberately not opened on load: Obsidian restores sidebar
		// leaves asynchronously, so an auto-open here creates a duplicate leaf on
		// every plugin reload. The ribbon icon and the command open it instead.
		this.app.workspace.onLayoutReady(() => void this.reloadConfigs());
	}

	async loadSettings(): Promise<void> {
		const stored: unknown = await this.loadData();
		// `loadData()` answers null when the vault has no `data.json`, which is the
		// only honest signal that nobody has ever configured this plugin here.
		const record =
			typeof stored === 'object' && stored !== null
				? (stored as Partial<PeriodicCalendarSettings>)
				: null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, record ?? {});

		// Two built-in sources ship turned off, but only for a vault that has never
		// stored anything. An existing user's list is copied through untouched and
		// marked as settled, so no later version can decide to turn off something
		// they switched on by hand. See `resolveDisabledSources` for the reasoning.
		const decision = resolveDisabledSources(
			record?.sourceDefaultsApplied === true,
			record !== null,
			record?.disabledSources,
			DEFAULT_DISABLED_SOURCES
		);
		this.settings.disabledSources = decision.disabledSources;
		this.settings.sourceDefaultsApplied = true;

		// The two display settings, on the other hand, *are* migrated once — the
		// combination they used to default to rendered a source's numbers nowhere.
		// The stored values are read from `record`, not from the merged settings,
		// where a fresh install is already indistinguishable from the new defaults.
		const visual = resolveVisualDefaults(
			record?.visualDefaultsApplied === true,
			{ valueDisplay: record?.valueDisplay, hoverMode: record?.hoverMode },
			{ valueDisplay: DEFAULT_SETTINGS.valueDisplay, hoverMode: DEFAULT_SETTINGS.hoverMode }
		);
		if (visual.valueDisplay !== null) this.settings.valueDisplay = visual.valueDisplay as ValueDisplay;
		if (visual.hoverMode !== null) this.settings.hoverMode = visual.hoverMode as HoverMode;
		this.settings.visualDefaultsApplied = true;

		this.settings.maxSummaryCards = clampCardLimit(
			this.settings.maxSummaryCards,
			DEFAULT_SETTINGS.maxSummaryCards,
			MAX_SUMMARY_CARDS
		);
		// A mark is worthless until it is on disk: without this write the next load
		// would see an unmarked install again and re-run the decisions.
		if (decision.markApplied || visual.markApplied) await this.saveSettings();

		this.configs.applySemesterSettings();
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** Called by the settings tab after any change. */
	onSettingsChanged(): void {
		applyLocalePreferences(this.settings.localeOverride, this.settings.weekStart);
		this.configs.applySemesterSettings();
		for (const view of this.calendarViews) view.repaint();
	}

	async refreshConfigs(): Promise<boolean> {
		return this.configs.reload();
	}

	// ------------------------------------------------------- API host seams

	/** Every open calendar, for the registry to drive. */
	getSurfaces(): readonly CalendarSurface[] {
		return this.calendarViews;
	}

	/**
	 * Backs the public `openView`. Same path as the ribbon icon and the command,
	 * so a consumer never has to know the view type — and the promise it returns
	 * guarantees `getSurfaces()` is no longer empty, which is what makes an
	 * immediately following `revealDate()` do something.
	 */
	openView(): Promise<void> {
		return this.activateView();
	}

	isSourceEnabled(sourceId: string): boolean {
		return isSourceEnabled(this.settings, sourceId);
	}

	/** Registered sources, for the per-source toggles in settings. */
	listSources(): SourceToggle[] {
		return this.registry.listSources();
	}

	/** A plugin registered or dropped a source: the toggles have to follow. */
	onSourcesChanged(): void {
		this.settingTab?.refreshDefinitions();
	}

	/**
	 * Backs the public `resolveNote`. This is the one thing every source needs
	 * and could not work out for itself without re-reading the vault's periodic
	 * note configuration, so the calendar — which already reads it — answers.
	 */
	resolveNote(date: Moment, granularity: Granularity): TFile | null {
		const config = this.configs.get(granularity);
		return config.enabled ? getPeriodicNote(this.app, date, config) : null;
	}

	// ------------------------------------------------------ view host seams

	decorateCell(cell: CalendarCell): void {
		this.registry.decorate(cell);
	}

	decorateMenu(date: Moment, granularity: Granularity, menu: Menu): void {
		this.registry.decorateMenu(date, granularity, menu);
	}

	acceptsDrop(date: Moment, granularity: Granularity, evt: DragEvent): boolean {
		return this.registry.acceptsDrop(date, granularity, evt);
	}

	handleDrop(date: Moment, granularity: Granularity, evt: DragEvent): boolean {
		return this.registry.handleDrop(date, granularity, evt);
	}

	notifyCellClick(
		date: Moment,
		granularity: Granularity,
		evt: MouseEvent | KeyboardEvent
	): void {
		this.registry.emitCellClick(date, granularity, evt);
	}

	notifyMonthChange(displayedMonth: Moment): void {
		this.registry.emitMonthChange(displayedMonth);
	}

	/** The footer's figures, once per repaint, from the enabled sources. */
	collectSummary(
		from: Moment,
		to: Moment,
		apply: (cards: readonly SummaryCard[]) => void
	): void {
		this.registry.collectSummary(from, to, apply);
	}

	/**
	 * Views are looked up on demand instead of being cached on the plugin, so a
	 * closed view is never kept alive by a stale reference.
	 */
	private get calendarViews(): CalendarView[] {
		return this.app.workspace
			.getLeavesOfType(CALENDAR_VIEW_TYPE)
			.map((leaf) => leaf.view)
			.filter((view): view is CalendarView => view instanceof CalendarView);
	}

	/**
	 * Dogfooding: the three built-in sources go through `registerSource` like any
	 * other plugin, with no privileged access whatsoever. The date ⇄ note mapping
	 * they used to receive as an injected resolver is now `api.resolveNote()`,
	 * part of the published contract, so there is nothing left to inject.
	 */
	private addBuiltInSources(): void {
		const context: SourceContext = {
			app: this.app,
			api: this.api,
			getWordsPerDot: () => this.settings.wordsPerDot,
		};
		this.addChild(new NotesExistSource(context));
		this.addChild(new WordCountSource(context));
		this.addChild(new TagsSource(context));
	}

	private async reloadConfigs(): Promise<void> {
		if (await this.configs.reload()) {
			for (const view of this.calendarViews) view.repaint();
		}
	}

	/**
	 * Opens the calendar, or reveals the one already open, and resolves only once
	 * the view really exists — never with a leaf whose view is still a deferred
	 * placeholder, because `calendarViews` filters those out and the caller would
	 * see an empty calendar list right after being told the view was open.
	 *
	 * Overlapping calls share one promise: leaves are looked up before the first
	 * `await`, so two independent runs would both find nothing and open two.
	 */
	private activateView(): Promise<void> {
		this.opening ??= this.openCalendarLeaf().finally(() => {
			this.opening = null;
		});
		return this.opening;
	}

	private async openCalendarLeaf(): Promise<void> {
		// Sidebar leaves are restored asynchronously, so before the layout is
		// ready a lookup can report no calendar when one is about to reappear —
		// which is the duplicate-leaf bug that keeps the view out of `onload`.
		if (!this.app.workspace.layoutReady) {
			await new Promise<void>((resolve) => {
				this.app.workspace.onLayoutReady(resolve);
			});
		}
		const existing = this.app.workspace.getLeavesOfType(CALENDAR_VIEW_TYPE)[0];
		const leaf = existing ?? this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		if (!existing) await leaf.setViewState({ type: CALENDAR_VIEW_TYPE, active: true });
		// `revealLeaf` uncollapses the sidebar and awaits the view's load, so a
		// deferred leaf stops being deferred here; the check after it is belt and
		// braces for a leaf that was revealed without being loaded.
		await this.app.workspace.revealLeaf(leaf);
		if (leaf.isDeferred) await leaf.loadIfDeferred();
	}

	private revealActiveNote(): void {
		const file = this.app.workspace.getActiveFile();
		const period = file ? parsePeriodicNote(file, this.configs) : null;
		if (!period) {
			new Notice(t('noticeNotPeriodicNote'));
			return;
		}
		const views = this.calendarViews;
		if (views.length === 0) {
			void this.activateView().then(() => {
				for (const view of this.calendarViews) {
					view.revealDate(period.date, period.granularity);
				}
			});
			return;
		}
		for (const view of views) view.revealDate(period.date, period.granularity);
	}
}
