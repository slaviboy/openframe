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

/** Two rectangles of different widths, each made a component, combined into a set. */
async function componentSet(page: Page, box: { x: number; y: number }) {
  const component = async (x: number, width: number) => {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 300);
    await page.mouse.down();
    await page.mouse.move(box.x + x + width, box.y + 380, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.press('ControlOrMeta+Alt+K');
  };
  await component(300, 60);
  await component(500, 160);
  await page.keyboard.press('ControlOrMeta+A');
  await page.getByRole('button', { name: 'Combine as variants' }).click();
  await expect(page.getByTestId('type-label')).toHaveText('Component set');
  const set = page.locator('[role="treeitem"][aria-level="1"]').filter({ hasText: 'Component 1' });
  if ((await set.getAttribute('aria-expanded')) === 'false') await set.getByRole('button', { name: 'Expand', exact: true }).click();
  await expect(page.getByRole('treeitem', { name: /=Component/ })).toHaveCount(2);
}

test('a Change to animates the switch, and the instance lists its variant interactions', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await componentSet(page, box);

  // On click: Change to the wider variant, smart animated over a second.
  await page.getByRole('treeitem', { name: 'Variant=Component 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Change to' });
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Variant=Component 2' });
  const animation = panel.getByRole('combobox', { name: /^Animation/ });
  // A Change to blends the instance's layers, so it offers the animations that blend.
  await expect(animation.locator('option')).toHaveText(['Instant', 'Dissolve', 'Smart animate']);
  await animation.selectOption('SMART_ANIMATE');
  const duration = panel.getByRole('spinbutton', { name: /^Duration \(ms\)/ });
  await duration.fill('1000');
  await duration.press('Enter');

  await page.keyboard.press('Alt+2');
  const assets = page.getByRole('region', { name: 'Assets' });
  await assets.getByRole('list', { name: 'Local components' }).getByRole('button', { name: 'Component 1', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Insert instance' }).click();
  await page.getByRole('button', { name: 'File', exact: true }).click();

  // The instance shows the interactions it takes from the set, to view rather than edit.
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const variantSection = page.getByRole('region', { name: 'Variant interactions' });
  await expect(variantSection).toContainText('On click: Change to Variant=Component 2');
  await expect(variantSection.getByRole('button', { name: /Remove interaction/ })).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  const shot = () => present.screenshot({ clip: screen });
  const before = await shot();

  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  // Part way through, the instance is neither the variant left nor the one it lands on.
  await present.waitForTimeout(350);
  const midway = await shot();
  expect(midway.equals(before)).toBe(false);

  await expect(stage).toHaveAttribute('data-variants', /=Variant=Component 2$/);
  await present.waitForTimeout(1200);
  const settled = await shot();
  expect(settled.equals(midway)).toBe(false);
  // Once it settles it stays put.
  await present.waitForTimeout(300);
  expect((await shot()).equals(settled)).toBe(true);
});
