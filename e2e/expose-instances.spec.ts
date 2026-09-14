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

test('an exposed nested instance shows its properties on instances of the outer component', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 360, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');
  const topLevel = (name: string) => page.locator('[role="treeitem"][aria-level="1"]').filter({ hasText: name });

  // Component 1 has a boolean property bound to its rectangle's visibility.
  await page.getByRole('button', { name: 'Create component property' }).click();
  await page.getByRole('menuitem', { name: 'Boolean' }).click();
  await page.getByRole('textbox', { name: 'New property name' }).fill('Show');
  await page.getByRole('button', { name: 'Create property' }).click();
  const inner = topLevel('Component 1');
  if ((await inner.getAttribute('aria-expanded')) === 'false') await inner.getByRole('button', { name: 'Expand', exact: true }).click();
  await page.getByRole('treeitem', { name: /Rectangle/ }).click();
  await page.getByRole('combobox', { name: 'Visibility property' }).selectOption('Show');

  // Component 2 wraps an instance of Component 1 and exposes it.
  await topLevel('Component 1').click();
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await expect(page.getByTestId('type-label')).toHaveText('Component');
  await page.getByRole('button', { name: 'Create component property' }).click();
  await page.getByRole('menuitem', { name: 'Nested instances' }).click();
  await page.getByRole('checkbox', { name: 'Expose Component 1' }).check();
  await expect(page.getByRole('group', { name: 'Exposed instances' })).toContainText('Component 1');

  // An instance of Component 2 shows the nested instance's property.
  await topLevel('Component 2').click();
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
  const nested = page.getByRole('group', { name: 'Nested instance Component 1' });
  const show = nested.getByRole('checkbox', { name: 'Show' });
  await expect(show).toBeChecked();
  await show.uncheck();
  await expect(show).not.toBeChecked();
});
