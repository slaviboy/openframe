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

import { keyOnTop } from '@/core/document/factory';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, invert, multiply, type Matrix } from '@/core/math/matrix';
import { draggedGap, draggedPadding, type LayoutHandle } from '@/core/layout/layout-handles';
import type { Padding } from '@/core/layout/flow-layout';
import { hitLayoutHandle, isUprightHandle } from '../interactions/layout-handles';
import { fromPoints, transformRect, unionAll, type Rect } from '@/core/math/rect';
import { edgeValues, guidesFor, snapBounds, snapValue, type SnapGuide } from '@/core/scene/snapping';
import { isLayoutGuideRect, SNAP_THRESHOLD_PX, snapCandidatesFor } from '../interactions/snap-candidates';
import { adoptCoveredLayers, duplicateNodes } from '../commands/structure';
import { setIgnoreAutoLayout, setLayoutSizing } from '../commands/auto-layout';
import { applySpacing, captureSpacingStarts, smartSelectionInfo, spacingHandleAt, type SmartSelectionInfo } from '../commands/smart-selection';
import { canParent } from '@/core/document/containment';
import type { DuplicateMemory } from '../editor';
import type { Vec2 } from '@/core/math/vec';
import { hitTestDeepest, isArtboardWithChildren, isInteractive, marqueeSelect, selectionTarget } from '@/core/scene/hit-test';
import { snapEqualGaps, type GapIndicator } from '@/core/scene/equal-gaps';
import { measureBetween, type MeasureLine } from '@/core/scene/measure';
import { nodeContainsLocal } from '@/core/scene/scene-index';
import { isSceneNode, type FrameNode, type GridTrack, type SceneNode } from '@/core/schema/document';
import { hitGridTrackEdge } from '../interactions/grid-tracks';
import { resizedTrack } from '@/core/layout/grid-track-handles';
import { isAutoLayoutFrame } from '@/core/layout/auto-layout';
import { flowInsertionIndex, flowInsertionLine, moveToFlowIndex } from '@/core/layout/flow-order';
import { beginCrop } from '../interactions/crop';
import { beginVectorEdit } from '../interactions/vector-edit';
import { beginTextEditAt } from '../interactions/text-edit';
import { resizedTextMode } from '../commands/text';
import { resolveCornerRadii } from '@/core/geometry/corners';
import type { CornerRadii } from '@/core/schema/document';
import { applyDraggedRadius, draggedRadius, hitRadiusHandle, radiusHandles, radiusHandleScreen, radiusTarget, type RadiusHandle } from '../interactions/radius-handles';
import {
  frameCenterWorld,
  handleCursor,
  hitHandle,
  hitRotationCorner,
  hitSectionTitle,
  isLineFrame,
  rotateCursor,
  selectionFrame,
  type Corner,
  type SelectionFrame,
} from '../chrome/selection-geometry';
import {
  captureStart,
  computeResize,
  HANDLE_AXES,
  matrixRotationDegrees,
  resizeMany,
  resizeSingle,
  rotateNodes,
  toTransform,
  translateNodes,
  type HandleId,
  type NodeStart,
} from '../interactions/transform';
import { applyScale, captureScale, type ScaleSnapshot } from '../interactions/scale';
import { screenToWorld } from '../viewport/viewport';
import { constrain45, lineTransform, parentToLocal, roundPoint, snapWorldPoint } from './draw-helpers';
import type { CursorKind, ModifierState, PointerInfo, Tool, ToolEnvironment } from './types';

type Gesture =
  | { kind: 'idle' }
  /** `toggleOnClick`: Shift-press on an already-selected layer deselects it only if no drag follows. */
  | { kind: 'pending-move'; down: PointerInfo; targets: Id[]; toggleOnClick?: Id }
  | {
      kind: 'move';
      down: PointerInfo;
      tx: Transaction;
      starts: NodeStart[];
      last: PointerInfo;
      /** World bounds of the moving layers at gesture start. */
      startBounds: Rect | null;
      /** World bounds of layers to snap to (captured at gesture start). */
      candidates: Rect[];
      guides: readonly SnapGuide[];
      /** Equal-spacing indicators after snapping between neighbors. */
      gaps: readonly GapIndicator[];
      /** Set when ⌥-drag duplicated the layers being moved. */
      duplicated: DuplicateMemory | null;
      /** Where the moved children of an auto layout frame will land in its flow on release. */
      insertion: { readonly frameId: Id; readonly index: number } | null;
    }
  | { kind: 'marquee'; down: PointerInfo; base: readonly Id[]; scope: Id; current: Vec2 }
  /** Dragging a smart selection's spacing handle: every gap follows the pointer. */
  | { kind: 'spacing'; tx: Transaction; down: PointerInfo; last: PointerInfo; info: SmartSelectionInfo; starts: NodeStart[]; gap: number }
  /** Dragging one end point of a single selected line; the other end stays fixed. */
  | {
      kind: 'line-end';
      tx: Transaction;
      id: Id;
      moving: 'start' | 'end';
      fixedWorld: Vec2;
      last: PointerInfo;
      candidates: Rect[];
      guides: readonly SnapGuide[];
    }
  | {
      kind: 'resize';
      down: PointerInfo;
      tx: Transaction;
      handle: HandleId;
      frame: SelectionFrame;
      starts: NodeStart[];
      last: PointerInfo;
      /** World bounds of layers the moving edges snap to (captured at gesture start). */
      candidates: Rect[];
      guides: readonly SnapGuide[];
      /** Scale tool: snapshot of the selection's subtrees, scaled proportionally instead of resized. */
      scale: ScaleSnapshot | null;
    }
  | {
      kind: 'rotate';
      tx: Transaction;
      corner: Corner;
      frame: SelectionFrame;
      starts: NodeStart[];
      pivot: Vec2;
      startAngle: number;
      /** Rotation (degrees, CCW positive) of a single rotated layer; null for multi-selection. */
      baseRotation: number | null;
      /** Rotation shown in the angle label. */
      displayAngle: number;
      last: PointerInfo;
    }
  /** Dragging an on-canvas corner radius handle (⌥: only that rectangle corner). */
  | {
      kind: 'radius';
      tx: Transaction;
      handle: RadiusHandle;
      /** Rectangle radii when the drag started (null for polygons and stars). */
      startRadii: CornerRadii | null;
      down: PointerInfo;
      last: PointerInfo;
      radius: number;
    }
  /** Dragging an auto layout frame's padding or gap handle; values come from the drag's start. */
  | {
      kind: 'layout-handle';
      tx: Transaction;
      down: PointerInfo;
      last: PointerInfo;
      frameId: Id;
      handle: LayoutHandle;
      direction: 'HORIZONTAL' | 'VERTICAL' | 'GRID';
      startPadding: Padding;
      startGap: number;
      toWorld: Matrix;
    }
  /** Dragging a grid track's edge: the track becomes fixed at its starting length plus the drag. */
  | {
      kind: 'grid-track';
      tx: Transaction;
      down: PointerInfo;
      last: PointerInfo;
      frameId: Id;
      axis: 'column' | 'row';
      index: number;
      startLength: number;
      toWorld: Matrix;
    };

