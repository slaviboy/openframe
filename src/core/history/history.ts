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
import type { Id } from '../ids/ids';
import { valuesEqual } from '../ops/equality';
import { invertOps, opTarget, type Op } from '../ops/ops';
import type { Node } from '../schema/document';

/** Summary of what changed in one commit/undo/redo, consumed by caches, renderer, UI and persistence. */
export interface ChangeSet {
  readonly ops: readonly Op[];
  /** Node id → changed field names. Created/deleted nodes use the markers '$created' / '$deleted'. */
  readonly nodes: ReadonlyMap<Id, ReadonlySet<string>>;
  /** Parents whose child list changed (insert, remove, reorder). */
  readonly structural: ReadonlySet<Id>;
  readonly source: 'commit' | 'undo' | 'redo' | 'preview' | 'cancel' | 'load';
}

export interface HistoryEntry<Meta> {
  readonly label: string;
  readonly ops: readonly Op[];
  readonly metaBefore: Meta;
  readonly metaAfter: Meta;
  /** Consecutive commits with the same key merge into this entry (e.g. keystrokes of one text editing session). */
  readonly mergeKey?: string | undefined;
}

export interface TransactionOptions {
  /** Merge into the last undo step when it has the same key and nothing else was committed since. */
  readonly mergeKey?: string | undefined;
  /**
   * False commits the change (listeners, persistence) without an undo step and without clearing
   * redo — for derived updates nobody asked for, such as refitting text once its fonts load.
   */
  readonly undoable?: boolean | undefined;
  /** False keeps the change from being carried between a component and its instances; see `Transaction.syncInstances`. */
  readonly syncInstances?: boolean | undefined;
}

export type ChangeListener = (change: ChangeSet) => void;

/**
 * A finalizer runs at commit (and before preview frames) to derive dependent
 * state — e.g. auto layout or constraints — by adding more ops to the same
 * transaction, so undo stays atomic.
 */
export type Finalizer = (tx: Transaction) => void;

export function buildChangeSet(ops: readonly Op[], source: ChangeSet['source'], store: DocumentStore): ChangeSet {
  const nodes = new Map<Id, Set<string>>();
  const structural = new Set<Id>();
  const mark = (id: Id, field: string) => {
    let set = nodes.get(id);
    if (!set) nodes.set(id, (set = new Set()));
    set.add(field);
  };
  for (const op of ops) {
    const id = opTarget(op);
    if (op.kind === 'create' || op.kind === 'delete') {
      mark(id, op.kind === 'create' ? '$created' : '$deleted');
      if (op.node.type !== 'DOCUMENT') structural.add(op.node.parent.id);
    } else {
      mark(id, op.field);
      if (op.field === 'parent') {
        const prev = op.prev as { id: Id } | undefined;
        const next = op.value as { id: Id } | undefined;
        if (prev) structural.add(prev.id);
        if (next) structural.add(next.id);
        if (!next && store.has(id)) structural.add(store.parentOf(id) ?? id);
      }
    }
  }
  return { ops, nodes, structural, source };
}

/**
 * A group of ops applied live and committed (or canceled) atomically.
 * Repeated `set`s of the same (node, field) coalesce, keeping the original
 * `prev`, so a 200-frame drag records one op per field.
 */
export class Transaction {
  private readonly recorded: Op[] = [];
  private readonly setIndex = new Map<string, number>();
  /** Ops were applied since the last preview (including coalesced sets, which don't add ops). */
  private dirty = true;
  private closed = false;
  /** Resizing frames in this transaction leaves their children alone (⌘ while resizing, the Scale tool). */
  ignoreConstraints = false;

  /**
   * Whether edits in this transaction are carried between a component and its instances. The Motion preview turns it
   * off: it shows an instance's layers where the animation puts them, which is deliberately not where the component
   * has them, and reconciling would pull them straight back.
   */
  syncInstances = true;

  constructor(
    readonly store: DocumentStore,
    readonly label: string,
    private readonly onPreview: (ops: readonly Op[]) => void,
    /** Runs before each preview is emitted, e.g. finalizers that keep layout live during a drag. */
    private readonly beforePreview: (tx: Transaction) => void = () => {},
  ) {}

