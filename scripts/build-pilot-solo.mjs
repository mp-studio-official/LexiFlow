#!/usr/bin/env node
/**
 * Baut die kontofreie PWA für die eigene Domain unter `/ohne-konto/`.
 *
 * Der normale Build liegt zunächst an `/`, weil das die allgemeine
 * Auslieferungsform von LexiFlow ist. Im Pilot besetzt dort anschließend das
 * Kontoportal den Einstieg. Ein zweiter Vite-Lauf ist hier Absicht: Nur so
 * erhalten HTML, Manifest, Assets und Service Worker **denselben** Grundpfad
 * und der Worker darf ausschließlich `/ohne-konto/` kontrollieren.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'vite';
import {
  metadatenFuerAnmeldefreieFassung,
  pruefeAnmeldefreieFassung,
} from './pilot-einstieg.mjs';

const wurzel = resolve(import.meta.dirname, '..');
const grundpfad = '/ohne-konto/';

process.env['LEXIFLOW_BASE'] = grundpfad;

await build({
  root: wurzel,
  configFile: resolve(wurzel, 'vite.config.ts'),
  build: {
    outDir: resolve(wurzel, 'dist', 'ohne-konto'),
    emptyOutDir: true,
  },
});

const einstieg = resolve(wurzel, 'dist', 'ohne-konto', 'index.html');
const html = metadatenFuerAnmeldefreieFassung(readFileSync(einstieg, 'utf8'));
writeFileSync(einstieg, html, 'utf8');
pruefeAnmeldefreieFassung(html);