/**
 * Move tool (V): selection, dragging, marquee selection, and resizing via handles.
 */
export class MoveTool implements Tool {
  private gesture: Gesture = { kind: 'idle' };
  private hoverCursor: CursorKind = 'default';
  private lastHover: PointerInfo | null = null;
  private measureLines: readonly MeasureLine[] = [];

  /** Equal-spacing indicators of the move in progress (world coordinates). */
  get gapIndicators(): readonly GapIndicator[] {
    return this.gesture.kind === 'move' ? this.gesture.gaps : [];
  }

  /** The auto layout insertion indicator while moving children of an auto layout frame, in world space. */
  get flowInsertion(): readonly [Vec2, Vec2] | null {
    const g = this.gesture;
    if (g.kind !== 'move' || !g.insertion) return null;
    const { editor } = this.env;
    const line = flowInsertionLine(editor.doc, g.insertion.frameId, g.insertion.index, new Set(g.starts.map((s) => s.id)));
    if (!line) return null;
    const world = editor.scene.worldTransform(g.insertion.frameId);
    return [apply(world, line[0]), apply(world, line[1])];
  }

  /** ⌥-hover distances between the selection and the hovered layer (or the selection's parent), in world space. */
  get measurements(): readonly MeasureLine[] {
    return this.gesture.kind === 'idle' ? this.measureLines : [];
  }

  /**
   * `scale` is the Scale tool (K): selection works the same, but handle drags scale layers and
   * their contents proportionally, and there is no rotation or line end point editing.
   */
  constructor(
    private readonly env: ToolEnvironment,
    readonly id: 'move' | 'scale' = 'move',
  ) {}

  get active(): boolean {
    return this.gesture.kind !== 'idle';
  }

  /** Snapping guides of the move in progress (world coordinates). */
  get snapGuides(): readonly SnapGuide[] {
    const g = this.gesture;
    return g.kind === 'move' || g.kind === 'resize' || g.kind === 'line-end' ? g.guides : [];
  }

  /** Angle label for the overlay while rotating: rotation in degrees and the pointer position. */
  get rotationLabel(): { angle: number; screen: Vec2 } | null {
    const g = this.gesture;
    return g.kind === 'rotate' ? { angle: g.displayAngle, screen: g.last.screen } : null;
  }

  /**
   * Corner radius handles to draw (screen points), shown while the pointer is over the selected
   * rectangle, polygon or star, or while one is dragged (`active` is the dragged handle's index).
   */
  get radiusHandleView(): { readonly points: readonly Vec2[]; readonly active: number } | null {
    if (this.id !== 'move') return null;
    const { editor } = this.env;
    const g = this.gesture;
    if (g.kind === 'radius') {
      const handles = radiusHandles(editor);
      const active = handles.findIndex((h) => h.corner === g.handle.corner);
      return { points: handles.map((h) => radiusHandleScreen(editor, h)), active };
    }
    if (g.kind !== 'idle' || !this.lastHover) return null;
    const node = radiusTarget(editor);
    if (!node) return null;
    const handles = radiusHandles(editor);
    const points = handles.map((h) => radiusHandleScreen(editor, h));
    const local = editor.scene.toLocal(node.id, this.lastHover.world);
    const hover = this.lastHover.screen;
    const over =
      (local !== null && local.x >= 0 && local.y >= 0 && local.x <= node.size.width && local.y <= node.size.height) ||
      points.some((p) => Math.hypot(p.x - hover.x, p.y - hover.y) <= this.env.hitTolerancePx);
    return over ? { points, active: -1 } : null;
  }

  /** Radius label while dragging a radius handle. */
  get radiusLabel(): { radius: number; screen: Vec2 } | null {
    const g = this.gesture;
    return g.kind === 'radius' ? { radius: g.radius, screen: g.last.screen } : null;
  }

  /** Current marquee in world space (for the overlay), or null. */
  get marquee(): Rect | null {
    if (this.gesture.kind !== 'marquee') return null;
    return fromPoints(this.gesture.down.world, this.gesture.current);
  }

