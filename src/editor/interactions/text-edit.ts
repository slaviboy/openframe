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

import type { Id } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import { hitTestDeepest, selectionTarget } from '@/core/scene/hit-test';
import type { TextNode } from '@/core/schema/document';
import {
  caret,
  clampSelection,
  deleteBackward,
  deleteForward,
  isCollapsed,
  moveHorizontal,
  moveTo,
  paragraphRangeAt,
  replaceSelection,
  selectionEnd,
  selectionStart,
  wordRangeAt,
  type TextEdit,
  type TextSelection,
} from '@/core/text/text-editing';
import type { Editor } from '../editor';
import type { ToolId } from '../stores/editor-store';
import type { CursorKind, PointerInfo, Tool } from '../tools/types';

/** An editing session of one text layer. */
interface Session {
  readonly nodeId: Id;
  /** History merge key: the whole session, including creating the layer, is one undo step. */
  readonly key: string;
  /** The layer was created for this session (removed without a trace if left empty). */
  readonly created: boolean;
  /** Text states before each edit, for undo and redo while editing. */
  readonly undo: TextEdit[];
  readonly redo: TextEdit[];
  /** The x position kept while moving the caret up and down through lines. */
  goalX: number | null;
}

const sessions = new WeakMap<Editor, Session>();
let lastKey = 0;
const UNDO_LIMIT = 500;

/** A new history merge key for a text editing session. */
export const newTextEditKey = (): string => `text-edit:${++lastKey}`;

const textNode = (editor: Editor, id: Id): TextNode | null => {
  const node = editor.doc.get(id);
  return node?.type === 'TEXT' ? node : null;
};

/** The layer being edited and its (clamped) text selection, or null when not editing. */
export function textEditTarget(editor: Editor): { node: TextNode; selection: TextSelection } | null {
  const ref = editor.state.getSnapshot().textEdit;
  const node = ref && textNode(editor, ref.nodeId);
  return node ? { node, selection: clampSelection(node.characters, ref) } : null;
}

function active(editor: Editor): { session: Session; node: TextNode; selection: TextSelection } | null {
  const session = sessions.get(editor);
  const target = textEditTarget(editor);
  return session && target && target.node.id === session.nodeId ? { session, ...target } : null;
}

/**
 * Starts editing a text layer (Return, double-click, or a new layer from the Text tool). The layer
 * becomes the only selection; the text selection defaults to all of the text.
 */
export function beginTextEdit(editor: Editor, id: Id, options: { created?: boolean; key?: string; selection?: TextSelection } = {}): boolean {
  const node = textNode(editor, id);
  if (!node || node.locked || editor.history.inTransaction) return false;
  endTextEdit(editor);
  editor.state.select([id]);
  sessions.set(editor, { nodeId: id, key: options.key ?? newTextEditKey(), created: options.created ?? false, undo: [], redo: [], goalX: null });
  const selection = clampSelection(node.characters, options.selection ?? { anchor: 0, focus: node.characters.length });
  editor.state.setTextEdit({ nodeId: id, ...selection });
  editor.requestRender();
  return true;
}

/** Starts editing with the caret at a world point (double-click, or clicking another text layer while editing). */
export function beginTextEditAt(editor: Editor, id: Id, world: Vec2): boolean {
  const node = textNode(editor, id);
  if (!node) return false;
  editor.scene.ensure(editor.pageId);
  const local = editor.scene.toLocal(id, world);
  const offset = local && editor.textLayout ? editor.textLayout.offsetAt(node, local) : node.characters.length;
  return beginTextEdit(editor, id, { selection: caret(offset) });
}

/** Stops editing, keeping the layer selected. An empty layer is removed. */
export function endTextEdit(editor: Editor): boolean {
  const session = sessions.get(editor);
  const editing = editor.state.getSnapshot().textEdit !== null;
  if (!session && !editing) return false;
  sessions.delete(editor);
  if (editing) editor.state.setTextEdit(null);
  if (session) finish(editor, session);
  editor.requestRender();
  return true;
}

function finish(editor: Editor, session: Session): void {
  const node = textNode(editor, session.nodeId);
  if (!node || node.characters !== '' || editor.history.inTransaction) return;
  // A new layer left empty disappears without an undo step; an existing one is deleted.
  if (session.created && editor.history.revert(session.key)) return;
  editor.history.run('Delete empty text', (tx) => tx.delete(node.id));
  editor.state.select(editor.selection.filter((id) => editor.doc.has(id)));
}

