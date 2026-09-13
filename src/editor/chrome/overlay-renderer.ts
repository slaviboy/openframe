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

import type { Id } from '@/core/ids/ids';
import { apply, type Matrix } from '@/core/math/matrix';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { GapIndicator } from '@/core/scene/equal-gaps';
import type { MeasureLine } from '@/core/scene/measure';
import { spacingHandles } from '@/core/scene/smart-selection';
import { smartSelectionInfo } from '../commands/smart-selection';
import type { SnapGuide } from '@/core/scene/snapping';
import { isSceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { cropImageWorldQuad } from '../interactions/crop';
import { textEditTarget } from '../interactions/text-edit';
import { selectionEnd, selectionStart } from '@/core/text/text-editing';
import { gradientEditChrome, type GradientChrome } from '../interactions/gradient-edit';
import { blurEditChrome } from '../interactions/blur-edit';
import { toCss, toHex6, type ColorProfile } from '@/core/color/color';
import { documentColorProfile } from '@/core/color/color-profile';
import type { Color } from '@/core/schema/document';
import { isMaskLayer } from '@/core/scene/masks';

const MASK_OUTLINE_COLOR = '#14ae5c';
import { allGuides, guideSegment, sameGuide } from '../interactions/guides';
import type { GuideRef } from '../stores/editor-store';
import { RULER_SIZE, rulerTicks } from './rulers';
import { worldToScreen } from '../viewport/viewport';
import type { ChromeTheme } from './chrome-theme';
import { forEachSection, handlePoint, isLineFrame, screenQuad, sectionTitleRect, selectionFrame, type SelectionFrame } from './selection-geometry';

export interface OverlayInput {
  readonly editor: Editor;
  readonly theme: ChromeTheme;
  readonly marquee: Rect | null;
  /** Live angle label while rotating (degrees, and pointer position in canvas pixels). */
  readonly rotation?: { angle: number; screen: Vec2 } | null;
  /** Corner radius handles (canvas pixels); `active` is the index of the dragged one, or −1. */
  readonly radiusHandles?: { readonly points: readonly Vec2[]; readonly active: number } | null;
  /** Live radius label while dragging a radius handle. */
  readonly radiusLabel?: { radius: number; screen: Vec2 } | null;
  /** Text editing chrome; `caretVisible` is the blink phase. */
  readonly textEdit?: { readonly caretVisible: boolean } | null;
  /** Snapping guides of the current move, in world coordinates. */
  readonly guides?: readonly SnapGuide[];
  /** ⌥ distance measurements, in world coordinates. */
  readonly measurements?: readonly MeasureLine[];
  /** Equal-spacing indicators while moving, in world coordinates. */
  readonly gaps?: readonly GapIndicator[];
  /** Draw rulers and ruler guides. */
  readonly rulers?: boolean;
  /** Draw the one-pixel grid (only at `PIXEL_GRID_MIN_ZOOM` and above). */
  readonly pixelGrid?: boolean;
  readonly hoveredGuide?: GuideRef | null;
  /** Outline every mask on the page (View › Mask outlines). */
  readonly maskOutlines?: boolean;
  /** Eyedropper loupe: the sampled color at a canvas point. */
  readonly eyedropper?: { readonly screen: Vec2; readonly color: Color } | null;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

const formatNumber = (n: number): string => {
  const r = Math.round(n * 100) / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0$/, '');
};

/**
 * Draws editor chrome over the scene: frame titles, hover outline, selection outlines,
 * resize handles, dimension label and marquee. Redrawn on every pointer frame; it never
 * touches the CanvasKit scene.
 */
export function drawOverlay(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, theme, dpr } = input;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, input.width, input.height);
  editor.scene.ensure(editor.pageId);
  const state = editor.state.getSnapshot();
  const selected = new Set(state.selection);

  if (input.pixelGrid) drawPixelGrid(ctx, input);
  drawFrameTitles(ctx, input, selected);
  drawSectionTitles(ctx, input, selected);
  if (input.rulers) drawRulerGuides(ctx, input);
  if (input.maskOutlines) {
    for (const id of editor.doc.descendants(editor.pageId, false)) {
      if (isMaskLayer(editor.doc, id)) outlineNode(ctx, editor, id, MASK_OUTLINE_COLOR, 1);
    }
  }

  if (state.hoverId && !selected.has(state.hoverId)) {
    outlineNode(ctx, editor, state.hoverId, theme.selection, theme.hoverWidth);
  }

  if (state.selection.length > 1) {
    for (const id of state.selection) outlineNode(ctx, editor, id, theme.selection, theme.selectionWidth);
  }

  const frame = selectionFrame(editor);
  if (frame && state.selection.length > 1) drawSmartSelection(ctx, input);
  if (frame) {
    const quad = screenQuad(editor, frame);
    // Slices are invisible in the scene, so their outline is dashed.
    if (frame.nodeId && editor.doc.get(frame.nodeId)?.type === 'SLICE') ctx.setLineDash(SLICE_DASH);
    strokeQuad(ctx, quad, theme.selection, theme.selectionWidth);
    ctx.setLineDash([]);
    drawHandles(ctx, editor, frame, theme);
    drawSizeLabel(ctx, quad, frame, theme, isLineFrame(editor, frame));
  }

  if (input.guides && input.guides.length > 0) {
    const v = editor.state.viewport;
    ctx.beginPath();
    for (const guide of input.guides) {
      if (guide.axis === 'x') {
        const x = Math.round((guide.position - v.x) * v.zoom) + 0.5;
        ctx.moveTo(x, (guide.from - v.y) * v.zoom);
        ctx.lineTo(x, (guide.to - v.y) * v.zoom);
      } else {
        const y = Math.round((guide.position - v.y) * v.zoom) + 0.5;
        ctx.moveTo((guide.from - v.x) * v.zoom, y);
        ctx.lineTo((guide.to - v.x) * v.zoom, y);
      }
    }
    ctx.strokeStyle = theme.guide;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  if (input.measurements && input.measurements.length > 0) drawMeasurements(ctx, input, input.measurements, theme.guide);
  if (input.gaps && input.gaps.length > 0) {
    const lines = input.gaps.map(
      (gap): MeasureLine =>
        gap.axis === 'x'
          ? { axis: 'x', distance: gap.distance, from: { x: gap.from, y: gap.at }, to: { x: gap.to, y: gap.at } }
          : { axis: 'y', distance: gap.distance, from: { x: gap.at, y: gap.from }, to: { x: gap.at, y: gap.to } },
    );
    drawMeasurements(ctx, input, lines, theme.spacing);
  }

  if (input.marquee) {
    const v = editor.state.viewport;
    const p = worldToScreen(v, input.marquee);
    const w = input.marquee.width * v.zoom;
    const h = input.marquee.height * v.zoom;
    ctx.fillStyle = theme.selectionFill;
    ctx.fillRect(p.x, p.y, w, h);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(p.x) + 0.5, Math.round(p.y) + 0.5, Math.round(w), Math.round(h));
  }

  if (input.radiusHandles) {
    input.radiusHandles.points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = i === input.radiusHandles!.active ? theme.selection : theme.handleFill;
      ctx.fill();
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  const label = input.rotation
    ? { text: `${formatNumber(input.rotation.angle)}°`, screen: input.rotation.screen }
    : input.radiusLabel
      ? { text: `Radius ${formatNumber(input.radiusLabel.radius)}`, screen: input.radiusLabel.screen }
      : null;
  if (label) {
    const text = label.text;
    ctx.font = theme.font;
    const w = Math.ceil(ctx.measureText(text).width) + 8;
    const x = Math.round(label.screen.x + 14);
    const y = Math.round(label.screen.y + 14);
    ctx.fillStyle = theme.selection;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 16, 2);
    ctx.fill();
    ctx.fillStyle = theme.labelText;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 4, y + 8.5);
  }

  if (input.eyedropper) drawEyedropperLoupe(ctx, input.eyedropper, theme, documentColorProfile(editor.doc));

  const gradient = gradientEditChrome(editor);
  if (gradient) drawGradientChrome(ctx, editor, gradient, theme);
  // Progressive blur handles look like a linear gradient line without stops.
  const blur = blurEditChrome(editor);
  if (blur) drawGradientChrome(ctx, editor, { linear: true, start: blur.start, end: blur.end, width: blur.start, stops: [] }, theme);

  const cropQuad = cropImageWorldQuad(editor);
  if (cropQuad) drawCropChrome(ctx, editor, cropQuad, theme);

  if (input.textEdit) drawTextEditChrome(ctx, editor, theme, input.textEdit.caretVisible);

  if (input.rulers) drawRulers(ctx, input);
}

