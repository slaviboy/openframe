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
import type { ListType, TextNode } from '@/core/schema/document';
import type { Transaction } from '@/core/history/history';
import { valuesEqual } from '@/core/ops/equality';
import { listTrigger } from '@/core/text/lists';
import { paragraphAt, paragraphRanges, paragraphStyleOffset } from '@/core/text/paragraphs';
import { changeIndentation, setListType, toggleListType } from '../commands/text';
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
import { runsAfterEdit, textChange, textStyleAt, type TextStyleRun } from '@/core/text/style-runs';
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
  /** Text states (with their style runs) before each edit, for undo and redo while editing. */
  readonly undo: Snapshot[];
  readonly redo: Snapshot[];
  /** The x position kept while moving the caret up and down through lines. */
  goalX: number | null;
}

interface Snapshot extends TextEdit {
  readonly runs: readonly TextStyleRun[] | undefined;
  readonly listType: ListType | undefined;
  readonly indentation: number | undefined;
}

const snapshotOf = (node: TextNode, selection: TextSelection): Snapshot => ({
  text: node.characters,
  selection,
  runs: node.styleRuns,
  listType: node.listType,
  indentation: node.indentation,
});

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

/**
 * Commits an edit. Style runs follow the change (typed text takes the style before the caret)
 * unless a snapshot restores them exactly.
 */
function apply(editor: Editor, session: Session, node: TextNode, selection: TextSelection, edit: TextEdit | Snapshot, record = true): void {
  const restoring = 'runs' in edit;
  const changed =
    edit.text !== node.characters || (restoring && (!valuesEqual(edit.runs, node.styleRuns) || edit.listType !== node.listType || edit.indentation !== node.indentation));
  if (changed) {
    if (editor.history.inTransaction) return;
    if (record) remember(session, node, selection);
    const change = textChange(node.characters, edit.text);
    const runs = restoring ? edit.runs : runsAfterEdit(node, change.start, change.end, change.insertedLength);
    editor.history.run(
      'Edit text',
      (tx) => {
        tx.set(node.id, 'characters', edit.text);
        tx.set(node.id, 'styleRuns', runs);
        if (restoring) {
          tx.set(node.id, 'listType', edit.listType);
          tx.set(node.id, 'indentation', edit.indentation);
        }
      },
      { mergeKey: session.key },
    );
  }
  session.goalX = null;
  editor.state.setTextEdit({ nodeId: node.id, ...clampSelection(edit.text, edit.selection) });
  editor.requestRender();
}

function remember(session: Session, node: TextNode, selection: TextSelection): void {
  session.undo.push(snapshotOf(node, selection));
  if (session.undo.length > UNDO_LIMIT) session.undo.shift();
  session.redo.length = 0;
}

type Active = { session: Session; node: TextNode; selection: TextSelection };

/** Commits a change of list properties (no text change) within the session's undo step. */
function changeList(editor: Editor, a: Active, change: (tx: Transaction) => void): void {
  if (editor.history.inTransaction) return;
  remember(a.session, a.node, a.selection);
  editor.history.run('Edit text', change, { mergeKey: a.session.key });
  a.session.goalX = null;
  editor.requestRender();
}

/** The list item holding an offset: its paragraph and indentation level, or null outside lists. */
function listItemAt(node: TextNode, offset: number): { start: number; end: number; level: number } | null {
  const range = paragraphAt(paragraphRanges(node.characters), offset);
  const style = textStyleAt(node, paragraphStyleOffset(range));
  return style.listType === 'NONE' ? null : { start: range.start, end: range.end, level: style.indentation };
}

/**
 * Types or pastes text over the selection (line breaks normalized to \n). In lists, Return on an
 * empty item moves it out a level (or ends the list at the first level), and "- ", "* ", "1. " or
 * "1) " typed at the start of a paragraph starts a list.
 */
