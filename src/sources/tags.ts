import { getAllTags, type TFile } from 'obsidian';
import type { CellMetadata, Granularity, SummaryCard } from '../api/types';
import { forgetPath, tagColor, tagSlug } from '../domain/sources';
import { t } from '../i18n';
import type { Moment } from '../periodic/resolve';
import { IndexedSource } from './context';
import { TAGS_SOURCE_ID } from './ids';

/** Upper bound on dots, so a heavily tagged note cannot fill the cell. */
const MAX_DOTS = 3;

/** Upper bound on the tags listed in the footer card's tooltip. */
const MAX_TOOLTIP_TAGS = 12;

/**
 * Colored dots and CSS classes from the tags of a period's note.
 *
 * Everything comes from `metadataCache`, so nothing is parsed and no file is
 * read — `getFileCache` is a memory lookup. The map is filled lazily, for the
 * notes the calendar asks about, and emptied entry by entry when the cache
 * reports a change.
 */
export class TagsSource extends IndexedSource {
	readonly id = TAGS_SOURCE_ID;
	readonly nameKey = 'sourceTagsName';

	private readonly tags = new Map<string, string[]>();

	getMetadata(date: Moment, granularity: Granularity): CellMetadata | null {
		const file = this.noteFor(date, granularity);
		if (!file) return null;
		const tags = this.tags.get(file.path) ?? this.index(file);
		if (tags.length === 0) return null;
		return {
			dots: tags.slice(0, MAX_DOTS).map((tag) => ({
				className: 'tag',
				color: tagColor(tag),
			})),
			classes: tags.map((tag) => `tag-${tagSlug(tag)}`),
			tooltip: tags.join(' '),
		};
	}

	/**
	 * How many different tags the period's notes carry.
	 *
	 * Nothing is read from disk: `index()` is a `metadataCache` lookup, so the
	 * whole month can be walked on the render path.
	 */
	getSummary(from: Moment, to: Moment): SummaryCard[] | null {
		const distinct = new Set<string>();
		this.eachDay(from, to, (date) => {
			const file = this.noteFor(date, 'day');
			if (!file) return;
			for (const tag of this.tags.get(file.path) ?? this.index(file)) distinct.add(tag);
		});
		if (distinct.size === 0) return null;
		const listed = [...distinct].sort();
		return [
			{
				label: t('summaryTagsLabel'),
				value: String(listed.length),
				icon: 'tags',
				// The count, then the tags themselves — the interesting part, and
				// short enough to read while the pointer is still on the card.
				tooltip: `${t('summaryTagsTooltip', { count: listed.length })}\n${listed
					.slice(0, MAX_TOOLTIP_TAGS)
					.join(' ')}`,
			},
		];
	}

	protected rebuild(): void {
		if (this.tags.size === 0) return;
		this.tags.clear();
		this.signalChange();
	}

	protected onFileChanged(file: TFile): void {
		if (file.extension !== 'md') return;
		// Only notes already looked up can be on screen; forgetting one is enough,
		// the next repaint reads the cache again.
		if (this.tags.delete(file.path)) this.signalChange();
	}

	protected onPathRemoved(path: string): void {
		if (forgetPath(this.tags, path)) this.signalChange();
	}

	/** Reads and caches a note's tags. A note with none caches an empty list. */
	private index(file: TFile): string[] {
		const cache = this.ctx.app.metadataCache.getFileCache(file);
		const tags = cache ? [...new Set(getAllTags(cache) ?? [])].sort() : [];
		this.tags.set(file.path, tags);
		return tags;
	}
}
