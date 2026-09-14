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

test('auto layout: add from the Object menu, change gap and alignment, persist, and remove', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('f');
  await drag(page, [300, 200], [700, 500]);
  await page.keyboard.press('r');
  await drag(page, [340, 240], [400, 300]);
  await page.keyboard.press('r');
  await drag(page, [440, 240], [500, 300]);

  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Object/ }).click();
  await page.getByRole('menu', { name: 'Object' }).getByRole('menuitem', { name: /Add auto layout/ }).click();

  // The row of rectangles becomes a horizontal flow with their spacing, hugging them.
  await expect(page.getByRole('button', { name: 'Horizontal layout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Gap between items')).toHaveValue('40');
  await expect(page.getByLabel('Width sizing')).toHaveValue('HUG');
  // Padding is the space around the rectangles: 40 above them, 200 below.
  await page.getByRole('button', { name: 'Individual padding' }).click();
  await expect(page.getByLabel('Top padding')).toHaveValue('40');
  await expect(page.getByLabel('Bottom padding')).toHaveValue('200');
  await page.getByRole('button', { name: 'Individual padding' }).click();
  const width = Number(await page.getByTestId('field-w').inputValue());

  await page.getByLabel('Gap between items').fill('10');
  await page.getByLabel('Gap between items').press('Enter');
  await expect(page.getByTestId('field-w')).toHaveValue(String(width - 30));

  // No vertical padding: the hugging frame is as tall as the rectangles.
  await page.getByLabel('Vertical padding').fill('0');
  await page.getByLabel('Vertical padding').press('Enter');
  await expect(page.getByTestId('field-h')).toHaveValue('60');

  // A fixed 300 px height with centered children moves them down by (300 − 60) / 2.
  await page.getByRole('treeitem', { name: /Rectangle 2/ }).click();
  await expect(page.getByLabel('Horizontal constraint')).toHaveCount(0);
  const y = Number(await page.getByTestId('field-y').inputValue());
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByLabel('Height sizing').selectOption('FIXED');
  await page.getByTestId('field-h').fill('300');
  await page.getByTestId('field-h').press('Enter');
  const center = page.getByRole('group', { name: 'Alignment' }).getByRole('button', { name: 'Center', exact: true });
  await center.click();
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 2/ }).click();
  await expect(page.getByTestId('field-y')).toHaveValue(String(y + 120));

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByRole('button', { name: 'Horizontal layout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Gap between items')).toHaveValue('10');

  await page.getByRole('button', { name: 'Freeform' }).click();
  await expect(page.getByRole('button', { name: 'Freeform' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Gap between items')).toHaveCount(0);
});
