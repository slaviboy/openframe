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

test('duplicating a component creates an instance, labeled Instance, that persists', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 400, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await expect(page.getByTestId('type-label')).toHaveText('Component');

  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByRole('treeitem', { name: /Component 1/ })).toHaveCount(2);
  await expect(page.getByText('Instance', { exact: true })).toBeVisible();

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const rows = page.getByRole('treeitem', { name: /Component 1/ });
  await expect(rows).toHaveCount(2);
  await rows.first().click();
  await expect(page.getByText('Instance', { exact: true })).toBeVisible();
});
