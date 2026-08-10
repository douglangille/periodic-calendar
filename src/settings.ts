import {
	PluginSettingTab,
	Setting,
	type App,
	type Plugin,
	type SettingDefinitionItem,
} from 'obsidian';
import { clampCardLimit } from './domain/settings';
import { t } from './i18n';
import { DEFAULT_FORMATS } from './periodic/config';
import type { WeekStart } from './periodic/resolve';
import type { HoverMode, ValueDisplay } from './calendar/day-cell';
import { TAGS_SOURCE_ID, WORD_COUNT_SOURCE_ID } from './sources/ids';

/**
 * Built-in sources that ship turned **off**.
 *
 * `notes-exist` is the classic calendar behaviour and stays on; the other two
 * are demonstrations of the public API — useful, but not what most people want
 * painted over their month. Only a fresh install is seeded with this list; see
 * `resolveDisabledSources` in `src/domain/settings.ts` for why an existing
 * user's choices are never touched.
 */
export const DEFAULT_DISABLED_SOURCES: readonly string[] = [WORD_COUNT_SOURCE_ID, TAGS_SOURCE_ID];

/** Ceiling for the footer's card limit, so the control cannot ask for absurdity. */
export const MAX_SUMMARY_CARDS = 12;

export interface CalendarPlusSettings {
	/** `locale` keeps whatever the active moment locale says. */
	weekStart: WeekStart;
	/** A moment locale code, or `system-default`. */
	localeOverride: string;
	showWeekNumbers: boolean;
	confirmBeforeCreate: boolean;
	/** The year/semester/quarter/month shortcut row under the header. */
	showPeriodShortcuts: boolean;
	/** How a numeric contribution from a source is rendered. */
	valueDisplay: ValueDisplay;
	/** What hovering a cell shows: the note's preview, a summary, or nothing. */
	hoverMode: HoverMode;
	/** The strip of source-contributed cards under the grid. */
	showFooter: boolean;
	/** Hard cap on footer cards, so a narrow sidebar cannot be flooded. */
	maxSummaryCards: number;
	/**
	 * Ids of sources the user turned off. Storing the *off* ones means a source
	 * that registers later is on by default, which is what a user expects after
	 * installing the plugin that provides it.
	 */
	disabledSources: string[];
	/**
	 * Whether {@link DEFAULT_DISABLED_SOURCES} has already been considered for
	 * this vault. Written once, and never acted on again: without it, "the user
	 * never had an opinion" and "the user switched this on" are the same absence,
	 * and an update would silently turn off something they had enabled by hand.
	 */
	sourceDefaultsApplied: boolean;
	/** Words each dot of the built-in word count source stands for. */
	wordsPerDot: number;
	/** Semester notes have no Periodic Notes equivalent, so they live here. */
	semesterEnabled: boolean;
	semesterFolder: string;
	semesterFormat: string;
	semesterTemplate: string;
}

export const DEFAULT_SETTINGS: CalendarPlusSettings = {
	weekStart: 'locale',
	localeOverride: 'system-default',
	showWeekNumbers: true,
	confirmBeforeCreate: true,
	showPeriodShortcuts: true,
	valueDisplay: 'none',
	hoverMode: 'preview',
	showFooter: true,
	maxSummaryCards: 4,
	disabledSources: [...DEFAULT_DISABLED_SOURCES],
	sourceDefaultsApplied: false,
	wordsPerDot: 250,
	semesterEnabled: false,
	semesterFolder: '',
	semesterFormat: DEFAULT_FORMATS.semester,
	semesterTemplate: '',
};

/** A source as the settings tab lists it. */
export interface SourceToggle {
	id: string;
	name: string;
	/** True when the source threw too often and is no longer queried. */
	degraded: boolean;
}

/** What the settings tab needs from the plugin, without importing it. */
export interface SettingsHost extends Plugin {
	settings: CalendarPlusSettings;
	saveSettings(): Promise<void>;
	onSettingsChanged(): void;
	/** Sources currently registered through the public API. */
	listSources(): SourceToggle[];
}

/** Prefix that distinguishes a per-source control key from a settings field. */
const SOURCE_KEY_PREFIX = 'source:';

/** The part of Obsidian 1.13's setting tab this plugin feature-detects. */
interface DeclarativeSettingTab {
	/** Re-reads `getSettingDefinitions()` and re-renders. Added in 1.13.0. */
	update(): void;
	/** Re-evaluates the `disabled` predicates in place. Added in 1.13.0. */
	refreshDomState(): void;
}

