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

test('a flow starting point tag on the canvas moves the flow, removes it, and previews it; flows copy links and preview', async ({ page, context, browserName }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Connecting Frame 1 to Frame 2 starts Flow 1 at Frame 1; its tag sits 40 px above the frame.
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  const section = panel.getByRole('region', { name: 'Flow starting point' });
  await expect(section.getByLabel('Flow name')).toHaveValue('Flow 1');
  const empty = () => page.mouse.click(box.x + 900, box.y + 650);
  const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
    await page.mouse.move(box.x + from.x, box.y + from.y);
    await page.mouse.down();
    await page.mouse.move(box.x + to.x, box.y + to.y, { steps: 8 });
    await page.mouse.up();
  };
  const flowOf = async (frame: string) => {
    await page.getByRole('treeitem', { name: frame }).click();
    return section.getByLabel('Flow name');
  };

  // Dragging the tag by its name onto Frame 2 moves the flow there.
  await empty();
  await drag({ x: 390, y: 169 }, { x: 720, y: 260 });
  await expect(await flowOf('Frame 2')).toHaveValue('Flow 1');
  await expect(await flowOf('Frame 1')).toHaveCount(0);

  // Dragged off onto empty canvas, the starting point is removed; undo brings it back.
  await empty();
  await drag({ x: 690, y: 169 }, { x: 900, y: 600 });
  await expect(panel.getByRole('list', { name: 'Flow list' })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(panel.getByRole('list', { name: 'Flow list' }).getByRole('listitem')).toHaveCount(1);

  // Copy link, next to the Flow starting point heading, copies presentation view's address for the flow.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('treeitem', { name: 'Frame 2' }).click();
  await section.getByRole('button', { name: 'Copy link' }).click();
  await expect(section.getByRole('status')).toHaveText('Link copied');
  if (browserName === 'chromium') {
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toContain('present=1');
    expect(link).toContain('node=');
  }

  // The tag's preview icon opens inline preview at the flow.
  await empty();
  await page.mouse.click(box.x + 657, box.y + 169);
  const preview = page.getByTestId('presentation');
  await expect(preview).toHaveAttribute('data-ready', 'true');
  await expect(preview).toHaveAttribute('data-screen', 'Frame 2');
});

test('Preview in the Flows list opens inline preview at the flow', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.getByRole('treeitem', { name: 'Frame 2' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 1' });
  await page.mouse.click(box.x + 900, box.y + 650);
  await panel.getByRole('list', { name: 'Flow list' }).getByRole('button', { name: 'Preview Flow 1' }).click();
  const preview = page.getByTestId('presentation');
  await expect(preview).toHaveAttribute('data-ready', 'true');
  await expect(preview).toHaveAttribute('data-screen', 'Frame 2');
});

test('double-clicking a flow starting point tag renames the flow in a field on the tag', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  const flowName = panel.getByRole('region', { name: 'Flow starting point' }).getByLabel('Flow name');
  await expect(flowName).toHaveValue('Flow 1');

  // Escape leaves the name as it was.
  await page.mouse.dblclick(box.x + 390, box.y + 169);
  const field = page.getByRole('textbox', { name: 'Rename flow' });
  await expect(field).toHaveValue('Flow 1');
  await field.fill('Onboarding');
  await field.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(flowName).toHaveValue('Flow 1');

  // Enter renames the flow.
  await page.mouse.dblclick(box.x + 390, box.y + 169);
  await field.fill('Checkout');
  await field.press('Enter');
  await expect(field).toHaveCount(0);
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await expect(flowName).toHaveValue('Checkout');
});
