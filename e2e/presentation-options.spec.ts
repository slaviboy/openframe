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

test('presentation view options: keyboard shortcuts turn off, and the UI hides and shows again', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');

  // Keys go to the prototype when no button has focus (closing the menu focuses the Options button).
  const pressArrowRight = async () => {
    await present.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await present.keyboard.press('ArrowRight');
  };
  // With keyboard shortcuts off, → doesn't move to the next screen; on again, it does.
  await present.getByRole('button', { name: 'Options' }).click();
  await present.getByText('Enable keyboard shortcuts').click();
  await pressArrowRight();
  await present.waitForTimeout(300);
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  await present.getByRole('button', { name: 'Options' }).click();
  await present.getByText('Enable keyboard shortcuts').click();
  await pressArrowRight();
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');

  // Hide UI: no toolbar or footer, a reminder, and the address says so.
  await present.getByRole('button', { name: 'Options' }).click();
  await present.getByText('Hide UI').click();
  await expect(present.getByRole('button', { name: 'Options' })).toHaveCount(0);
  await expect(present.getByRole('button', { name: 'Next screen' })).toHaveCount(0);
  await expect(present.getByRole('status').filter({ hasText: 'Show UI' })).toBeVisible();
  await expect(present).toHaveURL(/hide-ui=1/);
  // Reopening the address keeps the UI hidden.
  await present.reload();
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(present.getByRole('button', { name: 'Options' })).toHaveCount(0);
  // Show UI brings it back.
  await present.getByRole('button', { name: 'Show UI' }).click();
  await expect(present.getByRole('button', { name: 'Options' })).toBeVisible();
  await expect(present).not.toHaveURL(/hide-ui/);
});
