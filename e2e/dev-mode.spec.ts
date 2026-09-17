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

test('⇧D opens Dev Mode, which inspects a layer instead of editing it, and is remembered', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const toolbar = page.getByRole('toolbar', { name: 'Tools' });

  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 380, { steps: 5 });
  await page.mouse.up();
  const width = await page.getByTestId('field-w').inputValue();

  // ⇧D opens Dev Mode; the drawing tools stand down, since Dev Mode reads the design.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
  await expect(toolbar.getByRole('button', { name: /^Frame/ })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Rectangle/ })).toHaveCount(0);
  await expect(toolbar.getByRole('button', { name: /^Move \(/ })).toBeVisible();

  // The properties panel gives way to the inspect panel: measurements to read, not fields to edit.
  const inspect = page.getByTestId('inspect-panel');
  await expect(inspect).toBeVisible();
  await expect(page.getByTestId('field-w')).toHaveCount(0);
  await expect(inspect.getByRole('region', { name: 'Size' }).getByRole('button', { name: `Copy Width: ${width}` })).toBeVisible();
  await expect(inspect.getByRole('region', { name: 'Appearance' })).toContainText('100%');

  // ⇧D again returns to Design, with its fields back.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Design' })).toBeChecked();
  await expect(page.getByTestId('field-w')).toHaveValue(width);

  // The file opens in the mode it was left in.
  await page.keyboard.press('Shift+D');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('radio', { name: 'Dev Mode' })).toBeChecked();
});

test('the inspect panel waits for a single layer', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.keyboard.press('Shift+D');
  await expect(page.getByTestId('inspect-panel')).toContainText('Select a layer to inspect it.');
});

test('a design is marked ready for dev, listed in the sidebar, and shows as changed once it is edited', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A frame with a rectangle inside it: the design being handed over.
  await page.keyboard.press('f');
  await page.mouse.move(box.x + 300, box.y + 220);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 420, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Frame 1/ })).toBeVisible();
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 340, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 440, box.y + 340, { steps: 5 });
  await page.mouse.up();

  // A design is marked while designing, as the reference allows.
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  const status = page.getByRole('region', { name: 'Status' });
  await status.getByRole('button', { name: 'Mark as ready for dev' }).click();
  await expect(status).toContainText('Ready for dev');

  // Dev Mode lists it, and the page carries the badge that says so.
  await page.keyboard.press('Shift+D');
  const ready = page.getByRole('region', { name: 'Ready for development' });
  await expect(ready.getByRole('button', { name: /Frame 1/ })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Has designs ready for dev' }).or(page.getByLabel('Has designs ready for dev'))).toBeVisible();

  // Editing the design puts it in the changed state, which marking it again settles.
  await page.keyboard.press('Shift+D');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await page.getByTestId('field-x').fill('120');
  await page.getByTestId('field-x').press('Enter');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByRole('region', { name: 'Status' })).toContainText('changed');
  await page.getByRole('region', { name: 'Status' }).getByRole('button', { name: 'Mark as ready again' }).click();
  await expect(page.getByRole('region', { name: 'Status' })).not.toContainText('changed');

  // The status is part of the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Frame 1/ }).click();
  await expect(page.getByRole('region', { name: 'Status' })).toContainText('Ready for dev');
});

test('Inspect writes the selection out as code, in the language and unit chosen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 380, { steps: 5 });
  await page.mouse.up();
  const width = await page.getByTestId('field-w').inputValue();

  await page.keyboard.press('Shift+D');
  const inspect = page.getByTestId('inspect-panel');
  await inspect.getByRole('tab', { name: 'Code' }).click();
  const code = page.getByTestId('inspect-code');
  await expect(code).toContainText(`width: ${width}px;`);

  // Rems divide by the root font size, which the unit scale sets.
  await inspect.getByRole('combobox', { name: 'Code unit' }).selectOption('rem');
  await expect(code).toContainText(`width: ${Number(width) / 16}rem;`);
  await inspect.getByRole('spinbutton', { name: 'Unit scale' }).fill('10');
  await expect(code).toContainText(`width: ${Number(width) / 10}rem;`);

  // Another language writes the same layer its own way.
  await inspect.getByRole('combobox', { name: 'Code language' }).selectOption('COMPOSE');
  await expect(inspect.getByRole('combobox', { name: 'Code unit' })).toHaveValue('dp');
  await expect(code).toContainText(`.size(width = ${width}.dp`);

  await inspect.getByRole('combobox', { name: 'Code language' }).selectOption('SWIFTUI');
  await expect(code).toContainText(`.frame(width: ${width}`);

  // The List view is still there to go back to.
  await inspect.getByRole('tab', { name: 'List' }).click();
  await expect(code).toHaveCount(0);
  await expect(inspect.getByRole('region', { name: 'Size' })).toBeVisible();
});

