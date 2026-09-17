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

test('the stretch between keyframes takes an easing, which shapes the animation', async ({ page }) => {
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
  const startX = Number(await page.getByTestId('field-x').inputValue());
  await page.getByRole('button', { name: 'Add x position keyframe' }).click();
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  await current.fill('1000');
  await current.press('Enter');
  await page.getByTestId('field-x').fill(String(startX + 100));
  await page.getByTestId('field-x').press('Enter');

  // Halfway along a straight line, the layer is halfway.
  await current.fill('500');
  await current.press('Enter');
  const linear = Number(await page.getByTestId('field-x').inputValue());
  expect(linear).toBeGreaterThan(startX + 40);
  expect(linear).toBeLessThan(startX + 60);

  // Hold keeps the first value until the next keyframe.
  const easing = timeline.getByRole('combobox', { name: /X position easing from 0 ms/ });
  await easing.selectOption('HOLD');
  await expect.poll(async () => Number(await page.getByTestId('field-x').inputValue())).toBe(startX);

  // Ease out covers more ground early, so halfway it is past the middle.
  await easing.selectOption('EASE_OUT');
  await expect.poll(async () => Number(await page.getByTestId('field-x').inputValue())).toBeGreaterThan(linear);

  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('region', { name: 'Timeline' }).getByRole('combobox', { name: /X position easing from 0 ms/ })).toHaveValue('EASE_OUT');
});

test('a preset animation keyframes a layer from the properties panel', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 310, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('radio', { name: 'Motion' }).check();
  const animations = page.getByRole('region', { name: 'Animations' });
  await expect(animations).toContainText('Add an animation');

  // Fade in writes its keyframes from the playhead.
  await animations.getByRole('combobox', { name: 'Add animation' }).selectOption('FADE_IN');
  const timeline = page.getByRole('region', { name: 'Timeline' });
  await expect(timeline.getByRole('button', { name: /Opacity keyframe at 0 ms/ })).toBeVisible();
  await expect(timeline.getByRole('button', { name: /Opacity keyframe at 500 ms/ })).toBeVisible();
  await expect(animations.getByRole('list', { name: 'Animated properties' })).toContainText('Opacity');

  // It starts invisible and is fully there when it lands.
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  await expect(page.getByTestId('field-opacity')).toHaveValue('0%');
  await current.fill('500');
  await current.press('Enter');
  await expect(page.getByTestId('field-opacity')).toHaveValue('100%');

  // A composite style animates several properties at once.
  await animations.getByRole('combobox', { name: 'Add animation' }).selectOption('POP_IN');
  await expect(animations.getByRole('list', { name: 'Animated properties' })).toContainText('Width');
  await expect(animations.getByRole('list', { name: 'Animated properties' })).toContainText('Height');

  // An animation is taken off again from the same list.
  await animations.getByRole('button', { name: 'Remove width animation' }).click();
  await expect(animations.getByRole('list', { name: 'Animated properties' })).not.toContainText('Width');
});

test('the anchor point is revealed with ⌥R, dragged, and turns the layer around it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 330, { steps: 5 });
  await page.mouse.up();

  await page.getByRole('radio', { name: 'Motion' }).check();
  const transform = page.getByRole('region', { name: 'Transform' });
  const edit = transform.getByRole('button', { name: 'Edit anchor point' });
  await expect(edit).toHaveAttribute('aria-pressed', 'false');

  // ⌥R reveals the target, which sits in the middle of the layer until it is moved.
  await page.mouse.click(box.x + 700, box.y + 140);
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.keyboard.press('Alt+R');
  await expect(edit).toHaveAttribute('aria-pressed', 'true');
  await expect(transform.getByRole('button', { name: 'Reset anchor point' })).toHaveCount(0);

  // Dragging it to the layer's top-left corner anchors it there.
  await page.mouse.move(box.x + 450, box.y + 290);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 250, { steps: 8 });
  await page.mouse.up();
  await expect(transform.getByRole('button', { name: 'Reset anchor point' })).toBeVisible();

  // Turning the layer now swings it around that corner, which stays where it is.
  const x = Number(await page.getByTestId('field-x').inputValue());
  const y = Number(await page.getByTestId('field-y').inputValue());
  await page.getByTestId('field-rotation').fill('90');
  await page.getByTestId('field-rotation').press('Enter');
  await expect.poll(async () => Math.round(Number(await page.getByTestId('field-x').inputValue()))).toBe(Math.round(x));
  await expect.poll(async () => Math.round(Number(await page.getByTestId('field-y').inputValue()))).toBe(Math.round(y));

  // Reset puts it back in the middle.
  await transform.getByRole('button', { name: 'Reset anchor point' }).click();
  await expect(transform.getByRole('button', { name: 'Reset anchor point' })).toHaveCount(0);
});