/** Whether a source is allowed to contribute. Unknown ids are on by default. */
export function isSourceEnabled(settings: CalendarPlusSettings, sourceId: string): boolean {
	return !settings.disabledSources.includes(sourceId);
}

/**
 * Whether a source's toggle starts on when nothing has been stored about it.
 * Only the two built-ins that ship off answer false; anything arriving from
 * another plugin is on, so installing it shows something.
 */
function sourceDefault(sourceId: string): boolean {
	return !DEFAULT_DISABLED_SOURCES.includes(sourceId);
}

/** Records a per-source toggle. Returns true when it actually changed. */
export function setSourceEnabled(
	settings: CalendarPlusSettings,
	sourceId: string,
	enabled: boolean
): boolean {
	if (isSourceEnabled(settings, sourceId) === enabled) return false;
	settings.disabledSources = enabled
		? settings.disabledSources.filter((id) => id !== sourceId)
		: [...settings.disabledSources, sourceId];
	return true;
}

/**
 * The semester format description carries two literals — our own token and the
 * default format — so it is built rather than stored.
 */
function semesterFormatDesc(): string {
	return t('settingSemesterFormatDesc', {
		token: '{semester}',
		default: DEFAULT_FORMATS.semester,
	});
}

function weekStartOptions(): Record<string, string> {
	// Weekday names come from moment, already localized, so they agree with the
	// grid's own headers instead of being translated a second time.
	const weekdays = window.moment.weekdays();
	return {
		locale: t('optionLocaleDefault'),
		sunday: weekdays[0] ?? 'Sunday',
		monday: weekdays[1] ?? 'Monday',
		tuesday: weekdays[2] ?? 'Tuesday',
		wednesday: weekdays[3] ?? 'Wednesday',
		thursday: weekdays[4] ?? 'Thursday',
		friday: weekdays[5] ?? 'Friday',
		saturday: weekdays[6] ?? 'Saturday',
	};
}

function localeOptions(): Record<string, string> {
	const options: Record<string, string> = { 'system-default': t('optionSameAsObsidian') };
	for (const locale of window.moment.locales()) options[locale] = locale;
	return options;
}

function valueDisplayOptions(): Record<string, string> {
	return {
		none: t('optionValueHidden'),
		number: t('optionValueNumber'),
		intensity: t('optionValueIntensity'),
	};
}

function hoverModeOptions(): Record<string, string> {
	return {
		preview: t('optionHoverPreview'),
		summary: t('optionHoverSummary'),
		none: t('optionHoverNone'),
	};
}

