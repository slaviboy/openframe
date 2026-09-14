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

import { ROOT_ID, type Id } from '../ids/ids';
import type { DocumentMeta, Node } from '../schema/document';
import type { Op } from '../ops/ops';

/**
 * In-memory document: an entity map of immutable node values plus a derived
 * children index. Mutation happens only through `applyOp`, which is called by
 * transactions and history — never by UI code.
 */
export class DocumentStore {
  private readonly nodeMap = new Map<Id, Node>();
  private readonly childIndex = new Map<Id, Id[]>();
  private readonly nodeRevs = new Map<Id, number>();
  private revision = 0;

  constructor(
    public meta: DocumentMeta,
    nodes: Iterable<Node>,
  ) {
    for (const node of nodes) this.nodeMap.set(node.id, node);
    for (const node of this.nodeMap.values()) {
      if (node.type !== 'DOCUMENT') this.insertChild(node.parent.id, node.id);
    }
    if (!this.nodeMap.has(ROOT_ID)) throw new Error('Document has no root node');
  }

  /** Monotonic document revision; bumps on every applied op. */
  get rev(): number {
    return this.revision;
  }

  get size(): number {
    return this.nodeMap.size;
  }

  get(id: Id): Node | undefined {
    return this.nodeMap.get(id);
  }

  getOrThrow(id: Id): Node {
    const node = this.nodeMap.get(id);
    if (!node) throw new Error(`Node ${id} not found`);
    return node;
  }

  has(id: Id): boolean {
    return this.nodeMap.has(id);
  }

  /** Revision of a single node (0 if never modified since load). */
  nodeRev(id: Id): number {
    return this.nodeRevs.get(id) ?? 0;
  }

  /** Children ordered bottom-to-top (first = back-most), by fractional key then id. */
  children(id: Id): readonly Id[] {
    return this.childIndex.get(id) ?? EMPTY;
  }

  parentOf(id: Id): Id | null {
    const node = this.nodeMap.get(id);
    return node && node.type !== 'DOCUMENT' ? node.parent.id : null;
  }

  nodes(): IterableIterator<Node> {
    return this.nodeMap.values();
  }

  pages(): Id[] {
    // Styles are children of the root too.
    return [...this.children(ROOT_ID)].filter((id) => this.nodeMap.get(id)?.type === 'PAGE');
  }

  /** Ancestors from parent up to (and including) the root. */
  ancestors(id: Id): Id[] {
    const out: Id[] = [];
    let cur = this.parentOf(id);
    while (cur !== null) {
      out.push(cur);
      cur = this.parentOf(cur);
    }
    return out;
  }

  isAncestor(ancestor: Id, id: Id): boolean {
    let cur = this.parentOf(id);
    while (cur !== null) {
      if (cur === ancestor) return true;
      cur = this.parentOf(cur);
    }
    return false;
  }

  /** The PAGE containing a node (or the node itself if it is a page). */
  pageOf(id: Id): Id | null {
    let cur: Id | null = id;
    while (cur !== null) {
      const node = this.nodeMap.get(cur);
      if (!node) return null;
      if (node.type === 'PAGE') return cur;
      cur = this.parentOf(cur);
    }
    return null;
  }

  /** Depth-first pre-order traversal of a subtree, including the start node. */
  *descendants(id: Id, includeSelf = true): Generator<Id> {
    if (includeSelf) yield id;
    for (const child of this.children(id)) yield* this.descendants(child, true);
  }

  applyOp(op: Op): void {
    switch (op.kind) {
      case 'create': {
        if (this.nodeMap.has(op.node.id)) throw new Error(`create: node ${op.node.id} already exists`);
        if (op.node.type === 'DOCUMENT') throw new Error('create: cannot create a document root');
        if (!this.nodeMap.has(op.node.parent.id)) throw new Error(`create: parent ${op.node.parent.id} missing`);
        this.nodeMap.set(op.node.id, op.node);
        this.insertChild(op.node.parent.id, op.node.id);
        break;
      }
      case 'delete': {
        const node = this.getOrThrow(op.node.id);
        if (this.children(node.id).length > 0) throw new Error(`delete: node ${node.id} still has children`);
        if (node.type === 'DOCUMENT') throw new Error('delete: cannot delete the document root');
        this.removeChild(node.parent.id, node.id);
        this.nodeMap.delete(node.id);
        this.nodeRevs.delete(node.id);
        break;
      }
      case 'set': {
        const node = this.getOrThrow(op.id);
        if (op.field === 'id' || op.field === 'type') throw new Error(`set: field "${op.field}" is immutable`);
        let next: Node;
        if (op.value === undefined) {
          // Removing an optional field (e.g. undoing the first `cornerRadii` edit).
          const { [op.field]: _removed, ...rest } = node as unknown as Record<string, unknown>;
          next = rest as unknown as Node;
        } else {
          next = { ...node, [op.field]: op.value } as Node;
        }
        if (op.field === 'parent' && node.type !== 'DOCUMENT' && next.type !== 'DOCUMENT') {
          if (!this.nodeMap.has(next.parent.id)) throw new Error(`set parent: ${next.parent.id} missing`);
          if (next.parent.id === node.id || this.isAncestor(node.id, next.parent.id)) {
            throw new Error('set parent: would create a cycle');
          }
          this.removeChild(node.parent.id, node.id);
          this.nodeMap.set(node.id, next);
          this.insertChild(next.parent.id, node.id);
        } else {
          this.nodeMap.set(node.id, next);
        }
        break;
      }
    }
    this.revision++;
    const id = op.kind === 'set' ? op.id : op.node.id;
    if (op.kind !== 'delete') this.nodeRevs.set(id, this.revision);
  }

  private insertChild(parentId: Id, childId: Id): void {
    let list = this.childIndex.get(parentId);
    if (!list) {
      list = [];
      this.childIndex.set(parentId, list);
    }
    const child = this.nodeMap.get(childId)!;
    const key = child.type === 'DOCUMENT' ? '' : child.parent.key;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const other = this.nodeMap.get(list[mid]!)!;
      const otherKey = other.type === 'DOCUMENT' ? '' : other.parent.key;
      if (otherKey < key || (otherKey === key && other.id < childId)) lo = mid + 1;
      else hi = mid;
    }
    list.splice(lo, 0, childId);
  }

  private removeChild(parentId: Id, childId: Id): void {
    const list = this.childIndex.get(parentId);
    if (!list) return;
    const idx = list.indexOf(childId);
    if (idx >= 0) list.splice(idx, 1);
    if (list.length === 0) this.childIndex.delete(parentId);
  }
}

const EMPTY: readonly Id[] = Object.freeze([]);
