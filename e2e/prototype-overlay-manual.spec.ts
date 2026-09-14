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

test('a manually positioned overlay opens where its interaction says, relative to the layer it is on', async ({ page }) => {
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
  await drag('f', 350, 200, 200, 150);
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toBeVisible();
  await drag('f', 650, 200, 100, 60);
  await expect(page.getByRole('treeitem', { name: 'Frame 2' })).toBeVisible();
  // A button in Frame 1, at (bx, by) in the frame.
  await drag('r', 380, 230, 40, 20);
  const button = page.getByRole('treeitem', { name: 'Rectangle 1' });
  await expect(button).toHaveAttribute('aria-level', '2');
  const bx = Number(await page.getByTestId('field-x').inputValue());
  const by = Number(await page.getByTestId('field-y').inputValue());

  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Open overlay' });
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  // Frame 2 shows where each interaction opening it says.
  await page.getByRole('treeitem', { name: 'Frame 2' }).click();
  await panel.getByRole('region', { name: 'Overlay' }).getByRole('combobox', { name: 'Overlay position' }).selectOption({ label: 'Manual' });
  await button.click();
  const summary = panel.getByRole('button', { name: 'On click: Open overlay Frame 2' });
  if ((await summary.getAttribute('aria-expanded')) !== 'true') await summary.click();
  await panel.getByLabel('Overlay X', { exact: true }).fill('30');
  await panel.getByLabel('Overlay X', { exact: true }).press('Tab');
  await expect(panel.getByLabel('Overlay X', { exact: true })).toHaveValue('30');
  await panel.getByLabel('Overlay Y', { exact: true }).fill('40');
  await panel.getByLabel('Overlay Y', { exact: true }).press('Tab');
  await expect(panel.getByLabel('Overlay Y', { exact: true })).toHaveValue('40');

  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  const scale = screen.width / 200;
  await present.mouse.click(screen.x + (bx + 20) * scale, screen.y + (by + 10) * scale);
  await expect(stage).toHaveAttribute('data-overlays', 'Frame 2');
  // The overlay's top-left is 30 right of and 40 below the button's.
  await expect(stage).toHaveAttribute('data-overlay-origins', `Frame 2:${bx + 30},${by + 40}`);
});
