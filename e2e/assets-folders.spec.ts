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

test('the Assets tab lists components in folders from their slash names, or flat without sub-folders', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 380, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');

  // Rename the component with a slash.
  await page.getByRole('treeitem', { name: /Component 1/ }).dblclick();
  const layerName = page.getByRole('textbox', { name: 'Layer name' });
  await layerName.fill('Button/Primary');
  await layerName.press('Enter');
  await expect(page.getByRole('treeitem', { name: /Button\/Primary/ })).toHaveCount(1);

  await page.keyboard.press('Alt+2');
  const list = page.getByRole('list', { name: 'Local components' });
  const folder = list.getByRole('group', { name: 'Button' });
  await expect(folder.getByRole('button', { name: 'Primary', exact: true })).toBeVisible();

  const subFolders = page.getByRole('button', { name: 'Show sub-folders' });
  await expect(subFolders).toHaveAttribute('aria-pressed', 'true');
  await subFolders.click();
  await expect(subFolders).toHaveAttribute('aria-pressed', 'false');
  await expect(list.getByRole('group')).toHaveCount(0);
  await expect(list.getByRole('button', { name: 'Button/Primary', exact: true })).toBeVisible();
});