/**
 * Ends the session when editing stops through a state change (selecting something else, switching
 * pages, entering crop mode), so empty layers are still cleaned up. Returns an unsubscribe function.
 */
export function watchTextEdit(editor: Editor): () => void {
  return editor.state.subscribe(() => {
    const session = sessions.get(editor);
    const ref = editor.state.getSnapshot().textEdit;
    if (session && ref?.nodeId !== session.nodeId) {
      sessions.delete(editor);
      finish(editor, session);
    }
  });
}

function apply(editor: Editor, session: Session, node: TextNode, selection: TextSelection, edit: TextEdit, record = true): void {
  if (edit.text !== node.characters) {
    if (editor.history.inTransaction) return;
    if (record) {
      session.undo.push({ text: node.characters, selection });
      if (session.undo.length > UNDO_LIMIT) session.undo.shift();
      session.redo.length = 0;
    }
    editor.history.run('Edit text', (tx) => tx.set(node.id, 'characters', edit.text), { mergeKey: session.key });
  }
  session.goalX = null;
  editor.state.setTextEdit({ nodeId: node.id, ...clampSelection(edit.text, edit.selection) });
  editor.requestRender();
}

/** Types or pastes text over the selection (line breaks normalized to \n). */
export function insertText(editor: Editor, text: string): void {
  const a = active(editor);
  if (a) apply(editor, a.session, a.node, a.selection, replaceSelection(a.node.characters, a.selection, text.replace(/\r\n?/g, '\n')));
}

/** Backspace / Delete, by grapheme, word (⌥) or to the paragraph edge (⌘). */
export function deleteText(editor: Editor, direction: 'backward' | 'forward', unit: 'grapheme' | 'word' | 'paragraph' = 'grapheme'): void {
  const a = active(editor);
  if (!a) return;
  const edit = direction === 'backward' ? deleteBackward(a.node.characters, a.selection, unit) : deleteForward(a.node.characters, a.selection, unit);
  apply(editor, a.session, a.node, a.selection, edit);
}

export type CaretMove = 'left' | 'right' | 'up' | 'down' | 'lineStart' | 'lineEnd' | 'textStart' | 'textEnd';

/** Moves the caret (Shift extends the selection; ⌥ moves by word horizontally). */
export function moveTextCaret(editor: Editor, move: CaretMove, options: { extend: boolean; word: boolean }): void {
  const a = active(editor);
  if (!a) return;
  const { session, node, selection } = a;
  const text = node.characters;
  const layout = editor.textLayout;
  let next: TextSelection;
  let goalX: number | null = null;
  switch (move) {
    case 'left':
    case 'right':
      next = moveHorizontal(text, selection, move === 'left' ? -1 : 1, options);
      break;
    case 'up':
    case 'down': {
      if (!layout) return;
      const from = options.extend || isCollapsed(selection) ? selection.focus : move === 'up' ? selectionStart(selection) : selectionEnd(selection);
      goalX = session.goalX ?? layout.caretAt(node, from).x;
      next = moveTo(selection, layout.offsetOnAdjacentLine(node, from, move === 'up' ? -1 : 1, goalX), options.extend);
      break;
    }
    case 'lineStart':
    case 'lineEnd': {
      if (!layout) return;
      const [start, end] = layout.lineRange(node, selection.focus);
      next = moveTo(selection, move === 'lineStart' ? start : end, options.extend);
      break;
    }
    case 'textStart':
      next = moveTo(selection, 0, options.extend);
      break;
    case 'textEnd':
      next = moveTo(selection, text.length, options.extend);
      break;
  }
  session.goalX = goalX;
  editor.state.setTextEdit({ nodeId: node.id, ...next });
  editor.requestRender();
}

/** Sets the text selection of the layer being edited. */
export function setTextSelection(editor: Editor, selection: TextSelection): void {
  const a = active(editor);
  if (!a) return;
  a.session.goalX = null;
  editor.state.setTextEdit({ nodeId: a.node.id, ...clampSelection(a.node.characters, selection) });
  editor.requestRender();
}

export function selectAllText(editor: Editor): void {
  const a = active(editor);
  if (a) setTextSelection(editor, { anchor: 0, focus: a.node.characters.length });
}

/** The selected text, for copy and cut. */
export function selectedText(editor: Editor): string {
  const target = textEditTarget(editor);
  return target ? target.node.characters.slice(selectionStart(target.selection), selectionEnd(target.selection)) : '';
}

