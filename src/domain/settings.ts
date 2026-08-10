/**
 * Pure decisions about stored settings, kept here so they can be exercised
 * without an app — and so the reasoning behind them survives in one place.
 *
 * Like every module in `src/domain/`, this one imports nothing.
 */

/**
 * Which sources start turned off, and whether that has to be written down.
 *
 * `disabledSources` records the sources the user turned **off**, so a source
 * nobody has an opinion about is on. That is right for a source that arrives
 * later — installing a plugin should show its contribution — but it is the
 * wrong default for two of the built-in ones, which are examples of the API
 * rather than things most people want painted on their calendar.
 *
 * The hard part is that "never decided" and "deliberately turned on" look
 * identical in storage: both are an absence. Guessing would mean turning
 * something off behind the back of a user who had switched it on by hand, which
 * is worse than the original problem. So the decision is recorded explicitly,
 * once, and never revisited:
 *
 * - **Nothing stored at all** — a fresh install. Seed the new defaults.
 * - **Anything stored** — an existing user. Touch nothing; only write the mark,
 *   so their choices are frozen exactly as they were.
 * - **Mark already present** — the question has been answered; leave it alone.
 *
 * Do not "fix" this later by disabling sources retroactively for people who
 * already have settings: the mark exists precisely to make that impossible.
 *
 * @param alreadyApplied Whether the stored settings carry the mark.
 * @param hasStoredConfig Whether there is any stored configuration at all.
 * @param storedDisabled The stored list. Typed `unknown` because it comes
 *   straight off disk, where it can be anything a hand edit left behind.
 * @param defaultDisabled Ids that ship turned off on a fresh install.
 */
export function resolveDisabledSources(
	alreadyApplied: boolean,
	hasStoredConfig: boolean,
	storedDisabled: unknown,
	defaultDisabled: readonly string[]
): { disabledSources: string[]; markApplied: boolean } {
	const raw: readonly unknown[] = Array.isArray(storedDisabled)
		? (storedDisabled as readonly unknown[])
		: [];
	const stored = raw.filter((id): id is string => typeof id === 'string');
	if (alreadyApplied) return { disabledSources: stored, markApplied: false };
	if (hasStoredConfig) return { disabledSources: stored, markApplied: true };
	return { disabledSources: [...defaultDisabled], markApplied: true };
}

/**
 * A card limit that cannot make the footer nonsensical. Stored settings can hold
 * anything — a hand-edited `data.json`, a control from an older version — and a
 * limit of `NaN` would silently render no cards at all.
 */
export function clampCardLimit(value: unknown, fallback: number, max: number): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
	return Math.min(max, Math.max(1, Math.floor(value)));
}

/**
 * A count, shortened enough to fit a card in a narrow sidebar: `912`, `14.2k`,
 * `3.1M`. Deliberately not `Intl.NumberFormat`'s compact notation, which needs a
 * locale and would disagree with itself between the two the plugin can be in.
 */
export function compactNumber(value: number): string {
	if (!Number.isFinite(value)) return '0';
	const abs = Math.abs(value);
	if (abs < 1000) return String(Math.round(value));
	const [divisor, suffix] = abs < 1_000_000 ? [1000, 'k'] : [1_000_000, 'M'];
	const scaled = value / divisor;
	// One decimal below ten (`1.4k`), none above it (`14k`): the extra digit only
	// carries information while there are few enough units for it to matter.
	const text = Math.abs(scaled) < 10 ? scaled.toFixed(1) : String(Math.round(scaled));
	return `${text.replace(/\.0$/, '')}${suffix}`;
}
