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

test('connecting frames starts a flow; flows are renamed, described and listed; overlay frames have overlay settings', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });

  // Connecting Frame 1 to Frame 2 makes Frame 1 the starting point of Flow 1.
  const flow = panel.getByRole('region', { name: 'Flow starting point' });
  await expect(flow.getByLabel('Flow name')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await expect(flow.getByLabel('Flow name')).toHaveValue('Flow 1');
  await flow.getByLabel('Flow name').fill('Checkout');
  await flow.getByLabel('Flow name').press('Enter');
  await flow.getByLabel('Flow description').fill('Buy the item');
  await flow.getByLabel('Flow description').blur();

  // Opening Frame 2 as an overlay gives it overlay settings.
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Open overlay' });
  await page.getByRole('treeitem', { name: 'Frame 2' }).click();
  const overlay = panel.getByRole('region', { name: 'Overlay' });
  await overlay.getByRole('combobox', { name: 'Overlay position' }).selectOption({ label: 'Bottom center' });
  await overlay.getByLabel('Close when clicking outside').check();
  await overlay.getByLabel('Add background behind overlay').check();
  await expect(overlay.getByLabel('Opacity (%)')).toHaveValue('25');
  await expect(panel.getByRole('region', { name: 'Flow starting point' }).getByLabel('Flow name')).toHaveCount(0);

  // With nothing selected, the page's flows are listed; Select frame selects the starting frame.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('tab', { name: 'Prototype' }).click();
  await page.keyboard.press('Escape');
  const flows = panel.getByRole('list', { name: 'Flow list' });
  await expect(flows.getByRole('listitem')).toHaveCount(1);
  await expect(flows).toContainText('Checkout');
  await expect(flows).toContainText('Buy the item');
  await flows.getByRole('button', { name: 'Select frame of Checkout' }).click();
  await expect(page.getByRole('treeitem', { name: 'Frame 1' })).toHaveAttribute('aria-selected', 'true');

  // Overlay settings persisted.
  await page.getByRole('treeitem', { name: 'Frame 2' }).click();
  await expect(overlay.getByRole('combobox', { name: 'Overlay position' })).toHaveValue('BOTTOM_CENTER');
  await expect(overlay.getByLabel('Close when clicking outside')).toBeChecked();

  // Removing the starting point.
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await panel.getByRole('button', { name: 'Remove starting point' }).click();
  await expect(panel.getByRole('button', { name: 'Add starting point' })).toBeVisible();
});
