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

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

test('the Text tool creates, edits, undoes and persists text layers', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const input = page.getByTestId('text-input');

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 300);
  await expect(input).toBeFocused();
  await page.keyboard.type('Hello');
  await page.keyboard.press('Escape');
  await expect(input).not.toBeFocused();
  await expect(page.getByRole('treeitem', { name: /Hello/ })).toBeVisible();
  const width = Number(await page.getByTestId('field-w').inputValue());
  expect(width).toBeGreaterThan(20);

  // Return edits the selected layer with all text selected: typing replaces it.
  await page.keyboard.press('Enter');
  await expect(input).toBeFocused();
  await page.keyboard.type('Hello world');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: /Hello world/ })).toBeVisible();
  expect(Number(await page.getByTestId('field-w').inputValue())).toBeGreaterThan(width);

  // Caret keys and backspace.
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowRight');
  for (let i = 0; i < 5; i++) await page.keyboard.press('Backspace');
  await page.keyboard.type('there');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: /Hello there/ })).toBeVisible();

  // Each editing session is one undo step; the first one also created the layer.
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByRole('treeitem', { name: /Hello world/ })).toBeVisible();
  await page.keyboard.press(`${mod}+z`);
  await page.keyboard.press(`${mod}+z`);
  await expect(page.getByRole('treeitem', { name: /Hello/ })).toHaveCount(0);
  await page.keyboard.press(`${mod}+Shift+z`);
  await page.keyboard.press(`${mod}+Shift+z`);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(page.getByRole('treeitem', { name: /Hello there/ })).toBeVisible();

  // A text layer left empty is not kept.
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 700, box.y + 450);
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem')).toHaveCount(1);

  // Dragging creates a fixed-size text box.
  await page.keyboard.press('t');
  await page.mouse.move(box.x + 400, box.y + 420);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 460, { steps: 4 });
  await page.mouse.move(box.x + 600, box.y + 500, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.type('A fixed box with enough words to wrap onto several lines');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).toHaveValue('200');
  await expect(page.getByTestId('field-h')).toHaveValue('80');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('treeitem', { name: /Hello there/ })).toBeVisible();
  await expect(page.getByRole('treeitem', { name: /A fixed box/ })).toBeVisible();
});
