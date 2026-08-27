import { setIcon, setTooltip } from 'obsidian';
import type { Granularity } from '../api/types';
import { t } from '../i18n';
import { HEADER_GRANULARITIES } from '../periodic/config';
import { periodLabel, semesterOf, type Moment } from '../periodic/resolve';
import { CalendarCell, type HoverMode, type ValueDisplay } from './day-cell';

export interface HeaderSpec {
	displayedMonth: Moment;
	today: Moment;
	/** Whether to render the month/quarter/semester/year shortcut row. */
	showPeriodShortcuts: boolean;
	/** How a numeric contribution from a source is rendered on the buttons. */
	valueDisplay: ValueDisplay;
	/** What a hover over a period button produces. */
	hoverMode: HoverMode;
	isAvailable(granularity: Granularity): boolean;
	hasNote(date: Moment, granularity: Granularity): boolean;
	isActive(date: Moment, granularity: Granularity): boolean;
	onPrevious(): void;
	onNext(): void;
	onToday(): void;
}

/** Short label for a coarse period: `ago`, `Q3`, `S2`, `2026`. */
function shortcutText(date: Moment, granularity: Granularity): string {
	switch (granularity) {
		case 'month':
			return date.format('MMM');
		case 'quarter':
			return `Q${String(date.quarter())}`;
		case 'semester':
			return `S${String(semesterOf(date))}`;
		default:
			return date.format('YYYY');
	}
}

/**
 * Renders the navigation header into `container`, replacing its contents.
 *
 * Returns the period buttons as {@link CalendarCell}s. They are cells like any
 * other: the `Granularity` type promises `month`, `quarter`, `semester` and
 * `year`, so sources decorate them with dots, a value, classes and a tooltip
 * exactly as they do a day, and the view's delegated listeners give them the
 * same clicks, context menus, hover previews and drops. Only the element
 * differs — a real `<button>`, which is focusable and activates on Enter and
 * Space on its own.
 *
 * No per-button listener is attached here. The only listeners in this file are
 * the navigation arrows', which are not cells; everything the buttons do
 * arrives through the view's delegation, so a repaint can never leak a handler
 * and a period button can never behave differently from a day.
 */
export function renderHeader(container: HTMLElement, spec: HeaderSpec): CalendarCell[] {
	container.empty();

	const nav = container.createDiv({ cls: 'nav' });
	const title = nav.createEl('h3', { cls: 'title' });
	title.createSpan({ cls: 'month', text: spec.displayedMonth.format('MMMM') });
	title.appendText(' ');
	title.createSpan({ cls: 'year', text: spec.displayedMonth.format('YYYY') });

	const rightNav = nav.createDiv({ cls: 'right-nav' });

	const previous = rightNav.createEl('button', { cls: 'arrow' });
	setIcon(previous, 'chevron-left');
	previous.setAttribute('aria-label', t('navPreviousMonth'));
	setTooltip(previous, t('navPreviousMonth'), { placement: 'top' });
	previous.addEventListener('click', () => spec.onPrevious());

	// `moment().calendar()` is "Today at 3:00 PM" in the user's locale; the first
	// token before a digit or space is the localized word for today. It comes
	// from moment's locale, not from our dictionary, so it agrees with the grid.
	const todayWord = spec.today.calendar().split(/\d|\s/)[0] ?? t('navToday');
	const reset = rightNav.createEl('button', { cls: 'reset-button', text: todayWord });
	reset.setAttribute('aria-label', t('navToday'));
	setTooltip(reset, t('navToday'), { placement: 'top' });
	reset.addEventListener('click', () => spec.onToday());

	const next = rightNav.createEl('button', { cls: 'arrow right' });
	setIcon(next, 'chevron-right');
	next.setAttribute('aria-label', t('navNextMonth'));
	setTooltip(next, t('navNextMonth'), { placement: 'top' });
	next.addEventListener('click', () => spec.onNext());

	if (!spec.showPeriodShortcuts) return [];

	const shortcuts = container.createDiv({ cls: 'periodic-calendar-periods' });
	const cells: CalendarCell[] = [];
	for (const granularity of HEADER_GRANULARITIES) {
		if (!spec.isAvailable(granularity)) continue;
		const cell = new CalendarCell({
			parent: shortcuts,
			date: spec.displayedMonth,
			granularity,
			tag: 'button',
			cls: 'periodic-calendar-period',
			text: shortcutText(spec.displayedMonth, granularity),
			label: t('headerOpenPeriod', { period: periodLabel(spec.displayedMonth, granularity) }),
			valueDisplay: spec.valueDisplay,
			hoverMode: spec.hoverMode,
			flags: {
				hasNote: spec.hasNote(spec.displayedMonth, granularity),
				isActive: spec.isActive(spec.displayedMonth, granularity),
			},
		});
		cells.push(cell);
	}
	if (cells.length === 0) shortcuts.remove();
	return cells;
}