/** Eyedropper loupe: a swatch of the sampled color beside the pointer, with its hex value. */
function drawEyedropperLoupe(ctx: CanvasRenderingContext2D, sample: { readonly screen: Vec2; readonly color: Color }, theme: ChromeTheme, profile: ColorProfile): void {
  const cx = Math.round(sample.screen.x + 28);
  const cy = Math.round(sample.screen.y - 28);
  ctx.beginPath();
  ctx.arc(cx, cy, 18, 0, Math.PI * 2);
  ctx.fillStyle = toCss({ ...sample.color, a: 1 }, profile);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.arc(cx, cy, 19.5, 0, Math.PI * 2);
  ctx.stroke();
  const text = `#${toHex6(sample.color)}`;
  ctx.font = theme.font;
  const w = Math.ceil(ctx.measureText(text).width) + 8;
  const x = Math.round(cx - w / 2);
  const y = cy + 24;
  ctx.fillStyle = theme.selection;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 16, 2);
  ctx.fill();
  ctx.fillStyle = theme.labelText;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 4, y + 8.5);
}

/**
 * On-canvas gradient editing: the gradient line (with a contrasting halo), round handles for its
 * ends (and the width axis of non-linear gradients, dashed), and a square per stop in its color.
 */
function drawGradientChrome(ctx: CanvasRenderingContext2D, editor: Editor, g: GradientChrome, theme: ChromeTheme): void {
  const v = editor.state.viewport;
  const start = worldToScreen(v, g.start);
  const end = worldToScreen(v, g.end);
  const line = (a: Vec2, b: Vec2, dash: number[]) => {
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  };
  line(start, end, []);
  const handles = [start, end];
  if (!g.linear) {
    const width = worldToScreen(v, g.width);
    line(start, width, [4, 3]);
    handles.push(width);
  }
  for (const p of handles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, theme.handleSize / 2 + 1, 0, Math.PI * 2);
    ctx.fillStyle = theme.handleFill;
    ctx.fill();
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  const size = 10;
  for (const stop of g.stops) {
    const p = worldToScreen(v, stop.point);
    const x = Math.round(p.x - size / 2) + 0.5;
    const y = Math.round(p.y - size / 2) + 0.5;
    ctx.fillStyle = toCss(stop.color, documentColorProfile(editor.doc));
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 1, y - 1, size + 2, size + 2);
  }
}

