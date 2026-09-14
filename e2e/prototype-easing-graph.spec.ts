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

test('a custom Bézier is edited on its graph, and the animation preview plays while hovered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await drawFrame(page, 350, 200, 'Frame 1');
  await drawFrame(page, 650, 200, 'Frame 2');
  await page.getByRole('treeitem', { name: 'Frame 1' }).click();
  await page.getByRole('tab', { name: 'Prototype' }).click();
  const panel = page.getByRole('tabpanel', { name: 'Prototype' });
  await panel.getByRole('button', { name: 'Add interaction' }).click();
  await panel.getByRole('combobox', { name: 'Destination', exact: true }).selectOption({ label: 'Frame 2' });
  await panel.getByRole('combobox', { name: 'Animation', exact: true }).selectOption({ label: 'Dissolve' });
  // Custom bezier starts from the Ease out curve (0, 0, 0.58, 1).
  await panel.getByRole('combobox', { name: 'Easing', exact: true }).selectOption({ label: 'Custom bezier' });
  const graph = panel.getByRole('group', { name: 'Easing graph', exact: true });
  await expect(graph).toBeVisible();
  const x1 = panel.getByLabel('X1', { exact: true });
  await expect(x1).toHaveValue('0');

  // Dragging the first handle moves it right and up.
  const handle = (await graph.getByRole('button', { name: 'Bezier handle 1', exact: true }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 25, handle.y + handle.height / 2 - 25, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await x1.inputValue())).toBeGreaterThan(0.1);
  await expect.poll(async () => Number(await panel.getByLabel('Y1', { exact: true }).inputValue())).toBeGreaterThan(0.1);
  // The arrow keys nudge the second handle.
  await graph.getByRole('button', { name: 'Bezier handle 2', exact: true }).press('ArrowRight');
  await expect(panel.getByLabel('X2', { exact: true })).toHaveValue('0.59');
  // Clicking the start keyframe puts the first handle back on it.
  await graph.getByRole('button', { name: 'Reset Bezier handle 1', exact: true }).click();
  await expect(x1).toHaveValue('0');

  // Hovering the preview plays the animation.
  const preview = panel.getByRole('img', { name: 'Animation preview', exact: true });
  await preview.hover();
  await expect(preview).toHaveAttribute('data-playing', 'true');
  await page.mouse.move(0, 0);
  await expect(preview).not.toHaveAttribute('data-playing');

  // A custom spring is dragged on its graph: right stiffens it, up lowers its damping.
  await panel.getByRole('combobox', { name: 'Easing', exact: true }).selectOption({ label: 'Custom spring' });
  const stiffness = panel.getByLabel('Stiffness', { exact: true });
  const damping = panel.getByLabel('Damping', { exact: true });
  const before = { stiffness: Number(await stiffness.inputValue()), damping: Number(await damping.inputValue()) };
  const area = (await panel.getByRole('slider', { name: 'Spring graph', exact: true }).boundingBox())!;
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 + 30, area.y + area.height / 2 - 20, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await stiffness.inputValue())).toBeGreaterThan(before.stiffness);
  await expect.poll(async () => Number(await damping.inputValue())).toBeLessThan(before.damping);
});
