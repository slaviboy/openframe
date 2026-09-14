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

test('wrap style and hanging lists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A fixed-width box whose text wraps onto a second line.
  await page.keyboard.press('t');
  await page.mouse.move(box.x + 450, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 600, box.y + 260, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type('Wrap these words across two lines of text');
  await page.keyboard.press('Escape');
  const width = await page.getByTestId('field-w').inputValue();

  await page.getByRole('button', { name: 'Type settings' }).click();
  const wrap = page.getByLabel('Wrap style');
  await expect(wrap).toHaveValue('AUTO');
  await wrap.selectOption('BALANCE');
  await expect(wrap).toHaveValue('BALANCE');
  // The box keeps its size; only where lines break changes.
  await expect(page.getByTestId('field-w')).toHaveValue(width);
  await page.getByRole('checkbox', { name: 'Hanging lists' }).check();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Wrap these words/ }).click();
  await page.getByRole('button', { name: 'Type settings' }).click();
  await expect(page.getByLabel('Wrap style')).toHaveValue('BALANCE');
  await expect(page.getByRole('checkbox', { name: 'Hanging lists' })).toBeChecked();
});
