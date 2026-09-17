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

import { distanceToSegment } from '@/core/geometry/shapes';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, invert } from '@/core/math/matrix';
import type { Rect } from '@/core/math/rect';
import type { Vec2 } from '@/core/math/vec';
import { edgeValues, snapValue } from '@/core/scene/snapping';
import type { Guide } from '@/core/schema/document';
import { RULER_SIZE } from '../chrome/rulers';
import { forEachSection } from '../chrome/selection-geometry';
import type { Editor } from '../editor';
import type { GuideRef } from '../stores/editor-store';
import type { CursorKind, ModifierState, PointerInfo, Tool } from '../tools/types';
import { worldToScreen } from '../viewport/viewport';
import { SNAP_THRESHOLD_PX, snapCandidatesIn } from './snap-candidates';

export type RulerSide = 'top' | 'left';

/** Screen distance within which a guide is hovered or grabbed. */
export const GUIDE_HIT_PX = 3;

export const sameGuide = (a: GuideRef | null, b: GuideRef | null): boolean => a !== null && b !== null && a.owner === b.owner && a.index === b.index;

export function guidesOf(editor: Editor, owner: Id): readonly Guide[] {
  const node = editor.doc.get(owner);
  return node && (node.type === 'PAGE' || node.type === 'FRAME') ? (node.guides ?? []) : [];
}

/** Keeps documents canonical: a node without guides has no `guides` field. */
const guidesValue = (guides: readonly Guide[]): Guide[] | undefined => (guides.length > 0 ? [...guides] : undefined);

/** Frames that own guides: frames directly on the page or in a visible section. */
export function guideFrames(editor: Editor): Id[] {
  const frames: Id[] = [];
  const collect = (parent: Id) => {
    for (const id of editor.doc.children(parent)) {
      const node = editor.doc.get(id);
      if (node?.type === 'FRAME' && node.visible) frames.push(id);
    }
  };
  collect(editor.pageId);
  forEachSection(editor, collect);
  return frames;
}

/** Every guide on the active page: page guides first, then frame guides. */
export function allGuides(editor: Editor): GuideRef[] {
  const refs: GuideRef[] = guidesOf(editor, editor.pageId).map((_, index) => ({ owner: editor.pageId, index }));
  for (const frame of guideFrames(editor)) guidesOf(editor, frame).forEach((_, index) => refs.push({ owner: frame, index }));
  return refs;
}

/** Screen segment of a guide: page guides span the canvas, frame guides span their frame. */
export function guideSegment(editor: Editor, ref: GuideRef): [Vec2, Vec2] | null {
  const guide = guidesOf(editor, ref.owner)[ref.index];
  if (!guide) return null;
  const v = editor.state.viewport;
  if (ref.owner === editor.pageId) {
    const { width, height } = editor.canvasSize;
    if (guide.axis === 'X') {
      const x = (guide.offset - v.x) * v.zoom;
      return [
        { x, y: 0 },
        { x, y: height },
      ];
    }
    const y = (guide.offset - v.y) * v.zoom;
    return [
      { x: 0, y },
      { x: width, y },
    ];
  }
  const node = editor.doc.get(ref.owner);
  if (node?.type !== 'FRAME') return null;
  editor.scene.ensure(editor.pageId);
  const world = editor.scene.worldTransform(ref.owner);
  const { width: w, height: h } = node.size;
  const [a, b] =
    guide.axis === 'X'
      ? [
          { x: guide.offset, y: 0 },
          { x: guide.offset, y: h },
        ]
      : [
          { x: 0, y: guide.offset },
          { x: w, y: guide.offset },
        ];
  return [worldToScreen(v, apply(world, a)), worldToScreen(v, apply(world, b))];
}

/**
 * Where a guide's line falls in the world: the x of a vertical guide, the y of a horizontal one. A guide on a
 * rotated or flipped frame has no such line, and is left out.
 */
