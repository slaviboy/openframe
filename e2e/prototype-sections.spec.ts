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

test('a connection to a section plays its frame in presentation view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const drag = async (key: string, x: number, y: number, w: number, h: number) => {
    await page.keyboard.press(key);
    await page.mouse.move(box.x + x, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + x + w, box.y + y + h, { steps: 4 });
    await page.mouse.up();
  };
  await drag('f', 350, 200, 140, 120);
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toBeVisible();
  // A section with a frame in it.
  await drag('Shift+S', 600, 150, 320, 260);
  await expect(page.getByRole('treeitem', { name: /Section 1/ })).toBeVisible();
  await drag('f', 650, 200, 140, 120);
  await expect(page.getByRole('treeitem', { name: 'Frame 2' })).toHaveAttribute('aria-level', '2');

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Section 1' });
  await expect(panel.getByRole('button', { name: 'On click: Navigate to Section 1' })).toBeVisible();
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
});
