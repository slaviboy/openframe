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

import type { Rect } from './rect';

/**
 * Static packed R-tree (Hilbert-sorted, flat typed arrays) for viewport culling
 * and hit-testing. Rebuilding for 10k items takes a few milliseconds, which is
 * cheaper and simpler than incremental R-tree maintenance; the scene rebuilds
 * the index lazily after geometry changes.
 */
export class SpatialIndex<T> {
  private readonly items: T[] = [];
  private boxes = new Float64Array(0);
  private indices = new Uint32Array(0);
  private levelBounds: number[] = [];
  private readonly nodeSize: number;
  private built = false;
  private pending: { item: T; rect: Rect }[] = [];

  constructor(nodeSize = 16) {
    this.nodeSize = Math.max(2, nodeSize);
  }

  get size(): number {
    return this.built ? this.items.length : this.pending.length;
  }

  add(item: T, rect: Rect): void {
    if (this.built) throw new Error('SpatialIndex is immutable after build(); create a new index');
    this.pending.push({ item, rect });
  }

  build(): this {
    const entries = this.pending;
    this.pending = [];
    const n = entries.length;
    this.items.length = 0;
    this.built = true;
    if (n === 0) {
      this.boxes = new Float64Array(0);
      this.indices = new Uint32Array(0);
      this.levelBounds = [0];
      return this;
    }
    let numNodes = n;
    let count = n;
    this.levelBounds = [n * 4];
    do {
      count = Math.ceil(count / this.nodeSize);
      numNodes += count;
      this.levelBounds.push(numNodes * 4);
    } while (count > 1 || numNodes === n);

    this.boxes = new Float64Array(numNodes * 4);
    this.indices = new Uint32Array(numNodes);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const { rect } of entries) {
      minX = Math.min(minX, rect.x);
      minY = Math.min(minY, rect.y);
      maxX = Math.max(maxX, rect.x + rect.width);
      maxY = Math.max(maxY, rect.y + rect.height);
    }

    const hilbertValues = new Uint32Array(n);
    const w = maxX - minX || 1;
    const h = maxY - minY || 1;
    const HILBERT_MAX = (1 << 16) - 1;
    entries.forEach(({ rect }, i) => {
      const cx = Math.floor((HILBERT_MAX * (rect.x + rect.width / 2 - minX)) / w);
      const cy = Math.floor((HILBERT_MAX * (rect.y + rect.height / 2 - minY)) / h);
      hilbertValues[i] = hilbert(cx, cy);
    });

    const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => hilbertValues[a]! - hilbertValues[b]!);
    this.items.length = 0;
    order.forEach((src, dst) => {
      const { item, rect } = entries[src]!;
      this.items.push(item);
      const o = dst * 4;
      this.boxes[o] = rect.x;
      this.boxes[o + 1] = rect.y;
      this.boxes[o + 2] = rect.x + rect.width;
      this.boxes[o + 3] = rect.y + rect.height;
      this.indices[dst] = dst;
    });

    // Build parent levels bottom-up.
    let pos = 0;
    let write = n * 4;
    for (let level = 0; level < this.levelBounds.length - 1; level++) {
      const end = this.levelBounds[level]!;
      while (pos < end) {
        const nodeIndex = pos;
        let bx0 = Infinity;
        let by0 = Infinity;
        let bx1 = -Infinity;
        let by1 = -Infinity;
        for (let j = 0; j < this.nodeSize && pos < end; j++, pos += 4) {
          bx0 = Math.min(bx0, this.boxes[pos]!);
          by0 = Math.min(by0, this.boxes[pos + 1]!);
          bx1 = Math.max(bx1, this.boxes[pos + 2]!);
          by1 = Math.max(by1, this.boxes[pos + 3]!);
        }
        this.indices[write / 4] = nodeIndex;
        this.boxes[write++] = bx0;
        this.boxes[write++] = by0;
        this.boxes[write++] = bx1;
        this.boxes[write++] = by1;
      }
    }
    this.built = true;
    return this;
  }

  /** Items whose bounds intersect `r` (inclusive edges). */
  search(r: Rect, filter?: (item: T) => boolean): T[] {
    if (!this.built) throw new Error('SpatialIndex.search() before build()');
    const results: T[] = [];
    if (this.items.length === 0) return results;
    const x0 = r.x;
    const y0 = r.y;
    const x1 = r.x + r.width;
    const y1 = r.y + r.height;
    const stack: number[] = [];
    let nodeIndex: number | undefined = this.boxes.length - 4;
    while (nodeIndex !== undefined) {
      const end = Math.min(nodeIndex + this.nodeSize * 4, upperBound(nodeIndex, this.levelBounds));
      for (let pos = nodeIndex; pos < end; pos += 4) {
        if (x1 < this.boxes[pos]! || y1 < this.boxes[pos + 1]! || x0 > this.boxes[pos + 2]! || y0 > this.boxes[pos + 3]!)
          continue;
        const index = this.indices[pos / 4]!;
        if (nodeIndex >= this.items.length * 4) stack.push(index);
        else {
          const item = this.items[index]!;
          if (!filter || filter(item)) results.push(item);
        }
      }
      nodeIndex = stack.pop();
    }
    return results;
  }
}

