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

import { blurOffsets, isBlur, isProgressiveBlur, type BlurEffect } from '@/core/effects/effects';
import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { apply, invert, type Matrix } from '@/core/math/matrix';
import type { Vec2 } from '@/core/math/vec';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import type { ToolId } from '../stores/editor-store';
import type { CursorKind, PointerInfo, Tool } from '../tools/types';
import { worldToScreen } from '../viewport/viewport';

export interface BlurEditTarget {
  readonly node: SceneNode;
  readonly index: number;
  readonly effect: BlurEffect;
}

/** The progressive blur being edited, if it still exists and is progressive. */
export function blurEditTarget(editor: Editor): BlurEditTarget | null {
  const edit = editor.state.getSnapshot().blurEdit;
  const node = edit ? editor.doc.get(edit.nodeId) : undefined;
  if (!edit || !node || !isSceneNode(node)) return null;
  const effect = node.effects?.[edit.index];
  return effect && isBlur(effect) && isProgressiveBlur(effect) ? { node, index: edit.index, effect } : null;
}

/** Shows on-canvas start and end handles for a layer's progressive blur (the layer becomes the selection). */
export function beginBlurEdit(editor: Editor, nodeId: Id, index: number): boolean {
  editor.state.select([nodeId]);
  editor.state.setBlurEdit({ nodeId, index });
  if (!blurEditTarget(editor)) {
    editor.state.setBlurEdit(null);
    return false;
  }
  editor.requestRender();
  return true;
}

export function endBlurEdit(editor: Editor): boolean {
  if (!editor.state.getSnapshot().blurEdit) return false;
  editor.state.setBlurEdit(null);
  editor.requestRender();
  return true;
}

/** World-space start and end of the progressive blur being edited. */
export function blurEditChrome(editor: Editor): { readonly start: Vec2; readonly end: Vec2 } | null {
  const target = blurEditTarget(editor);
  if (!target) return null;
  editor.scene.ensure(editor.pageId);
  const world = editor.scene.worldTransform(target.node.id);
  const { start, end } = blurOffsets(target.effect);
  const { width, height } = target.node.size;
  return { start: apply(world, { x: start.x * width, y: start.y * height }), end: apply(world, { x: end.x * width, y: end.y * height }) };
}

interface BlurGesture {
  readonly handle: 'start' | 'end';
  readonly tx: Transaction;
  readonly target: BlurEditTarget;
  readonly toLocal: Matrix;
  moved: boolean;
}

const clamp01 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/**
 * Pointer handling while a progressive blur is edited on the canvas: drag the start or end handle to
 * set where the blur begins and reaches full strength (clamped to the layer box). Clicking elsewhere,
 * Escape or selecting another layer stops editing.
 */
export class BlurEditController implements Tool {
  readonly id: ToolId = 'move';
  private gesture: BlurGesture | null = null;
  private hoverCursor: CursorKind = 'default';

  constructor(
    private readonly editor: Editor,
    private readonly tolerancePx: number,
  ) {}

  get active(): boolean {
    return this.gesture !== null;
  }

  cursor(): CursorKind {
    return this.gesture ? 'move' : this.hoverCursor;
  }

  private hit(p: PointerInfo): 'start' | 'end' | null {
    const chrome = blurEditChrome(this.editor);
    if (!chrome) return null;
    const v = this.editor.state.viewport;
    const near = (world: Vec2) => {
      const s = worldToScreen(v, world);
      return Math.hypot(s.x - p.screen.x, s.y - p.screen.y) <= this.tolerancePx + 3;
    };
    return near(chrome.end) ? 'end' : near(chrome.start) ? 'start' : null;
  }

  pointerDown(p: PointerInfo): void {
    const { editor } = this;
    editor.scene.ensure(editor.pageId);
    const target = blurEditTarget(editor);
    const handle = p.button === 0 && target ? this.hit(p) : null;
    const toLocal = target && invert(editor.scene.worldTransform(target.node.id));
    if (!handle || !target || !toLocal) {
      endBlurEdit(editor);
      return;
    }
    this.gesture = { handle, tx: editor.history.begin('Move blur handle'), target, toLocal, moved: false };
  }

  pointerMove(p: PointerInfo): void {
    const g = this.gesture;
    if (!g) {
      this.hoverCursor = this.hit(p) ? 'move' : 'default';
      return;
    }
    g.moved = true;
    const local = apply(g.toLocal, p.world);
    const { width, height } = g.target.node.size;
    const offset = { x: clamp01(width > 0 ? local.x / width : 0), y: clamp01(height > 0 ? local.y / height : 0) };
    const effect: BlurEffect = g.handle === 'start' ? { ...g.target.effect, startOffset: offset } : { ...g.target.effect, endOffset: offset };
    const current = g.tx.store.getOrThrow(g.target.node.id) as SceneNode;
    g.tx.set(g.target.node.id, 'effects', (current.effects ?? []).map((e, i) => (i === g.target.index ? effect : e)));
    g.tx.flushPreview();
    this.editor.requestRender();
  }

  pointerUp(): void {
    const g = this.gesture;
    if (!g) return;
    this.gesture = null;
    if (g.moved) this.editor.history.commit(g.tx);
    else this.editor.history.cancel(g.tx);
  }

  cancel(): boolean {
    if (this.gesture) {
      this.editor.history.cancel(this.gesture.tx);
      this.gesture = null;
      return true;
    }
    return endBlurEdit(this.editor);
  }
}