export function guideWorldLine(editor: Editor, ref: GuideRef): { readonly axis: Guide['axis']; readonly position: number } | null {
  const guide = guidesOf(editor, ref.owner)[ref.index];
  if (!guide) return null;
  if (ref.owner === editor.pageId) return { axis: guide.axis, position: guide.offset };
  const node = editor.doc.get(ref.owner);
  if (node?.type !== 'FRAME') return null;
  editor.scene.ensure(editor.pageId);
  const m = editor.scene.worldTransform(ref.owner);
  if (Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9) return null;
  const origin = apply(m, { x: 0, y: 0 });
  return guide.axis === 'X' ? { axis: 'X', position: origin.x + guide.offset * m.a } : { axis: 'Y', position: origin.y + guide.offset * m.d };
}

/** The guide nearest a screen point within `tolerancePx` (frame guides win ties). */
export function hitGuide(editor: Editor, screen: Vec2, tolerancePx = GUIDE_HIT_PX): GuideRef | null {
  let best: GuideRef | null = null;
  let bestDistance = tolerancePx;
  for (const ref of allGuides(editor)) {
    const segment = guideSegment(editor, ref);
    if (!segment) continue;
    const d = distanceToSegment(screen, segment[0], segment[1]);
    if (d <= bestDistance) {
      best = ref;
      bestDistance = d;
    }
  }
  return best;
}

/** Which ruler a screen point is on (the corner square belongs to neither). */
export function rulerAt(editor: Editor, screen: Vec2): RulerSide | null {
  const { left, right, top } = editor.canvasInsets;
  if (screen.x < left || screen.x > editor.canvasSize.width - right || screen.y < top) return null;
  const onTop = screen.y < top + RULER_SIZE;
  const onLeft = screen.x < left + RULER_SIZE;
  if (onTop && onLeft) return null;
  return onTop ? 'top' : onLeft ? 'left' : null;
}

/** Axis-aligned frame (page or section level) containing a world point; the topmost wins. */
function guideFrameAt(editor: Editor, world: Vec2): Id | null {
  let found: Id | null = null;
  editor.scene.ensure(editor.pageId);
  for (const id of guideFrames(editor)) {
    const node = editor.doc.get(id);
    const m = editor.scene.worldTransform(id);
    const local = editor.scene.toLocal(id, world);
    if (node?.type !== 'FRAME' || !local || Math.abs(m.b) > 1e-9 || Math.abs(m.c) > 1e-9) continue;
    if (local.x >= 0 && local.y >= 0 && local.x <= node.size.width && local.y <= node.size.height) found = id;
  }
  return found;
}

export function removeGuide(editor: Editor, ref: GuideRef): void {
  const guides = guidesOf(editor, ref.owner);
  if (!guides[ref.index]) return;
  editor.history.run('Remove guide', (tx) => {
    tx.set(ref.owner, 'guides', guidesValue(guides.filter((_, i) => i !== ref.index)));
  });
  editor.state.clearSelection();
}

interface GuideDrag {
  tx: Transaction;
  ref: GuideRef;
  axis: Guide['axis'];
  /** The guide did not exist before this gesture (dragged from a ruler, or an ⌥-copy). */
  created: boolean;
  dragged: boolean;
  down: PointerInfo;
  last: PointerInfo;
  candidates: Rect[];
}

/**
 * Ruler guide gestures, available with rulers shown: drag from the top ruler for a horizontal
 * guide or from the left ruler for a vertical one; drag a guide to move it (⌥ drags out a
 * copy); drop it on a ruler to remove it; click to select it. Page guides snap to whole pixels
 * and to layer edges (Control disables snapping). A new guide dropped over a frame becomes a
 * frame guide.
 */
export class GuideController implements Tool {
  readonly id = 'move' as const;
  private drag: GuideDrag | null = null;

  constructor(private readonly editor: Editor) {}

  get active(): boolean {
    return this.drag !== null;
  }

  cursor(): CursorKind {
    return this.drag?.axis === 'X' ? 'ew-resize' : 'ns-resize';
  }

  beginFromRuler(p: PointerInfo, side: RulerSide): void {
    const { editor } = this;
    const axis = side === 'top' ? 'Y' : 'X';
    const owner = editor.pageId;
    const existing = guidesOf(editor, owner);
    const tx = editor.history.begin('Add guide');
    tx.set(owner, 'guides', [...existing, { axis, offset: Math.round(axis === 'X' ? p.world.x : p.world.y) }]);
    this.start(tx, { owner, index: existing.length }, axis, true, p);
  }