test('the motion path on the canvas drags a position keyframe somewhere else', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 310, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  await page.getByRole('radio', { name: 'Motion' }).check();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  const startX = Number(await page.getByTestId('field-x').inputValue());
  const startY = Number(await page.getByTestId('field-y').inputValue());
  // The 60 px the layer was drawn across say how much of the canvas one of its own units covers.
  const zoom = 60 / Number(await page.getByTestId('field-w').inputValue());

  await page.getByRole('button', { name: 'Add x position keyframe' }).click();
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  await current.fill('1000');
  await current.press('Enter');
  await page.getByTestId('field-x').fill(String(startX + 200));
  await page.getByTestId('field-x').press('Enter');
  await expect(timeline.getByRole('button', { name: /X position keyframe at 1000 ms/ })).toBeVisible();

  // The path runs from the layer to a box 200 to its right, marking where it is at 1000 ms.
  await current.fill('0');
  await current.press('Enter');
  const target = { x: box.x + 430 + 200 * zoom, y: box.y + 280 };

  // Dragging that box 100 down bends the path, and the layer gains the Y keyframes to travel it.
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y + 100 * zoom, { steps: 10 });
  await page.mouse.up();
  await expect(timeline.getByRole('group', { name: 'Y position track' })).toBeVisible();

  await current.fill('1000');
  await current.press('Enter');
  await expect.poll(async () => Number(await page.getByTestId('field-y').inputValue())).toBe(startY + 100);
  await expect(page.getByTestId('field-x')).toHaveValue(String(startX + 200));
});

test('a stretch of the motion path bends by the handle in its middle', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 460, box.y + 310, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 1/ })).toBeVisible();

  await page.getByRole('radio', { name: 'Motion' }).check();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  const startY = Number(await page.getByTestId('field-y').inputValue());
  const startX = Number(await page.getByTestId('field-x').inputValue());
  const zoom = 60 / Number(await page.getByTestId('field-w').inputValue());

  await page.getByRole('button', { name: 'Add x position keyframe' }).click();
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  await current.fill('1000');
  await current.press('Enter');
  await page.getByTestId('field-x').fill(String(startX + 200));
  await page.getByTestId('field-x').press('Enter');
  await expect(timeline.getByRole('button', { name: /X position keyframe at 1000 ms/ })).toBeVisible();
  await current.fill('0');
  await current.press('Enter');

  // The handle sits halfway along the straight path; pulling it 50 down bends the stretch that far.
  const handle = { x: box.x + 430 + 100 * zoom, y: box.y + 280 };
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(handle.x, handle.y + 50 * zoom, { steps: 10 });
  await page.mouse.up();
  await expect(timeline.getByRole('group', { name: 'Y position track' })).toBeVisible();

  // Halfway through, the layer is off the straight line by as much as the handle was pulled.
  await current.fill('500');
  await current.press('Enter');
  await expect.poll(async () => Number(await page.getByTestId('field-y').inputValue())).toBe(startY + 50);
  // At the keyframes themselves the bend has no pull, so the layer is where the path starts and ends.
  await current.fill('1000');
  await current.press('Enter');
  await expect(page.getByTestId('field-y')).toHaveValue(String(startY));
});
