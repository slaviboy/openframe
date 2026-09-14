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

test('Reset component state on a navigation puts the interactive components of its destination back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const component = async (x: number) => {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 80, box.y + 380, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+Alt+K');
  };
  await component(300);
  await component(500);
  await page.keyboard.press('ControlOrMeta+A');
  await page.getByRole('button', { name: 'Combine as variants' }).click();
  await expect(page.getByTestId('type-label')).toHaveText('Component set');
  const set = page.locator('[role="treeitem"][aria-level="1"]').filter({ hasText: 'Component 1' });
  if ((await set.getAttribute('aria-expanded')) === 'false') await set.getByRole('button', { name: 'Expand', exact: true }).click();
  const secondName = 'Variant=Component 2';
  // Clicking the first variant changes it to the second.
  await page.getByRole('treeitem', { name: 'Variant=Component 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Change to' });
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: secondName });

  // An instance of the set, renamed Card.
  await page.keyboard.press('Alt+2');
  const assets = page.getByRole('region', { name: 'Assets' });
  await assets.getByRole('list', { name: 'Local components' }).getByRole('button', { name: 'Component 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Insert instance' }).click();
  // The new instance is selected (the Design tab names its type); then back to the file's layers.
  await page.getByRole('tab', { name: 'Design' }).click();
  await expect(page.getByTestId('type-label')).toHaveText('Instance');
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await page.locator('[role="treeitem"][aria-selected="true"]').dblclick();
  await page.getByRole('textbox', { name: 'Layer name' }).fill('Card');
  await page.keyboard.press('Enter');
  // The row's name also holds its Expand, Lock and Hide buttons.
  const card = page.getByRole('treeitem', { name: 'Card' });
  await expect(card).toBeVisible();

  // Frame 1: N goes there from Card, and B comes back to Card resetting its component state.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 700, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 820, box.y + 220, { steps: 4 });
  await page.mouse.up();
  const frame = page.getByRole('treeitem', { name: 'Frame 1' });
  await expect(frame).toBeVisible();
  const keyInteraction = async (key: string, destination: string) => {
    await panel.getByRole('button', { name: 'Add interaction' }).click();
    await panel.getByRole('combobox', { name: 'Trigger' }).selectOption({ label: 'Key/Gamepad' });
    await panel.getByLabel('Key', { exact: true }).press(key);
    await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: destination });
  };
  await page.getByRole('tab', { name: 'Prototype' }).click();
  await card.click();
  await keyInteraction('KeyN', 'Frame 1');
  await expect(panel.getByRole('button', { name: 'Key/Gamepad: Navigate to Frame 1' })).toBeVisible();
  await frame.click();
  await keyInteraction('KeyB', 'Card');
  await panel.getByLabel('Reset component state').check();
  await expect(panel.getByLabel('Reset component state')).toBeChecked();

  await card.click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Card');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-variants', `Card=${secondName}`);
  // Away and back: the navigation back resets Card to its variant in the file.
  await present.keyboard.press('n');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  await expect(stage).toHaveAttribute('data-variants', `Card=${secondName}`);
  await present.keyboard.press('b');
  await expect(stage).toHaveAttribute('data-screen', 'Card');
  await expect(stage).toHaveAttribute('data-variants', '');
});
