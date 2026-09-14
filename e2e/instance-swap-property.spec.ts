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

test('an instance swap property is created, applied to a nested instance, and swapped on an instance', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const component = async (x: number) => {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 60, box.y + 360, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+Alt+K');
  };
  await component(300);
  await component(500);
  const rows = page.getByRole('treeitem');
  const topLevel = (name: string) => page.locator('[role="treeitem"][aria-level="1"]').filter({ hasText: name });

  // Component 3 wraps an instance of Component 1.
  await topLevel('Component 1').click();
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await expect(page.getByTestId('type-label')).toHaveText('Component');

  // Create the instance swap property on it.
  await page.getByRole('button', { name: 'Create component property' }).click();
  await page.getByRole('menuitem', { name: 'Instance swap' }).click();
  await page.getByRole('textbox', { name: 'New property name' }).fill('Icon');
  await page.getByRole('combobox', { name: 'New property default value' }).selectOption({ label: 'Component 1' });
  await page.getByRole('checkbox', { name: 'Preferred Component 2' }).check();
  await page.getByRole('button', { name: 'Create property' }).click();
  await expect(page.getByRole('group', { name: 'Property Icon' })).toBeVisible();

  // Apply it to the nested instance from the top of the right sidebar.
  const outer = topLevel('Component 3');
  if ((await outer.getAttribute('aria-expanded')) === 'false') await outer.getByRole('button', { name: 'Expand', exact: true }).click();
  await page.locator('[role="treeitem"][aria-level="2"]').filter({ hasText: 'Component 1' }).click();
  await page.getByRole('combobox', { name: 'Instance swap property' }).selectOption('Icon');

  // An instance of Component 3 swaps its nested instance from the property's dropdown, preferred components first.
  await topLevel('Component 3').click();
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
  const icon = page.getByRole('combobox', { name: 'Icon', exact: true });
  await expect(icon.locator('option:checked')).toHaveText('Component 1');
  await expect(icon.locator('optgroup').first()).toHaveAttribute('label', 'Preferred');
  await icon.selectOption({ label: 'Component 2' });
  await expect(icon.locator('option:checked')).toHaveText('Component 2');
  await expect(rows.filter({ hasText: 'Component 2' })).not.toHaveCount(0);
});
