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

test('auto layout: ignore auto layout, min width and canvas stacking persist', async ({ page }) => {
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
  await expect(page.getByRole('button', { name: 'Horizontal layout' })).toHaveAttribute('aria-pressed', 'true');

  // The second rectangle leaves the flow and gets constraints; the frame hugs the first one only.
  const width = Number(await page.getByTestId('field-w').inputValue());
  await page.getByRole('treeitem', { name: /Rectangle 2/ }).click();
  await expect(page.getByLabel('Horizontal constraint')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ignore auto layout' }).click();
  await expect(page.getByRole('button', { name: 'Ignore auto layout' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Horizontal constraint')).toBeVisible();
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByTestId('field-w')).toHaveValue(String(width - 100));

  // A minimum width keeps the hugging frame at least that wide.
  await page.getByLabel('Width sizing').selectOption('ADD_MIN');
  await expect(page.getByLabel('Width sizing')).toHaveValue('HUG');
  await page.getByLabel('Min width').fill('500');
  await page.getByLabel('Min width').press('Enter');
  await expect(page.getByTestId('field-w')).toHaveValue('500');

  await page.getByRole('button', { name: 'Auto layout settings' }).click();
  await page.getByLabel('Canvas stacking').selectOption('FIRST');
  await page.getByLabel('Inside strokes').selectOption('EXCLUDED');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByLabel('Min width')).toHaveValue('500');
  await page.getByRole('button', { name: 'Auto layout settings' }).click();
  await expect(page.getByLabel('Canvas stacking')).toHaveValue('FIRST');
  await expect(page.getByLabel('Inside strokes')).toHaveValue('EXCLUDED');

  await page.getByLabel('Width sizing').selectOption('REMOVE_LIMITS');
  await expect(page.getByLabel('Min width')).toHaveCount(0);
  await expect(page.getByTestId('field-w')).toHaveValue(String(width - 100));
});
