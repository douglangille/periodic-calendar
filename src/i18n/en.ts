/**
 * English strings — the source of truth.
 *
 * Every other dictionary is typed against these keys, so a missing translation
 * is a compile error rather than an empty label at runtime. Sentence case is
 * enforced here by `obsidianmd/ui/sentence-case-locale-module`.
 *
 * `{name}` placeholders are substituted by `t()`. Month and weekday names are
 * **not** here: they come from `moment`, already localized.
 */
export default {
	// --- View and navigation -------------------------------------------------
	viewTitle: 'Calendar',
	ribbonOpenCalendar: 'Open calendar',
	navPreviousMonth: 'Previous month',
	navNextMonth: 'Next month',
	navToday: 'Go to today',
	gridWeekColumn: 'Week',
	headerOpenPeriod: 'Open {period}',
	periodWeekLabel: 'Week {week} · {year}',

	// --- Commands ------------------------------------------------------------
	commandOpenView: 'Open view',
	commandRevealActiveNote: 'Reveal active note',
	commandOpenDailyNote: 'Open daily note',
	commandOpenWeeklyNote: 'Open weekly note',
	commandOpenMonthlyNote: 'Open monthly note',
	commandOpenQuarterlyNote: 'Open quarterly note',
	commandOpenSemesterNote: 'Open semester note',
	commandOpenYearlyNote: 'Open yearly note',

	// --- Context menu --------------------------------------------------------
	menuOpenInNewTab: 'Open in new tab',
	menuOpenToTheRight: 'Open to the right',
	menuDelete: 'Delete',
	menuCreateNote: 'Create note',
	menuNotConfigured: 'No note is configured for this period',

	// --- Notices and the confirmation modal ----------------------------------
	noticeNotPeriodicNote: 'The active note is not a periodic note.',
	noticeNotConfigured:
		'No note is configured for this period. Set it up in Periodic Notes, or in Calendar Plus settings for semester notes.',
	noticeTemplateUnreadable: 'Could not read the template {path}',
	noticeCreateFailed: 'Could not create the note.',
	modalNewNoteTitle: 'New note',
	modalNewNoteBody: 'File {name} does not exist. Would you like to create it?',
	modalCreate: 'Create',
	modalCancel: 'Never mind',

	// --- Settings: group headings --------------------------------------------
	settingsGroupWeek: 'Week',
	settingsGroupNotes: 'Notes',
	settingsGroupSources: 'Sources',
	settingsGroupFooter: 'Summary footer',
	settingsGroupSemester: 'Semester notes',

	// --- Settings: items -----------------------------------------------------
	settingWeekStartName: 'Start week on',
	settingWeekStartDesc:
		'Which day the grid starts on. The locale default follows the language of the calendar.',
	settingLocaleName: 'Override locale',
	settingLocaleDesc: 'Render the calendar in a language other than the one Obsidian uses.',
	settingWeekNumbersName: 'Show week numbers',
	settingWeekNumbersDesc: 'Add a column with the week number, which opens the weekly note.',
	settingConfirmName: 'Confirm before creating a note',
	settingConfirmDesc: 'Ask first when a click would create a note that does not exist yet.',
	settingShortcutsName: 'Show period shortcuts',
	settingShortcutsDesc:
		'A row of buttons under the header that opens the yearly, semester, quarterly and monthly notes.',
	settingValueDisplayName: 'Numbers from sources',
	settingValueDisplayDesc:
		'How a value contributed by another plugin is shown in a cell: hidden, printed as a number, or mapped to a background intensity.',
	settingHoverName: 'Hovering a day shows',
	settingHoverDesc:
		'Note preview is the pop-up Obsidian shows for a link. Cell summary is a tooltip with what the sources report for that day, and shows no preview.',
	settingWordsPerDotName: 'Words per dot',
	settingWordsPerDotDesc: 'How many words each dot of the word count source stands for.',
	settingsSourcesEmpty:
		'No source is registered yet. Sources come from Calendar Plus itself and from other plugins.',
	settingsSourceDegraded:
		'Stopped after repeated errors. It is retried when it reports new data.',
	settingFooterName: 'Show the summary footer',
	settingFooterDesc:
		'A strip of cards under the grid with the figures the enabled sources report for the displayed month.',
	settingMaxCardsName: 'Maximum cards',
	settingMaxCardsDesc:
		'Cards past this many are left out, so the footer cannot take over a narrow sidebar.',
	settingSemesterEnabledName: 'Enable semester notes',
	settingSemesterEnabledDesc:
		'Periodic Notes has no semester tier, so Calendar Plus resolves it on its own: semester 1 covers the first six months of the year, semester 2 the rest.',
	settingSemesterFolderName: 'Semester note folder',
	settingSemesterFolderPlaceholder: 'Folder for semester notes',
	settingSemesterFormatName: 'Semester note format',
	settingSemesterFormatDesc:
		'A moment format. The extra token {token} becomes 1 or 2. Default: {default}',
	settingSemesterTemplateName: 'Semester note template',

	// --- Settings: dropdown options ------------------------------------------
	optionLocaleDefault: 'Locale default',
	optionSameAsObsidian: 'Same as Obsidian',
	optionValueHidden: 'Hidden',
	optionValueNumber: 'As a number',
	optionValueIntensity: 'As background intensity',
	optionHoverPreview: 'Note preview',
	optionHoverSummary: 'Cell summary',
	optionHoverNone: 'Nothing',

	// --- Built-in sources ----------------------------------------------------
	sourceNotesExistName: 'Existing notes',
	sourceWordCountName: 'Word count',
	sourceTagsName: 'Tags',
	sourceWordCountTooltipOne: '{count} word',
	sourceWordCountTooltip: '{count} words',

	// --- Built-in sources: footer cards --------------------------------------
	summaryNotesLabel: 'Notes',
	summaryNotesTooltip: '{count} of the {days} days of the period have a note',
	summaryWordsLabel: 'Words',
	summaryWordsTooltip: '{count} words across the notes of the period',
	summaryTagsLabel: 'Tags',
	summaryTagsTooltip: '{count} different tags in the notes of the period',
};
