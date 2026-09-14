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

import { expect, test } from './fixtures';

test('⌘⌥O outlines a stroke into a vector above the filled layer; undo restores; the outline persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Add stroke' }).click();

  const layers = page.getByRole('treeitem', { name: /Rectangle 1/ });
  await layers.first().click();
  await page.keyboard.press('ControlOrMeta+Alt+O');
  await expect(layers).toHaveCount(2);
  // The inside stroke of a 100 × 100 rectangle covers its box; the outline above it is selected.
  await expect(layers.first()).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('field-w')).toHaveValue('100');
  // The rectangle keeps its fill and no longer has a stroke.
  await layers.nth(1).click();
  await expect(page.getByRole('region', { name: 'Stroke' }).getByRole('button', { name: 'Add stroke' })).toBeVisible();

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(layers).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+Z');
  await expect(layers).toHaveCount(2);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toHaveCount(2);
});