/** Undo while editing: steps back through this session's edits. */
export function undoTextEdit(editor: Editor): boolean {
  const a = active(editor);
  const previous = a?.session.undo.pop();
  if (!a || !previous) return false;
  a.session.redo.push({ text: a.node.characters, selection: a.selection });
  apply(editor, a.session, a.node, a.selection, previous, false);
  return true;
}

export function redoTextEdit(editor: Editor): boolean {
  const a = active(editor);
  const next = a?.session.redo.pop();
  if (!a || !next) return false;
  a.session.undo.push({ text: a.node.characters, selection: a.selection });
  apply(editor, a.session, a.node, a.selection, next, false);
  return true;
}

/**
 * Pointer handling while editing text (routed by the ToolManager while `textEdit` is set): a click
 * places the caret, Shift-click extends, double-click selects a word and triple-click a paragraph,
 * dragging selects. Clicking another text layer edits it; clicking anything else ends editing and
 * selects what was clicked.
 */
export class TextEditController implements Tool {
  readonly id: ToolId = 'move';
  private drag: { readonly granularity: 'grapheme' | 'word' | 'paragraph'; readonly origin: TextSelection } | null = null;
  private hoverCursor: CursorKind = 'text';

  constructor(
    private readonly editor: Editor,
    private readonly tolerancePx: number,
  ) {}

  get active(): boolean {
    return this.drag !== null;
  }

  cursor(): CursorKind {
    return this.drag ? 'text' : this.hoverCursor;
  }

  private localIn(node: TextNode, p: PointerInfo): Vec2 | null {
    const { editor } = this;
    editor.scene.ensure(editor.pageId);
    const local = editor.scene.toLocal(node.id, p.world);
    const tolerance = this.tolerancePx / editor.state.viewport.zoom;
    const inside = local && local.x >= -tolerance && local.y >= -tolerance && local.x <= node.size.width + tolerance && local.y <= node.size.height + tolerance;
    return inside ? local : null;
  }

  pointerDown(p: PointerInfo): void {
    const { editor } = this;
    const target = textEditTarget(editor);
    if (p.button !== 0 || !target) return;
    const local = this.localIn(target.node, p);
    if (!local) {
      endTextEdit(editor);
      const hit = hitTestDeepest(editor.doc, editor.scene, editor.pageId, p.world, { tolerance: 0 });
      const id = hit ? selectionTarget(editor.doc, editor.pageId, hit, [], p.mod) : null;
      if (id && editor.doc.get(id)?.type === 'TEXT') beginTextEditAt(editor, id, p.world);
      else editor.state.select(id ? [id] : []);
      return;
    }
    const layout = editor.textLayout;
    if (!layout) return;
    const text = target.node.characters;
    const offset = layout.offsetAt(target.node, local);
    if (p.clickCount >= 2) {
      const granularity = p.clickCount === 2 ? 'word' : 'paragraph';
      const [start, end] = granularity === 'word' ? wordRangeAt(text, offset) : paragraphRangeAt(text, offset);
      const selection = { anchor: start, focus: end };
      this.drag = { granularity, origin: selection };
      setTextSelection(editor, selection);
      return;
    }
    const anchor = p.shift ? target.selection.anchor : offset;
    this.drag = { granularity: 'grapheme', origin: caret(anchor) };
    setTextSelection(editor, { anchor, focus: offset });
  }

  pointerMove(p: PointerInfo): void {
    const { editor } = this;
    const target = textEditTarget(editor);
    if (!target) return;
    if (!this.drag) {
      this.hoverCursor = this.localIn(target.node, p) ? 'text' : 'default';
      return;
    }
    const layout = editor.textLayout;
    const local = editor.scene.toLocal(target.node.id, p.world);
    if (!layout || !local) return;
    const text = target.node.characters;
    const offset = layout.offsetAt(target.node, local);
    const { origin, granularity } = this.drag;
    if (granularity === 'grapheme') {
      setTextSelection(editor, { anchor: origin.anchor, focus: offset });
      return;
    }
    const [start, end] = granularity === 'word' ? wordRangeAt(text, offset) : paragraphRangeAt(text, offset);
    const from = Math.min(selectionStart(origin), start);
    const to = Math.max(selectionEnd(origin), end);
    setTextSelection(editor, offset < selectionStart(origin) ? { anchor: to, focus: from } : { anchor: from, focus: to });
  }

  pointerUp(): void {
    this.drag = null;
  }

  /** Escape: ends editing (the layer stays selected). */
  cancel(): boolean {
    this.drag = null;
    return endTextEdit(this.editor);
  }
}