/** Crop mode: dashed outline of the whole image with round scale handles on its corners. */
/** Text editing: the text box, the selection highlight, and the caret (blinking, via `caretVisible`). */
function drawTextEditChrome(ctx: CanvasRenderingContext2D, editor: Editor, theme: ChromeTheme, caretVisible: boolean): void {
  const target = textEditTarget(editor);
  const layout = editor.textLayout;
  if (!target || !layout) return;
  const { node, selection } = target;
  editor.scene.ensure(editor.pageId);
  const world = editor.scene.worldTransform(node.id);
  const v = editor.state.viewport;
  const at = (x: number, y: number) => worldToScreen(v, apply(world, { x, y }));
  const { width: w, height: h } = node.size;
  strokeQuad(ctx, [at(0, 0), at(w, 0), at(w, h), at(0, h)], theme.selection, 1);
  const start = selectionStart(selection);
  const end = selectionEnd(selection);
  if (start < end) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = theme.selection;
    for (const r of layout.selectionRects(node, start, end)) {
      const quad = [at(r.x, r.y), at(r.x + r.width, r.y), at(r.x + r.width, r.y + r.height), at(r.x, r.y + r.height)];
      ctx.beginPath();
      quad.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  } else if (caretVisible) {
    const c = layout.caretAt(node, selection.focus);
    const top = at(c.x, c.top);
    const bottom = at(c.x, c.bottom);
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(bottom.x, bottom.y);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function drawCropChrome(ctx: CanvasRenderingContext2D, editor: Editor, quad: readonly Vec2[], theme: ChromeTheme): void {
  const v = editor.state.viewport;
  const points = quad.map((p) => worldToScreen(v, p));
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = theme.selection;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, theme.handleSize / 2, 0, Math.PI * 2);
    ctx.fillStyle = theme.handleFill;
    ctx.fill();
    ctx.strokeStyle = theme.selection;
    ctx.stroke();
  }
}

