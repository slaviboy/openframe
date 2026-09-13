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

import type { Vec2 } from '@/core/math/vec';
import type { Id } from '@/core/ids/ids';
import { hitTestDeepest, layersAt, selectionTarget } from '@/core/scene/hit-test';
import type { SnapGuide } from '@/core/scene/snapping';
import type { Editor } from '../editor';
import { hitHandle, hitRotationCorner, selectionFrame } from '../chrome/selection-geometry';
import { GuideController, guidesOf, hitGuide, rulerAt, sameGuide } from '../interactions/guides';
import type { GuideRef, ToolId } from '../stores/editor-store';
import { panBy, screenToWorld, zoomAt, type Viewport } from '../viewport/viewport';
import { CropController } from '../interactions/crop';
import { GradientEditController } from '../interactions/gradient-edit';
import { EyedropperTool, type EyedropperSample } from './eyedropper-tool';
import { ImagePlaceTool } from './image-tool';
import { LineTool } from './line-tool';
import { MoveTool } from './move-tool';
import { ShapeTool } from './shape-tool';
import type { CursorKind, ModifierState, PointerInfo, Tool, ToolEnvironment } from './types';

export interface WheelSample {
  readonly screen: Vec2;
  readonly deltaX: number;
  readonly deltaY: number;
  /** deltaMode normalized to pixels by the host. */
  readonly ctrlOrMeta: boolean;
  readonly shift: boolean;
}

/** Hand tool: drag to pan. */
class HandTool implements Tool {
  readonly id = 'hand' as const;
  private last: Vec2 | null = null;

  constructor(private readonly editor: Editor) {}

  get active(): boolean {
    return this.last !== null;
  }

  cursor(): CursorKind {
    return this.last ? 'grabbing' : 'grab';
  }

  pointerDown(p: PointerInfo): void {
    this.last = p.screen;
  }

  pointerMove(p: PointerInfo): void {
    if (!this.last) return;
    this.editor.setViewport(panBy(this.editor.state.viewport, p.screen.x - this.last.x, p.screen.y - this.last.y));
    this.last = p.screen;
  }

  pointerUp(): void {
    this.last = null;
  }

  cancel(): boolean {
    const was = this.last !== null;
    this.last = null;
    return was;
  }
}

/**
 * Routes pointer input to the active tool, and handles navigation that works in every
 * tool: Space (temporary hand), middle-mouse panning, wheel scrolling and pinch/⌘-wheel zoom.
 */
export class ToolManager {
  readonly env: ToolEnvironment;
  /** Ruler guide gestures (any tool can drag from a ruler; guides are grabbed with the Move tool). */
  readonly guides: GuideController;
  /** Crop mode pointer handling (active while `croppingId` is set). */
  readonly crop: CropController;
  /** On-canvas gradient handles (active while `gradientEdit` is set). */
  readonly gradientEdit: GradientEditController;
  /** Guide under the pointer, for the overlay. */
  hoveredGuide: GuideRef | null = null;
  private readonly tools: Record<ToolId, Tool>;
  private middlePan: Vec2 | null = null;
  private pointerTool: Tool | null = null;
  private rulersVisible = false;
  private hoverCursor: CursorKind | null = null;

  constructor(readonly editor: Editor) {
    this.env = { editor, hitTolerancePx: 5, dragThresholdPx: 3 };
    this.guides = new GuideController(editor);
    this.crop = new CropController(editor, this.env.hitTolerancePx);
    this.gradientEdit = new GradientEditController(editor, this.env.hitTolerancePx);
    editor.pickColorFromCanvas = () => {
      const current = editor.state.getSnapshot().tool;
      return this.eyedropper.pick(current === 'eyedropper' ? 'move' : current);
    };
    this.tools = {
      move: new MoveTool(this.env),
      hand: new HandTool(editor),
      scale: new MoveTool(this.env, 'scale'),
      frame: new ShapeTool('frame', this.env),
      section: new ShapeTool('section', this.env),
      slice: new ShapeTool('slice', this.env),
      rectangle: new ShapeTool('rectangle', this.env),
      line: new LineTool('line', this.env),
      arrow: new LineTool('arrow', this.env),
      ellipse: new ShapeTool('ellipse', this.env),
      polygon: new ShapeTool('polygon', this.env),
      star: new ShapeTool('star', this.env),
      image: new ImagePlaceTool(this.env),
      eyedropper: new EyedropperTool(this.env),
    };
    let previous = editor.state.getSnapshot().tool;
    editor.state.subscribe(() => {
      const next = editor.state.getSnapshot().tool;
      if (next !== previous) {
        // Switching tools abandons any gesture of the previous tool.
        const old = this.tools[previous];
        if (old.active && old !== this.pointerTool) old.cancel();
        // Leaving Place image drops the images still waiting.
        if (old instanceof ImagePlaceTool) old.discard();
        if (old instanceof EyedropperTool) old.leave();
        previous = next;
      }
    });
  }

