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

test('matching frames (a common prefix before a slash) share their scroll position in presentation view', async ({ page }) => {
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
  const rename = async (from: string, to: string) => {
    await page.getByRole('treeitem', { name: from }).dblclick();
    await page.getByRole('textbox', { name: 'Layer name' }).fill(to);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('treeitem', { name: to })).toBeVisible();
  };
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  // Two frames, each with a rectangle reaching 60 below its bottom, scrolling vertically.
  for (const [n, x] of [
    [1, 350],
    [2, 650],
  ] as const) {
    await drag('f', x, 200, 140, 120);
    await expect(page.getByRole('treeitem', { name: `Frame ${n}` })).toBeVisible();
    await drag('r', x + 10, 310, 120, 70);
    await expect(page.getByRole('treeitem', { name: `Rectangle ${n}` })).toBeVisible();
  }
  // Renamed once both are drawn (a new frame takes the first free Frame number).
  for (const n of [1, 2]) {
    await rename(`Rectangle ${n}`, `Content ${n}`);
    await rename(`Frame ${n}`, `Checkout / ${n}`);
  }
  await page.getByRole('tab', { name: 'Prototype' }).click();
  for (const n of [1, 2]) {
    await page.getByRole('treeitem', { name: `Checkout / ${n}` }).click();
    await panel.getByRole('combobox', { name: 'Overflow' }).selectOption({ label: 'Vertical' });
  }
  await page.getByRole('treeitem', { name: 'Checkout / 1' }).click();
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Checkout / 2' });
  await page.getByRole('treeitem', { name: 'Checkout / 1' }).click();

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Checkout / 1');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  await present.mouse.move(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await present.mouse.wheel(0, 2000);
  await expect(stage).toHaveAttribute('data-scroll', /Checkout \/ 1:0,60/);
  // The destination opens scrolled as far.
  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-screen', 'Checkout / 2');
  await expect(stage).toHaveAttribute('data-scroll', /Checkout \/ 2:0,60/);
});
