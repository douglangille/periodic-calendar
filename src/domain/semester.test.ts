import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import moment from 'moment';
import {
	SEMESTERS,
	expandSemesterToken,
	semesterFormatCandidates,
	semesterOfMonth,
	semesterStartMonth,
} from './semester.ts';

/**
 * The semester tier is the one thing here that `moment` does not provide, so it
 * is the one thing that can be wrong without anybody noticing until a note
 * lands in the wrong file.
 *
 * `moment` is a devDependency pinned to the version the `obsidian` package
 * depends on, so these are the same formatting and strict-parsing rules the
 * plugin gets from `window.moment` at runtime. It is never bundled: esbuild
 * only follows `src/main.ts`, which does not reach a test file.
 */

/** The default format for semester notes, from `DEFAULT_FORMATS.semester`. */
const DEFAULT_FORMAT = 'YYYY-[S]{semester}';

/** What `formatPeriod` does: expand our token, then let moment format. */
function basenameFor(iso: string, format = DEFAULT_FORMAT): string {
	const date = moment(iso, 'YYYY-MM-DD', true);
	return date.format(expandSemesterToken(format, semesterOfMonth(date.month())));
}

/** What `parseBasename` does for a semester: try both candidates, strictly. */
function parseBasename(
	basename: string,
	format = DEFAULT_FORMAT
): { year: number; month: number } | null {
	for (const candidate of semesterFormatCandidates(format)) {
		const parsed = moment(basename, candidate.format, true);
		if (!parsed.isValid()) continue;
		const start = parsed.month(semesterStartMonth(candidate.semester)).startOf('month');
		return { year: start.year(), month: start.month() };
	}
	return null;
}

describe('semesterOfMonth', () => {
	it('splits the year in half at the end of June', () => {
		// The boundary is the whole point: June is still the first semester and
		// July is already the second.
		assert.equal(semesterOfMonth(5), 1); // June
		assert.equal(semesterOfMonth(6), 2); // July
	});

	it('assigns every month of the year', () => {
		const first = [0, 1, 2, 3, 4, 5].map(semesterOfMonth);
		const second = [6, 7, 8, 9, 10, 11].map(semesterOfMonth);
		assert.deepEqual(first, [1, 1, 1, 1, 1, 1]);
		assert.deepEqual(second, [2, 2, 2, 2, 2, 2]);
	});
});

describe('semesterStartMonth', () => {
	it('is January for the first semester and July for the second', () => {
		assert.equal(semesterStartMonth(1), 0);
		assert.equal(semesterStartMonth(2), 6);
	});

	it('round-trips with semesterOfMonth', () => {
		for (const semester of SEMESTERS) {
			assert.equal(semesterOfMonth(semesterStartMonth(semester)), semester);
		}
	});
});

describe('expandSemesterToken', () => {
	it('escapes the digit so moment reads it as a literal', () => {
		assert.equal(expandSemesterToken(DEFAULT_FORMAT, 1), 'YYYY-[S][1]');
		assert.equal(expandSemesterToken(DEFAULT_FORMAT, 2), 'YYYY-[S][2]');
	});

	it('replaces every occurrence', () => {
		assert.equal(expandSemesterToken('{semester}/YYYY-S{semester}', 2), '[2]/YYYY-S[2]');
	});

	it('leaves a format without the token untouched', () => {
		assert.equal(expandSemesterToken('YYYY-MM', 1), 'YYYY-MM');
	});
});

describe('formatting a semester basename', () => {
	it('writes 2026-S1 for the first half of the year', () => {
		assert.equal(basenameFor('2026-01-01'), '2026-S1');
		assert.equal(basenameFor('2026-03-15'), '2026-S1');
	});

	it('keeps 30 June in the first semester and moves 1 July to the second', () => {
		assert.equal(basenameFor('2026-06-30'), '2026-S1');
		assert.equal(basenameFor('2026-07-01'), '2026-S2');
	});

	it('writes 2026-S2 through the end of December', () => {
		assert.equal(basenameFor('2026-12-31'), '2026-S2');
	});

	it('honours a user format that puts the semester first', () => {
		assert.equal(basenameFor('2026-09-09', '[S]{semester}-YYYY'), 'S2-2026');
	});

	it('leaves the rest of the format to moment, tokens and all', () => {
		// A bare `S` is moment's fractional-seconds token, not a letter, which is
		// exactly why the default format writes it as `[S]` and why our own token
		// expands to a bracketed literal rather than a bare digit.
		assert.equal(basenameFor('2026-09-09', 'S{semester}-YYYY'), '02-2026');
	});
});

describe('parsing a semester basename back', () => {
	it('recovers the year and the first month of the semester', () => {
		assert.deepEqual(parseBasename('2026-S1'), { year: 2026, month: 0 });
		assert.deepEqual(parseBasename('2026-S2'), { year: 2026, month: 6 });
	});

	it('round-trips every month of a year', () => {
		for (let month = 0; month < 12; month++) {
			const iso = `2026-${String(month + 1).padStart(2, '0')}-15`;
			const parsed = parseBasename(basenameFor(iso));
			assert.deepEqual(parsed, {
				year: 2026,
				month: semesterStartMonth(semesterOfMonth(month)),
			});
		}
	});

	it('rejects a semester that does not exist', () => {
		// Strict parsing is what makes this a rejection instead of a silent
		// coercion: a stray note in the semester folder is not a semester note.
		assert.equal(parseBasename('2026-S3'), null);
		assert.equal(parseBasename('2026-S0'), null);
	});

	it('rejects a basename written in another granularity format', () => {
		assert.equal(parseBasename('2026-01'), null);
		assert.equal(parseBasename('2026'), null);
		assert.equal(parseBasename('2026-Q1'), null);
	});

	it('parses a custom format the same way it writes it', () => {
		assert.deepEqual(parseBasename('S2-2026', '[S]{semester}-YYYY'), { year: 2026, month: 6 });
		assert.equal(parseBasename('2026-S2', '[S]{semester}-YYYY'), null);
	});
});