export function insertText(editor: Editor, text: string): void {
  const a = active(editor);
  if (!a) return;
  const typed = text.replace(/\r\n?/g, '\n');
  if (typed === '\n' && isCollapsed(a.selection)) {
    const item = listItemAt(a.node, a.selection.focus);
    if (item && item.start === item.end) {
      const at = { start: a.selection.focus, end: a.selection.focus };
      changeList(editor, a, (tx) => {
        if (item.level > 1) changeIndentation(tx, a.node, -1, at);
        else setListType(tx, a.node, 'NONE', at);
      });
      return;
    }
  }
  apply(editor, a.session, a.node, a.selection, replaceSelection(a.node.characters, a.selection, typed));
  if (typed !== ' ') return;
  const after = active(editor);
  if (!after || !isCollapsed(after.selection)) return;
  const caretAt = after.selection.focus;
  const paragraph = paragraphAt(paragraphRanges(after.node.characters), caretAt);
  const trigger = listTrigger(after.node.characters.slice(paragraph.start, caretAt));
  if (!trigger || listItemAt(after.node, caretAt)) return;
  apply(editor, after.session, after.node, after.selection, replaceSelection(after.node.characters, { anchor: paragraph.start, focus: caretAt }, ''));
  const cleared = active(editor);
  if (cleared) changeList(editor, cleared, (tx) => setListType(tx, cleared.node, trigger.type, { start: paragraph.start, end: paragraph.start }));
}

/** Tab / ⇧Tab (⌘] / ⌘[) inside a list: changes the indentation of the selected items. Returns false outside lists. */
export function indentListItem(editor: Editor, delta: 1 | -1): boolean {
  const a = active(editor);
  if (!a || !listItemAt(a.node, selectionStart(a.selection))) return false;
  const range = { start: selectionStart(a.selection), end: selectionEnd(a.selection) };
  changeList(editor, a, (tx) => {
    changeIndentation(tx, a.node, delta, range);
  });
  return true;
}

/** ⌘⇧8 / ⌘⇧7 (⌥8 for bullets on macOS) while editing: toggles the list type of the selected paragraphs. */
export function toggleList(editor: Editor, type: 'UNORDERED' | 'ORDERED'): void {
  const a = active(editor);
  if (!a) return;
  const range = { start: selectionStart(a.selection), end: selectionEnd(a.selection) };
  changeList(editor, a, (tx) => toggleListType(tx, a.node, type, range));
}

/** The text selection of a layer being edited, including a collapsed caret, or null. */
export function textSelectionRange(editor: Editor, id: Id): { start: number; end: number } | null {
  const target = textEditTarget(editor);
  return target && target.node.id === id ? { start: selectionStart(target.selection), end: selectionEnd(target.selection) } : null;
}

/** Backspace / Delete, by grapheme, word (⌥) or to the paragraph edge (⌘). Backspace at the start of a list item removes its marker. */
export function deleteText(editor: Editor, direction: 'backward' | 'forward', unit: 'grapheme' | 'word' | 'paragraph' = 'grapheme'): void {
  const a = active(editor);
  if (!a) return;
  if (direction === 'backward' && isCollapsed(a.selection)) {
    const item = listItemAt(a.node, a.selection.focus);
    if (item && a.selection.focus === item.start) {
      const at = { start: item.start, end: item.start };
      changeList(editor, a, (tx) => setListType(tx, a.node, 'NONE', at));
      return;
    }
  }
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

/**
 * The characters that property changes apply to: the selected range while editing that layer with
 * a non-empty selection, otherwise null (the whole layer).
 */
export function textStyleRange(editor: Editor, id: Id): { start: number; end: number } | null {
  const target = textEditTarget(editor);
  if (!target || target.node.id !== id || isCollapsed(target.selection)) return null;
  return { start: selectionStart(target.selection), end: selectionEnd(target.selection) };
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
  a.session.redo.push(snapshotOf(a.node, a.selection));
  apply(editor, a.session, a.node, a.selection, previous, false);
  return true;
}

export function redoTextEdit(editor: Editor): boolean {
  const a = active(editor);
  const next = a?.session.redo.pop();
  if (!a || !next) return false;
  a.session.undo.push(snapshotOf(a.node, a.selection));
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
