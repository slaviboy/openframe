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

test('multi-edit variants selects every variant of the set, and Q ends it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const component = async (x: number) => {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 80, box.y + 380, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+Alt+K');
  };
  await component(300);
  await component(500);
  await page.keyboard.press('ControlOrMeta+A');
  await page.getByRole('button', { name: 'Combine as variants' }).click();

  // Select one variant.
  const set = page.locator('[role="treeitem"][aria-level="1"]').filter({ hasText: 'Component 1' });
  if ((await set.getAttribute('aria-expanded')) === 'false') await set.getByRole('button', { name: 'Expand', exact: true }).click();
  await page.getByRole('treeitem', { name: /Variant=Component 1/ }).click();
  await expect(page.getByTestId('type-label')).toHaveText('Component');

  const button = page.getByRole('button', { name: 'Multi-edit variants' });
  await button.click();
  await expect(page.getByText('2 layers')).toBeVisible();
  const exit = page.getByRole('button', { name: 'Exit multi-edit' });
  await expect(exit).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('q');
  await expect(exit).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Multi-edit variants' })).toBeVisible();
});
