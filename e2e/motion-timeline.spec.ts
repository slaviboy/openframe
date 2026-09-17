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

test('Motion keyframes a layer, and the playhead moves it on the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 310, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  // Motion is a mode of its own, with the timeline across the bottom.
  await page.getByRole('radio', { name: 'Motion' }).check();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  await expect(timeline).toBeVisible();
  await expect(timeline.getByTestId('field-duration')).toHaveValue('2000');
  await expect(timeline).toContainText('Select a layer and add a keyframe');

  // A keyframe at the start holds where the layer is now.
  const startX = Number(await page.getByTestId('field-x').inputValue());
  await page.getByRole('button', { name: 'Add x position keyframe' }).click();
  await expect(timeline.getByRole('group', { name: 'X position track' })).toBeVisible();

  // At 1000 ms the layer is moved 200 to the right, which records the second keyframe.
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  await current.fill('1000');
  await current.press('Enter');
  await page.getByTestId('field-x').fill(String(startX + 200));
  await page.getByTestId('field-x').press('Enter');
  await expect(timeline.getByRole('button', { name: /X position keyframe at 1000 ms/ })).toBeVisible();

  // Halfway along, the canvas shows the layer halfway: the field follows the playhead.
  await current.fill('500');
  await current.press('Enter');
  await expect.poll(async () => Number(await page.getByTestId('field-x').inputValue())).toBeGreaterThan(startX + 50);
  await expect.poll(async () => Number(await page.getByTestId('field-x').inputValue())).toBeLessThan(startX + 150);

  // Back in Design the layer is where the file has it, not where the playhead left it.
  await page.getByRole('radio', { name: 'Design' }).check();
  await expect(page.getByTestId('field-x')).toHaveValue(String(startX));
});

test('the timeline plays with Space, and its timing controls hold', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 310, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('radio', { name: 'Motion' }).check();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  await page.getByRole('button', { name: 'Add opacity keyframe' }).click();
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  await current.fill('1000');
  await current.press('Enter');
  await page.getByTestId('field-opacity').fill('0');
  await page.getByTestId('field-opacity').press('Enter');

  // Space plays: the playhead moves on its own.
  await current.fill('0');
  await current.press('Enter');
  // Clicking the canvas takes focus off the field, so Space reaches the editor.
  await page.mouse.click(box.x + 700, box.y + 140);
  await page.keyboard.press('Space');
  await expect.poll(async () => Number(await current.inputValue()), { timeout: 4000 }).toBeGreaterThan(0);
  await page.keyboard.press('Space');
  const paused = Number(await current.inputValue());
  await page.waitForTimeout(300);
  expect(Number(await current.inputValue())).toBe(paused);

  // The timing controls: seconds, playback mode and duration, kept on the page.
  await timeline.getByRole('button', { name: 'Time unit' }).click();
  await expect(timeline.getByRole('button', { name: 'Time unit' })).toHaveText('s');
  await timeline.getByRole('button', { name: 'Playback' }).click();
  await expect(timeline.getByRole('button', { name: 'Playback' })).toHaveText('Once');
  await timeline.getByTestId('field-duration').fill('3');
  await timeline.getByTestId('field-duration').press('Enter');

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('radio', { name: 'Motion' })).toBeChecked();
  await expect(page.getByRole('region', { name: 'Timeline' }).getByRole('button', { name: 'Playback' })).toHaveText('Once');
});

test('keyframes on the timeline are selected, dragged and deleted', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 310, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('radio', { name: 'Motion' }).check();
  const timeline = page.getByRole('region', { name: 'Timeline' });

  // Auto-keyframe records a keyframe for a property that is not animated yet.
  await timeline.getByRole('button', { name: 'Auto-keyframe' }).click();
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  await current.fill('400');
  await current.press('Enter');
  const startX = Number(await page.getByTestId('field-x').inputValue());
  await page.getByTestId('field-x').fill(String(startX + 120));
  await page.getByTestId('field-x').press('Enter');
  const keyframe = timeline.getByRole('button', { name: /X position keyframe at 400 ms/ });
  await expect(keyframe).toBeVisible();

  // Dragging it along the lane moves it in time.
  const lane = (await keyframe.boundingBox())!;
  await page.mouse.move(lane.x + lane.width / 2, lane.y + lane.height / 2);
  await page.mouse.down();
  await page.mouse.move(lane.x + lane.width / 2 + 120, lane.y + lane.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(timeline.getByRole('button', { name: /X position keyframe at 400 ms/ })).toHaveCount(0);
  const moved = timeline.getByRole('button', { name: /X position keyframe at/ });
  await expect(moved).toHaveCount(1);
  await expect(moved).toHaveAttribute('aria-pressed', 'true');

  // Delete takes the selected keyframe away, and undo brings it back.
  await moved.press('Delete');
  await expect(timeline.getByRole('button', { name: /X position keyframe at/ })).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(timeline.getByRole('button', { name: /X position keyframe at/ })).toHaveCount(1);
});
