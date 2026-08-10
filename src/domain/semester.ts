/**
 * Semester arithmetic and the `{semester}` format token.
 *
 * `moment` has no semester unit and no semester token — `S` already means
 * fractional seconds — so this tier is entirely ours: the month decides the
 * semester, and the token is expanded to a bracket-escaped literal *before*
 * `moment` ever sees the format string.
 *
 * Everything here takes plain numbers and strings rather than moments, which is
 * what lets the delicate part be tested without an app.
 */

/** The two semesters, in the order a parser should try them. */
export const SEMESTERS = [1, 2] as const;

/** Semester 1 or semester 2. */
export type Semester = (typeof SEMESTERS)[number];

/** Months in a semester. Half a year, by definition. */
const MONTHS_PER_SEMESTER = 6;

/**
 * Which semester a month belongs to, from a zero-based month index as
 * `moment().month()` reports it: January–June is 1, July–December is 2.
 */
export function semesterOfMonth(month: number): Semester {
	return month < MONTHS_PER_SEMESTER ? 1 : 2;
}

/** Zero-based index of the first month of a semester: January or July. */
export function semesterStartMonth(semester: Semester): number {
	return (semester - 1) * MONTHS_PER_SEMESTER;
}

/**
 * Replaces every `{semester}` in a format with the digit, escaped for `moment`.
 *
 * The brackets are what make `moment` treat the digit as a literal instead of a
 * format token, both when formatting and when parsing strictly.
 */
export function expandSemesterToken(format: string, semester: Semester): string {
	return format.replace(/\{semester\}/g, `[${String(semester)}]`);
}

/**
 * The `moment` formats a semester basename could have been written with, paired
 * with the semester each one implies.
 *
 * There are only two candidates, so trying both and keeping the one that parses
 * strictly beats writing a parser for our own token.
 */
export function semesterFormatCandidates(
	format: string
): { semester: Semester; format: string }[] {
	return SEMESTERS.map((semester) => ({
		semester,
		format: expandSemesterToken(format, semester),
	}));
}
