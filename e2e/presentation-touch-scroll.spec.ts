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

test('fixed layers are labeled in the Layers panel, and dragging a finger scrolls in presentation view', async ({ page }) => {
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
  // A rectangle reaching 60 below the frame's bottom.
  await drag('r', 360, 310, 120, 70);
  await expect(page.getByRole('treeitem', { name: 'Rectangle 1' })).toBeVisible();

  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await panel.getByRole('combobox', { name: 'Overflow' }).selectOption({ label: 'Vertical' });

  // Fixed layers are labeled in the Layers panel.
  await page.getByRole('treeitem', { name: 'Rectangle 1' }).click();
  await panel.getByRole('combobox', { name: 'Scroll position' }).selectOption('FIXED');
  const row = page.getByRole('treeitem', { name: 'Rectangle 1' });
  await expect(row.getByTestId('fixed-tag')).toHaveText('Fixed');
  await panel.getByRole('combobox', { name: 'Scroll position' }).selectOption('SCROLLS');
  await expect(row.getByTestId('fixed-tag')).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  const x = screen.x + screen.width / 2;
  const y = screen.y + screen.height / 2;
  const touch = (type: string, clientY: number) => stage.dispatchEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: x, clientY, bubbles: true });
  // Dragging the finger up scrolls the content up, as far as it goes.
  await touch('pointerdown', y);
  await touch('pointermove', y - 20);
  await touch('pointermove', y - 3000);
  await touch('pointerup', y - 3000);
  await expect(stage).toHaveAttribute('data-scroll', 'Frame 1:0,60');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
});
