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

test('Add instances inserts a component into a slot of an instance, and a slot past its limit warns', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const topLevel = (name: string) => page.locator('[role="treeitem"][aria-level="1"]').filter({ hasText: name });

  // Component 1: a rectangle to insert.
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 600, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 660, box.y + 360, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+K');

  // Frame 2, a component holding Frame 1, which becomes its slot with at most 0 layers.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 300, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 420, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+Alt+G');
  await page.keyboard.press('ControlOrMeta+Alt+K');
  const card = topLevel('Frame 2');
  if ((await card.getAttribute('aria-expanded')) === 'false') await card.getByRole('button', { name: 'Expand', exact: true }).click();
  await page.locator('[role="treeitem"][aria-level="2"]').filter({ hasText: 'Frame 1' }).click();
  await page.getByRole('button', { name: 'Convert to slot' }).click();
  await page.getByRole('menuitem', { name: 'New slot property' }).click();
  await card.click({ position: { x: 60, y: 8 } });
  await page.getByRole('group', { name: 'Property Slot' }).getByRole('button', { name: 'Edit slot property' }).click();
  const maximum = page.getByRole('spinbutton', { name: 'Maximum layers of Slot' });
  await maximum.fill('0');
  await maximum.press('Enter');
  await expect(page.getByRole('spinbutton', { name: 'Maximum layers of Slot' })).toHaveValue('0');

  // An instance of the card; add an instance of Component 1 to its slot.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await card.click({ position: { x: 60, y: 8 } });
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
  await page.getByRole('group', { name: 'Slot Slot' }).getByRole('button', { name: 'Add instances' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add instances' });
  await dialog.getByRole('button', { name: 'Component 1', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByRole('alert')).toContainText('more than its maximum of 0');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
});
