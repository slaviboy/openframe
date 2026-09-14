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

test('spelling suggestions replace a misspelled word', async ({ page }) => {
  await page.goto('/');
  const canvas = page.getByTestId('canvas');
  await expect(canvas).toHaveAttribute('data-ready', 'true');
  const box = (await canvas.boundingBox())!;

  await page.keyboard.press('t');
  await page.mouse.click(box.x + 500, box.y + 200);
  await page.keyboard.type('recieve');
  // The dictionary loads when editing starts.
  await expect(canvas).toHaveAttribute('data-spelling', 'true');

  await page.mouse.click(box.x + 510, box.y + 200, { button: 'right' });
  const menu = page.getByRole('menu', { name: 'Context menu' });
  await menu.getByRole('menuitem', { name: 'receive', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('treeitem', { name: /^receive/ })).toHaveCount(1);

  // Check spelling can be turned off in Preferences.
  await page.getByRole('button', { name: 'Main menu' }).click();
  await page.getByRole('menu', { name: 'Main menu' }).getByRole('menuitem', { name: /^Preferences/ }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: /Check spelling/ })).toHaveAttribute('aria-checked', 'true');
});
