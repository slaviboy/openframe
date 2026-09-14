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

test('Add variant turns a component into a component set and adds more variants to it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 240, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');

  const add = page.getByRole('button', { name: 'Add variant' });
  await add.click();
  // The new variant is selected, in a component set named after the component.
  await expect(page.getByTestId('type-label')).toHaveText('Component');
  await add.click();

  const set = page.getByRole('treeitem', { name: /(Expand|Collapse) Component 1$/ });
  await expect(set).toHaveCount(1);
  if ((await set.getAttribute('aria-expanded')) === 'false') await set.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: /Variant=Component 1/ })).toHaveCount(3);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.getByRole('treeitem', { name: /Variant=Component 1/ })).toHaveCount(2);
});
