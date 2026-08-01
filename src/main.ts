import { Plugin } from 'obsidian';

/**
 * Scaffold entry point. Phase 2 replaces this with the real lifecycle:
 * the calendar view, periodic note resolution and the public API.
 */
export default class CalendarPlusPlugin extends Plugin {
	async onload() {
		console.log('[calendar-plus] loaded');
	}
}
