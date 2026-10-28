import { MarkdownRenderer, type App, type Component, type TFile } from 'obsidian';
import { t } from '../i18n';

export interface PreviewOptions {
	app: App;
	/** Owns the renderer's lifetime: the view, so embeds die with it. */
	component: Component;
	label: string;
	/** The note, or null when it does not exist or the period is not configured. */
	file: TFile | null;
	/** False when the period has no periodic note configuration at all. */
	configured: boolean;
	/** Opens the note, or creates it first (after the usual confirmation). */
	onOpen: () => void;
}

/**
 * Renders a period's note, read-only, into `el`.
 *
 * Built off-screen and swapped in at the end, so refreshing the preview of the
 * note already showing does not blink the pane empty first. Returns false when
 * `isStale` said a newer render superseded this one, in which case `el` is left
 * exactly as it was.
 */
export async function renderPreview(
	el: HTMLElement,
	options: PreviewOptions,
	text: string | null,
	isStale: () => boolean
): Promise<boolean> {
	const next = createDiv();
	const header = next.createDiv({ cls: 'periodic-calendar-preview-header' });
	// A note carries its own title, so the label is only for the empty states,
	// where nothing else says which period was picked.
	if (!options.file) header.createSpan({ cls: 'periodic-calendar-preview-title', text: options.label });
	if (options.configured) {
		const button = header.createEl('button', {
			cls: 'periodic-calendar-preview-open',
			text: options.file ? t('previewOpen') : t('previewCreate'),
		});
		button.addEventListener('click', options.onOpen);
	}

	if (!options.file || text === null) {
		next.createDiv({
			cls: 'periodic-calendar-preview-empty',
			text: options.configured ? t('previewEmpty') : t('menuNotConfigured'),
		});
	} else {
		const body = next.createDiv({ cls: 'periodic-calendar-preview-body markdown-rendered' });
		const frontmatter = options.app.metadataCache.getFileCache(options.file)?.frontmatterPosition;
		const content = frontmatter ? text.slice(frontmatter.end.offset).replace(/^\s*\n/, '') : text;
		await MarkdownRenderer.render(options.app, content, body, options.file.path, options.component);
	}

	if (isStale()) return false;
	el.empty();
	el.append(...Array.from(next.childNodes));
	return true;
}