function drawRulerGuides(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, theme } = input;
  const selectedGuide = editor.state.getSnapshot().selectedGuide;
  for (const ref of allGuides(editor)) {
    const segment = guideSegment(editor, ref);
    if (!segment) continue;
    const [a, b] = segment;
    const crisp = (v: number) => Math.round(v) + 0.5;
    const vertical = Math.abs(a.x - b.x) < 0.01;
    const horizontal = Math.abs(a.y - b.y) < 0.01;
    ctx.beginPath();
    ctx.moveTo(vertical ? crisp(a.x) : a.x, horizontal ? crisp(a.y) : a.y);
    ctx.lineTo(vertical ? crisp(b.x) : b.x, horizontal ? crisp(b.y) : b.y);
    ctx.strokeStyle = sameGuide(ref, selectedGuide) || sameGuide(ref, input.hoveredGuide ?? null) ? theme.selection : theme.rulerGuide;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Top and left rulers inside the canvas area left uncovered by panels, with the selection's extent highlighted. */
function drawRulers(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, theme, width, height } = input;
  const v = editor.state.viewport;
  const { left, right, top } = editor.canvasInsets;
  const S = RULER_SIZE;
  const x0 = left;
  const x1 = width - right;
  const y0 = top;
  if (x1 - x0 <= S || height - y0 <= S) return;
  const selection = editor.selection.length > 0 ? editor.selectionBounds() : null;

  ctx.save();
  ctx.fillStyle = theme.rulerBackground;
  ctx.fillRect(x0, y0, x1 - x0, S);
  ctx.fillRect(x0, y0 + S, S, height - y0 - S);
  ctx.font = theme.rulerFont;

  // Top ruler (x axis).
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0 + S, y0, x1 - x0 - S, S);
  ctx.clip();
  if (selection) {
    ctx.fillStyle = theme.rulerHighlight;
    ctx.fillRect((selection.x - v.x) * v.zoom, y0, selection.width * v.zoom, S);
  }
  ctx.beginPath();
  ctx.fillStyle = theme.rulerText;
  ctx.textBaseline = 'top';
  for (const tick of rulerTicks(v.x, v.zoom, width)) {
    const x = Math.round(tick.screen) + 0.5;
    const length = tick.label !== null ? 8 : 4;
    ctx.moveTo(x, y0 + S - length);
    ctx.lineTo(x, y0 + S);
    if (tick.label !== null) ctx.fillText(tick.label, x + 3, y0 + 3);
  }
  ctx.strokeStyle = theme.rulerTick;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // Left ruler (y axis), labels rotated to read bottom-to-top.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0 + S, S, height - y0 - S);
  ctx.clip();
  if (selection) {
    ctx.fillStyle = theme.rulerHighlight;
    ctx.fillRect(x0, (selection.y - v.y) * v.zoom, S, selection.height * v.zoom);
  }
  ctx.beginPath();
  ctx.fillStyle = theme.rulerText;
  ctx.textBaseline = 'top';
  for (const tick of rulerTicks(v.y, v.zoom, height)) {
    const y = Math.round(tick.screen) + 0.5;
    const length = tick.label !== null ? 8 : 4;
    ctx.moveTo(x0 + S - length, y);
    ctx.lineTo(x0 + S, y);
    if (tick.label !== null) {
      ctx.save();
      ctx.translate(x0 + 3, y - 3);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(tick.label, 0, 0);
      ctx.restore();
    }
  }
  ctx.strokeStyle = theme.rulerTick;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(x0 + S, y0 + S - 0.5);
  ctx.lineTo(x1, y0 + S - 0.5);
  ctx.moveTo(x0 + S - 0.5, y0 + S);
  ctx.lineTo(x0 + S - 0.5, height);
  ctx.strokeStyle = theme.rulerBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

const SLICE_DASH = [4, 3];

