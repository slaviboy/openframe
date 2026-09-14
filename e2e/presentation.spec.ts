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

import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function drawFrame(page: Page, x: number, y: number, name: string) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 140, box.y + y + 120, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name })).toBeVisible();
}

test('Present opens presentation view in a new tab that plays the prototype', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');

  // Frame 1 pushes to Frame 2 on click; Enter goes back from Frame 2.
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await panel.getByRole('combobox', { name: 'Animation', exact: true }).selectOption({ label: 'Push' });
  await page.getByRole('treeitem', { name: 'Frame 2' }).click();
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Trigger' }).selectOption({ label: 'Keyboard' });
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Back' });
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');

  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  // The frame is drawn: its area doesn't look like the same-sized patch of background beside it.
  const inset = { x: screen.x + 10, y: screen.y + 10, width: 40, height: 40 };
  await expect
    .poll(async () => {
      const frame = await present.screenshot({ clip: inset });
      const background = await present.screenshot({ clip: { ...inset, x: Math.max(0, screen.x - 60) } });
      return frame.equals(background);
    })
    .toBe(false);
  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
  await present.keyboard.press('Enter');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');

  // The footer moves between screens and restarts the flow; the flows sidebar lists the flows.
  await present.getByRole('button', { name: 'Next screen' }).click();
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
  await expect(present.getByRole('status')).toHaveText('2 / 2');
  await present.getByRole('button', { name: 'Restart' }).click();
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  await present.getByRole('button', { name: 'Flows' }).click();
  await expect(present.getByRole('complementary', { name: 'Flows' })).toContainText('Flow 1');
});

test('a frame with vertical overflow scrolls in presentation view, bringing a hotspot below the fold into reach', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  // A rectangle in Frame 1 reaching 60 below its bottom (content y 110 to 180 in a 120-tall frame).
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 360, box.y + 310);
  await page.mouse.down();
  await page.mouse.move(box.x + 480, box.y + 380, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: 'Rectangle 1' })).toBeVisible();

  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await panel.getByRole('combobox', { name: 'Overflow' }).selectOption({ label: 'Vertical' });
  await expect(panel.getByRole('alert')).toHaveCount(0);

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;

  // Before scrolling, the point is above the rectangle.
  await present.mouse.click(screen.x + 70, screen.y + 100);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  // Scrolling down brings the rectangle up under it.
  await present.mouse.move(screen.x + 70, screen.y + 60);
  await present.mouse.wheel(0, 200);
  await expect(stage).toHaveAttribute('data-scroll', 'Frame 1:0,60');
  await present.mouse.click(screen.x + 70, screen.y + 100);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
});

test('a Smart animate interaction plays between matching frames', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  // A rectangle named Card in each frame, at different places and sizes: the layers match.
  const box = (await page.getByTestId('canvas').boundingBox())!;
  for (const [x, w] of [
    [360, 40],
    [700, 80],
  ] as const) {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 230);
    await page.mouse.down();
    await page.mouse.move(box.x + x + w, box.y + 270, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ControlOrMeta+r');
    await page.keyboard.type('Card');
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('treeitem', { name: 'Card' })).toHaveCount(2);

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await panel.getByRole('combobox', { name: 'Animation', exact: true }).selectOption({ label: 'Smart animate' });
  await panel.getByLabel('Duration (ms)', { exact: true }).fill('600');
  await panel.getByLabel('Duration (ms)', { exact: true }).press('Enter');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  await present.mouse.click(screen.x + screen.width - 10, screen.y + screen.height - 10);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
  // Let the transition play through its blended frames.
  await present.waitForTimeout(800);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
});
