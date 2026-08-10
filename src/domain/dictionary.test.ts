import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickDictionary } from './dictionary.ts';

const EN = { hello: 'Hello' };
const ES = { hello: 'Hola' };
const PT = { hello: 'Olá' };
const DICTIONARIES = { es: ES, pt: PT };

describe('pickDictionary', () => {
	it('takes an exact match', () => {
		assert.equal(pickDictionary(DICTIONARIES, 'es', EN), ES);
	});

	it('falls back to the base language for a regional variant', () => {
		// Obsidian reports `pt-BR`; shipping one Portuguese dictionary is enough.
		assert.equal(pickDictionary(DICTIONARIES, 'pt-BR', EN), PT);
		assert.equal(pickDictionary(DICTIONARIES, 'es-419', EN), ES);
	});

	it('prefers the exact regional dictionary over the base one when both exist', () => {
		const ptBr = { hello: 'Oi' };
		assert.equal(pickDictionary({ ...DICTIONARIES, 'pt-BR': ptBr }, 'pt-BR', EN), ptBr);
	});

	it('falls back for a language we do not ship', () => {
		assert.equal(pickDictionary(DICTIONARIES, 'ja', EN), EN);
		assert.equal(pickDictionary(DICTIONARIES, 'ja-JP', EN), EN);
	});

	it('falls back for an empty or absent language code', () => {
		// `getLanguage()` can return an empty string; a raw key must never reach
		// the screen because of it.
		assert.equal(pickDictionary(DICTIONARIES, '', EN), EN);
		assert.equal(pickDictionary(DICTIONARIES, '-', EN), EN);
	});

	it('does not match case-insensitively, because Obsidian codes are canonical', () => {
		assert.equal(pickDictionary(DICTIONARIES, 'ES', EN), EN);
	});
});