/** Smart selection chrome: a pink ring at each layer's center and a pink bar in the middle of each gap. */
function drawSmartSelection(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, theme } = input;
  const info = smartSelectionInfo(editor);
  if (!info) return;
  const v = editor.state.viewport;
  ctx.save();
  ctx.strokeStyle = theme.spacing;
  ctx.lineWidth = 2;
  for (const rect of info.rects) {
    const c = worldToScreen(v, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = theme.spacing;
  for (const handle of spacingHandles(info.rects, info.selection)) {
    const p = worldToScreen(v, handle);
    const [w, h] = info.selection.axis === 'x' ? [3, 14] : [14, 3];
    ctx.beginPath();
    ctx.roundRect(Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h, 1.5);
    ctx.fill();
  }
  ctx.restore();
}

/** Red distance lines with end ticks and a centered label for each measurement. */
function drawMeasurements(ctx: CanvasRenderingContext2D, input: OverlayInput, lines: readonly MeasureLine[], color: string): void {
  const { editor, theme } = input;
  const v = editor.state.viewport;
  const crisp = (n: number) => Math.round(n) + 0.5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const line of lines) {
    const a = worldToScreen(v, line.from);
    const b = worldToScreen(v, line.to);
    if (line.axis === 'x') {
      const y = crisp(a.y);
      ctx.moveTo(a.x, y);
      ctx.lineTo(b.x, y);
      ctx.moveTo(crisp(a.x), y - 3);
      ctx.lineTo(crisp(a.x), y + 3);
      ctx.moveTo(crisp(b.x), y - 3);
      ctx.lineTo(crisp(b.x), y + 3);
    } else {
      const x = crisp(a.x);
      ctx.moveTo(x, a.y);
      ctx.lineTo(x, b.y);
      ctx.moveTo(x - 3, crisp(a.y));
      ctx.lineTo(x + 3, crisp(a.y));
      ctx.moveTo(x - 3, crisp(b.y));
      ctx.lineTo(x + 3, crisp(b.y));
    }
  }
  ctx.stroke();
  ctx.font = theme.font;
  ctx.textBaseline = 'middle';
  for (const line of lines) {
    const a = worldToScreen(v, line.from);
    const b = worldToScreen(v, line.to);
    const text = formatNumber(line.distance);
    const w = Math.ceil(ctx.measureText(text).width) + 8;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2;
    const x = Math.round(line.axis === 'x' ? cx - w / 2 : cx + 6);
    const y = Math.round(line.axis === 'x' ? cy + 6 : cy - 8);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, 16, 2);
    ctx.fill();
    ctx.fillStyle = theme.labelText;
    ctx.fillText(text, x + 4, y + 8.5);
  }
  ctx.restore();
}

/** The pixel grid appears at 400% zoom and above, where each document pixel is at least 4 screen pixels. */
export const PIXEL_GRID_MIN_ZOOM = 4;

/** Hairlines on every whole world coordinate in view, over the scene and under the chrome. */
function drawPixelGrid(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, theme, width, height } = input;
  const v = editor.state.viewport;
  if (v.zoom < PIXEL_GRID_MIN_ZOOM) return;
  ctx.beginPath();
  for (let wx = Math.ceil(v.x); (wx - v.x) * v.zoom < width; wx++) {
    const x = Math.round((wx - v.x) * v.zoom) + 0.5;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let wy = Math.ceil(v.y); (wy - v.y) * v.zoom < height; wy++) {
    const y = Math.round((wy - v.y) * v.zoom) + 0.5;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.strokeStyle = theme.pixelGrid;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/** Titles above artboards: frames directly on the page or inside a (visible) section. */
function drawFrameTitles(ctx: CanvasRenderingContext2D, input: OverlayInput, selected: Set<Id>): void {
  const { editor, theme } = input;
  ctx.font = theme.font;
  ctx.textBaseline = 'bottom';
  const v = editor.state.viewport;
  const drawTitlesIn = (parent: Id) => {
    for (const id of editor.doc.children(parent)) {
      const node = editor.doc.get(id);
      if (!node || node.type !== 'FRAME' || !node.visible) continue;
      const world = editor.scene.worldTransform(id);
      const origin = worldToScreen(v, apply(world, { x: 0, y: 0 }));
      const widthPx = node.size.width * Math.hypot(world.a, world.b) * v.zoom;
      if (origin.x > input.width || origin.y < 0 || origin.y - 20 > input.height || widthPx < 8) continue;
      ctx.fillStyle = selected.has(id) ? theme.frameTitleSelected : theme.frameTitle;
      ctx.fillText(truncate(ctx, node.name, widthPx), origin.x, origin.y - 4);
    }
  };
  drawTitlesIn(editor.pageId);
  forEachSection(editor, drawTitlesIn);
}

/** Section name pills inside each section's top-left corner (blue when selected). */
function drawSectionTitles(ctx: CanvasRenderingContext2D, input: OverlayInput, selected: Set<Id>): void {
  const { editor, theme } = input;
  ctx.font = theme.font;
  ctx.textBaseline = 'middle';
  forEachSection(editor, (id) => {
    const rect = sectionTitleRect(editor, id);
    const node = editor.doc.get(id);
    if (!rect || !node || rect.x > input.width || rect.y > input.height || rect.x + rect.width < 0 || rect.y + rect.height < 0) return;
    const active = selected.has(id);
    ctx.fillStyle = active ? theme.selection : theme.sectionTitleFill;
    ctx.beginPath();
    ctx.roundRect(Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), rect.height, 4);
    ctx.fill();
    ctx.fillStyle = active ? theme.labelText : theme.sectionTitleText;
    ctx.fillText(truncate(ctx, node.name, rect.width - 16), Math.round(rect.x) + 8, rect.y + rect.height / 2 + 0.5);
  });
}

function truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '' : `${text.slice(0, lo)}…`;
}

function outlineNode(ctx: CanvasRenderingContext2D, editor: Editor, id: Id, color: string, width: number): void {
  const node = editor.doc.get(id);
  if (!node || !isSceneNode(node)) return;
  const world = editor.scene.worldTransform(id);
  const v = editor.state.viewport;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (node.type === 'ELLIPSE') {
    ctx.beginPath();
    const toScreen: Matrix = {
      a: world.a * v.zoom,
      b: world.b * v.zoom,
      c: world.c * v.zoom,
      d: world.d * v.zoom,
      e: (world.e - v.x) * v.zoom,
      f: (world.f - v.y) * v.zoom,
    };
    ctx.transform(toScreen.a, toScreen.b, toScreen.c, toScreen.d, toScreen.e, toScreen.f);
    ctx.ellipse(node.size.width / 2, node.size.height / 2, node.size.width / 2, node.size.height / 2, 0, 0, Math.PI * 2);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  } else {
    const frame: SelectionFrame = { toWorld: world, width: node.size.width, height: node.size.height, nodeId: id };
    if (node.type === 'SLICE') ctx.setLineDash(SLICE_DASH);
    strokeQuad(ctx, screenQuad(editor, frame), color, width);
  }
  ctx.restore();
}

function strokeQuad(ctx: CanvasRenderingContext2D, quad: readonly Vec2[], color: string, width: number): void {
  ctx.beginPath();
  const snap = (v: number) => Math.round(v) + (width % 2 === 1 ? 0.5 : 0);
  const axisAligned = Math.abs(quad[0]!.y - quad[1]!.y) < 0.01 && Math.abs(quad[0]!.x - quad[3]!.x) < 0.01;
  quad.forEach((p, i) => {
    const x = axisAligned ? snap(p.x) : p.x;
    const y = axisAligned ? snap(p.y) : p.y;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

function drawHandles(ctx: CanvasRenderingContext2D, editor: Editor, frame: SelectionFrame, theme: ChromeTheme): void {
  const v = editor.state.viewport;
  const size = theme.handleSize;
  const handles = isLineFrame(editor, frame) ? (['nw', 'ne'] as const) : (['nw', 'ne', 'se', 'sw'] as const);
  for (const h of handles) {
    const p = worldToScreen(v, apply(frame.toWorld, handlePoint(frame, h)));
    const x = Math.round(p.x - size / 2) + 0.5;
    const y = Math.round(p.y - size / 2) + 0.5;
    ctx.fillStyle = theme.handleFill;
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, size, size);
  }
}

function drawSizeLabel(ctx: CanvasRenderingContext2D, quad: readonly Vec2[], frame: SelectionFrame, theme: ChromeTheme, lengthOnly = false): void {
  // Lines show their length only.
  const text = lengthOnly ? formatNumber(frame.width) : `${formatNumber(frame.width)} × ${formatNumber(frame.height)}`;
  ctx.font = theme.font;
  const metrics = ctx.measureText(text);
  const padX = 4;
  const h = 16;
  const w = Math.ceil(metrics.width) + padX * 2;
  const bottom = Math.max(...quad.map((p) => p.y));
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const x = Math.round(cx - w / 2);
  const y = Math.round(bottom + 6);
  ctx.fillStyle = theme.selection;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 2);
  ctx.fill();
  ctx.fillStyle = theme.labelText;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + h / 2 + 0.5);
}
