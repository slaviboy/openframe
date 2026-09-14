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

test('a frame in a component becomes a slot from the right sidebar, and the slot settings are edited', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A frame inside a frame; the outer frame becomes the component.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 420, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+G');
  await page.keyboard.press('ControlOrMeta+Alt+K');
  await expect(page.getByTestId('type-label')).toHaveText('Component');

  const component = page.locator('[role="treeitem"][aria-level="1"]').first();
  if ((await component.getAttribute('aria-expanded')) === 'false') await component.getByRole('button', { name: 'Expand', exact: true }).click();
  await page.locator('[role="treeitem"][aria-level="2"]').first().click();
  await page.getByRole('button', { name: 'Convert to slot' }).click();
  await page.getByRole('menuitem', { name: 'New slot property' }).click();
  await expect(page.getByRole('button', { name: 'Convert to slot' })).toHaveCount(0);

  // The component lists the slot property; its settings are edited from its row.
  await component.click({ position: { x: 60, y: 8 } });
  const slot = page.getByRole('group', { name: 'Property Slot' });
  await expect(slot).toBeVisible();
  await slot.getByRole('button', { name: 'Edit slot property' }).click();
  const maximum = page.getByRole('spinbutton', { name: 'Maximum layers of Slot' });
  await maximum.fill('3');
  await maximum.press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Maximum layers of Slot' })).toHaveValue('3');
  const onlyPreferred = page.getByRole('checkbox', { name: 'Only allow preferred instances' });
  await onlyPreferred.check();
  await expect(onlyPreferred).toBeChecked();
});
