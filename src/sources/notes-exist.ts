import type { TFile } from 'obsidian';
import type { CellMetadata, Granularity, SummaryCard } from '../api/types';
import { forgetPath } from '../domain/sources';
import { t } from '../i18n';
import type { Moment } from '../periodic/resolve';
import { IndexedSource } from './context';
import { NOTES_EXIST_SOURCE_ID } from './ids';

/**
 * A dot on every period that already has a note.
 *
 * This is the behaviour the original Calendar plugin hardcoded; here it is just
 * one source among others, and it can be turned off.
 *
 * `api.resolveNote()` answers the question directly, so there is no index of
 * dates at all. The set of markdown paths is still kept, but only as a change
 * detector: it is what tells the source whether a vault event actually changed
 * which notes exist, so a plain edit does not trigger a repaint.
 */
export class NotesExistSource extends IndexedSource {
	readonly id = NOTES_EXIST_SOURCE_ID;
	readonly nameKey = 'sourceNotesExistName';

	private readonly paths = new Set<string>();

	getMetadata(date: Moment, granularity: Granularity): CellMetadata | null {
		if (this.noteFor(date, granularity) === null) return null;
		return { dots: [{ className: 'note' }] };
	}

	/** How much of the period was written up at all. */
	getSummary(from: Moment, to: Moment): SummaryCard[] | null {
		let written = 0;
		const days = this.eachDay(from, to, (date) => {
			if (this.noteFor(date, 'day') !== null) written += 1;
		});
		if (written === 0) return null;
		return [
			{
				label: t('summaryNotesLabel'),
				value: String(written),
				icon: 'file-text',
				tooltip: t('summaryNotesTooltip', { count: written, days }),
			},
		];
	}

	protected rebuild(): void {
		this.paths.clear();
		for (const file of this.ctx.app.vault.getMarkdownFiles()) this.paths.add(file.path);
		this.signalChange();
	}

	protected onFileChanged(file: TFile): void {
		// Only existence matters, so a `modify` of an already-known note is a
		// no-op and must not trigger a repaint.
		if (file.extension !== 'md' || this.paths.has(file.path)) return;
		this.paths.add(file.path);
		this.signalChange();
	}

	protected onPathRemoved(path: string): void {
		if (forgetPath(this.paths, path)) this.signalChange();
	}
}
