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

import { pointsFrame } from '../interactions/vector-points-frame';
import { chainPointAt, strokeChain } from '@/core/vector/vector-width';
import { WIDTH_KNOB_MIN_PX } from '../interactions/vector-edit';
import { selectedHandles } from '../interactions/vector-handles';
import { arcCommands } from '@/core/geometry/arc';
import type { Id } from '@/core/ids/ids';
import { apply, type Matrix } from '@/core/math/matrix';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import type { GapIndicator } from '@/core/scene/equal-gaps';
import type { PathCommand } from '@/core/geometry/corners';
import type { MeasureLine } from '@/core/scene/measure';
import { spacingHandles } from '@/core/scene/smart-selection';
import { smartSelectionInfo } from '../commands/smart-selection';
import type { SnapGuide } from '@/core/scene/snapping';
import { isSceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { cropImageWorldQuad } from '../interactions/crop';
import { isUprightHandle, selectedLayoutHandles } from '../interactions/layout-handles';
import { GRID_EDGE_BAND_PX, selectedGridTracks } from '../interactions/grid-tracks';
import { trackLabel } from '@/core/layout/grid-track-handles';
import { networkStrokePath, regionFillPath } from '@/core/vector/vector-network';
import { textEditTarget } from '../interactions/text-edit';
import { misspelledRanges } from '@/core/text/spelling';
import { selectionEnd, selectionStart } from '@/core/text/text-editing';
import { gradientEditChrome, type GradientChrome } from '../interactions/gradient-edit';
import { blurEditChrome } from '../interactions/blur-edit';
import { toCss, toHex6, type ColorProfile } from '@/core/color/color';
import { documentColorProfile } from '@/core/color/color-profile';
import type { Color } from '@/core/schema/document';
import { isMaskLayer } from '@/core/scene/masks';
import { gridLines, layoutGuideBands } from '@/core/layout/layout-guides';

const MASK_OUTLINE_COLOR = '#14ae5c';
import { allGuides, guideSegment, sameGuide } from '../interactions/guides';
import type { GuideRef } from '../stores/editor-store';
import { RULER_SIZE, rulerTicks } from './rulers';
import { worldToScreen } from '../viewport/viewport';
import type { ChromeTheme } from './chrome-theme';
import {
  forEachSection,
  handlePoint,
  isLineFrame,
  screenQuad,
  sectionTitleRect,
  selectionFrame,
  type SelectionFrame,
  addVariantButtonRect,
  quickAddButtons,
  ADD_INSTANCES_LABEL,
  addInstancesButtonRect,
  hoveredInstanceSlots,
} from './selection-geometry';
import { variantsOf } from '@/core/document/variants';
import { slotIndicators } from '@/core/document/component-properties';
import { noodleBetween, type Noodle } from '@/core/prototype/connections';
import { flowsOf } from '@/core/prototype/flows';
import { CONNECT_HANDLE_SIZE, connectHandle, FLOW_TAG_ICON_WIDTH, overlayBadgeRect, overlayFrames, screenBounds, setFlowTags, shownConnections, type FlowTagRect } from './prototype-geometry';
import { animatedGifHash } from '../images/animated-gif';
import { TEXT_PATH_HANDLE_SIZE, textPathHandle } from './text-path-handle';
import { drawnMeasurements } from '../commands/measurements';
import { COMMENT_PIN_SIZE, drawnComments } from './comment-pins';
import { ANCHOR_HANDLE_SIZE, anchorHandle } from './anchor-handle';
import { MOTION_PATH_CURVE_SIZE, MOTION_PATH_KEYFRAME_SIZE, motionPath } from './motion-path';

/** The label an animated GIF gets next to its size. */
const GIF_TAG = 'GIF';

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
  /** Arc handles of the selected ellipse (screen points); `active` is the one being dragged. */
  readonly arcHandles?: { readonly handles: readonly { readonly kind: 'sweep' | 'start' | 'ratio'; readonly screen: Vec2 }[]; readonly active: 'sweep' | 'start' | 'ratio' | null } | null;
  /** Live sweep, start or ratio label while dragging an arc handle. */
  readonly arcLabel?: { readonly text: string; readonly screen: Vec2 } | null;
  /** Outline of the lasso being drawn in vector edit mode (screen points). */
  readonly vectorLasso?: readonly Vec2[] | null;
  /** The region the Paint tool would change, and whether it would remove the region's fill. */
  readonly vectorPaintHover?: { readonly region: number; readonly remove: boolean } | null;
  /** The pieces the Shape builder would act on, in the edited layer's space. */
  readonly vectorShapeFaces?: readonly (readonly PathCommand[])[];
  /** The eraser's path on screen and its width, while erasing in vector edit mode. */
  readonly vectorEraser?: { readonly points: readonly Vec2[]; readonly width: number } | null;
  /** Where the Variable width tool would add a width point (screen). */
  readonly vectorWidthHover?: Vec2 | null;
  /** The Cut tool's cut line on screen, while dragging it across paths. */
  readonly vectorCutLine?: readonly [Vec2, Vec2] | null;
  /** Text editing chrome; `caretVisible` is the blink phase. */
  readonly textEdit?: { readonly caretVisible: boolean } | null;
  /** Snapping guides of the current move, in world coordinates. */
  readonly guides?: readonly SnapGuide[];
  /** ⌥ distance measurements, in world coordinates. */
  readonly measurements?: readonly MeasureLine[];
  /** Auto layout insertion indicator while moving children of an auto layout frame, in world coordinates. */
  readonly insertion?: readonly [Vec2, Vec2] | null;
  /** The Pen's line from the point last placed to the pointer, in world coordinates. */
  readonly penRubberBand?: readonly [Vec2, Vec2] | null;
  /** Equal-spacing indicators while moving, in world coordinates. */
  readonly gaps?: readonly GapIndicator[];
  /** Draw rulers and ruler guides. */
  readonly rulers?: boolean;
  /** Draw the one-pixel grid (only at `PIXEL_GRID_MIN_ZOOM` and above). */
  readonly pixelGrid?: boolean;
  /** Draw frames' layout guides (View › Layout guides). */
  readonly layoutGuides?: boolean;
  readonly hoveredGuide?: GuideRef | null;
  /** Outline every mask on the page (View › Mask outlines). */
  readonly maskOutlines?: boolean;
  /** Selected connections being dragged: the pointer (screen) and the frame they would lead to. */
  readonly connectionDrag?: {
    readonly refs: readonly { readonly sourceId: Id; readonly reactionIndex: number; readonly actionIndex: number }[];
    readonly end: Vec2;
    readonly destination: Id | null;
  } | null;
  /** A connection being dragged from the + handle (screen points), and the frame it would connect to. */
  readonly connectDrag?: { readonly start: Vec2; readonly end: Vec2; readonly destination: Id | null } | null;
  /** A flow starting point's tag being dragged by its name (screen point), and the frame it would move to. */
  readonly flowTagDrag?: { readonly nodeId: Id; readonly end: Vec2; readonly destination: Id | null } | null;
  /** Eyedropper loupe: the sampled color at a canvas point. */
  readonly eyedropper?: { readonly screen: Vec2; readonly color: Color } | null;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

/** Connections and flow starting points on the canvas. */
export const PROTOTYPE_COLOR = '#0d99ff';

/** A layer's bounds on screen. */
function screenRectOf(editor: Editor, id: Id): Rect | null {
  const bounds = editor.scene.worldBounds(id);
  if (!bounds) return null;
  const v = editor.state.viewport;
  const p = worldToScreen(v, bounds);
  return { x: p.x, y: p.y, width: bounds.width * v.zoom, height: bounds.height * v.zoom };
}

function drawArrowhead(ctx: CanvasRenderingContext2D, noodle: Noodle): void {
  const dx = noodle.end.x - noodle.c2.x;
  const dy = noodle.end.y - noodle.c2.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const size = 8;
  ctx.beginPath();
  ctx.moveTo(noodle.end.x, noodle.end.y);
  ctx.lineTo(noodle.end.x - ux * size - uy * size * 0.6, noodle.end.y - uy * size + ux * size * 0.6);
  ctx.lineTo(noodle.end.x - ux * size + uy * size * 0.6, noodle.end.y - uy * size - ux * size * 0.6);
  ctx.closePath();
  ctx.fill();
}

/**
 * Prototype chrome: each flow starting point's name in a blue tag above its frame, and a noodle from each visible
 * connection's hotspot to its destination (the selection's connections, or every connection with nothing selected).
 */
function drawPrototypeChrome(ctx: CanvasRenderingContext2D, input: OverlayInput, selection: readonly Id[]): void {
  const { editor, theme } = input;
  ctx.font = theme.font;
  ctx.textBaseline = 'middle';
  const flowDrag = input.flowTagDrag ?? null;
  const tags: FlowTagRect[] = [];
  for (const flow of flowsOf(editor.doc, editor.pageId)) {
    const rect = screenRectOf(editor, flow.nodeId);
    if (!rect) continue;
    const text = `▶ ${flow.name}`;
    const width = Math.ceil(ctx.measureText(text).width) + 10;
    // A tag being dragged follows the pointer, held by its name.
    const held = flowDrag !== null && flowDrag.nodeId === flow.nodeId ? flowDrag.end : null;
    const x = Math.round(held ? held.x - FLOW_TAG_ICON_WIDTH - 4 : rect.x);
    const y = Math.round(held ? held.y - 9 : rect.y - 40);
    if (!held) tags.push({ nodeId: flow.nodeId, rect: { x, y, width, height: 18 } });
    ctx.fillStyle = PROTOTYPE_COLOR;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 18, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x + 5, y + 9.5);
  }
  setFlowTags(editor, tags);
  // The frame a dragged tag would move the flow to, outlined.
  const flowTarget = flowDrag?.destination ? screenRectOf(editor, flowDrag.destination) : null;
  if (flowTarget) {
    ctx.strokeStyle = PROTOTYPE_COLOR;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(flowTarget.x) + 0.5, Math.round(flowTarget.y) + 0.5, Math.round(flowTarget.width), Math.round(flowTarget.height));
  }
  // Each overlay frame's badge: a blue icon just outside its top-right corner (outlined while it is selected).
  const selectedOverlay = editor.state.getSnapshot().selectedOverlay;
  for (const frameId of overlayFrames(editor)) {
    const badge = overlayBadgeRect(editor, frameId);
    if (!badge) continue;
    const bx = Math.round(badge.x);
    const by = Math.round(badge.y);
    ctx.fillStyle = PROTOTYPE_COLOR;
    ctx.beginPath();
    ctx.roundRect(bx, by, badge.width, badge.height, 4);
    ctx.fill();
    // A layer over another.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx + 3.5, by + 3.5, 6, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(bx + 7, by + 7, 6, 6);
    if (selectedOverlay === frameId) {
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 1.5, by - 1.5, badge.width + 3, badge.height + 3);
    }
  }
  ctx.strokeStyle = PROTOTYPE_COLOR;
  ctx.fillStyle = PROTOTYPE_COLOR;
  ctx.lineWidth = 2;
  const selectedConnections = editor.state.getSnapshot().selectedConnections;
  const dragging = input.connectionDrag;
  const isRef = (refs: readonly { sourceId: Id; reactionIndex: number; actionIndex: number }[], connection: { sourceId: Id; reactionIndex: number; actionIndex: number }) =>
    refs.some((ref) => ref.sourceId === connection.sourceId && ref.reactionIndex === connection.reactionIndex && ref.actionIndex === connection.actionIndex);
  for (const connection of shownConnections(editor, selection)) {
    const source = screenRectOf(editor, connection.sourceId);
    const moved = dragging && isRef(dragging.refs, connection);
    // Dragged connections follow the pointer, or end on the frame under it.
    const destinationRect = moved
      ? dragging.destination
        ? screenRectOf(editor, dragging.destination)
        : { x: dragging.end.x, y: dragging.end.y, width: 0, height: 0 }
      : screenRectOf(editor, connection.destinationId);
    if (!source || !destinationRect) continue;
    const noodle = noodleBetween(source, destinationRect);
    const selectedNoodle = isRef(selectedConnections, connection);
    if (selectedNoodle) {
      // A selected connection is drawn thicker, with a light halo.
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(noodle.start.x, noodle.start.y);
      ctx.bezierCurveTo(noodle.c1.x, noodle.c1.y, noodle.c2.x, noodle.c2.y, noodle.end.x, noodle.end.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.lineWidth = selectedNoodle ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(noodle.start.x, noodle.start.y);
    ctx.bezierCurveTo(noodle.c1.x, noodle.c1.y, noodle.c2.x, noodle.c2.y, noodle.end.x, noodle.end.y);
    ctx.stroke();
    if (moved && dragging.destination && destinationRect.width > 0) {
      ctx.strokeRect(Math.round(destinationRect.x) + 0.5, Math.round(destinationRect.y) + 0.5, Math.round(destinationRect.width), Math.round(destinationRect.height));
    }
    ctx.beginPath();
    ctx.arc(noodle.start.x, noodle.start.y, 3, 0, Math.PI * 2);
    ctx.fill();
    drawArrowhead(ctx, noodle);
  }

  const drag = input.connectDrag;
  if (drag) {
    // The frame the connection would end on, outlined; the noodle follows the pointer.
    const target = drag.destination ? screenBounds(editor, drag.destination) : null;
    if (target) {
      ctx.lineWidth = 2;
      ctx.strokeRect(Math.round(target.x) + 0.5, Math.round(target.y) + 0.5, Math.round(target.width), Math.round(target.height));
    }
    const noodle = noodleBetween({ x: drag.start.x, y: drag.start.y, width: 0, height: 0 }, target ?? { x: drag.end.x, y: drag.end.y, width: 0, height: 0 });
    ctx.beginPath();
    ctx.moveTo(noodle.start.x, noodle.start.y);
    ctx.bezierCurveTo(noodle.c1.x, noodle.c1.y, noodle.c2.x, noodle.c2.y, noodle.end.x, noodle.end.y);
    ctx.stroke();
    drawArrowhead(ctx, noodle);
    return;
  }
  // The + handle on the selection's edge starts a new connection.
  const handle = connectHandle(editor);
  if (handle) {
    const { x, y } = handle.center;
    ctx.beginPath();
    ctx.arc(x, y, CONNECT_HANDLE_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = PROTOTYPE_COLOR;
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 4, y);
    ctx.lineTo(x + 4, y);
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x, y + 4);
    ctx.stroke();
  }
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
  if (input.layoutGuides) drawLayoutGuides(ctx, input);
  drawFrameTitles(ctx, input, selected);
  drawSectionTitles(ctx, input, selected);
  // The Prototype tab shows flow starting points and connections.
  if (state.rightTab === 'prototype') drawPrototypeChrome(ctx, input, state.selection);
  if (input.rulers) drawRulerGuides(ctx, input);
  if (input.maskOutlines) {
    for (const id of editor.doc.descendants(editor.pageId, false)) {
      if (isMaskLayer(editor.doc, id)) outlineNode(ctx, editor, id, MASK_OUTLINE_COLOR, 1);
    }
  }

  if (state.hoverId && !selected.has(state.hoverId)) {
    outlineNode(ctx, editor, state.hoverId, theme.selection, theme.hoverWidth);
  }
  // Slots: a pink box around the slots of the hovered instance, and around empty slots set to show.
  for (const slot of slotIndicators(editor.doc, editor.pageId, state.hoverId)) outlineNode(ctx, editor, slot, theme.slot, 1);
  // Hovering an instance shows Add instances in the top-left corner of each of its slots.
  for (const slot of hoveredInstanceSlots(editor)) {
    const pill = addInstancesButtonRect(editor, slot);
    if (pill) drawAddInstancesButton(ctx, pill, theme);
  }

  if (state.selection.length > 1) {
    for (const id of state.selection) outlineNode(ctx, editor, id, theme.selection, theme.selectionWidth);
  }

  // Multi-edit variants: a dotted rectangle around each variant of the set.
  if (state.multiEditSetId) {
    ctx.setLineDash([4, 3]);
    for (const variant of variantsOf(editor.doc, state.multiEditSetId)) outlineNode(ctx, editor, variant.id, theme.component, 1);
    ctx.setLineDash([]);
  }

  const frame = selectionFrame(editor);
  if (frame && state.selection.length > 1) drawSmartSelection(ctx, input);
  drawLayoutHandles(ctx, input);
  drawGridTracks(ctx, input);
  drawVectorEdit(ctx, input);
  if (frame) {
    const quad = screenQuad(editor, frame);
    // Slices are invisible in the scene, so their outline is dashed.
    if (frame.nodeId && editor.doc.get(frame.nodeId)?.type === 'SLICE') ctx.setLineDash(SLICE_DASH);
    strokeQuad(ctx, quad, theme.selection, theme.selectionWidth);
    ctx.setLineDash([]);
    drawHandles(ctx, editor, frame, theme);
    drawSizeLabel(ctx, quad, frame, theme, isLineFrame(editor, frame), animatedGifHash(editor, frame.nodeId) !== undefined);
    const addVariant = addVariantButtonRect(editor);
    if (addVariant) drawAddVariantButton(ctx, addVariant, theme);
    drawQuickAddButtons(ctx, input);
    // Motion: the path a layer travels, dotted between the boxes marking its position keyframes.
    const path = motionPath(editor);
    if (path) {
      ctx.fillStyle = theme.selection;
      for (const dot of path.dots) {
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = theme.selection;
      // The round handle in the middle of a stretch bends it.
      for (const handle of path.curves) {
        ctx.beginPath();
        ctx.arc(handle.screen.x, handle.screen.y, MOTION_PATH_CURVE_SIZE / 2, 0, Math.PI * 2);
        ctx.fillStyle = theme.handleFill;
        ctx.fill();
        ctx.stroke();
      }
      const side = MOTION_PATH_KEYFRAME_SIZE;
      for (const point of path.points) {
        ctx.beginPath();
        ctx.rect(point.screen.x - side / 2, point.screen.y - side / 2, side, side);
        ctx.fillStyle = theme.handleFill;
        ctx.fill();
        ctx.stroke();
      }
    }
    // Motion: the target a layer turns and scales around.
    const anchor = anchorHandle(editor);
    if (anchor) {
      const r = ANCHOR_HANDLE_SIZE / 2;
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(anchor.center.x, anchor.center.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(anchor.center.x - r - 3, anchor.center.y);
      ctx.lineTo(anchor.center.x + r + 3, anchor.center.y);
      ctx.moveTo(anchor.center.x, anchor.center.y - r - 3);
      ctx.lineTo(anchor.center.x, anchor.center.y + r + 3);
      ctx.stroke();
    }
    // Text on a path: the handle that moves the text along its path.
    const textPath = textPathHandle(editor);
    if (textPath) {
      ctx.beginPath();
      ctx.arc(textPath.center.x, textPath.center.y, TEXT_PATH_HANDLE_SIZE / 2, 0, Math.PI * 2);
      ctx.fillStyle = theme.handleFill;
      ctx.fill();
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  if (input.insertion) {
    const [from, to] = input.insertion.map((point) => worldToScreen(editor.state.viewport, point));
    ctx.beginPath();
    ctx.moveTo(from!.x, from!.y);
    ctx.lineTo(to!.x, to!.y);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The Pen's trailing line: where the next segment would go, drawn thin and dashed so it reads as not yet there.
  if (input.penRubberBand) {
    const [from, to] = input.penRubberBand.map((point) => worldToScreen(editor.state.viewport, point));
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(from!.x, from!.y);
    ctx.lineTo(to!.x, to!.y);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.restore();
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

  // Comments: a region outline where one covers an area, and a pin marking each one.
  for (const comment of drawnComments(editor)) {
    const r = COMMENT_PIN_SIZE / 2;
    if (comment.region) {
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.strokeRect(comment.region.x, comment.region.y, comment.region.width, comment.region.height);
      ctx.setLineDash([]);
    }
    const cx = comment.pin.x + r;
    const cy = comment.pin.y - r;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    // The tail points down to the spot the comment marks.
    ctx.moveTo(cx - r * 0.5, cy + r * 0.8);
    ctx.lineTo(comment.pin.x, comment.pin.y);
    ctx.lineTo(cx + r * 0.2, cy + r * 0.95);
    ctx.closePath();
    ctx.fillStyle = comment.resolved ? theme.handleFill : theme.selection;
    ctx.fill();
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // The measurements saved on the page, which everyone who opens the file sees, as against ⌥'s passing ones.
  for (const saved of drawnMeasurements(editor)) drawMeasurements(ctx, input, saved.lines, theme.spacing, saved.label);
  if (input.measurements && input.measurements.length > 0) drawMeasurements(ctx, input, input.measurements, theme.guide);
  if (input.gaps && input.gaps.length > 0) {
    const lines = input.gaps.map((gap): MeasureLine =>
      gap.axis === 'x'
        ? { axis: 'x', distance: gap.distance, from: { x: gap.from, y: gap.at }, to: { x: gap.to, y: gap.at } }
        : { axis: 'y', distance: gap.distance, from: { x: gap.at, y: gap.from }, to: { x: gap.at, y: gap.to } },
    );
    drawMeasurements(ctx, input, lines, theme.spacing);
  }

  // The box moved about with the keyboard (⌥Space), drawn like a marquee so it reads the same way.
  const keyboardBox = state.keyboardBox;
  if (keyboardBox) {
    const a = worldToScreen(editor.state.viewport, { x: keyboardBox.x, y: keyboardBox.y });
    const b = worldToScreen(editor.state.viewport, { x: keyboardBox.x + keyboardBox.width, y: keyboardBox.y + keyboardBox.height });
    ctx.fillStyle = theme.selectionFill;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(b.x - a.x), Math.round(b.y - a.y));
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

  if (input.arcHandles) {
    for (const h of input.arcHandles.handles) {
      ctx.beginPath();
      ctx.arc(h.screen.x, h.screen.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = h.kind === input.arcHandles.active ? theme.selection : theme.handleFill;
      ctx.fill();
      ctx.strokeStyle = theme.selection;
      ctx.lineWidth = 1;
      ctx.stroke();
      if (h.kind === 'start') {
        // The start handle has a dot inside it.
        ctx.beginPath();
        ctx.arc(h.screen.x, h.screen.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = theme.selection;
        ctx.fill();
      }
    }
  }

  const label = input.rotation
    ? { text: `${formatNumber(input.rotation.angle)}°`, screen: input.rotation.screen }
    : input.radiusLabel
      ? { text: `Radius ${formatNumber(input.radiusLabel.radius)}`, screen: input.radiusLabel.screen }
      : (input.arcLabel ?? null);
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
  // Misspelled words get a red wavy underline along the bottom of their text.
  if (editor.spelling) {
    ctx.save();
    ctx.strokeStyle = SPELLING_COLOR;
    ctx.lineWidth = 1;
    for (const word of misspelledRanges(node.characters, editor.spelling)) {
      for (const r of layout.selectionRects(node, word.start, word.end)) {
        drawWavyLine(ctx, at(r.x, r.y + r.height), at(r.x + r.width, r.y + r.height));
      }
    }
    ctx.restore();
  }
}

const SPELLING_COLOR = '#e5484d';

/** A small wavy line between two screen points (a spelling underline). */
function drawWavyLine(ctx: CanvasRenderingContext2D, from: Vec2, to: Vec2): void {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  if (length < 1) return;
  const ux = (to.x - from.x) / length;
  const uy = (to.y - from.y) / length;
  // Perpendicular, pointing down the text.
  const nx = -uy;
  const ny = ux;
  const step = 2;
  const amplitude = 1.5;
  ctx.beginPath();
  for (let d = 0, i = 0; d <= length; d += step, i++) {
    const offset = i % 2 === 0 ? -amplitude : amplitude;
    const x = from.x + ux * d + nx * (offset - 1);
    const y = from.y + uy * d + ny * (offset - 1);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
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
  const marked = new Set(editor.state.getSnapshot().markedLayers);
  ctx.save();
  ctx.strokeStyle = theme.spacing;
  ctx.fillStyle = theme.spacing;
  ctx.lineWidth = 2;
  for (const [i, rect] of info.rects.entries()) {
    const c = worldToScreen(v, { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    ctx.beginPath();
    ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
    // A marked layer's ring is filled in, which is what says duplicating or deleting will act on it alone.
    if (marked.has(info.ids[i]!)) ctx.fill();
    else ctx.stroke();
  }
  for (const handle of spacingHandles(info.rects, info.selection)) {
    const p = worldToScreen(v, handle);
    const [w, h] = info.selection.axis === 'x' ? [3, 14] : [14, 3];
    ctx.beginPath();
    ctx.roundRect(Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h, 1.5);
    ctx.fill();
  }
  ctx.restore();
}

/** Vector edit mode: the edited layer's segments and its points, selected points filled. */
function drawVectorEdit(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, theme } = input;
  const state = editor.state.getSnapshot().vectorEdit;
  const node = state ? editor.doc.get(state.nodeId) : undefined;
  if (!state || node?.type !== 'VECTOR') return;
  const v = editor.state.viewport;
  const m = editor.scene.worldTransform(node.id);
  const toScreen = (p: Vec2) => worldToScreen(v, apply(m, p));
  ctx.save();
  ctx.beginPath();
  for (const command of networkStrokePath(node.vectorNetwork)) {
    if (command.op === 'Z') ctx.closePath();
    else if (command.op === 'C') {
      const [c1, c2, to] = [toScreen({ x: command.x1, y: command.y1 }), toScreen({ x: command.x2, y: command.y2 }), toScreen(command)];
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
    } else {
      const to = toScreen(command);
      if (command.op === 'M') ctx.moveTo(to.x, to.y);
      else ctx.lineTo(to.x, to.y);
    }
  }
  ctx.strokeStyle = theme.selection;
  ctx.lineWidth = 1;
  ctx.stroke();
  const hover = input.vectorPaintHover;
  const hoverRegion = hover ? node.vectorNetwork.regions[hover.region] : undefined;
  if (hover && hoverRegion) {
    // Diagonal stripes over the region the Paint tool would change: blue to fill it, red to remove its fill.
    ctx.save();
    ctx.beginPath();
    for (const command of regionFillPath(node.vectorNetwork, hoverRegion)) {
      if (command.op === 'Z') ctx.closePath();
      else if (command.op === 'C') {
        const [c1, c2, to] = [toScreen({ x: command.x1, y: command.y1 }), toScreen({ x: command.x2, y: command.y2 }), toScreen(command)];
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
      } else {
        const to = toScreen(command);
        if (command.op === 'M') ctx.moveTo(to.x, to.y);
        else ctx.lineTo(to.x, to.y);
      }
    }
    ctx.clip(hoverRegion.windingRule === 'EVENODD' ? 'evenodd' : 'nonzero');
    ctx.beginPath();
    for (let d = -input.height; d < input.width + input.height; d += 8) {
      ctx.moveTo(d, 0);
      ctx.lineTo(d + input.height, input.height);
    }
    ctx.strokeStyle = hover.remove ? '#f24822' : theme.selection;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }
  // The pieces the Shape builder is over or has gathered, washed over so they can be told apart.
  for (const face of input.vectorShapeFaces ?? []) {
    ctx.save();
    ctx.beginPath();
    for (const command of face) {
      if (command.op === 'Z') ctx.closePath();
      else if (command.op === 'C') {
        const [c1, c2, to] = [toScreen({ x: command.x1, y: command.y1 }), toScreen({ x: command.x2, y: command.y2 }), toScreen(command)];
        ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y);
      } else {
        const to = toScreen(command);
        if (command.op === 'M') ctx.moveTo(to.x, to.y);
        else ctx.lineTo(to.x, to.y);
      }
    }
    ctx.fillStyle = theme.selection;
    ctx.globalAlpha = 0.25;
    ctx.fill('evenodd');
    ctx.globalAlpha = 1;
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  if (state.tool === 'width') {
    // Width points: a pink line across the stroke with a knob at each side (at least 12px out) and the point on the path.
    const pink = '#ff24bd';
    const chain = strokeChain(node.vectorNetwork);
    const pxPerUnit = Math.hypot(m.a, m.b) * v.zoom || 1;
    const selectedWidths = new Set(state.widthPoints ?? []);
    if (chain) {
      (node.strokeWidths ?? []).forEach((w, i) => {
        const { point, normal } = chainPointAt(chain, w.position);
        const reach = Math.max(w.width / 2, WIDTH_KNOB_MIN_PX / pxPerUnit);
        const a = toScreen({ x: point.x + normal.x * reach, y: point.y + normal.y * reach });
        const b = toScreen({ x: point.x - normal.x * reach, y: point.y - normal.y * reach });
        const c = toScreen(point);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = pink;
        ctx.lineWidth = 1;
        ctx.stroke();
        for (const [q, r] of [
          [a, 3],
          [b, 3],
          [c, 4],
        ] as const) {
          ctx.beginPath();
          ctx.arc(q.x, q.y, r, 0, Math.PI * 2);
          ctx.fillStyle = q === c && selectedWidths.has(i) ? pink : theme.handleFill;
          ctx.fill();
          ctx.stroke();
        }
      });
    }
    const hoverPoint = input.vectorWidthHover;
    if (hoverPoint) {
      ctx.beginPath();
      ctx.arc(hoverPoint.x, hoverPoint.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = pink;
      ctx.fill();
    }
  }
  // Bézier handles of the selected points: a line from the point to a round knob.
  const chosenHandles = state.selectedHandles ?? [];
  for (const h of selectedHandles(editor)) {
    ctx.beginPath();
    ctx.moveTo(h.vertexScreen.x, h.vertexScreen.y);
    ctx.lineTo(h.screen.x, h.screen.y);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(h.screen.x, h.screen.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = chosenHandles.some((e) => e.segment === h.end.segment && e.side === h.end.side) ? theme.selection : theme.handleFill;
    ctx.fill();
    ctx.stroke();
  }
  // The bounding box of the selected points, with its corner handles.
  const pointsBox = pointsFrame(editor);
  if (pointsBox) {
    strokeQuad(ctx, screenQuad(editor, pointsBox.frame), theme.selection, 1);
    drawHandles(ctx, editor, pointsBox.frame, theme);
  }
  const selected = new Set(state.vertices);
  const size = 7;
  node.vectorNetwork.vertices.forEach((vertex, i) => {
    const p = toScreen(vertex);
    ctx.beginPath();
    ctx.rect(Math.round(p.x - size / 2) + 0.5, Math.round(p.y - size / 2) + 0.5, size, size);
    ctx.fillStyle = selected.has(i) ? theme.selection : theme.handleFill;
    ctx.fill();
    ctx.strokeStyle = theme.selection;
    ctx.stroke();
  });
  const eraser = input.vectorEraser;
  if (eraser && eraser.points.length > 0) {
    // The eraser's path, as wide as the eraser.
    ctx.beginPath();
    eraser.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    if (eraser.points.length === 1) ctx.lineTo(eraser.points[0]!.x + 0.01, eraser.points[0]!.y);
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = eraser.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }
  const cutLine = input.vectorCutLine;
  if (cutLine) {
    ctx.beginPath();
    ctx.moveTo(cutLine[0].x, cutLine[0].y);
    ctx.lineTo(cutLine[1].x, cutLine[1].y);
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = theme.selection;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const lasso = input.vectorLasso;
  if (lasso && lasso.length > 1) {
    ctx.beginPath();
    lasso.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = theme.selection;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = theme.selection;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

/**
 * Track pills with size labels along the top (columns) and left (rows) sides of the selected grid
 * frame, and short ticks where track edges can be dragged, while the pointer is over the frame.
 */
function drawGridTracks(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, theme } = input;
  const selected = selectedGridTracks(editor);
  if (!selected) return;
  const v = editor.state.viewport;

  // Tracks picked out on the canvas stay washed over whether the frame is hovered or not, so what Delete or a
  // drag would act on is always plain.
  const picked = editor.state.getSnapshot().gridTracks;
  if (picked && picked.frameId === selected.frameId) {
    const bands = picked.axis === 'column' ? selected.columns : selected.rows;
    const frame = editor.doc.get(selected.frameId);
    const across = frame && 'size' in frame ? (picked.axis === 'column' ? frame.size.height : frame.size.width) : 0;
    ctx.save();
    ctx.fillStyle = theme.selection;
    ctx.globalAlpha = 0.18;
    for (const index of picked.indices) {
      const band = bands[index];
      if (!band) continue;
      const from = worldToScreen(v, apply(selected.toWorld, picked.axis === 'column' ? { x: band.start, y: 0 } : { x: 0, y: band.start }));
      const to = worldToScreen(v, apply(selected.toWorld, picked.axis === 'column' ? { x: band.start + band.length, y: across } : { x: across, y: band.start + band.length }));
      ctx.fillRect(from.x, from.y, to.x - from.x, to.y - from.y);
    }
    ctx.restore();
  }

  const hover = editor.state.getSnapshot().hoverId;
  if (!hover || (hover !== selected.frameId && !editor.doc.isAncestor(selected.frameId, hover))) return;
  ctx.save();
  ctx.font = theme.font;
  ctx.fillStyle = theme.selection;
  ctx.strokeStyle = theme.selection;
  ctx.lineWidth = 2;
  for (const handle of selected.handles) {
    if (handle.kind === 'pill') {
      const p = worldToScreen(v, apply(selected.toWorld, handle.at));
      const column = handle.axis === 'column';
      const [cx, cy] = column ? [p.x, p.y - 8] : [p.x - 8, p.y];
      const [w, h] = column ? [16, 4] : [4, 16];
      ctx.beginPath();
      ctx.roundRect(Math.round(cx - w / 2), Math.round(cy - h / 2), w, h, 2);
      ctx.fill();
      const label = trackLabel((column ? selected.columnSizes : (selected.rowSizes ?? []))[handle.index]);
      ctx.textAlign = column ? 'center' : 'right';
      ctx.textBaseline = column ? 'bottom' : 'middle';
      ctx.fillText(label, column ? cx : cx - 6, column ? cy - 4 : cy);
    } else {
      const start = worldToScreen(v, apply(selected.toWorld, handle.from));
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(handle.axis === 'column' ? start.x : start.x + GRID_EDGE_BAND_PX, handle.axis === 'column' ? start.y + GRID_EDGE_BAND_PX : start.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Pink spacing handles of the selected auto layout frame, while the pointer is over the frame or its contents. */
function drawLayoutHandles(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, theme } = input;
  const selected = selectedLayoutHandles(editor);
  if (!selected) return;
  const hover = editor.state.getSnapshot().hoverId;
  if (!hover || (hover !== selected.frameId && !editor.doc.isAncestor(selected.frameId, hover))) return;
  const node = editor.doc.get(selected.frameId);
  const v = editor.state.viewport;
  // Too small on screen to tell the handles apart.
  if (!node || node.type !== 'FRAME' || Math.min(node.size.width * Math.abs(selected.toWorld.a), node.size.height * Math.abs(selected.toWorld.d)) * v.zoom < 48) return;
  ctx.save();
  ctx.fillStyle = theme.spacing;
  for (const handle of selected.handles) {
    const p = worldToScreen(v, apply(selected.toWorld, handle.at));
    const [w, h] = isUprightHandle(handle, selected.direction) ? [3, 12] : [12, 3];
    ctx.beginPath();
    ctx.roundRect(Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h, 1.5);
    ctx.fill();
  }
  ctx.restore();
}

/** Red distance lines with end ticks and a centered label for each measurement. */
function drawMeasurements(ctx: CanvasRenderingContext2D, input: OverlayInput, lines: readonly MeasureLine[], color: string, label?: string): void {
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
    const text = label ?? formatNumber(line.distance);
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

/** Grid lines closer than this many screen pixels are not drawn. */
const LAYOUT_GRID_MIN_SPACING_PX = 3;

const rgba = (c: Color): string => `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`;

/**
 * Visible layout guides of every visible, unrotated frame on the page, clipped to the frame: columns
 * and rows as translucent bands, uniform grids as lines. Drawn over the scene, so exports never include them.
 */
function drawLayoutGuides(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const { editor, width, height } = input;
  const v = editor.state.viewport;
  const visit = (parent: Id) => {
    for (const id of editor.doc.children(parent)) {
      const node = editor.doc.get(id);
      if (!node || !isSceneNode(node) || !node.visible) continue;
      if (node.type === 'FRAME' && node.layoutGuides?.some((g) => g.visible)) {
        const m = editor.scene.worldTransform(id);
        if (Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && m.a > 0 && m.d > 0) {
          const origin = worldToScreen(v, apply(m, { x: 0, y: 0 }));
          const sx = m.a * v.zoom;
          const sy = m.d * v.zoom;
          const w = node.size.width * sx;
          const h = node.size.height * sy;
          if (origin.x < width && origin.y < height && origin.x + w > 0 && origin.y + h > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(origin.x, origin.y, w, h);
            ctx.clip();
            for (const guide of node.layoutGuides) {
              if (!guide.visible) continue;
              if (guide.pattern === 'GRID') {
                if (guide.sectionSize * Math.min(sx, sy) < LAYOUT_GRID_MIN_SPACING_PX) continue;
                ctx.beginPath();
                for (const gx of gridLines(guide, node.size.width)) {
                  const x = Math.round(origin.x + gx * sx) + 0.5;
                  ctx.moveTo(x, origin.y);
                  ctx.lineTo(x, origin.y + h);
                }
                for (const gy of gridLines(guide, node.size.height)) {
                  const y = Math.round(origin.y + gy * sy) + 0.5;
                  ctx.moveTo(origin.x, y);
                  ctx.lineTo(origin.x + w, y);
                }
                ctx.strokeStyle = rgba(guide.color);
                ctx.lineWidth = 1;
                ctx.stroke();
              } else {
                ctx.fillStyle = rgba(guide.color);
                for (const band of layoutGuideBands(guide, node.size)) {
                  if (guide.pattern === 'COLUMNS') ctx.fillRect(origin.x + band.start * sx, origin.y, band.length * sx, h);
                  else ctx.fillRect(origin.x, origin.y + band.start * sy, w, band.length * sy);
                }
              }
            }
            ctx.restore();
          }
        }
      }
      if (editor.doc.children(id).length > 0) visit(id);
    }
  };
  visit(editor.pageId);
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

/** The + buttons on either side of a hovered frame while the Frame tool is in hand, which copy it to that side. */
function drawQuickAddButtons(ctx: CanvasRenderingContext2D, input: OverlayInput): void {
  const buttons = quickAddButtons(input.editor);
  if (!buttons) return;
  for (const rect of [buttons.left, buttons.right]) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    ctx.fillStyle = input.theme.selection;
    ctx.beginPath();
    ctx.arc(cx, cy, rect.width / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = input.theme.labelText;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy);
    ctx.lineTo(cx + 5, cy);
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx, cy + 5);
    ctx.stroke();
  }
}

/** The purple + button below a selected component set, which adds a variant. */
function drawAddVariantButton(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, theme: ChromeTheme): void {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  ctx.fillStyle = theme.component;
  ctx.beginPath();
  ctx.arc(cx, cy, rect.width / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.labelText;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy);
  ctx.lineTo(cx + 5, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();
}

/** The pink Add instances pill in a slot of the hovered instance. */
function drawAddInstancesButton(ctx: CanvasRenderingContext2D, rect: { x: number; y: number; width: number; height: number }, theme: ChromeTheme): void {
  ctx.font = theme.font;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.slot;
  ctx.beginPath();
  ctx.roundRect(Math.round(rect.x), Math.round(rect.y), Math.round(rect.width), rect.height, 4);
  ctx.fill();
  ctx.fillStyle = theme.labelText;
  ctx.fillText(ADD_INSTANCES_LABEL, Math.round(rect.x) + 8, rect.y + rect.height / 2 + 0.5);
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
    if (node.arcData) {
      // Arcs, pies and rings are outlined along their shape.
      for (const c of arcCommands(node.size.width, node.size.height, node.arcData)) {
        if (c.op === 'M') ctx.moveTo(c.x, c.y);
        else if (c.op === 'L') ctx.lineTo(c.x, c.y);
        else if (c.op === 'C') ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        else ctx.closePath();
      }
    } else {
      ctx.ellipse(node.size.width / 2, node.size.height / 2, node.size.width / 2, node.size.height / 2, 0, 0, Math.PI * 2);
    }
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

function drawSizeLabel(ctx: CanvasRenderingContext2D, quad: readonly Vec2[], frame: SelectionFrame, theme: ChromeTheme, lengthOnly = false, gif = false): void {
  // Lines show their length only.
  const text = lengthOnly ? formatNumber(frame.width) : `${formatNumber(frame.width)} × ${formatNumber(frame.height)}`;
  ctx.font = theme.font;
  const padX = 4;
  const gap = 4;
  const h = 16;
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  // An animated GIF is labeled in a pill of its own, next to the size; the pair stays centered under the selection.
  const tagWidth = gif ? Math.ceil(ctx.measureText(GIF_TAG).width) + padX * 2 : 0;
  const total = w + (gif ? gap + tagWidth : 0);
  const bottom = Math.max(...quad.map((p) => p.y));
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const x = Math.round(cx - total / 2);
  const y = Math.round(bottom + 6);
  ctx.textBaseline = 'middle';
  const pill = (left: number, width: number, label: string) => {
    ctx.fillStyle = theme.selection;
    ctx.beginPath();
    ctx.roundRect(left, y, width, h, 2);
    ctx.fill();
    ctx.fillStyle = theme.labelText;
    ctx.fillText(label, left + padX, y + h / 2 + 0.5);
  };
  pill(x, w, text);
  if (gif) pill(x + w + gap, tagWidth, GIF_TAG);
}