  get tool(): Tool {
    return this.tools[this.editor.state.getSnapshot().tool];
  }

  /** The eyedropper tool. */
  get eyedropper(): EyedropperTool {
    return this.tools.eyedropper as EyedropperTool;
  }

  /** The color under the pointer while the eyedropper is active, for the overlay loupe. */
  get eyedropperSample(): EyedropperSample | null {
    return this.editor.state.getSnapshot().tool === 'eyedropper' ? this.eyedropper.sample : null;
  }

  /** The Place image tool, which holds imported images until they are placed. */
  get imageTool(): ImagePlaceTool {
    return this.tools.image as ImagePlaceTool;
  }

  /** The selection tool in use (Move or Scale), for overlay feedback such as the marquee. */
  get moveTool(): MoveTool {
    const current = this.pointerTool ?? this.tool;
    return current instanceof MoveTool ? current : (this.tools.move as MoveTool);
  }

  /** Snapping guides of whichever tool owns the current gesture. */
  get snapGuides(): readonly SnapGuide[] {
    return (this.pointerTool ?? this.tool).snapGuides ?? [];
  }

  /** Rulers (and with them, ruler guides) are shown and interactive. Set by the UI. */
  setRulersVisible(visible: boolean): void {
    if (this.rulersVisible === visible) return;
    this.rulersVisible = visible;
    if (!visible) {
      this.hoveredGuide = null;
      this.hoverCursor = null;
    }
    this.editor.requestRender();
  }

  cursor(): CursorKind {
    if (this.middlePan) return 'grabbing';
    if (!this.pointerTool && this.hoverCursor) return this.hoverCursor;
    return (this.pointerTool ?? (this.canvasEditor ?? this.tool)).cursor();
  }

  /** Guide under the pointer when guides can be grabbed: Move tool, rulers on, and not over a selection handle. */
  private guideUnder(p: PointerInfo): GuideRef | null {
    const { editor } = this;
    if (!this.rulersVisible || editor.state.getSnapshot().tool !== 'move') return null;
    const frame = selectionFrame(editor);
    const tolerance = this.env.hitTolerancePx;
    if (frame && (hitHandle(editor, frame, p.screen, tolerance) || hitRotationCorner(editor, frame, p.screen, tolerance))) return null;
    return hitGuide(editor, p.screen);
  }

  toPointer(sample: Omit<PointerInfo, 'world'>): PointerInfo {
    return { ...sample, world: screenToWorld(this.editor.state.viewport, sample.screen) };
  }

  pointerDown(sample: Omit<PointerInfo, 'world'>): void {
    if (sample.button === 1) {
      this.middlePan = sample.screen;
      return;
    }
    const canvasEditor = sample.button === 0 ? this.canvasEditor : null;
    if (canvasEditor) {
      this.pointerTool = canvasEditor;
      canvasEditor.pointerDown(this.toPointer(sample));
      return;
    }
    if (sample.button === 0 && this.rulersVisible) {
      const p = this.toPointer(sample);
      const side = rulerAt(this.editor, p.screen);
      if (side) {
        this.pointerTool = this.guides;
        this.guides.beginFromRuler(p, side);
        return;
      }
      const guide = this.guideUnder(p);
      if (guide) {
        this.pointerTool = this.guides;
        this.guides.beginOnGuide(p, guide);
        return;
      }
    }
    this.pointerTool = this.tool;
    this.pointerTool.pointerDown(this.toPointer(sample));
  }

