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

test('a boolean component property is created, applied to a layer, and toggled on an instance', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 380, box.y + 380, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

  // Create a boolean property from the component's Properties section.
  await page.getByRole('button', { name: 'Create component property' }).click();
  await page.getByRole('menuitem', { name: 'Boolean' }).click();
  await page.getByRole('textbox', { name: 'New property name' }).fill('Show shape');
  await page.getByRole('button', { name: 'Create property' }).click();
  const defaultValue = page.getByRole('checkbox', { name: 'Default value of Show shape' });
  await expect(defaultValue).toBeChecked();

  // Apply it to the rectangle's visibility from the Appearance section.
  const component = page.getByRole('treeitem', { name: /Component 1/ });
  await component.getByRole('button', { name: 'Expand', exact: true }).click();
  await page.getByRole('treeitem', { name: /Rectangle/ }).click();
  await page.getByRole('combobox', { name: 'Visibility property' }).selectOption('Show shape');

  // Turning the default off hides the layer; an instance can turn it back on.
  await component.click({ position: { x: 60, y: 8 } });
  await defaultValue.uncheck();
  await expect(defaultValue).not.toBeChecked();
  await blur();
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
  const onInstance = page.getByRole('checkbox', { name: 'Show shape', exact: true });
  await expect(onInstance).not.toBeChecked();
  await onInstance.check();
  await expect(onInstance).toBeChecked();
  await blur();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(onInstance).not.toBeChecked();
});
