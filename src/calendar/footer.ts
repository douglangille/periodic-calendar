import { setIcon, setTooltip } from 'obsidian';
import type { SummaryCard } from '../api/types';

export interface FooterSpec {
	/** Cards in registration order, as the registry collected them. */
	cards: readonly SummaryCard[];
	/**
	 * Hard cap from settings. Cards past it are dropped rather than squeezed:
	 * the calendar lives in a sidebar, and the user decides how much of it the
	 * footer may take.
	 */
	maxCards: number;
}

/**
 * Renders the summary strip into `container`, replacing its contents.
 *
 * The strip is a wrapping row, not a scroller. A sidebar is narrow and already
 * scrolls vertically; a second, horizontal scroller inside it hides cards
 * behind an edge with no affordance, and fights the gesture the user is already
 * making. Wrapping keeps every card the user asked for visible, at the cost of
 * one more line — and the card limit in settings is what stops those lines from
 * growing without end.
 *
 * No listener is attached to anything that outlives the call: the strip is
 * rebuilt from scratch on every repaint, so its elements go away with it.
 */
export function renderFooter(container: HTMLElement, spec: FooterSpec): void {
	container.empty();
	const cards = spec.cards.slice(0, Math.max(0, spec.maxCards));
	// An empty footer must take no room at all, or every month with no notes
	// would end in a stripe of nothing.
	container.toggleClass('is-empty', cards.length === 0);
	for (const card of cards) renderCard(container, card);
}

function renderCard(parent: HTMLElement, card: SummaryCard): void {
	// A card is only a button when there is something to press. One that looks
	// interactive and does nothing is worse than a plain figure.
	const interactive = typeof card.onClick === 'function';
	const el = parent.createEl(interactive ? 'button' : 'div', { cls: 'periodic-calendar-card' });
	el.toggleClass('is-interactive', interactive);

	const figure = el.createDiv({ cls: 'periodic-calendar-card-figure' });
	if (card.icon) {
		const icon = figure.createSpan({ cls: 'periodic-calendar-card-icon' });
		setIcon(icon, card.icon);
	}
	figure.createSpan({ cls: 'periodic-calendar-card-value', text: card.value });
	el.createSpan({ cls: 'periodic-calendar-card-label', text: card.label });

	// No `aria-label` here on purpose. Obsidian's tooltip and the accessible name
	// share that attribute, so setting both would mean one of them losing; the
	// card's own text already names it ("23 Notes"), and a source's tooltip is
	// expected to be a self-contained sentence rather than a fragment.
	if (card.tooltip) setTooltip(el, card.tooltip, { placement: 'top' });

	if (!interactive) return;
	el.addEventListener('click', () => {
		try {
			card.onClick?.();
		} catch (error) {
			// A consumer's callback is not allowed to take the calendar down.
			console.error('Periodic Calendar: a summary card click handler threw', error);
		}
	});
}