  beginOnGuide(p: PointerInfo, ref: GuideRef): void {
    const { editor } = this;
    const guide = guidesOf(editor, ref.owner)[ref.index];
    if (!guide) return;
    if (p.alt) {
      const existing = guidesOf(editor, ref.owner);
      const tx = editor.history.begin('Add guide');
      tx.set(ref.owner, 'guides', [...existing, { ...guide }]);
      this.start(tx, { owner: ref.owner, index: existing.length }, guide.axis, true, p);
    } else {
      this.start(editor.history.begin('Move guide'), ref, guide.axis, false, p);
    }
  }

  private start(tx: Transaction, ref: GuideRef, axis: Guide['axis'], created: boolean, p: PointerInfo): void {
    const { editor } = this;
    editor.scene.ensure(editor.pageId);
    this.drag = { tx, ref, axis, created, dragged: created, down: p, last: p, candidates: snapCandidatesIn(editor, [editor.pageId], undefined, false) };
    editor.state.selectGuide(ref);
    tx.flushPreview();
    editor.requestRender();
  }

  pointerDown(): void {
    // Gestures start through beginFromRuler / beginOnGuide.
  }

  pointerMove(p: PointerInfo): void {
    const d = this.drag;
    if (!d) return;
    d.last = p;
    if (!d.dragged && Math.hypot(p.screen.x - d.down.screen.x, p.screen.y - d.down.screen.y) < 3) return;
    d.dragged = true;
    this.update(p);
  }

  pointerUp(p: PointerInfo): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    const { editor } = this;
    if (!d.dragged) {
      // A click selects the guide.
      editor.history.cancel(d.tx);
      editor.state.selectGuide(d.ref);
      return;
    }
    this.update(p, d);
    if (rulerAt(editor, p.screen)) {
      editor.history.cancel(d.tx);
      if (d.created) editor.state.clearSelection();
      else removeGuide(editor, d.ref);
      return;
    }
    let ref = d.ref;
    const frame = d.created && ref.owner === editor.pageId ? guideFrameAt(editor, p.world) : null;
    if (frame) {
      const pageGuides = guidesOf(editor, ref.owner);
      const frameGuides = guidesOf(editor, frame);
      const inv = invert(editor.scene.computeWorld(frame));
      const local = inv ? apply(inv, p.world) : p.world;
      d.tx.set(ref.owner, 'guides', guidesValue(pageGuides.filter((_, i) => i !== ref.index)));
      d.tx.set(frame, 'guides', [...frameGuides, { axis: d.axis, offset: Math.round(d.axis === 'X' ? local.x : local.y) }]);
      ref = { owner: frame, index: frameGuides.length };
    }
    editor.history.commit(d.tx);
    editor.state.selectGuide(ref);
  }

  modifiersChanged(m: ModifierState): void {
    const d = this.drag;
    if (d?.dragged) this.update({ ...d.last, ...m });
  }

  cancel(): boolean {
    if (!this.drag) return false;
    this.editor.history.cancel(this.drag.tx);
    this.drag = null;
    return true;
  }

  private update(p: PointerInfo, d: GuideDrag | null = this.drag): void {
    if (!d) return;
    const { editor } = this;
    const guides = guidesOf(editor, d.ref.owner);
    if (!guides[d.ref.index]) return;
    const offset = this.offsetAt(p, d);
    d.tx.set(
      d.ref.owner,
      'guides',
      guides.map((g, i) => (i === d.ref.index ? { ...g, offset } : g)),
    );
    d.tx.flushPreview();
    editor.requestRender();
  }

  private offsetAt(p: PointerInfo, d: GuideDrag): number {
    const { editor } = this;
    if (d.ref.owner !== editor.pageId) {
      const inv = invert(editor.scene.computeWorld(d.ref.owner));
      const local = inv ? apply(inv, p.world) : p.world;
      return Math.round(d.axis === 'X' ? local.x : local.y);
    }
    const value = d.axis === 'X' ? p.world.x : p.world.y;
    if (!p.ctrl && d.candidates.length > 0) {
      const delta = snapValue(value, edgeValues(d.candidates, d.axis === 'X' ? 'x' : 'y'), SNAP_THRESHOLD_PX / editor.state.viewport.zoom);
      if (delta !== null) return Math.round((value + delta) * 100) / 100;
    }
    return Math.round(value);
  }
}
