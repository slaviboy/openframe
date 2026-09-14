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

test('a Change to interaction between variants switches an instance in presentation view', async ({ page }) => {
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
  await expect(page.getByRole('treeitem', { name: /=Component/ })).toHaveCount(2);
  // The set's default variant (the one instances start from) changes to the other on click.
  const firstName = 'Variant=Component 1';
  const secondName = 'Variant=Component 2';
  await page.getByRole('treeitem', { name: firstName }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Change to' });
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: secondName });
  await expect(panel.getByRole('button', { name: `On click: Change to ${secondName}` })).toBeVisible();

  // An instance of the component set (its default variant), from the Assets tab.
  await page.keyboard.press('Alt+2');
  const assets = page.getByRole('region', { name: 'Assets' });
  await assets.getByRole('list', { name: 'Local components' }).getByRole('button', { name: 'Component 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Insert instance' }).click();
  await page.getByRole('button', { name: 'File', exact: true }).click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  await expect(stage).toHaveAttribute('data-variants', '');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-variants', new RegExp(`=${secondName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  // Restart puts the instance back to its variant in the file.
  await present.getByRole('button', { name: 'Restart' }).click();
  await expect(stage).toHaveAttribute('data-variants', '');
});
