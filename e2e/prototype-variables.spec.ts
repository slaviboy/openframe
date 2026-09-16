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

test('Set variable and a Conditional run in order in presentation view', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  // A number variable, 0.
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const view = page.getByRole('region', { name: 'Variables' });
  await view.getByRole('button', { name: 'Create collection' }).last().click();
  await view.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Number' }).click();
  const value = view.getByRole('table', { name: 'Collection variables' }).getByRole('textbox', { name: 'Number Mode 1' });
  await value.fill('0');
  await value.press('Enter');
  await view.getByRole('button', { name: 'Close variables' }).click();
  await expect(view).toHaveCount(0);

  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  const details = panel.getByRole('group', { name: 'Interaction details' });

  // On click: set Number to Number + 1…
  await details.getByRole('combobox', { name: 'Action', exact: true }).selectOption({ label: 'Set variable' });
  await details.getByRole('combobox', { name: 'Variable', exact: true }).selectOption({ label: 'Number' });
  const expression = details.getByRole('textbox', { name: 'Value', exact: true });
  // The field lists the variables that can go in it, and picking one writes its reference.
  const insert = details.getByRole('combobox', { name: 'Insert variable into Value' });
  await insert.selectOption({ label: 'Number' });
  await expect(expression).toHaveValue('{Number}');
  await expression.fill('{Number} +');
  await expect(expression).toHaveAttribute('aria-invalid', 'true');
  await expression.fill('{Number} + 1');
  await expect(expression).not.toHaveAttribute('aria-invalid', 'true');
  await expression.press('Enter');
  await expect(panel.getByRole('button', { name: 'On click: Set variable Number' })).toBeVisible();

  // …then if Number > 1, navigate to Frame 2.
  await details.getByRole('button', { name: 'Add action' }).click();
  await details.getByRole('combobox', { name: 'Action 2', exact: true }).selectOption({ label: 'Conditional' });
  const condition = details.getByRole('textbox', { name: 'Condition 2', exact: true });
  await condition.fill('{Number} > 1');
  await condition.press('Enter');
  await details.getByRole('button', { name: 'Add if action' }).click();
  await details.getByRole('combobox', { name: 'Destination 2 if 1', exact: true }).selectOption({ label: 'Frame 2' });
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');

  const popup = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'Present', exact: true }).click();
  const present = await popup;
  const stage = present.getByTestId('presentation');
  await expect(stage).toHaveAttribute('data-ready', 'true');
  const screen = (await present.getByTestId('presentation-screen').boundingBox())!;
  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-variables', 'Number=1');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 1');
  await present.mouse.click(screen.x + screen.width / 2, screen.y + screen.height / 2);
  await expect(stage).toHaveAttribute('data-variables', 'Number=2');
  await expect(stage).toHaveAttribute('data-screen', 'Frame 2');
});
