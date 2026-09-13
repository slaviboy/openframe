/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from './fixtures';

/** A real TrueType font with its own family name ("codicon"), shipped with Playwright. */
function fixtureFont(): Buffer {
  const dir = join(process.cwd(), 'node_modules/playwright-core/lib/vite/recorder/assets');
  const file = readdirSync(dir).find((f) => f.startsWith('codicon') && f.endsWith('.ttf'));
  if (!file) throw new Error('codicon font fixture not found');
  return readFileSync(join(dir, file));
}

test('the font picker searches, filters, previews, uploads fonts and keeps them', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 300);
  await page.keyboard.type('Fonts');
  await page.keyboard.press('Escape');

  const family = page.getByLabel('Font family');
  await expect(family).toHaveText('Inter');
  await family.click();
  const picker = page.getByRole('dialog', { name: 'Font picker' });
  // Family options only (the filter menu's options are options too).
  const fonts = picker.getByRole('listbox', { name: 'Fonts' });
  await expect(picker.getByLabel('Search fonts')).toBeFocused();
  await expect(fonts.getByRole('option', { name: 'Inter' })).toBeVisible();
  await picker.getByLabel('Search fonts').fill('zzz');
  await expect(fonts.getByRole('option')).toHaveCount(0);
  await picker.getByLabel('Search fonts').fill('');
  await picker.getByLabel('Font filter').selectOption('user');
  await expect(fonts.getByRole('option')).toHaveCount(0);

  // Upload a font: it is listed under installed and uploaded fonts.
  const chooser = page.waitForEvent('filechooser');
  await picker.getByRole('button', { name: 'Upload fonts…' }).click();
  await (await chooser).setFiles([{ name: 'codicon.ttf', mimeType: 'font/ttf', buffer: fixtureFont() }]);
  await expect(fonts.getByRole('option', { name: 'codicon' })).toBeVisible();

  // Hovering previews without committing; Escape restores the font.
  await fonts.getByRole('option', { name: 'codicon' }).hover();
  await expect(family).toHaveText('codicon');
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  await expect(family).toHaveText('Inter');

  // Picking applies it as one undo step.
  await family.click();
  await page.getByRole('dialog', { name: 'Font picker' }).getByRole('option', { name: 'codicon' }).click();
  await expect(family).toHaveText('codicon');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.mouse.click(box.x + 900, box.y + 500);
  await page.keyboard.press(`${mod}+z`);
  await page.getByRole('treeitem', { name: /Fonts/ }).click();
  await expect(family).toHaveText('Inter');
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(family).toHaveText('codicon');

  // The uploaded font is kept across reloads, so the layer isn't missing its font.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Fonts/ }).click();
  await expect(page.getByLabel('Font family')).toHaveText('codicon');
  await page.getByLabel('Font family').click();
  await page.getByRole('dialog', { name: 'Font picker' }).getByLabel('Font filter').selectOption('file');
  await expect(page.getByRole('dialog', { name: 'Font picker' }).getByRole('option', { name: 'codicon' })).toBeVisible();
});