test('⇧M saves a measurement between two layers, which is labelled, kept and removed', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // Two rectangles with a gap between them.
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 300, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 360, box.y + 320, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 500, box.y + 260);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 320, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByRole('treeitem', { name: /Rectangle 2/ })).toBeVisible();

  await page.keyboard.press('Shift+D');
  // ⇧M takes the measurement tool, and a drag from one rectangle to the other saves the distance.
  await page.keyboard.press('Shift+M');
  await expect(page.getByRole('toolbar', { name: 'Tools' }).getByRole('button', { name: /^Measurement/ })).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(box.x + 330, box.y + 290);
  await page.mouse.down();
  await page.mouse.move(box.x + 530, box.y + 290, { steps: 10 });
  await page.mouse.up();

  const measurements = page.getByRole('region', { name: 'Measurements' });
  await expect(measurements).toBeVisible();
  const label = measurements.getByRole('textbox', { name: 'Measurement 1 label' });
  await label.fill('Gutter');
  await label.press('Enter');

  // It belongs to the file, so it is still there after a reload.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('region', { name: 'Measurements' }).getByRole('textbox', { name: 'Measurement 1 label' })).toHaveValue('Gutter');

  await page.getByRole('button', { name: 'Delete measurement 1' }).click();
  await expect(page.getByRole('region', { name: 'Measurements' })).toHaveCount(0);
});

test('⇧T annotates a layer with a note, a category and the properties it calls out', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 380, { steps: 5 });
  await page.mouse.up();
  const width = await page.getByTestId('field-w').inputValue();

  // A note is written while designing, as the reference allows.
  await page.keyboard.press('Shift+T');
  const annotations = page.getByRole('region', { name: 'Annotations' });
  const note = annotations.getByRole('textbox', { name: 'Annotation 1 note' });
  await note.fill('Use the brand blue');
  await note.blur();
  await annotations.getByRole('combobox', { name: 'Annotation 1 category' }).selectOption('accessibility');

  // A called-out property reads from the design itself.
  await annotations.getByRole('combobox', { name: 'Annotation 1 add property' }).selectOption('width');
  await expect(annotations).toContainText(width);
  await page.getByTestId('field-w').fill('300');
  await page.getByTestId('field-w').press('Enter');
  await expect(annotations).toContainText('300');

  // Dev Mode shows it too, and filters by category.
  await page.keyboard.press('Shift+D');
  const devAnnotations = page.getByRole('region', { name: 'Annotations' });
  await expect(devAnnotations.getByRole('textbox', { name: 'Annotation 1 note' })).toHaveValue('Use the brand blue');
  await devAnnotations.getByRole('combobox', { name: 'Filter annotations' }).selectOption('development');
  await expect(devAnnotations.getByRole('textbox', { name: 'Annotation 1 note' })).toHaveCount(0);
  await devAnnotations.getByRole('combobox', { name: 'Filter annotations' }).selectOption('');
  await expect(devAnnotations.getByRole('textbox', { name: 'Annotation 1 note' })).toBeVisible();

  // It belongs to the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByRole('region', { name: 'Annotations' }).getByRole('textbox', { name: 'Annotation 1 note' })).toHaveValue('Use the brand blue');

  await page.getByRole('button', { name: 'Delete annotation 1' }).click();
  await expect(page.getByRole('textbox', { name: 'Annotation 1 note' })).toHaveCount(0);
});