export class CalendarPlusSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly host: SettingsHost
	) {
		super(app, host);
	}

	/**
	 * Declarative settings, used by Obsidian 1.13 and later (and by its global
	 * settings search). `display()` below covers older versions, which
	 * `minAppVersion` still supports.
	 */
	override getSettingDefinitions(): SettingDefinitionItem[] {
		return [
			{
				type: 'group',
				heading: t('settingsGroupWeek'),
				items: [
					{
						name: t('settingWeekStartName'),
						desc: t('settingWeekStartDesc'),
						control: {
							type: 'dropdown',
							key: 'weekStart',
							defaultValue: DEFAULT_SETTINGS.weekStart,
							options: weekStartOptions(),
						},
					},
					{
						name: t('settingLocaleName'),
						desc: t('settingLocaleDesc'),
						control: {
							type: 'dropdown',
							key: 'localeOverride',
							defaultValue: DEFAULT_SETTINGS.localeOverride,
							options: localeOptions(),
						},
					},
					{
						name: t('settingWeekNumbersName'),
						desc: t('settingWeekNumbersDesc'),
						control: {
							type: 'toggle',
							key: 'showWeekNumbers',
							defaultValue: DEFAULT_SETTINGS.showWeekNumbers,
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settingsGroupNotes'),
				items: [
					{
						name: t('settingConfirmName'),
						desc: t('settingConfirmDesc'),
						control: {
							type: 'toggle',
							key: 'confirmBeforeCreate',
							defaultValue: DEFAULT_SETTINGS.confirmBeforeCreate,
						},
					},
					{
						name: t('settingShortcutsName'),
						desc: t('settingShortcutsDesc'),
						control: {
							type: 'toggle',
							key: 'showPeriodShortcuts',
							defaultValue: DEFAULT_SETTINGS.showPeriodShortcuts,
						},
					},
					{
						name: t('settingValueDisplayName'),
						desc: t('settingValueDisplayDesc'),
						control: {
							type: 'dropdown',
							key: 'valueDisplay',
							defaultValue: DEFAULT_SETTINGS.valueDisplay,
							options: valueDisplayOptions(),
						},
					},
					{
						name: t('settingHoverName'),
						desc: t('settingHoverDesc'),
						control: {
							type: 'dropdown',
							key: 'hoverMode',
							defaultValue: DEFAULT_SETTINGS.hoverMode,
							options: hoverModeOptions(),
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settingsGroupSources'),
				items: [
					...this.host.listSources().map((source) => ({
						// A source's name is its own; only ours go through `t()`.
						name: source.name,
						desc: source.degraded ? t('settingsSourceDegraded') : undefined,
						control: {
							type: 'toggle' as const,
							key: `${SOURCE_KEY_PREFIX}${source.id}`,
							defaultValue: sourceDefault(source.id),
						},
					})),
					{
						name: t('settingWordsPerDotName'),
						desc: t('settingWordsPerDotDesc'),
						control: {
							type: 'number' as const,
							key: 'wordsPerDot',
							defaultValue: DEFAULT_SETTINGS.wordsPerDot,
							min: 1,
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settingsGroupFooter'),
				items: [
					{
						name: t('settingFooterName'),
						desc: t('settingFooterDesc'),
						control: {
							type: 'toggle',
							key: 'showFooter',
							defaultValue: DEFAULT_SETTINGS.showFooter,
						},
					},
					{
						name: t('settingMaxCardsName'),
						desc: t('settingMaxCardsDesc'),
						control: {
							type: 'number',
							key: 'maxSummaryCards',
							defaultValue: DEFAULT_SETTINGS.maxSummaryCards,
							min: 1,
							max: MAX_SUMMARY_CARDS,
							disabled: () => !this.host.settings.showFooter,
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settingsGroupSemester'),
				items: [
					{
						name: t('settingSemesterEnabledName'),
						desc: t('settingSemesterEnabledDesc'),
						control: {
							type: 'toggle',
							key: 'semesterEnabled',
							defaultValue: DEFAULT_SETTINGS.semesterEnabled,
						},
					},
					{
						name: t('settingSemesterFolderName'),
						control: {
							type: 'folder',
							key: 'semesterFolder',
							defaultValue: DEFAULT_SETTINGS.semesterFolder,
							includeRoot: true,
							disabled: () => !this.host.settings.semesterEnabled,
						},
					},
					{
						name: t('settingSemesterFormatName'),
						desc: semesterFormatDesc(),
						control: {
							type: 'text',
							key: 'semesterFormat',
							defaultValue: DEFAULT_SETTINGS.semesterFormat,
							placeholder: DEFAULT_FORMATS.semester,
							disabled: () => !this.host.settings.semesterEnabled,
						},
					},
					{
						name: t('settingSemesterTemplateName'),
						control: {
							type: 'file',
							key: 'semesterTemplate',
							defaultValue: DEFAULT_SETTINGS.semesterTemplate,
							disabled: () => !this.host.settings.semesterEnabled,
						},
					},
				],
			},
		];
	}

	/**
	 * Re-reads the declarative definitions after the source list changed.
	 *
	 * Obsidian stores the result of `getSettingDefinitions()` in `settingItems`
	 * when the tab is added and re-reads it only when someone calls `update()`.
	 * A source registered after `onload` — which is where a consumer plugin
	 * registers, since it has to wait for the layout — therefore has no toggle
	 * until this runs.
	 *
	 * **It must run whether or not the settings window is open.** Guarding this
	 * on `containerEl.isConnected` is exactly the bug that hid the Simple Tasks
	 * source: the registration happens while the settings window is closed, the
	 * refresh was skipped, and nothing ever re-read the definitions afterwards,
	 * so the toggle was missing for the rest of the session. `update()` only
	 * touches the DOM when the tab is being displayed, so calling it on a closed
	 * tab is both safe and the entire point.
	 *
	 * `update()` exists from 1.13 — the version that renders definitions at all —
	 * hence the runtime check rather than a direct call, which `minAppVersion`
	 * 1.10 forbids. On older versions `display()` re-runs on every open, so there
	 * is nothing to do.
	 */
	refreshDefinitions(): void {
		// Typed as an unrelated shape on purpose: the call is feature-detected,
		// which is what `no-unsupported-api` cannot see through a `SettingTab`.
		const modern = this as unknown as Partial<DeclarativeSettingTab>;
		if (typeof modern.update !== 'function') return;
		modern.update();
	}

	/**
	 * Per-source toggles have no field of their own in the settings object, so
	 * their keys are resolved here instead of by the default field lookup.
	 */
	override getControlValue(key: string): unknown {
		if (key.startsWith(SOURCE_KEY_PREFIX)) {
			return isSourceEnabled(this.host.settings, key.slice(SOURCE_KEY_PREFIX.length));
		}
		return (this.host.settings as unknown as Record<string, unknown>)[key];
	}

	/** Persists a declarative change and repaints the open calendars. */
	override setControlValue(key: string, value: unknown): void {
		if (key.startsWith(SOURCE_KEY_PREFIX)) {
			setSourceEnabled(this.host.settings, key.slice(SOURCE_KEY_PREFIX.length), value === true);
		} else if (key === 'maxSummaryCards') {
			this.host.settings.maxSummaryCards = clampCardLimit(
				value,
				DEFAULT_SETTINGS.maxSummaryCards,
				MAX_SUMMARY_CARDS
			);
		} else {
			const settings = this.host.settings as unknown as Record<string, unknown>;
			settings[key] = value;
		}
		void this.host.saveSettings();
		this.host.onSettingsChanged();
		// Some controls gate others — the footer's limit, the semester fields. The
		// predicates are only re-read on request, so a change that flips one has to
		// say so or the control stays greyed out until the tab is reopened.
		const modern = this as unknown as Partial<DeclarativeSettingTab>;
		if (typeof modern.refreshDomState === 'function') modern.refreshDomState();
	}

	/**
	 * Classic settings UI, still required because `minAppVersion` is 1.10.0 and
	 * `getSettingDefinitions()` only renders from 1.13.0 on. Delete this together
	 * with the version bump.
	 */
	override display(): void {
		this.renderClassicSettings();
	}

	private renderClassicSettings(): void {
		const { containerEl } = this;
		containerEl.empty();
		const settings = this.host.settings;

		const commit = () => {
			void this.host.saveSettings();
			this.host.onSettingsChanged();
		};

		new Setting(containerEl).setName(t('settingsGroupWeek')).setHeading();

		new Setting(containerEl)
			.setName(t('settingWeekStartName'))
			.setDesc(t('settingWeekStartDesc'))
			.addDropdown((dropdown) => {
				dropdown.addOptions(weekStartOptions());
				dropdown.setValue(settings.weekStart);
				dropdown.onChange((value) => {
					settings.weekStart = value as WeekStart;
					commit();
				});
			});

		new Setting(containerEl)
			.setName(t('settingLocaleName'))
			.setDesc(t('settingLocaleDesc'))
			.addDropdown((dropdown) => {
				dropdown.addOptions(localeOptions());
				dropdown.setValue(settings.localeOverride);
				dropdown.onChange((value) => {
					settings.localeOverride = value;
					commit();
					this.renderClassicSettings();
				});
			});

		new Setting(containerEl)
			.setName(t('settingWeekNumbersName'))
			.setDesc(t('settingWeekNumbersDesc'))
			.addToggle((toggle) => {
				toggle.setValue(settings.showWeekNumbers);
				toggle.onChange((value) => {
					settings.showWeekNumbers = value;
					commit();
				});
			});

		new Setting(containerEl).setName(t('settingsGroupNotes')).setHeading();

		new Setting(containerEl)
			.setName(t('settingConfirmName'))
			.setDesc(t('settingConfirmDesc'))
			.addToggle((toggle) => {
				toggle.setValue(settings.confirmBeforeCreate);
				toggle.onChange((value) => {
					settings.confirmBeforeCreate = value;
					commit();
				});
			});

		new Setting(containerEl)
			.setName(t('settingShortcutsName'))
			.setDesc(t('settingShortcutsDesc'))
			.addToggle((toggle) => {
				toggle.setValue(settings.showPeriodShortcuts);
				toggle.onChange((value) => {
					settings.showPeriodShortcuts = value;
					commit();
				});
			});

		new Setting(containerEl)
			.setName(t('settingValueDisplayName'))
			.setDesc(t('settingValueDisplayDesc'))
			.addDropdown((dropdown) => {
				dropdown.addOptions(valueDisplayOptions());
				dropdown.setValue(settings.valueDisplay);
				dropdown.onChange((value) => {
					settings.valueDisplay = value as ValueDisplay;
					commit();
				});
			});

		new Setting(containerEl)
			.setName(t('settingHoverName'))
			.setDesc(t('settingHoverDesc'))
			.addDropdown((dropdown) => {
				dropdown.addOptions(hoverModeOptions());
				dropdown.setValue(settings.hoverMode);
				dropdown.onChange((value) => {
					settings.hoverMode = value as HoverMode;
					commit();
				});
			});

		new Setting(containerEl).setName(t('settingsGroupSources')).setHeading();

		const sources = this.host.listSources();
		if (sources.length === 0) {
			new Setting(containerEl).setDesc(t('settingsSourcesEmpty'));
		}
		for (const source of sources) {
			const setting = new Setting(containerEl).setName(source.name);
			if (source.degraded) setting.setDesc(t('settingsSourceDegraded'));
			setting.addToggle((toggle) => {
				toggle.setValue(isSourceEnabled(settings, source.id));
				toggle.onChange((value) => {
					setSourceEnabled(settings, source.id, value);
					commit();
				});
			});
		}

		new Setting(containerEl)
			.setName(t('settingWordsPerDotName'))
			.setDesc(t('settingWordsPerDotDesc'))
			.addText((text) => {
				text.inputEl.type = 'number';
				text.setValue(String(settings.wordsPerDot));
				text.onChange((value) => {
					const parsed = Number.parseInt(value, 10);
					settings.wordsPerDot = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.wordsPerDot;
					commit();
				});
			});

		new Setting(containerEl).setName(t('settingsGroupFooter')).setHeading();

		new Setting(containerEl)
			.setName(t('settingFooterName'))
			.setDesc(t('settingFooterDesc'))
			.addToggle((toggle) => {
				toggle.setValue(settings.showFooter);
				toggle.onChange((value) => {
					settings.showFooter = value;
					commit();
					this.renderClassicSettings();
				});
			});

		if (settings.showFooter) {
			new Setting(containerEl)
				.setName(t('settingMaxCardsName'))
				.setDesc(t('settingMaxCardsDesc'))
				.addText((text) => {
					text.inputEl.type = 'number';
					text.setValue(String(settings.maxSummaryCards));
					text.onChange((value) => {
						settings.maxSummaryCards = clampCardLimit(
							Number.parseInt(value, 10),
							DEFAULT_SETTINGS.maxSummaryCards,
							MAX_SUMMARY_CARDS
						);
						commit();
					});
				});
		}

		new Setting(containerEl).setName(t('settingsGroupSemester')).setHeading();

		new Setting(containerEl)
			.setName(t('settingSemesterEnabledName'))
			.setDesc(t('settingSemesterEnabledDesc'))
			.addToggle((toggle) => {
				toggle.setValue(settings.semesterEnabled);
				toggle.onChange((value) => {
					settings.semesterEnabled = value;
					commit();
					this.renderClassicSettings();
				});
			});

		if (!settings.semesterEnabled) return;

		new Setting(containerEl).setName(t('settingSemesterFolderName')).addText((text) => {
			text.setPlaceholder(t('settingSemesterFolderPlaceholder'));
			text.setValue(settings.semesterFolder);
			text.onChange((value) => {
				settings.semesterFolder = value;
				commit();
			});
		});

		new Setting(containerEl)
			.setName(t('settingSemesterFormatName'))
			.setDesc(semesterFormatDesc())
			.addText((text) => {
				text.setPlaceholder(DEFAULT_FORMATS.semester);
				text.setValue(settings.semesterFormat);
				text.onChange((value) => {
					settings.semesterFormat = value;
					commit();
				});
			});

		new Setting(containerEl).setName(t('settingSemesterTemplateName')).addText((text) => {
			// A path example, not prose: it stays as it is in every language.
			text.setPlaceholder('_templates/semester.md');
			text.setValue(settings.semesterTemplate);
			text.onChange((value) => {
				settings.semesterTemplate = value;
				commit();
			});
		});
	}
}