  cursor(): CursorKind {
    if (this.gesture.kind === 'resize') return handleCursor(this.gesture.frame, this.gesture.handle);
    if (this.gesture.kind === 'rotate') return rotateCursor(this.gesture.frame, this.gesture.corner);
    if (this.gesture.kind === 'line-end') return 'crosshair';
    if (this.gesture.kind === 'grid-track') return this.gesture.axis === 'column' ? 'ew-resize' : 'ns-resize';
    if (this.gesture.kind === 'layout-handle') return isUprightHandle(this.gesture.handle, this.gesture.direction) ? 'ew-resize' : 'ns-resize';
    if (this.gesture.kind === 'spacing') return this.gesture.info.selection.axis === 'x' ? 'ew-resize' : 'ns-resize';
    return this.hoverCursor;
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    const frame = selectionFrame(editor);
    if (frame && !p.shift) {
      const handle = hitHandle(editor, frame, p.screen, this.env.hitTolerancePx);
      if (handle && this.id === 'move' && frame.nodeId && isLineFrame(editor, frame)) {
        editor.scene.ensure(editor.pageId);
        const moving = handle === 'e' ? 'end' : 'start';
        const fixedWorld = apply(frame.toWorld, { x: moving === 'end' ? 0 : frame.width, y: 0 });
        const tx = editor.history.begin('Resize');
        const candidates = snapCandidatesFor(editor, [frame.nodeId]);
        this.gesture = { kind: 'line-end', tx, id: frame.nodeId, moving, fixedWorld, last: p, candidates, guides: [] };
        return;
      }
      // Double-clicking an edge sets that axis to hug contents; with ⌥, to fill container.
      if (handle && this.id === 'move' && p.clickCount >= 2 && frame.nodeId && (handle === 'n' || handle === 's' || handle === 'e' || handle === 'w')) {
        const node = editor.doc.get(frame.nodeId);
        if (node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
          const axis = handle === 'e' || handle === 'w' ? 'horizontal' : 'vertical';
          editor.history.run(p.alt ? 'Fill container' : 'Hug contents', (tx) => setLayoutSizing(tx, tx.store.getOrThrow(node.id) as SceneNode, axis, p.alt ? 'FILL' : 'HUG'));
          return;
        }
      }
      if (handle) {
        const tx = editor.history.begin('Resize');
        editor.scene.ensure(editor.pageId);
        const starts = editor.selection.map((id) => captureStart(tx, editor.scene, id));
        const candidates = snapCandidatesFor(editor, editor.selection);
        const scale = this.id === 'scale' ? captureScale(tx.store, editor.scene, editor.selection) : null;
        this.gesture = { kind: 'resize', down: p, tx, handle, frame, starts, last: p, candidates, guides: [], scale };
        return;
      }
    }
    // Padding and gap handles of a selected auto layout frame (resize handles on its edges take precedence).
    if (this.id === 'move') {
      const layout = hitLayoutHandle(editor, p.screen, this.env.hitTolerancePx);
      if (layout) {
        const node = editor.doc.getOrThrow(layout.selected.frameId) as FrameNode;
        const tx = editor.history.begin(layout.handle.kind === 'gap' ? 'Change gap' : 'Change padding');
        this.gesture = {
          kind: 'layout-handle',
          tx,
          down: p,
          last: p,
          frameId: node.id,
          handle: layout.handle,
          direction: layout.selected.direction,
          startPadding: { top: node.paddingTop ?? 0, right: node.paddingRight ?? 0, bottom: node.paddingBottom ?? 0, left: node.paddingLeft ?? 0 },
          startGap: node.itemSpacing ?? 0,
          toWorld: layout.selected.toWorld,
        };
        return;
      }
    }
    // Grid track edges near the selected grid frame's top or left side resize their track.
    if (this.id === 'move') {
      const edge = hitGridTrackEdge(editor, p.screen, this.env.hitTolerancePx);
      if (edge) {
        const bands = edge.axis === 'column' ? edge.selected.columns : edge.selected.rows;
        this.gesture = {
          kind: 'grid-track',
          tx: editor.history.begin(edge.axis === 'column' ? 'Resize column' : 'Resize row'),
          down: p,
          last: p,
          frameId: edge.selected.frameId,
          axis: edge.axis,
          index: edge.index,
          startLength: bands[edge.index]!.length,
          toWorld: edge.selected.toWorld,
        };
        return;
      }
    }
    if (frame && this.id === 'move' && !p.shift) {
      const handle = hitRadiusHandle(editor, p.screen, this.env.hitTolerancePx);
      if (handle) {
        const tx = editor.history.begin('Change corner radius');
        const node = tx.store.getOrThrow(handle.id);
        const startRadii = node.type === 'RECTANGLE' ? resolveCornerRadii(node) : null;
        this.gesture = { kind: 'radius', tx, handle, startRadii, down: p, last: p, radius: handle.radius };
        return;
      }
    }
    if (frame && this.id === 'move') {
      const corner = hitRotationCorner(editor, frame, p.screen, this.env.hitTolerancePx);
      if (corner) {
        const tx = editor.history.begin('Rotate');
        editor.scene.ensure(editor.pageId);
        const starts = editor.selection.map((id) => captureStart(tx, editor.scene, id));
        const pivot = frameCenterWorld(frame);
        const baseRotation = starts.length === 1 ? matrixRotationDegrees(starts[0]!.world) : null;
        this.gesture = {
          kind: 'rotate',
          tx,
          corner,
          frame,
          starts,
          pivot,
          startAngle: Math.atan2(p.world.y - pivot.y, p.world.x - pivot.x),
          baseRotation,
          displayAngle: baseRotation ?? 0,
          last: p,
        };
        return;
      }
    }
    // Smart selection: dragging a pink spacing handle changes every gap.
    const smart = frame && this.id === 'move' ? smartSelectionInfo(editor) : null;
    if (smart && spacingHandleAt(editor, smart, p.screen, this.env.hitTolerancePx)) {
      const tx = editor.history.begin('Change spacing');
      const starts = captureSpacingStarts(tx, editor, smart);
      this.gesture = { kind: 'spacing', tx, down: p, last: p, info: smart, starts, gap: smart.selection.gap };
      return;
    }

    // Section titles select (and drag) their section; double-click renames it.
    editor.scene.ensure(editor.pageId);
    const titled = hitSectionTitle(editor, p.screen);
    if (titled) {
      if (p.clickCount >= 2) {
        for (const ancestor of editor.doc.ancestors(titled)) editor.state.setExpanded(ancestor, true);
        editor.state.select([titled]);
        editor.state.setRenaming(titled);
        return;
      }
      if (p.shift) editor.state.toggleSelection(titled);
      else if (!editor.selection.includes(titled)) editor.state.select([titled]);
      this.gesture = { kind: 'pending-move', down: p, targets: [...editor.selection] };
      return;
    }

    const tolerance = this.env.hitTolerancePx / editor.state.viewport.zoom;
    const deepest = hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, { tolerance: 0 }) ??
      hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, { tolerance });

    // Clicking inside the current selection's bounds keeps it (so multi-selections can be dragged).
    if (frame && !p.shift && !p.mod && this.insideFrame(frame, p.world) && (deepest === null || this.isWithinSelection(deepest))) {
      this.gesture = { kind: 'pending-move', down: p, targets: [...editor.selection] };
      return;
    }

    if (deepest) {
      const target = selectionTarget(editor.doc, editor.pageId, deepest, editor.selection, p.mod);
      // Background of an artboard with children behaves like empty canvas (marquee inside it).
      if (!p.mod && target === deepest && isArtboardWithChildren(editor.doc, editor.pageId, target) && p.clickCount < 2) {
        this.startMarquee(p, target);
        return;
      }
      if (p.shift && editor.selection.includes(target)) {
        this.gesture = { kind: 'pending-move', down: p, targets: [...editor.selection], toggleOnClick: target };
        return;
      }
      if (p.shift) editor.state.toggleSelection(target);
      else if (!editor.selection.includes(target)) editor.state.select([target]);
      this.gesture = { kind: 'pending-move', down: p, targets: [...editor.selection] };
      return;
    }
    this.startMarquee(p, editor.pageId);
  }

  pointerMove(p: PointerInfo): void {
    const g = this.gesture;
    switch (g.kind) {
      case 'idle':
        this.updateHover(p);
        return;
      case 'pending-move': {
        if (Math.hypot(p.screen.x - g.down.screen.x, p.screen.y - g.down.screen.y) < this.env.dragThresholdPx) return;
        const { editor } = this.env;
        editor.scene.ensure(editor.pageId);
        let targets = g.targets.filter((id) => isInteractive(editor.doc, id));
        const tx = editor.history.begin(p.alt && targets.length > 0 ? 'Duplicate' : 'Move');
        let duplicated: DuplicateMemory | null = null;
        if (p.alt && targets.length > 0) {
          // ⌥-drag: move copies and leave the originals in place.
          duplicated = duplicateNodes(tx, editor, targets);
          targets = [...duplicated.clones];
          editor.state.select(targets);
        }
        const starts = targets.map((id) => captureStart(tx, editor.scene, id));
        const startBounds = unionAll(starts.map((s) => transformRect(s.world, { x: 0, y: 0, width: s.width, height: s.height })));
        const candidates = snapCandidatesFor(editor, targets);
        this.gesture = { kind: 'move', down: g.down, tx, starts, last: p, startBounds, candidates, guides: [], gaps: [], duplicated, insertion: null };
        this.applyMove(p);
        return;
      }
      case 'move':
        g.last = p;
        this.applyMove(p);
        return;
      case 'marquee': {
        g.current = p.world;
        const { editor } = this.env;
        const rect = fromPoints(g.down.world, p.world);
        const hits = marqueeSelect(editor.doc, editor.scene, editor.pageId, rect, g.scope, p.mod);
        editor.state.select(p.shift ? [...new Set([...g.base, ...hits])] : hits);
        editor.requestRender();
        return;
      }
      case 'resize':
        g.last = p;
        this.applyResize(p);
        return;
      case 'rotate':
        g.last = p;
        this.applyRotate(p);
        return;
      case 'line-end':
        g.last = p;
        this.applyLineEnd(p);
        return;
      case 'radius':
        g.last = p;
        this.applyRadius(p);
        return;
      case 'grid-track':
        g.last = p;
        this.applyGridTrack(p);
        return;
      case 'layout-handle':
        g.last = p;
        this.applyLayoutHandle(p);
        return;
      case 'spacing': {
        g.last = p;
        const delta = g.info.selection.axis === 'x' ? p.world.x - g.down.world.x : p.world.y - g.down.world.y;
        g.gap = Math.max(0, Math.round(g.info.selection.gap + delta));
        applySpacing(g.tx, g.info, g.starts, g.gap);
        g.tx.flushPreview();
        this.env.editor.requestRender();
        return;
      }
    }
  }

  pointerUp(p: PointerInfo): void {
    const g = this.gesture;
    const { editor } = this.env;
    this.gesture = { kind: 'idle' };
    switch (g.kind) {
      case 'pending-move': {
        if (g.toggleOnClick) {
          editor.state.toggleSelection(g.toggleOnClick);
          break;
        }
        // A click (no drag) on an already-selected layer inside a multi-selection selects just that layer.
        if (!p.shift && g.targets.length > 1) {
          const deepest = hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, { tolerance: 0 });
          if (deepest) {
            const target = selectionTarget(editor.doc, editor.pageId, deepest, [], p.mod);
            if (g.targets.includes(target)) editor.state.select([target]);
          }
        }
        if (p.clickCount >= 2) {
          const only = editor.selection.length === 1 ? editor.selection[0]! : null;
          // Double-clicking a text layer edits its text with the caret at the click.
          if (only && editor.doc.get(only)?.type === 'TEXT' && beginTextEditAt(editor, only, p.world)) break;
          // Double-clicking a layer with an image fill (and no children) starts cropping it.
          // Double-clicking a vector layer edits its points.
          if (only && editor.doc.get(only)?.type === 'VECTOR' && beginVectorEdit(editor, only)) break;
          if (only && editor.doc.children(only).length === 0 && beginCrop(editor, only)) break;
          this.enterChild(p);
        }
        break;
      }
      case 'move':
        this.adoptIntoSections(g.tx, g.starts);
        // ⌃ while dropping layers into an auto layout frame adds them with Ignore auto layout.
        if (p.ctrl) {
          for (const s of g.starts) {
            const parent = g.tx.store.parentOf(s.id);
            if (parent && this.enteredParent(g.tx, s.id) && isAutoLayoutFrame(g.tx.store.get(parent))) setIgnoreAutoLayout(g.tx, g.tx.store.getOrThrow(s.id) as SceneNode, true);
          }
        }
        if (g.insertion) {
          const { frameId, index } = g.insertion;
          const inFlow = (id: Id) => g.tx.store.parentOf(id) === frameId && (g.tx.store.get(id) as SceneNode | undefined)?.layoutPositioning !== 'ABSOLUTE';
          moveToFlowIndex(g.tx, frameId, g.starts.map((s) => s.id).filter(inFlow), index);
        }
        editor.history.commit(g.tx);
        if (g.duplicated) editor.duplicateMemory = g.duplicated;
        break;
      case 'resize':
        this.adoptIntoSections(g.tx, g.starts);
        editor.history.commit(g.tx);
        break;
      case 'grid-track':
        editor.history.commit(g.tx);
        break;
      case 'layout-handle':
        // A click without dragging opens a field to type the value instead.
        if (Math.hypot(p.screen.x - g.down.screen.x, p.screen.y - g.down.screen.y) < this.env.dragThresholdPx) {
          editor.history.cancel(g.tx);
          const handle = g.handle.kind === 'gap' ? { kind: 'gap' as const, index: g.handle.index } : { kind: 'padding' as const, side: g.handle.side };
          editor.state.setLayoutValueEdit({ frameId: g.frameId, handle, mode: g.down.alt ? (g.down.shift ? 'all' : 'opposite') : 'side' });
        } else {
          editor.history.commit(g.tx);
        }
        break;
      case 'rotate':
      case 'line-end':
      case 'spacing':
      case 'radius':
        editor.history.commit(g.tx);
        break;
      case 'marquee':
        editor.requestRender();
        break;
      case 'idle':
        break;
    }
    this.updateHover(p);
  }

  modifiersChanged(m: ModifierState): void {
    const g = this.gesture;
    if (g.kind === 'idle' && this.lastHover && this.lastHover.alt !== m.alt) {
      // Pressing or releasing ⌥ without moving the pointer shows or hides measurements.
      this.lastHover = { ...this.lastHover, ...m };
      this.updateMeasurement(this.lastHover);
      this.env.editor.requestRender();
    }
    if (g.kind === 'resize') this.applyResize({ ...g.last, ...m });
    if (g.kind === 'move') this.applyMove({ ...g.last, ...m });
    if (g.kind === 'rotate') this.applyRotate({ ...g.last, ...m });
    if (g.kind === 'line-end') this.applyLineEnd({ ...g.last, ...m });
    if (g.kind === 'radius') this.applyRadius({ ...g.last, ...m });
    if (g.kind === 'layout-handle') this.applyLayoutHandle({ ...g.last, ...m });
  }

  cancel(): boolean {
    const g = this.gesture;
    const { editor } = this.env;
    this.gesture = { kind: 'idle' };
    if (g.kind === 'move' || g.kind === 'resize' || g.kind === 'rotate' || g.kind === 'line-end' || g.kind === 'spacing' || g.kind === 'radius' || g.kind === 'layout-handle' || g.kind === 'grid-track') {
      editor.history.cancel(g.tx);
      return true;
    }
    if (g.kind === 'marquee') {
      editor.state.select(g.base);
      return true;
    }
    return g.kind === 'pending-move';
  }

  private startMarquee(p: PointerInfo, scope: Id): void {
    const { editor } = this.env;
    if (!p.shift) editor.state.clearSelection();
    this.gesture = { kind: 'marquee', down: p, base: [...editor.selection], scope, current: p.world };
  }

  private applyMove(p: PointerInfo): void {
    const g = this.gesture;
    if (g.kind !== 'move') return;
    const { editor } = this.env;
    let dx = p.world.x - g.down.world.x;
    let dy = p.world.y - g.down.world.y;
    let lockedAxis: 'x' | 'y' | null = null;
    if (p.shift) {
      if (Math.abs(dx) > Math.abs(dy)) {
        dy = 0;
        lockedAxis = 'y';
      } else {
        dx = 0;
        lockedAxis = 'x';
      }
    }
    g.guides = [];
    g.gaps = [];
    // Holding Control temporarily disables snapping.
    if (!p.ctrl && g.startBounds && g.candidates.length > 0) {
      const threshold = SNAP_THRESHOLD_PX / editor.state.viewport.zoom;
      const moved = { ...g.startBounds, x: g.startBounds.x + dx, y: g.startBounds.y + dy };
      const snap = snapBounds(moved, g.candidates, threshold, {
        x: lockedAxis !== 'x',
        y: lockedAxis !== 'y',
      });
      dx += snap.dx;
      dy += snap.dy;
      g.guides = snap.guides;
      // Axes that didn't snap to an edge may snap to equal spacing between neighbors.
      const neighbors = g.candidates.filter((rect) => !isLayoutGuideRect(rect));
      const equal = snapEqualGaps({ ...g.startBounds, x: g.startBounds.x + dx, y: g.startBounds.y + dy }, neighbors, threshold, {
        x: lockedAxis !== 'x' && !snap.guides.some((guide) => guide.axis === 'x'),
        y: lockedAxis !== 'y' && !snap.guides.some((guide) => guide.axis === 'y'),
      });
      dx += equal.dx;
      dy += equal.dy;
      g.gaps = equal.gaps;
    }
    translateNodes(g.tx, g.starts, { x: dx, y: dy });
    this.reparentUnderPointer(g.tx, g.starts, p);
    // Children of one auto layout frame show where they will land in its flow.
    const store = g.tx.store;
    const parents = new Set(g.starts.map((s) => store.parentOf(s.id)));
    const [parent] = parents;
    g.insertion = null;
    const ignoring = p.ctrl && g.starts.some((s) => this.enteredParent(g.tx, s.id));
    if (!ignoring && parents.size === 1 && parent && isAutoLayoutFrame(store.get(parent)) && g.starts.every((s) => (store.get(s.id) as SceneNode | undefined)?.layoutPositioning !== 'ABSOLUTE')) {
      const local = editor.scene.toLocal(parent, p.world);
      if (local) g.insertion = { frameId: parent, index: flowInsertionIndex(store, parent, local, new Set(g.starts.map((s) => s.id))) };
    }
    g.tx.flushPreview();
    editor.requestRender();
  }

  /** A section moved or resized over layers takes in the siblings it fully covers. */
  private adoptIntoSections(tx: Transaction, starts: readonly NodeStart[]): void {
    const { editor } = this.env;
    const sections = starts.map((s) => s.id).filter((id) => tx.store.get(id)?.type === 'SECTION');
    if (sections.length === 0) return;
    tx.flushPreview();
    adoptCoveredLayers(tx, editor, sections);
  }

  /**
   * Moves dragged layers into the frame or section under the pointer (or out to the page),
   * preserving world position. Dragged sections only drop into other sections.
   */
  /** Whether a layer being moved now has a different parent than when the gesture began. */
  private enteredParent(tx: Transaction, id: Id): boolean {
    return tx.ops.some((op) => op.kind === 'set' && op.id === id && op.field === 'parent' && (op.prev as { id: Id } | undefined)?.id !== tx.store.parentOf(id));
  }

  private reparentUnderPointer(tx: Transaction, starts: NodeStart[], p: PointerInfo): void {
    const { editor } = this.env;
    const store = editor.doc;
    const moving = new Set(starts.map((s) => s.id));
    editor.scene.ensure(editor.pageId);
    const movingSection = starts.some((s) => store.get(s.id)?.type === 'SECTION');
    const container = this.frameUnder(p.world, moving, movingSection ? ['SECTION'] : ['FRAME', 'SECTION']) ?? editor.pageId;
    const containerType = store.getOrThrow(container).type;
    for (const s of starts) {
      const node = store.getOrThrow(s.id);
      if (!isSceneNode(node) || node.parent.id === container || !canParent(containerType, node.type)) continue;
      // Only reparent layers whose parent is a frame or the page (never pull layers out of groups or boolean groups).
      const parent = store.get(node.parent.id);
      if (parent?.type === 'GROUP' || parent?.type === 'BOOLEAN_OPERATION') continue;
      const world = editor.scene.computeWorld(s.id);
      const containerWorld = container === editor.pageId ? null : editor.scene.computeWorld(container);
      const inv = containerWorld ? invert(containerWorld) : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      if (!inv) continue;
      const local = multiply(inv, world);
      tx.set(s.id, 'parent', { id: container, key: keyOnTop(store, container) });
      tx.set(s.id, 'transform', toTransform(local));
      // Later pointer moves translate from the gesture's starting world position, which must
      // now be expressed in the new parent's coordinate space.
      const newParentWorld = containerWorld ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
      starts[starts.indexOf(s)] = { ...s, parentWorld: newParentWorld, transform: multiply(inv, s.world) };
    }
  }

  private frameUnder(world: Vec2, exclude: Set<Id>, types: readonly ('FRAME' | 'SECTION')[]): Id | null {
    const { editor } = this.env;
    const store = editor.doc;
    let found: Id | null = null;
    const visit = (id: Id): void => {
      const children = store.children(id);
      for (let i = children.length - 1; i >= 0 && found === null; i--) {
        const childId = children[i]!;
        if (exclude.has(childId)) continue;
        const child = store.get(childId);
        if (!child || (child.type !== 'FRAME' && child.type !== 'SECTION') || !types.includes(child.type) || !child.visible || child.locked) continue;
        const local = editor.scene.toLocal(childId, world);
        if (local && nodeContainsLocal(child, local, 0)) {
          visit(childId);
          found ??= childId;
        }
      }
    };
    visit(editor.pageId);
    return found;
  }

  /**
   * Applies the rotation from the gesture start to the pointer angle. With Shift, a single
   * layer snaps its resulting rotation to 15° increments; a multi-selection snaps the delta.
   */
  private applyRotate(p: PointerInfo): void {
    const g = this.gesture;
    if (g.kind !== 'rotate') return;
    const angle = Math.atan2(p.world.y - g.pivot.y, p.world.x - g.pivot.x);
    let delta = angle - g.startAngle;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta)); // normalize to (−π, π]
    // Screen-clockwise delta lowers the counterclockwise-positive rotation value.
    let deltaDeg = (delta * 180) / Math.PI;
    if (p.shift) {
      if (g.baseRotation !== null) {
        const snapped = Math.round((g.baseRotation - deltaDeg) / 15) * 15;
        deltaDeg = g.baseRotation - snapped;
      } else {
        deltaDeg = Math.round(deltaDeg / 15) * 15;
      }
    }
    rotateNodes(g.tx, g.starts, g.pivot, (deltaDeg * Math.PI) / 180);
    g.displayAngle = normalizeDegrees((g.baseRotation ?? 0) - deltaDeg);
    g.tx.flushPreview();
    this.env.editor.requestRender();
  }

  /** Moves one end of a line (Shift constrains to 45° around the fixed end; Control disables snapping). */
  private applyLineEnd(p: PointerInfo): void {
    const g = this.gesture;
    if (g.kind !== 'line-end') return;
    const { editor } = this.env;
    const node = editor.doc.get(g.id);
    if (node?.type !== 'LINE') return;
    let world: Vec2;
    if (p.shift) {
      world = constrain45(g.fixedWorld, p.world);
      g.guides = [];
    } else {
      const snap = snapWorldPoint(editor, p.world, g.candidates, p.ctrl);
      world = snap.point;
      g.guides = snap.x || snap.y ? guidesFor(fromPoints(g.fixedWorld, world), g.candidates, snap) : [];
    }
    const toLocal = parentToLocal(editor, node.parent.id);
    const fixed = toLocal(g.fixedWorld);
    const moved = p.shift ? toLocal(world) : roundPoint(toLocal(world));
    const [start, end] = g.moving === 'end' ? [fixed, moved] : [moved, fixed];
    g.tx.set(g.id, 'transform', lineTransform(start, Math.atan2(end.y - start.y, end.x - start.x)));
    g.tx.set(g.id, 'size', { width: Math.round(Math.hypot(end.x - start.x, end.y - start.y) * 100) / 100, height: 0 });
    g.tx.flushPreview();
    editor.requestRender();
  }

  private applyResize(p: PointerInfo): void {
    const g = this.gesture;
    if (g.kind !== 'resize') return;
    const { editor } = this.env;
    const inv = invert(g.frame.toWorld);
    if (!inv) return;
    const toBox = (w: Vec2) => ({ x: inv.a * w.x + inv.c * w.y + inv.e, y: inv.b * w.x + inv.d * w.y + inv.f });
    const resizeTo = (pointerWorld: Vec2) =>
      computeResize({
        box: { x: 0, y: 0, width: g.frame.width, height: g.frame.height },
        handle: g.handle,
        pointer: toBox(pointerWorld),
        start: toBox(g.down.world),
        // Shift toggles aspect locking; a single layer with constrain proportions starts locked.
        keepAspect: g.scale !== null || p.shift !== this.constrained(g.frame),
        fromCenter: p.alt,
      });
    let result = resizeTo(p.world);
    g.guides = [];
    const m = g.frame.toWorld;
    // Snap the moving edges of axis-aligned selections (holding Control disables snapping).
    if (!p.ctrl && g.candidates.length > 0 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9) {
      const [ax, ay] = HANDLE_AXES[g.handle];
      const threshold = SNAP_THRESHOLD_PX / editor.state.viewport.zoom;
      const edge = apply(m, { x: ax === 1 ? result.x1 : result.x0, y: ay === 1 ? result.y1 : result.y0 });
      const dx = ax !== 0 ? snapValue(edge.x, edgeValues(g.candidates, 'x'), threshold) : null;
      const dy = ay !== 0 ? snapValue(edge.y, edgeValues(g.candidates, 'y'), threshold) : null;
      if (dx !== null || dy !== null) {
        result = resizeTo({ x: p.world.x + (dx ?? 0), y: p.world.y + (dy ?? 0) });
        const corner0 = apply(m, { x: result.x0, y: result.y0 });
        const corner1 = apply(m, { x: result.x1, y: result.y1 });
        g.guides = guidesFor(fromPoints(corner0, corner1), g.candidates, { x: dx !== null, y: dy !== null });
      }
    }
    // Holding ⌘ resizes frames without applying their children's constraints; the Scale tool scales children itself.
    g.tx.ignoreConstraints = g.scale !== null || p.mod;
    if (g.scale) {
      // Scale tool: one proportional factor for everything, anchored opposite the handle (center with Alt).
      const width = Math.abs(result.x1 - result.x0);
      const height = Math.abs(result.y1 - result.y0);
      const factor = g.frame.width > 0 ? width / g.frame.width : g.frame.height > 0 ? height / g.frame.height : 1;
      const [ax, ay] = HANDLE_AXES[g.handle];
      const fixed = p.alt
        ? { x: g.frame.width / 2, y: g.frame.height / 2 }
        : { x: ax === 1 ? 0 : ax === -1 ? g.frame.width : g.frame.width / 2, y: ay === 1 ? 0 : ay === -1 ? g.frame.height : g.frame.height / 2 };
      applyScale(g.tx, g.scale, Math.max(factor, 0.01), apply(g.frame.toWorld, fixed));
      g.tx.flushPreview();
      editor.requestRender();
      return;
    }
    if (g.frame.nodeId && g.starts.length === 1) {
      resizeSingle(g.tx, g.starts[0]!, result);
      const resized = g.tx.store.get(g.frame.nodeId);
      // Resizing by hand makes hug and fill layers fixed on the resized axes.
      if (resized && resized.type !== 'DOCUMENT' && resized.type !== 'PAGE') {
        const [rx, ry] = HANDLE_AXES[g.handle];
        if (rx !== 0 && resized.layoutSizingHorizontal) g.tx.set(resized.id, 'layoutSizingHorizontal', undefined);
        if (ry !== 0 && resized.layoutSizingVertical) g.tx.set(resized.id, 'layoutSizingVertical', undefined);
      }
      if (resized?.type === 'TEXT') {
        // A side handle wraps auto-width text; handles that change the height fix the box.
        const [ax, ay] = HANDLE_AXES[g.handle];
        const mode = resizedTextMode(resized.textAutoResize, { width: ax !== 0, height: ay !== 0 });
        if (mode !== resized.textAutoResize) g.tx.set(resized.id, 'textAutoResize', mode);
      }
    } else {
      const from = { x: g.frame.toWorld.e, y: g.frame.toWorld.f, width: g.frame.width, height: g.frame.height };
      resizeMany(g.tx, g.starts, from, {
        x0: result.x0 + from.x,
        y0: result.y0 + from.y,
        x1: result.x1 + from.x,
        y1: result.y1 + from.y,
      });
    }
    g.tx.flushPreview();
    editor.requestRender();
  }

  /** A dragged track edge: the track becomes fixed at its starting length plus the drag distance. */
  private applyGridTrack(p: PointerInfo): void {
    const g = this.gesture;
    if (g.kind !== 'grid-track') return;
    const { editor } = this.env;
    const frame = g.tx.store.get(g.frameId);
    if (frame?.type !== 'FRAME') return;
    const delta = g.axis === 'column' ? (p.world.x - g.down.world.x) / (Math.abs(g.toWorld.a) || 1) : (p.world.y - g.down.world.y) / (Math.abs(g.toWorld.d) || 1);
    const flex: GridTrack = { type: 'FLEX', value: 1 };
    const current = g.axis === 'column' ? (frame.gridColumnSizes ?? [flex]) : (frame.gridRowSizes ?? []);
    // Auto rows become explicit up to the dragged one.
    const tracks = Array.from({ length: Math.max(current.length, g.index + 1) }, (_, i): GridTrack => current[i] ?? flex);
    tracks[g.index] = resizedTrack(g.startLength, delta);
    g.tx.set(g.frameId, g.axis === 'column' ? 'gridColumnSizes' : 'gridRowSizes', tracks);
    g.tx.flushPreview();
    editor.requestRender();
  }

  /** Padding (⌥ opposite sides, ⌥⇧ all sides) or gap from a handle drag, stepping by the big nudge with ⇧. */
  private applyLayoutHandle(p: PointerInfo): void {
    const g = this.gesture;
    if (g.kind !== 'layout-handle') return;
    const { editor } = this.env;
    const delta = { x: (p.world.x - g.down.world.x) / (Math.abs(g.toWorld.a) || 1), y: (p.world.y - g.down.world.y) / (Math.abs(g.toWorld.d) || 1) };
    if (g.handle.kind === 'gap') {
      if (g.direction !== 'GRID') g.tx.set(g.frameId, 'itemSpacing', draggedGap(g.startGap, g.direction, delta, p.shift ? editor.nudgeAmounts.big : undefined) || undefined);
    } else {
      const mode = p.alt ? (p.shift ? 'all' : 'opposite') : 'side';
      const next = draggedPadding(g.startPadding, g.handle.side, delta, mode, !p.alt && p.shift ? editor.nudgeAmounts.big : undefined);
      g.tx.set(g.frameId, 'paddingTop', next.top || undefined);
      g.tx.set(g.frameId, 'paddingRight', next.right || undefined);
      g.tx.set(g.frameId, 'paddingBottom', next.bottom || undefined);
      g.tx.set(g.frameId, 'paddingLeft', next.left || undefined);
    }
    g.tx.flushPreview();
    editor.requestRender();
  }

  private applyRadius(p: PointerInfo): void {
    const g = this.gesture;
    if (g.kind !== 'radius') return;
    const { editor } = this.env;
    const local = editor.scene.toLocal(g.handle.id, p.world);
    const downLocal = editor.scene.toLocal(g.handle.id, g.down.world);
    if (!local || !downLocal) return;
    g.radius = draggedRadius(g.handle, downLocal, local);
    applyDraggedRadius(g.tx, g.handle, g.radius, p.alt, g.startRadii);
    g.tx.flushPreview();
    editor.requestRender();
  }

  private updateHover(p: PointerInfo): void {
    const { editor } = this.env;
    const frame = selectionFrame(editor);
    const handle = frame ? hitHandle(editor, frame, p.screen, this.env.hitTolerancePx) : null;
    const corner = frame && !handle ? hitRotationCorner(editor, frame, p.screen, this.env.hitTolerancePx) : null;
    this.hoverCursor = frame && handle ? handleCursor(frame, handle) : frame && corner ? rotateCursor(frame, corner) : 'default';
    const smart = frame && !handle && !corner && this.id === 'move' ? smartSelectionInfo(editor) : null;
    if (smart && spacingHandleAt(editor, smart, p.screen, this.env.hitTolerancePx)) {
      this.hoverCursor = smart.selection.axis === 'x' ? 'ew-resize' : 'ns-resize';
    }
    this.lastHover = p;
    const titled = handle || corner ? null : hitSectionTitle(editor, p.screen);
    if (titled) {
      editor.state.setHover(titled);
      this.updateMeasurement(p);
      return;
    }
    const deepest = hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, { tolerance: 0 });
    // With ⌥ held, hover the deepest layer so distances can be measured to nested content.
    const target = deepest ? selectionTarget(editor.doc, editor.pageId, deepest, editor.selection, p.mod || p.alt) : null;
    editor.state.setHover(target && isArtboardWithChildren(editor.doc, editor.pageId, target) && target === deepest && !p.mod && !p.alt ? null : target);
    this.updateMeasurement(p);
  }

  /**
   * ⌥ held with a selection: measure to the hovered layer, or to the selection's parent frame or
   * section when hovering the selection itself, empty canvas or content inside the selection.
   */
  private updateMeasurement(p: PointerInfo): void {
    const { editor } = this.env;
    this.measureLines = [];
    if (!p.alt || editor.selection.length === 0) return;
    const selection = editor.selectionBounds();
    if (!selection) return;
    const hover = editor.state.getSnapshot().hoverId;
    const hoverInSelection = hover !== null && editor.selection.some((id) => id === hover || editor.doc.isAncestor(id, hover));
    let target: Rect | null = null;
    if (hover && !hoverInSelection) {
      target = editor.scene.worldBounds(hover);
    } else {
      const parent = editor.doc.parentOf(editor.selection[0]!);
      if (parent !== null && parent !== editor.pageId) target = editor.scene.worldBounds(parent);
    }
    if (target) this.measureLines = measureBetween(selection, target);
  }

  /** Whether a resize of this frame keeps the aspect ratio without Shift (every selected layer constrains proportions). */
  private constrained(frame: SelectionFrame): boolean {
    const { editor } = this.env;
    const ids = frame.nodeId ? [frame.nodeId] : editor.selection;
    return ids.length > 0 && ids.every((id) => {
      const node = editor.doc.get(id);
      return node !== undefined && isSceneNode(node) && node.constrainProportions === true;
    });
  }

  private insideFrame(frame: SelectionFrame, world: Vec2): boolean {
    const inv = invert(frame.toWorld);
    if (!inv) return false;
    const x = inv.a * world.x + inv.c * world.y + inv.e;
    const y = inv.b * world.x + inv.d * world.y + inv.f;
    return x >= 0 && y >= 0 && x <= frame.width && y <= frame.height;
  }

  private isWithinSelection(id: Id): boolean {
    const { editor } = this.env;
    return editor.selection.some((s) => s === id || editor.doc.isAncestor(s, id));
  }

  /** Double-click: select the next layer down under the pointer (Enter-into-group behavior). */
  private enterChild(p: PointerInfo): void {
    const { editor } = this.env;
    const deepest = hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, { tolerance: 0 });
    const current = editor.selection[0];
    if (!deepest || !current || deepest === current) return;
    const chain: Id[] = [];
    for (let cur: Id | null = deepest; cur !== null && cur !== current; cur = editor.doc.parentOf(cur)) chain.unshift(cur);
    if (chain.length > 0 && editor.doc.isAncestor(current, deepest)) editor.state.select([chain[0]!]);
  }
}

/** Wraps an angle in degrees into (−180, 180]. */
export function normalizeDegrees(degrees: number): number {
  const wrapped = ((((degrees + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 ? 180 : wrapped;
}

/** Converts a DOM-agnostic pointer sample into PointerInfo using the editor viewport. */
export function pointerInfo(
  editorViewport: { x: number; y: number; zoom: number },
  sample: Omit<PointerInfo, 'world'>,
): PointerInfo {
  return { ...sample, world: screenToWorld(editorViewport, sample.screen) };
}