test('Dev Mode shows a layer’s variables and the links left on it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');

  // A colour variable to bind the rectangle's fill to.
  await page.getByRole('button', { name: 'Variables', exact: true }).click();
  const variables = page.getByRole('region', { name: 'Variables' });
  await variables.getByRole('button', { name: 'Create collection' }).last().click();
  await variables.getByRole('button', { name: 'Create variable' }).click();
  await page.getByRole('menuitem', { name: 'Color' }).click();
  await page.keyboard.press('Escape');

  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 380, { steps: 5 });
  await page.mouse.up();

  await page.keyboard.press('Shift+D');
  const inspect = page.getByTestId('inspect-panel');

  // A link is pasted in and followed from the panel.
  const resources = inspect.getByRole('region', { name: 'Dev resources' });
  const field = resources.getByRole('textbox', { name: 'Add a dev resource link' });
  await field.fill('example.com/card.tsx');
  await field.press('Enter');
  const link = resources.getByRole('link', { name: 'https://example.com/card.tsx' });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', 'https://example.com/card.tsx');

  // It belongs to the file.
  await expect(page.getByTestId('save-status')).toHaveText('Saved locally');
  await page.reload();
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  await page.getByRole('treeitem', { name: /Rectangle 1/ }).click();
  await expect(page.getByRole('region', { name: 'Dev resources' }).getByRole('link')).toHaveCount(1);

  await page.getByRole('button', { name: /^Delete link/ }).click();
  await expect(page.getByRole('region', { name: 'Dev resources' }).getByRole('link')).toHaveCount(0);
});

test('an animated layer hands its animation over as code, with a read-only timeline to watch it in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 520, box.y + 380, { steps: 5 });
  await page.mouse.up();

  // A slide over the first second of the animation.
  await page.getByRole('radio', { name: 'Motion' }).check();
  const timeline = page.getByRole('region', { name: 'Timeline' });
  const current = timeline.getByRole('textbox', { name: 'Current time' });
  const startX = Number(await page.getByTestId('field-x').inputValue());
  await page.getByRole('button', { name: 'Add x position keyframe' }).click();
  await current.fill('1000');
  await current.press('Enter');
  await page.getByTestId('field-x').fill(String(startX + 100));
  await page.getByTestId('field-x').press('Enter');

  await page.getByRole('radio', { name: 'Dev Mode' }).check();
  const motion = page.getByRole('region', { name: 'Motion' });
  const code = page.getByTestId('animation-code');
  await expect(code).toContainText('@keyframes rectangle-1 {');
  // A keyframe a second into a two-second animation is halfway along it.
  await expect(code).toContainText('50% {');
  await expect(code).toContainText('animation: rectangle-1 2000ms linear infinite;');

  await motion.getByRole('combobox', { name: 'Animation code format' }).selectOption('REACT');
  await expect(code).toContainText('<motion.div');
  await expect(code).toContainText('repeat: Infinity,');
  await motion.getByRole('combobox', { name: 'Animation code format' }).selectOption('JSON');
  await expect(code).toContainText('"duration": 2000,');

  // The timeline view watches the animation without being able to change it.
  await expect(page.getByRole('region', { name: 'Timeline' })).toHaveCount(0);
  await motion.getByRole('button', { name: 'Show in timeline view' }).click();
  const devTimeline = page.getByRole('region', { name: 'Timeline' });
  await expect(devTimeline).toBeVisible();
  await expect(devTimeline.getByRole('button', { name: 'Auto-keyframe' })).toHaveCount(0);
  await expect(devTimeline.getByRole('button', { name: /X position keyframe at 0 ms/ })).toBeDisabled();

  await motion.getByRole('button', { name: 'Hide timeline view' }).click();
  await expect(page.getByRole('region', { name: 'Timeline' })).toHaveCount(0);
});

test('Dev Mode lists what the page has to hand over, icons found by their shape included', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('canvas')).toHaveAttribute('data-ready', 'true');
  const box = (await page.getByTestId('canvas').boundingBox())!;

  // A small round drawing, which reads as an icon, and a banner too big to be one.
  await page.keyboard.press('o');
  await page.mouse.move(box.x + 300, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 324, box.y + 274, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('r');
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 700, box.y + 500, { steps: 6 });
  await page.mouse.up();

  await page.keyboard.press('Shift+D');
  const assets = page.getByRole('region', { name: 'Assets' });
  await expect(assets).toBeVisible();
  // The ellipse is found by its shape and offered as SVG; the banner is not an icon, so it is not listed.
  await expect(assets.getByRole('button', { name: 'Select Ellipse 1' })).toBeVisible();
  await expect(assets).toContainText('SVG · icon');
  await expect(assets.getByRole('button', { name: 'Select Rectangle 1' })).toHaveCount(0);
  await expect(assets.getByRole('button', { name: 'Download Ellipse 1' })).toBeVisible();

  // Selecting an asset selects the layer it stands for.
  await assets.getByRole('button', { name: 'Select Ellipse 1' }).click();
  await expect(page.getByTestId('inspect-panel')).toContainText('Ellipse 1');
});
