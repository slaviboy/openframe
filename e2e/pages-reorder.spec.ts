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

test('pages are dragged into another order, which one undo takes back and a reload keeps', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  const pages = page.getByRole('listbox', { name: 'Pages' }).getByRole('option');
  await page.getByRole('button', { name: 'Add page' }).click();
  await page.getByRole('button', { name: 'Add page' }).click();
  await expect(pages).toHaveCount(3);
  await expect(pages).toHaveText(['Page 1', 'Page 2', 'Page 3']);

  // Drag the last page above the first one.
  const third = (await pages.nth(2).boundingBox())!;
  const first = (await pages.nth(0).boundingBox())!;
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2, first.y + 2, { steps: 6 });
  await page.mouse.up();
  await expect(pages).toHaveText(['Page 3', 'Page 1', 'Page 2']);

  await page.keyboard.press(`${mod}+z`);
  await expect(pages).toHaveText(['Page 1', 'Page 2', 'Page 3']);
  await page.keyboard.press(`${mod}+Shift+z`);
  await expect(pages).toHaveText(['Page 3', 'Page 1', 'Page 2']);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('listbox', { name: 'Pages' }).getByRole('option')).toHaveText(['Page 3', 'Page 1', 'Page 2']);
});
