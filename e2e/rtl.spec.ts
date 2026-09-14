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

test('right-to-left text and direction controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Plain English text has no direction controls.
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 150);
  await page.keyboard.type('Hello');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('group', { name: 'Text direction' })).toHaveCount(0);

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 260);
  await page.keyboard.insertText('שלום עולם');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('field-w')).not.toHaveValue('0');
  const direction = page.getByRole('group', { name: 'Text direction' });
  // Detected from the text.
  await expect(direction.getByRole('button', { name: 'Right to left' })).toHaveAttribute('aria-pressed', 'true');
  await direction.getByRole('button', { name: 'Left to right' }).click();
  await expect(direction.getByRole('button', { name: 'Left to right' })).toHaveAttribute('aria-pressed', 'true');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /שלום/ }).click();
  await expect(page.getByRole('group', { name: 'Text direction' }).getByRole('button', { name: 'Left to right' })).toHaveAttribute('aria-pressed', 'true');
});
