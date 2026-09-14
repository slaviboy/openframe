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

test('hovering a slot of an instance on the canvas shows Add instances, which inserts into the slot', async ({ page }) => {
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

  // Frame 2, a component whose Frame 1 is a slot.
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

  // An instance of the card, on top of it.
  await card.click({ position: { x: 60, y: 8 } });
  await page.keyboard.press('ControlOrMeta+D');
  await expect(page.getByTestId('type-label')).toHaveText('Instance');

  // Hover the instance, then click the pill in its slot's top-left corner (the slot spans 300–460 × 300–420).
  await page.mouse.move(box.x + 380, box.y + 380, { steps: 4 });
  await page.mouse.click(box.x + 320, box.y + 316);
  const dialog = page.getByRole('dialog', { name: 'Add instances' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Component 1', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
});
