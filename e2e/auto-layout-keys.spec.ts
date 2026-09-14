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

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 5 });
  await page.mouse.up();
}

test('auto layout alignment box keys, padding shorthand and uniform padding', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('f');
  await drag(page, [300, 200], [700, 500]);
  await page.keyboard.press('r');
  await drag(page, [340, 240], [400, 300]);
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Add auto layout/ }).click();
  await expect(page.getByRole('button', { name: 'Vertical layout' })).toHaveAttribute('aria-pressed', 'true');

  // Arrow keys move the alignment; W/A/S/D go to an edge; X toggles the Auto gap. None of them reach tool shortcuts.
  const alignment = page.getByRole('group', { name: 'Alignment' });
  await alignment.getByRole('button', { name: 'Top left' }).click();
  await page.keyboard.press('ArrowRight');
  await expect(alignment.getByRole('button', { name: 'Top center' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('s');
  await expect(alignment.getByRole('button', { name: 'Bottom center' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('a');
  await expect(alignment.getByRole('button', { name: 'Bottom left' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('x');
  await expect(page.getByLabel('Gap mode')).toHaveValue('SPACE_BETWEEN');
  await expect(page.getByRole('button', { name: 'Grid layout' })).toBeVisible();
  await alignment.getByRole('button', { name: 'Left' }).press('x');
  await expect(page.getByLabel('Gap mode')).toHaveValue('FIXED');

  // CSS shorthand in a padding field sets every side.
  await page.getByLabel('Horizontal padding').fill('1,2,3,4');
  await page.getByLabel('Horizontal padding').press('Enter');
  await page.getByRole('button', { name: 'Individual padding' }).click();
  await expect(page.getByLabel('Top padding')).toHaveValue('1');
  await expect(page.getByLabel('Right padding')).toHaveValue('2');
  await expect(page.getByLabel('Bottom padding')).toHaveValue('3');
  await expect(page.getByLabel('Left padding')).toHaveValue('4');

  // ⌘-click (Ctrl-click) a padding field to set all sides at once.
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.getByLabel('Top padding').click({ modifiers: [mod] });
  await page.getByLabel('Top padding').fill('7');
  await page.getByLabel('Top padding').press('Enter');
  await expect(page.getByLabel('Right padding')).toHaveValue('7');
  await expect(page.getByLabel('Left padding')).toHaveValue('7');
});
