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

import type { DocumentStore } from '../document/store';
import type { Transaction } from '../history/history';
import type { Id } from '../ids/ids';
import { hasGeometry, isSceneNode, type GradientPaint, type Paint, type SceneNode, type SolidPaint } from '../schema/document';
import { canonicalStringify } from '../serialize/serialize';

export type ColorPaint = SolidPaint | GradientPaint;

/** Where a paint is used: a layer, its fills or strokes, and the paint's index. */
export interface PaintUsage {
  readonly node: Id;
  readonly field: 'fills' | 'strokes';
  readonly index: number;
}

/** One distinct color in a selection, with every place it is used. */
export interface SelectionColor {
  readonly key: string;
  readonly paint: ColorPaint;
  readonly usages: readonly PaintUsage[];
  /** Layers using the color, in the order first seen. */
  readonly layers: readonly Id[];
}

/** Paints are the same selection color when their type, color (or stops) and opacity match. */
function colorKey(paint: ColorPaint): string {
  if (paint.type === 'SOLID') return canonicalStringify(['SOLID', paint.color, paint.opacity]);
  const stops = [...paint.gradientStops].sort((a, b) => a.position - b.position);
  return canonicalStringify([paint.type, stops, paint.opacity]);
}

/**
 * Distinct solid and gradient colors of the selected layers and everything inside them, from
 * fills and strokes, in the order first seen. Hidden paints, image paints and masks are left out.
 */
export function selectionColors(store: DocumentStore, ids: readonly Id[]): SelectionColor[] {
  const byKey = new Map<string, { paint: ColorPaint; usages: PaintUsage[]; layers: Id[] }>();
  const visit = (id: Id) => {
    const node = store.get(id);
    if (!node || !isSceneNode(node) || node.isMask) return;
    if (hasGeometry(node)) {
      for (const field of ['fills', 'strokes'] as const) {
        if (field === 'fills' && node.type === 'LINE') continue;
        node[field].forEach((paint: Paint, index) => {
          if (!paint.visible || paint.type === 'IMAGE') return;
          const key = colorKey(paint);
          let entry = byKey.get(key);
          if (!entry) byKey.set(key, (entry = { paint, usages: [], layers: [] }));
          entry.usages.push({ node: node.id, field, index });
          if (!entry.layers.includes(node.id)) entry.layers.push(node.id);
        });
      }
    }
    for (const child of store.children(id)) visit(child);
  };
  ids.forEach(visit);
  return [...byKey].map(([key, entry]) => ({ key, ...entry }));
}

/** Selection colors are shown for several layers or for layers that contain others. */
export const showsSelectionColors = (store: DocumentStore, ids: readonly Id[]): boolean =>
  ids.length > 1 || ids.some((id) => store.children(id).length > 0);

/** Rewrites every usage of a selection color with `edit` (which must keep the paint a color paint). */
export function updateSelectionColor(tx: Transaction, usages: readonly PaintUsage[], edit: (paint: ColorPaint) => Paint): void {
  const byLayer = new Map<Id, PaintUsage[]>();
  for (const usage of usages) byLayer.set(usage.node, [...(byLayer.get(usage.node) ?? []), usage]);
  for (const [id, list] of byLayer) {
    const node = tx.store.get(id) as SceneNode | undefined;
    if (!node || !hasGeometry(node)) continue;
    for (const field of ['fills', 'strokes'] as const) {
      const indices = list.filter((u) => u.field === field).map((u) => u.index);
      if (indices.length === 0) continue;
      const next = node[field].map((paint, i) => (indices.includes(i) && paint.type !== 'IMAGE' ? edit(paint) : paint));
      tx.set(id, field, next);
    }
  }
}