function upperBound(value: number, arr: number[]): number {
  let i = 0;
  let j = arr.length - 1;
  while (i < j) {
    const m = (i + j) >> 1;
    if (arr[m]! > value) j = m;
    else i = m + 1;
  }
  return arr[i]!;
}

/** Hilbert curve index of (x, y) in a 2^16 grid (Warren/Rawlinson algorithm). */
function hilbert(x: number, y: number): number {
  let a = x ^ y;
  let b = 0xffff ^ a;
  let c = 0xffff ^ (x | y);
  let d = x & (y ^ 0xffff);
  let A = a | (b >> 1);
  let B = (a >> 1) ^ a;
  let C = (c >> 1) ^ (b & (d >> 1)) ^ c;
  let D = (a & (c >> 1)) ^ (d >> 1) ^ d;

  a = A; b = B; c = C; d = D;
  A = (a & (a >> 2)) ^ (b & (b >> 2));
  B = (a & (b >> 2)) ^ (b & ((a ^ b) >> 2));
  C ^= (a & (c >> 2)) ^ (b & (d >> 2));
  D ^= (b & (c >> 2)) ^ ((a ^ b) & (d >> 2));

  a = A; b = B; c = C; d = D;
  A = (a & (a >> 4)) ^ (b & (b >> 4));
  B = (a & (b >> 4)) ^ (b & ((a ^ b) >> 4));
  C ^= (a & (c >> 4)) ^ (b & (d >> 4));
  D ^= (b & (c >> 4)) ^ ((a ^ b) & (d >> 4));

  a = A; b = B; c = C; d = D;
  C ^= (a & (c >> 8)) ^ (b & (d >> 8));
  D ^= (b & (c >> 8)) ^ ((a ^ b) & (d >> 8));

  a = C ^ (C >> 1);
  b = D ^ (D >> 1);
  let i0 = x ^ y;
  let i1 = b | (0xffff ^ (i0 | a));
  i0 = (i0 | (i0 << 8)) & 0x00ff00ff;
  i0 = (i0 | (i0 << 4)) & 0x0f0f0f0f;
  i0 = (i0 | (i0 << 2)) & 0x33333333;
  i0 = (i0 | (i0 << 1)) & 0x55555555;
  i1 = (i1 | (i1 << 8)) & 0x00ff00ff;
  i1 = (i1 | (i1 << 4)) & 0x0f0f0f0f;
  i1 = (i1 | (i1 << 2)) & 0x33333333;
  i1 = (i1 | (i1 << 1)) & 0x55555555;
  return ((i1 << 1) | i0) >>> 0;
}
