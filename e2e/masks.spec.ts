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

async function drag(page: Page, box: { x: number; y: number }, from: [number, number], to: [number, number]) {
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + (from[0] + to[0]) / 2, box.y + (from[1] + to[1]) / 2, { steps: 3 });
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 3 });
  await page.mouse.up();
}

test('Use as mask groups layers with the bottom layer as the mask; mask type persists; Remove mask', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('o');
  await drag(page, box, [420, 300], [520, 400]);
  await page.keyboard.press('r');
  await drag(page, box, [440, 320], [560, 420]);
  // Marquee both layers from empty canvas.
  await drag(page, box, [400, 280], [580, 440]);

  await page.mouse.click(box.x + 500, box.y + 360, { button: 'right' });
  await page.locator('[role^="menuitem"]', { hasText: 'Use as mask' }).click();
  const group = page.getByRole('treeitem', { name: /Mask group/ });
  await expect(group).toBeVisible();

  await group.getByRole('button', { name: 'Expand' }).click();
  await page.getByRole('treeitem', { name: /Ellipse 1/ }).click();
  await expect(page.getByLabel('Mask type')).toHaveValue('ALPHA');
  await page.getByLabel('Mask type').selectOption('LUMINANCE');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Mask group/ }).getByRole('button', { name: 'Expand' }).click();
  await page.getByRole('treeitem', { name: /Ellipse 1/ }).click();
  await expect(page.getByLabel('Mask type')).toHaveValue('LUMINANCE');

  await page.getByRole('button', { name: 'Remove mask' }).click();
  await expect(page.getByLabel('Mask type')).toHaveCount(0);
});