  pointerMove(sample: Omit<PointerInfo, 'world'>): void {
    if (this.middlePan) {
      this.editor.setViewport(panBy(this.editor.state.viewport, sample.screen.x - this.middlePan.x, sample.screen.y - this.middlePan.y));
      this.middlePan = sample.screen;
      return;
    }
    const p = this.toPointer(sample);
    if (!this.pointerTool && this.rulersVisible && !this.tool.active) {
      const overRuler = rulerAt(this.editor, p.screen) !== null;
      const guide = overRuler ? null : this.guideUnder(p);
      if (!sameGuide(guide, this.hoveredGuide) && (guide !== null || this.hoveredGuide !== null)) {
        this.hoveredGuide = guide;
        this.editor.requestRender();
      }
      const axis = guide ? guidesOf(this.editor, guide.owner)[guide.index]?.axis : undefined;
      this.hoverCursor = overRuler ? 'default' : axis === 'X' ? 'ew-resize' : axis === 'Y' ? 'ns-resize' : null;
      if (overRuler || guide) {
        this.editor.state.setHover(null);
        return;
      }
    }
    (this.pointerTool ?? (this.canvasEditor ?? this.tool)).pointerMove(p);
  }

  pointerUp(sample: Omit<PointerInfo, 'world'>): void {
    if (this.middlePan) {
      this.middlePan = null;
      return;
    }
    const tool = this.pointerTool ?? this.tool;
    this.pointerTool = null;
    tool.pointerUp(this.toPointer(sample));
  }

  modifiersChanged(m: ModifierState): void {
    (this.pointerTool ?? this.tool).modifiersChanged?.(m);
  }

  /**
   * Right-click: selects the layer under the pointer unless the current selection already
   * contains it (so a multi-selection keeps its menu); empty canvas clears the selection.
   */
  contextSelect(sample: Omit<PointerInfo, 'world'>): void {
    const { editor } = this;
    const p = this.toPointer(sample);
    const guide = this.rulersVisible ? hitGuide(editor, p.screen) : null;
    if (guide) {
      editor.state.selectGuide(guide);
      return;
    }
    const deepest = hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, {
      tolerance: this.env.hitTolerancePx / editor.state.viewport.zoom,
    });
    if (!deepest) {
      editor.state.clearSelection();
      return;
    }
    const target = selectionTarget(editor.doc, editor.pageId, deepest, editor.selection, p.mod);
    const covered = editor.selection.some((id) => id === target || editor.doc.isAncestor(id, target));
    if (!covered) editor.state.select([target]);
  }

  /** Whether Return can place an object: a frame, section, slice or shape tool is active with no gesture in progress. */
  canPlaceObject(): boolean {
    const tool = this.tool;
    return tool instanceof ShapeTool && !tool.active;
  }

  /** Keyboard placement: the active shape tool creates its layer centered in the visible canvas area. */
  placeObject(): Id | null {
    const tool = this.tool;
    if (!(tool instanceof ShapeTool) || tool.active) return null;
    const { editor } = this;
    const { left, right, top, bottom } = editor.canvasInsets;
    const { width, height } = editor.canvasSize;
    const center = screenToWorld(editor.state.viewport, { x: left + (width - left - right) / 2, y: top + (height - top - bottom) / 2 });
    return tool.placeAt(center);
  }

  /** Layers under the pointer for the "Select layer" context menu. */
  layersUnder(sample: Omit<PointerInfo, 'world'>): Id[] {
    const { editor } = this;
    const p = this.toPointer(sample);
    return layersAt(editor.doc, editor.scene, editor.pageId, p.world, this.env.hitTolerancePx / editor.state.viewport.zoom);
  }

  /** Escape: cancel gesture first; otherwise let the caller handle deselect. */
  cancel(): boolean {
    const tool = this.pointerTool ?? (this.canvasEditor ?? this.tool);
    this.pointerTool = null;
    return tool.cancel();
  }

  /** Crop mode or on-canvas gradient editing, which take pointer input ahead of the active tool. */
  private get canvasEditor(): Tool | null {
    const state = this.editor.state.getSnapshot();
    if (state.croppingId !== null) return this.crop;
    if (state.gradientEdit !== null) return this.gradientEdit;
    return null;
  }

  wheel(w: WheelSample): void {
    const v: Viewport = this.editor.state.viewport;
    if (w.ctrlOrMeta) {
      // Pinch gestures arrive as ctrl+wheel with small deltas; mouse wheels with large ones.
      const factor = Math.exp(-w.deltaY * (Math.abs(w.deltaY) < 50 ? 0.01 : 0.002));
      this.editor.setViewport(zoomAt(v, w.screen, v.zoom * factor));
      return;
    }
    const dx = w.shift && w.deltaX === 0 ? w.deltaY : w.deltaX;
    const dy = w.shift && w.deltaX === 0 ? 0 : w.deltaY;
    this.editor.setViewport(panBy(v, -dx, -dy));
  }
}
