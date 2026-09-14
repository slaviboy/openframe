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

test('navigating between matching frames shares the state of an interactive component interacted with', async ({ page }) => {
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

  // Two frames whose names share the Screen prefix, each holding an instance named Toggle.
  const selectedRow = page.locator('[role="treeitem"][aria-selected="true"]');
  const rename = async (name: string) => {
    await selectedRow.dblclick();
    await page.getByRole('textbox', { name: 'Layer name' }).fill(name);
    await page.keyboard.press('Enter');
    await expect(selectedRow).toContainText(name);
  };
  for (const screen of ['Screen / A', 'Screen / B']) {
    await page.keyboard.press('Alt+2');
    const assets = page.getByRole('region', { name: 'Assets' });
    await assets.getByRole('list', { name: 'Local components' }).getByRole('button', { name: 'Component 1', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Insert instance' }).click();
    await page.getByRole('tab', { name: 'Design' }).click();
    await expect(page.getByTestId('type-label')).toHaveText('Instance');
    await page.getByRole('button', { name: 'File', exact: true }).click();
    await rename('Toggle');
    // Frame selection wraps the instance in a frame, which is selected.
    await page.keyboard.press('ControlOrMeta+Alt+G');
    await expect(page.getByTestId('type-label')).toHaveText('Frame');
    await rename(screen);
  }

  // N on Screen / A goes to Screen / B.
  await page.getByRole('tab', { name: 'Prototype' }).click();
  await page.getByRole('treeitem', { name: 'Screen / A' }).click();
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Trigger' }).selectOption({ label: 'Key/Gamepad' });
  await panel.getByLabel('Key', { exact: true }).press('KeyN');
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Screen / B' });
  await expect(panel.getByRole('button', { name: 'Key/Gamepad: Navigate to Screen / B' })).toBeVisible();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-screen', 'Screen / A');
  // Nothing interacted with yet: nothing to share.
  await expect(stage).toHaveAttribute('data-variants', '');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-variants', `Toggle=${secondName}`);
  // On Screen / B, the matching Toggle is switched too.
  await present.keyboard.press('n');
  await expect(stage).toHaveAttribute('data-screen', 'Screen / B');
  await expect(stage).toHaveAttribute('data-variants', `Toggle=${secondName};Toggle=${secondName}`);
});
