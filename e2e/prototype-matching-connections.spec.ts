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

test('of matching interactions only the top-left connection shows, until it is selected', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await drawFrame(page, 500, 450, 'Frame 3');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  // A button in Frame 1 and one in Frame 2, both going to Frame 3.
  for (const [x, name] of [
    [370, 'Rectangle 1'],
    [670, 'Rectangle 2'],
  ] as const) {
    await page.keyboard.press('r');
    await page.mouse.move(box.x + x, box.y + 230);
    await page.mouse.down();
    await page.mouse.move(box.x + x + 40, box.y + 250, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole('treeitem', { name })).toHaveAttribute('aria-level', '2');
  }
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  for (const name of ['Rectangle 1', 'Rectangle 2']) {
    await page.getByRole('treeitem', { name }).click();
    await panel.getByRole('button', { name: 'Add interaction' }).click();
    await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 3' });
  }
  const selected = (name: string) => page.getByRole('treeitem', { name }).getAttribute('aria-selected');
  // Each noodle runs down to Frame 3, crossing y 350: Frame 1's button's at x 480, Frame 2's at x 630.
  const noodle1 = { x: box.x + 480, y: box.y + 350 };
  const noodle2 = { x: box.x + 630, y: box.y + 350 };
  const empty = () => page.mouse.click(box.x + 900, box.y + 650);

  // While the buttons are named differently, both connections show.
  await empty();
  await page.mouse.click(noodle2.x, noodle2.y);
  await expect.poll(() => selected('Rectangle 2')).toBe('true');

  // Named alike, they are matching interactions: only Frame 1's (the top-left) connection shows.
  // (Rows list the topmost layer first, so each button's row is kept by its test id.)
  const button1 = page.getByTestId((await page.getByRole('treeitem', { name: 'Rectangle 1' }).getAttribute('data-testid'))!);
  const button2 = page.getByTestId((await page.getByRole('treeitem', { name: 'Rectangle 2' }).getAttribute('data-testid'))!);
  for (const name of ['Rectangle 1', 'Rectangle 2']) {
    await page.getByRole('treeitem', { name }).dblclick();
    await page.getByRole('textbox', { name: 'Layer name' }).fill('Button');
    await page.keyboard.press('Enter');
  }
  await expect(page.getByRole('treeitem', { name: 'Button' })).toHaveCount(2);
  await empty();
  await page.mouse.click(noodle2.x, noodle2.y);
  await expect(button2).toHaveAttribute('aria-selected', 'false');

  // Selecting that connection shows the matching one too, which can then be selected.
  await empty();
  await page.mouse.click(noodle1.x, noodle1.y);
  await expect(button1).toHaveAttribute('aria-selected', 'true');
  await page.mouse.click(noodle2.x, noodle2.y);
  await expect(button2).toHaveAttribute('aria-selected', 'true');
});
