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

test('hanging quotes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.type('"Quoted"');
  await page.keyboard.press('Escape');
  const width = await page.getByTestId('field-w').inputValue();

  await page.getByRole('button', { name: 'Type settings' }).click();
  const hanging = page.getByRole('checkbox', { name: 'Hanging quotes' });
  await expect(hanging).not.toBeChecked();
  await hanging.check();
  // The quote hangs outside the box; the box itself keeps its size.
  await expect(page.getByTestId('field-w')).toHaveValue(width);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Quoted/ }).click();
  await page.getByRole('button', { name: 'Type settings' }).click();
  await expect(page.getByRole('checkbox', { name: 'Hanging quotes' })).toBeChecked();
});