  get ops(): readonly Op[] {
    return this.recorded;
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  create(node: Node): void {
    this.push({ kind: 'create', node });
  }

  /** Deletes a node and its whole subtree (children first). */
  delete(id: Id): void {
    const ids = [...this.store.descendants(id)].reverse();
    for (const nodeId of ids) this.push({ kind: 'delete', node: this.store.getOrThrow(nodeId) });
  }

  set(id: Id, field: string, value: unknown): void {
    const node = this.store.getOrThrow(id) as unknown as Record<string, unknown>;
    const prev = node[field];
    if (valuesEqual(prev, value)) return;
    const key = `${id}\0${field}`;
    const existing = this.setIndex.get(key);
    if (existing !== undefined) {
      const earlier = this.recorded[existing]!;
      if (earlier.kind === 'set') {
        this.assertOpen();
        this.store.applyOp({ kind: 'set', id, field, value, prev });
        this.recorded[existing] = { ...earlier, value };
        this.dirty = true;
        return;
      }
    }
    this.push({ kind: 'set', id, field, value, prev });
    this.setIndex.set(key, this.recorded.length - 1);
  }

  /** Sets several fields of one node. */
  update(id: Id, patch: Readonly<Record<string, unknown>>): void {
    for (const [field, value] of Object.entries(patch)) this.set(id, field, value);
  }

  /**
   * Emits a preview ChangeSet when anything was applied since the last preview (for live
   * rendering during gestures). A coalesced set changes the document without adding an op, so
   * it must still produce a preview.
   */
  flushPreview(): void {
    if (!this.dirty) return;
    this.beforePreview(this);
    this.dirty = false;
    this.onPreview(this.recorded);
  }

  /** @internal */
  close(): void {
    this.closed = true;
  }

  private push(op: Op): void {
    this.assertOpen();
    this.store.applyOp(op);
    this.recorded.push(op);
    this.dirty = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error(`Transaction "${this.label}" is closed`);
  }
}

export interface HistoryOptions<Meta> {
  store: DocumentStore;
  /** Captures editor metadata (e.g. selection, page) to restore on undo/redo. */
  captureMeta: () => Meta;
  restoreMeta: (meta: Meta) => void;
  finalizers?: Finalizer[];
  /**
   * Finalizers that also run before every preview of an open transaction, so derived layout follows a
   * drag live. They must be safe to run repeatedly (compute from the ops' original values).
   */
  previewFinalizers?: Finalizer[];
  /** Runs before a transaction starts, so a preview of the document (Motion's playhead) can stand down for the edit. */
  beforeBegin?: () => void;
  /** Development invariant check run after every change. */
  validate?: (store: DocumentStore) => void;
  limit?: number;
  /** Whether the document can't be changed (e.g. while viewing an earlier version): commits are discarded and undo and redo do nothing. */
  isReadOnly?: () => boolean;
}

/**
 * Owns the undo/redo stacks and is the only entry point for document mutation.
 */
export class History<Meta> {
  private readonly undoStack: HistoryEntry<Meta>[] = [];
  private readonly redoStack: HistoryEntry<Meta>[] = [];
  private readonly listeners = new Set<ChangeListener>();
  private active: { tx: Transaction; metaBefore: Meta; mergeKey: string | undefined } | null = null;
  private readonly limit: number;

  constructor(private readonly options: HistoryOptions<Meta>) {
    this.limit = options.limit ?? 500;
  }

  get store(): DocumentStore {
    return this.options.store;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0 && !this.active && !this.readOnly;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0 && !this.active && !this.readOnly;
  }

