import type { Granularity } from '../api/types';
import { t } from '../i18n';
import {
	isWeekend,
	monthGridDays,
	periodLabel,
	weekdayLabels,
	weekdayLabelsFull,
	weekdayLabelsMin,
	type Moment,
} from '../periodic/resolve';
import { CalendarCell, type HoverMode, type ValueDisplay } from './day-cell';

export interface MonthGridSpec {
	/** Any date inside the month to render. */
	displayedMonth: Moment;
	today: Moment;
	showWeekNumbers: boolean;
	/** Whether weekly notes are configured; week cells are inert otherwise. */
	weekEnabled: boolean;
	valueDisplay: ValueDisplay;
	/** What a hover over a cell produces. */
	hoverMode: HoverMode;
	/** Whether the note for this period already exists. */
	hasNote(date: Moment, granularity: Granularity): boolean;
	/** Whether this period is the one of the currently active note. */
	isActive(date: Moment, granularity: Granularity): boolean;
}

/** The rendered grid, plus the lookups the view needs to drive it. */
export interface MonthGrid {
	cells: CalendarCell[];
	/** `[row][column]`; column 0 holds the week cell when week numbers are on. */
	rows: (CalendarCell | null)[][];
	byElement: Map<HTMLElement, CalendarCell>;
	byUid: Map<string, CalendarCell>;
	/** Column index of the first day cell: 1 when week numbers are shown, else 0. */
	dayColumnOffset: number;
}

/**
 * Renders the month table into `container`, replacing whatever was there.
 *
 * No event listeners are attached here: the view delegates from a stable
 * ancestor, so repainting the grid can never leak handlers.
 */
export function renderMonthGrid(container: HTMLElement, spec: MonthGridSpec): MonthGrid {
	container.empty();

	const weeks = monthGridDays(spec.displayedMonth);
	const labels = weekdayLabels();
	const labelsMin = weekdayLabelsMin();
	const labelsFull = weekdayLabelsFull();

	const table = container.createEl('table', { cls: 'calendar' });
	table.setAttribute('role', 'grid');

	// A col per weekday so the `weekend` class can tint whole columns, exactly
	// as the original plugin does.
	const colgroup = table.createEl('colgroup');
	if (spec.showWeekNumbers) colgroup.createEl('col', { cls: 'calendar-plus-week-col' });
	const firstWeek = weeks[0] ?? [];
	for (const day of firstWeek) {
		const col = colgroup.createEl('col');
		col.toggleClass('weekend', isWeekend(day));
	}

	const headRow = table.createEl('thead').createEl('tr');
	if (spec.showWeekNumbers) {
		const th = headRow.createEl('th', { cls: 'calendar-plus-week-header' });
		th.setAttribute('aria-label', t('gridWeekColumn'));
	}
	for (const [index, day] of firstWeek.entries()) {
		const th = headRow.createEl('th', { cls: 'weekday' });
		// Both abbreviations go in; a container query on the view shows exactly one,
		// because three letters do not fit a column in a narrow sidebar. `display:
		// none` keeps the hidden one out of the accessibility tree too, and the
		// full name is the header's accessible name either way.
		th.createSpan({ cls: 'calendar-plus-weekday-full', text: labels[index] ?? '' });
		th.createSpan({ cls: 'calendar-plus-weekday-min', text: labelsMin[index] ?? '' });
		const full = labelsFull[index];
		if (full) th.setAttribute('aria-label', full);
		th.toggleClass('weekend', isWeekend(day));
	}

	const tbody = table.createEl('tbody');
	const grid: MonthGrid = {
		cells: [],
		rows: [],
		byElement: new Map(),
		byUid: new Map(),
		dayColumnOffset: spec.showWeekNumbers ? 1 : 0,
	};

	const register = (cell: CalendarCell) => {
		grid.cells.push(cell);
		grid.byElement.set(cell.el, cell);
		grid.byUid.set(cell.uid, cell);
		return cell;
	};

	for (const week of weeks) {
		const tr = tbody.createEl('tr');
		tr.setAttribute('role', 'row');
		const row: (CalendarCell | null)[] = [];

		if (spec.showWeekNumbers) {
			const reference = week[0];
			const td = tr.createEl('td', { cls: 'calendar-plus-week-cell' });
			if (reference) {
				const cell = new CalendarCell({
					parent: td,
					date: reference,
					granularity: 'week',
					text: String(reference.week()),
					cls: 'week-num',
					label: periodLabel(reference, 'week'),
					valueDisplay: spec.valueDisplay,
					hoverMode: spec.hoverMode,
					flags: {
						hasNote: spec.weekEnabled && spec.hasNote(reference, 'week'),
						isActive: spec.weekEnabled && spec.isActive(reference, 'week'),
					},
				});
				cell.el.toggleClass('is-unavailable', !spec.weekEnabled);
				row.push(register(cell));
			} else {
				row.push(null);
			}
		}

		for (const day of week) {
			const td = tr.createEl('td');
			td.toggleClass('weekend', isWeekend(day));
			const cell = new CalendarCell({
				parent: td,
				date: day,
				granularity: 'day',
				text: day.format('D'),
				cls: 'day',
				label: periodLabel(day, 'day'),
				valueDisplay: spec.valueDisplay,
				hoverMode: spec.hoverMode,
				flags: {
					isToday: day.isSame(spec.today, 'day'),
					isActive: spec.isActive(day, 'day'),
					isAdjacentMonth: !day.isSame(spec.displayedMonth, 'month'),
					isWeekend: isWeekend(day),
					hasNote: spec.hasNote(day, 'day'),
				},
			});
			row.push(register(cell));
		}

		grid.rows.push(row);
	}

	return grid;
}

/** Position of a cell inside the grid, or null when it is not in it. */
export function locateCell(grid: MonthGrid, cell: CalendarCell): { row: number; col: number } | null {
	for (const [row, cells] of grid.rows.entries()) {
		const col = cells.indexOf(cell);
		if (col >= 0) return { row, col };
	}
	return null;
}

/**
 * Moves keyboard focus by a grid offset, keeping a single tab stop (roving
 * tabindex) so the calendar does not add 42 stops to the tab order.
 */
export function moveFocus(grid: MonthGrid, from: CalendarCell, rowDelta: number, colDelta: number): boolean {
	const at = locateCell(grid, from);
	if (!at) return false;
	const row = grid.rows[at.row + rowDelta];
	if (!row) return false;
	const target = row[at.col + colDelta];
	if (!target) return false;
	focusCell(grid, target);
	return true;
}

/** Gives `cell` the grid's single tab stop and focuses it. */
export function focusCell(grid: MonthGrid, cell: CalendarCell): void {
	setTabStop(grid, cell);
	cell.el.focus();
}

/** Chooses which cell holds the tab stop, without moving focus. */
export function setTabStop(grid: MonthGrid, cell: CalendarCell | null): void {
	for (const candidate of grid.cells) candidate.el.tabIndex = -1;
	const target = cell ?? grid.cells.find((candidate) => candidate.granularity === 'day') ?? null;
	if (target) target.el.tabIndex = 0;
}
