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

test("a component set's properties are renamed, given other values and deleted from the Properties section", async ({ page }) => {
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

  // Double-click a property to rename it.
  await page.getByRole('group', { name: 'Property Variant' }).getByText('Variant', { exact: true }).dblclick();
  const propertyName = page.getByRole('textbox', { name: 'Property name' });
  await propertyName.fill('State');
  await propertyName.press('Enter');
  const state = page.getByRole('group', { name: 'Property State' });
  await expect(state).toBeVisible();

  // Change a value from the property's values.
  const values = state.getByRole('button', { name: 'Edit values of State' });
  await expect(values).toHaveText('Component 1, Component 2');
  await values.click();
  const value = page.getByRole('textbox', { name: 'Value Component 2' });
  await value.fill('Hover');
  await value.press('Enter');
  await expect(values).toHaveText('Component 1, Hover');

  // Deleting the only property deletes the component set; undo brings it back.
  await state.click({ button: 'right', position: { x: 4, y: 4 } });
  await page.getByRole('menuitem', { name: 'Delete property' }).click();
  await expect(page.getByRole('treeitem')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.getByRole('treeitem', { name: /Component 1/ })).toHaveCount(1);
});
