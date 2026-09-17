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

import type { Transaction } from '@/core/history/history';
import { valuesAt } from '@/core/motion/animation';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type AnimatedProperty, type SceneNode, type Transform } from '@/core/schema/document';
import { resolvedAnimation } from '../commands/motion';
import { rotationDegrees, setRotation } from '../commands/properties';
import type { Editor } from '../editor';

/**
 * The canvas while the timeline's playhead is somewhere: the animated layers are shown at their values for that moment,
 * as a preview the file itself never takes. Moving the playhead re-applies it, and leaving Motion (or playing from the
 * start again) drops it, so the layers go back to the values the file holds.
 */
export class MotionPreview {
  private tx: Transaction | null = null;
  private shown: string | null = null;

  constructor(private readonly editor: Editor) {
    editor.motionPreview = this;
  }

  /** Stops showing the animation and lets go of the editor. */
  dispose(): void {
    this.clear();
    if (this.editor.motionPreview === this) this.editor.motionPreview = null;
  }

  /** Shows the animation at `time`. Nothing is shown at a moment where no track has anything to say. */
  show(time: number): void {
    // Easings bound to variables are looked up before the animation is read.
    const animation = resolvedAnimation(this.editor);
    const values = valuesAt(animation, time);
    const key = `${time}:${animation?.tracks.length ?? 0}`;
    if (values.size === 0) {
      this.clear();
      return;
    }
    if (key === this.shown) return;
    this.clear();
    const tx = this.editor.history.begin('Motion preview');
    for (const [id, properties] of values) {
      const node = tx.store.get(id);
      if (!node || !isSceneNode(node)) continue;
      applyValues(tx, node, properties);
    }
    tx.flushPreview();
    this.tx = tx;
    this.shown = key;
    this.editor.requestRender();
  }

  /** Puts the layers back as the file has them. */
  clear(): void {
    if (!this.tx) return;
    const tx = this.tx;
    this.tx = null;
    this.shown = null;
    this.editor.history.cancel(tx);
    this.editor.requestRender();
  }

  get active(): boolean {
    return this.tx !== null;
  }
}

/** Sets a layer's animated properties in an open transaction. */
function applyValues(tx: Transaction, node: SceneNode, properties: Partial<Record<AnimatedProperty, number>>): void {
  const id: Id = node.id;
  if (properties.opacity !== undefined) tx.set(id, 'opacity', Math.min(1, Math.max(0, properties.opacity)));
  const share = (value: number) => Math.min(1, Math.max(0, value));
  if (properties.trimStart !== undefined) tx.set(id, 'strokeTrimStart', share(properties.trimStart));
  if (properties.trimEnd !== undefined) tx.set(id, 'strokeTrimEnd', share(properties.trimEnd));
  if (properties.width !== undefined || properties.height !== undefined) {
    const size = { width: Math.max(0, properties.width ?? node.size.width), height: Math.max(0, properties.height ?? node.size.height) };
    const share = node.anchor ?? { x: 0.5, y: 0.5 };
    // A layer scales around its anchor, so the anchor stays where it was while the size changes.
    const shift = { x: (node.size.width - size.width) * share.x, y: (node.size.height - size.height) * share.y };
    const t = node.transform;
    tx.set(id, 'size', size);
    tx.set(id, 'transform', [t[0], t[1], t[2], t[3], t[4] + t[0] * shift.x + t[2] * shift.y, t[5] + t[1] * shift.x + t[3] * shift.y] satisfies Transform);
  }
  if (properties.rotation !== undefined && properties.rotation !== rotationDegrees(node)) setRotation(tx, node, properties.rotation);
  if (properties.x !== undefined || properties.y !== undefined) {
    // The turn a rotation keyframe applied is kept: only the place moves.
    const current = (tx.store.getOrThrow(id) as SceneNode).transform;
    const next: Transform = [current[0], current[1], current[2], current[3], properties.x ?? current[4], properties.y ?? current[5]];
    tx.set(id, 'transform', next);
  }
}