  /** Whether the document can't be changed right now. */
  get readOnly(): boolean {
    return this.options.isReadOnly?.() ?? false;
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  get inTransaction(): boolean {
    return this.active !== null;
  }

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts a long-lived transaction (e.g. for a drag). Only one may be active. */
  /** Whether the active transaction records an undo step. */
  private activeUndoable = true;

  begin(label: string, options: TransactionOptions = {}): Transaction {
    this.options.beforeBegin?.();
    if (this.active) throw new Error(`Cannot begin "${label}": "${this.active.tx.label}" is still active`);
    const tx = new Transaction(
      this.store,
      label,
      (ops) => this.emit(buildChangeSet(ops, 'preview', this.store)),
      (open) => {
        for (const finalize of this.options.previewFinalizers ?? []) finalize(open);
      },
    );
    if (options.syncInstances === false) tx.syncInstances = false;
    this.active = { tx, metaBefore: this.options.captureMeta(), mergeKey: options.mergeKey };
    this.activeUndoable = options.undoable ?? true;
    return tx;
  }

  commit(tx: Transaction): ChangeSet | null {
    this.assertActive(tx);
    if (this.readOnly) {
      // A read-only document discards the change (its previews revert).
      this.cancel(tx);
      return null;
    }
    try {
      for (const finalize of this.options.finalizers ?? []) finalize(tx);
      this.options.validate?.(this.store);
    } catch (error) {
      this.cancel(tx);
      throw error;
    }
    const { metaBefore, mergeKey } = this.active!;
    const undoable = this.activeUndoable;
    tx.close();
    this.active = null;
    // A coalesced drag that ends where it started leaves only no-op sets: record nothing.
    if (tx.ops.every((op) => op.kind === 'set' && valuesEqual(op.prev, op.value))) {
      if (tx.ops.length > 0) this.emit(buildChangeSet(tx.ops, 'commit', this.store));
      return null;
    }
    if (!undoable) {
      const change = buildChangeSet(tx.ops, 'commit', this.store);
      this.emit(change);
      return change;
    }
    const last = this.undoStack.at(-1);
    if (mergeKey !== undefined && last?.mergeKey === mergeKey && this.redoStack.length === 0) {
      this.undoStack[this.undoStack.length - 1] = { ...last, ops: [...last.ops, ...tx.ops], metaAfter: this.options.captureMeta() };
    } else {
      this.undoStack.push({ label: tx.label, ops: tx.ops, metaBefore, metaAfter: this.options.captureMeta(), mergeKey });
    }
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
    const change = buildChangeSet(tx.ops, 'commit', this.store);
    this.emit(change);
    return change;
  }

  cancel(tx: Transaction): void {
    this.assertActive(tx);
    const inverse = invertOps(tx.ops);
    for (const op of inverse) this.store.applyOp(op);
    const { metaBefore } = this.active!;
    tx.close();
    this.active = null;
    this.options.restoreMeta(metaBefore);
    if (inverse.length > 0) this.emit(buildChangeSet(inverse, 'cancel', this.store));
  }

  /**
   * Undoes the last step if it has `mergeKey`, without making it redoable — for work that is
   * abandoned as a whole (e.g. a new text layer left empty). Returns whether it did.
   */
  revert(mergeKey: string): boolean {
    const last = this.undoStack.at(-1);
    if (this.active || last?.mergeKey !== mergeKey) return false;
    this.undoStack.pop();
    const inverse = invertOps(last.ops);
    for (const op of inverse) this.store.applyOp(op);
    this.options.restoreMeta(last.metaBefore);
    this.emit(buildChangeSet(inverse, 'undo', this.store));
    return true;
  }

  /** Runs `fn` in a transaction and commits it; cancels and rethrows on error. */
  run<T>(label: string, fn: (tx: Transaction) => T, options: TransactionOptions = {}): T {
    const tx = this.begin(label, options);
    let result: T;
    try {
      result = fn(tx);
    } catch (error) {
      if (tx.isOpen) this.cancel(tx);
      throw error;
    }
    this.commit(tx);
    return result;
  }

  undo(): boolean {
    if (!this.canUndo) return false;
    const entry = this.undoStack.pop()!;
    const inverse = invertOps(entry.ops);
    for (const op of inverse) this.store.applyOp(op);
    this.redoStack.push(entry);
    this.options.restoreMeta(entry.metaBefore);
    this.emit(buildChangeSet(inverse, 'undo', this.store));
    return true;
  }

  redo(): boolean {
    if (!this.canRedo) return false;
    const entry = this.redoStack.pop()!;
    for (const op of entry.ops) this.store.applyOp(op);
    this.undoStack.push(entry);
    this.options.restoreMeta(entry.metaAfter);
    this.emit(buildChangeSet(entry.ops, 'redo', this.store));
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private assertActive(tx: Transaction): void {
    if (!this.active || this.active.tx !== tx) throw new Error(`Transaction "${tx.label}" is not active`);
  }

  private emit(change: ChangeSet): void {
    for (const listener of this.listeners) listener(change);
  }
}
