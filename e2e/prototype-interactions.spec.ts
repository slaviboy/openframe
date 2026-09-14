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

async function drawFrame(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('f');
  await page.mouse.move(box.x + x, box.y + y);
  await page.mouse.down();
  await page.mouse.move(box.x + x + 140, box.y + y + 120, { steps: 4 });
  await page.mouse.up();
}

test('the Prototype tab adds interactions and edits their trigger, actions, destination and animation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200);
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toBeVisible();
  await drawFrame(page, 650, 200);
  await expect(page.getByRole('treeitem', { name: /Frame 2/ })).toBeVisible();
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();

  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  const details = panel.getByRole('group', { name: 'Interaction details' });
  await details.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await expect(panel.getByRole('button', { name: 'On click: Navigate to Frame 2' })).toBeVisible();

  // Trigger: After delay, with its delay.
  await details.getByRole('combobox', { name: 'Trigger' }).selectOption({ label: 'After delay' });
  await details.getByLabel('Delay (ms)').fill('1500');
  await details.getByLabel('Delay (ms)').press('Enter');
  await expect(details.getByLabel('Delay (ms)')).toHaveValue('1500');

  // Animation: Push to the right, with a spring (which sets its own duration).
  await details.getByRole('combobox', { name: 'Animation', exact: true }).selectOption({ label: 'Push' });
  await details.getByRole('combobox', { name: 'Direction', exact: true }).selectOption({ label: 'Right' });
  await expect(details.getByLabel('Duration (ms)', { exact: true })).toHaveValue('300');
  await details.getByRole('combobox', { name: 'Easing', exact: true }).selectOption({ label: 'Gentle' });
  await expect(details.getByLabel('Duration (ms)', { exact: true })).toHaveCount(0);

  // A second action opens a link.
  await details.getByRole('button', { name: 'Add action' }).click();
  await details.getByRole('combobox', { name: 'Action 2', exact: true }).selectOption({ label: 'Open link' });
  await details.getByLabel('Link 2').fill('https://example.com');
  await details.getByLabel('Link 2').press('Enter');
  await expect(panel.getByRole('button', { name: 'After delay: Navigate to Frame 2 +1' })).toBeVisible();

  // Interactions are saved with the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  await panel.getByRole('button', { name: 'After delay: Navigate to Frame 2 +1' }).click();
  await expect(details.getByRole('combobox', { name: 'Direction', exact: true })).toHaveValue('RIGHT');
  await expect(details.getByLabel('Link 2')).toHaveValue('https://example.com');

  // A second interaction can't repeat a trigger the layer has.
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await expect(panel.getByRole('button', { name: 'On click: Navigate to None' })).toBeVisible();
  await expect(panel.getByRole('group', { name: 'Interaction details' }).getByRole('option', { name: 'After delay' })).toBeDisabled();

  await panel.getByRole('button', { name: 'Remove interaction 1' }).click();
  await panel.getByRole('button', { name: 'Remove interaction 1' }).click();
  await expect(panel.getByRole('list', { name: 'Interaction list' })).toHaveCount(0);
});
