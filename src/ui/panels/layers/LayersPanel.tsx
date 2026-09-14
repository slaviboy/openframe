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

import { thumbnailFrameId } from '@/core/document/file-thumbnail';
import { useCallback, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Id } from '@/core/ids/ids';
import { isSceneNode, type SceneNode } from '@/core/schema/document';
import { moveLayers, type DropPosition } from '@/editor/commands/layers';
import { Icon } from '../../icons/Icon';
import { layerIcon } from '../../icons/layer-icons';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { objectMenuEntries } from '../../menus/menu-model';
import { IconButton } from '../../primitives/IconButton';
import { Menu } from '../../primitives/Menu';
import { LAYER_INDENT, LAYER_ROW_HEIGHT } from '../../tokens';
import { flattenLayers, rowRange, type LayerRow } from './layer-rows';
import { renameLayer } from '@/core/text/text-resize';
import styles from './LayersPanel.module.css';

const OVERSCAN = 8;


interface DragState {
  ids: Id[];
  startY: number;
  active: boolean;
  target: { id: Id; position: DropPosition } | null;
}

export function LayersPanel() {
  const editor = useEditor();
  const revision = useDocumentRevision();
  const pageId = useEditorState((s) => s.activePageId);
  const expanded = useEditorState((s) => s.expanded);
  const selection = useEditorState((s) => s.selection);
  const renamingId = useEditorState((s) => s.renamingId);
  const hoverId = useEditorState((s) => s.hoverId);
  const suggested = useEditorState((s) => s.suggested);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 400 });
  const anchorRef = useRef<Id | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dropTarget, setDropTarget] = useState<DragState['target']>(null);
  const [rowMenu, setRowMenu] = useState<{ x: number; y: number } | null>(null);
  const closeRowMenu = useCallback(() => setRowMenu(null), []);

  const rows = useMemo(
    () => flattenLayers(editor.doc, pageId, expanded),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision invalidates the document-derived rows
    [editor, pageId, expanded, revision],
  );
  const selected = useMemo(() => new Set(selection), [selection]);

  const first = Math.max(0, Math.floor(scroll.top / LAYER_ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(rows.length, Math.ceil((scroll.top + scroll.height) / LAYER_ROW_HEIGHT) + OVERSCAN);

  const selectRow = (row: LayerRow, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) => {
    if (e.metaKey || e.ctrlKey) {
      editor.state.toggleSelection(row.id);
    } else if (e.shiftKey && anchorRef.current) {
      editor.state.select(rowRange(rows, anchorRef.current, row.id));
      return;
    } else {
      editor.state.select([row.id]);
    }
    anchorRef.current = row.id;
  };

  const toggleNode = (id: Id, field: 'visible' | 'locked') => {
    const node = editor.doc.get(id);
    if (!node || !isSceneNode(node)) return;
    editor.history.run(field === 'visible' ? 'Toggle visibility' : 'Toggle lock', (tx) => tx.set(id, field, !node[field]));
  };

  const setExpandedDeep = (id: Id, value: boolean) => {
    for (const d of editor.doc.descendants(id)) if (editor.doc.children(d).length) editor.state.setExpanded(d, value);
  };

  const rowFromClientY = (clientY: number): { row: LayerRow; offset: number } | null => {
    const el = scrollRef.current;
    if (!el) return null;
    const y = clientY - el.getBoundingClientRect().top + el.scrollTop;
    const index = Math.floor(y / LAYER_ROW_HEIGHT);
    const row = rows[Math.max(0, Math.min(rows.length - 1, index))];
    return row ? { row, offset: (y - index * LAYER_ROW_HEIGHT) / LAYER_ROW_HEIGHT } : null;
  };

  const onRowPointerDown = (row: LayerRow, e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,input')) return;
    if (!selected.has(row.id) || e.shiftKey || e.metaKey || e.ctrlKey) selectRow(row, e);
    dragRef.current = { ids: selected.has(row.id) && !e.shiftKey ? [...selection] : [row.id], startY: e.clientY, active: false, target: null };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onRowPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.active && Math.abs(e.clientY - drag.startY) < 4) return;
    drag.active = true;
    const hit = rowFromClientY(e.clientY);
    if (!hit) return;
    const node = editor.doc.get(hit.row.id);
    const container = node?.type === 'FRAME' || node?.type === 'GROUP' || node?.type === 'BOOLEAN_OPERATION' || node?.type === 'SECTION';
    const position: DropPosition = container
      ? hit.offset < 0.25
        ? 'above'
        : hit.offset > 0.75 && !hit.row.expanded
          ? 'below'
          : 'inside'
      : hit.offset < 0.5
        ? 'above'
        : 'below';
    const target = drag.ids.includes(hit.row.id) ? null : { id: hit.row.id, position };
    drag.target = target;
    setDropTarget(target);
  };

  const onRowPointerUp = (row: LayerRow, e: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDropTarget(null);
    if (!drag) return;
    if (!drag.active) {
      if (!e.shiftKey && !e.metaKey && !e.ctrlKey) {
        editor.state.select([row.id]);
        anchorRef.current = row.id;
      }
      return;
    }
    if (!drag.target) return;
    const { id, position } = drag.target;
    try {
      editor.history.run('Move layers', (tx) => {
        if (!moveLayers(tx, editor.scene, drag.ids, id, position)) return;
      });
      if (position === 'inside') editor.state.setExpanded(id, true);
    } catch (error) {
      // Invalid structural moves (e.g. emptying a group) are rolled back by the transaction.
      console.warn('Openframe: layer move rejected', error);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const current = selection.at(-1);
    const index = rows.findIndex((r) => r.id === current);
    const row = rows[index];
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const next = rows[index < 0 ? 0 : index + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) {
        editor.state.select(e.shiftKey && current ? [...selection, next.id] : [next.id]);
        anchorRef.current = next.id;
        scrollIntoView(rows.indexOf(next));
      }
      handled();
    } else if (e.key === 'ArrowRight' && row?.hasChildren) {
      editor.state.setExpanded(row.id, true);
      handled();
    } else if (e.key === 'ArrowLeft' && row) {
      if (row.expanded) editor.state.setExpanded(row.id, false);
      else {
        const parent = editor.doc.parentOf(row.id);
        if (parent && parent !== pageId) editor.state.select([parent]);
      }
      handled();
    } else if ((e.key === 'Enter' || e.key === 'F2') && selection.length === 1) {
      editor.state.setRenaming(selection[0]!);
      handled();
    }
  };

  const scrollIntoView = (index: number) => {
    const el = scrollRef.current;
    if (!el || index < 0) return;
    const top = index * LAYER_ROW_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + LAYER_ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = top + LAYER_ROW_HEIGHT - el.clientHeight;
  };

  return (
    <section className={styles.panel} aria-label="Layers">
      <header className={styles.header}>
        <h2 className={styles.title}>Layers</h2>
        <IconButton icon="search" label="Find" onClick={() => editor.state.setFindOpen(true)} />
        <IconButton icon="collapse" label="Collapse layers" onClick={() => editor.state.collapseAll()} />
      </header>
      <div
        ref={(el) => {
          scrollRef.current = el;
        }}
        className={styles.scroll}
        role="tree"
        aria-label="Layers"
        aria-multiselectable="true"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })}
        onPointerLeave={() => editor.state.setHover(null)}
      >
        {rows.length === 0 && <p className={styles.empty}>Layers you add to this page appear here.</p>}
        <div style={{ height: rows.length * LAYER_ROW_HEIGHT, position: 'relative' }}>
          {rows.slice(first, last).map((row, i) => {
            const node = editor.doc.get(row.id);
            if (!node || !isSceneNode(node)) return null;
            const isSelected = selected.has(row.id);
            const parentSelected = !isSelected && editor.doc.ancestors(row.id).some((a) => selected.has(a));
            const drop = dropTarget?.id === row.id ? dropTarget.position : undefined;
            return (
              <div
                key={row.id}
                role="treeitem"
                aria-level={row.depth + 1}
                aria-selected={isSelected}
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                data-testid={`layer-row-${row.id}`}
                className={styles.row}
                data-selected={isSelected || undefined}
                data-child-selected={parentSelected || undefined}
                data-hover={hoverId === row.id || undefined}
                data-hidden={!node.visible || undefined}
                data-suggested={suggested.has(row.id) || undefined}
                data-drop={drop}
                style={{ top: (first + i) * LAYER_ROW_HEIGHT, paddingLeft: 8 + row.depth * LAYER_INDENT }}
                onPointerEnter={() => editor.state.setHover(row.id)}
                onPointerDown={(e) => onRowPointerDown(row, e)}
                onPointerMove={onRowPointerMove}
                onPointerUp={(e) => onRowPointerUp(row, e)}
                onDoubleClick={(e) => {
                  if (!(e.target as HTMLElement).closest('button')) editor.state.setRenaming(row.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (!selected.has(row.id)) {
                    editor.state.select([row.id]);
                    anchorRef.current = row.id;
                  }
                  setRowMenu({ x: e.clientX, y: e.clientY });
                }}
              >
                <button
                  type="button"
                  className={styles.caret}
                  tabIndex={-1}
                  aria-label={row.expanded ? 'Collapse' : 'Expand'}
                  style={{ visibility: row.hasChildren ? 'visible' : 'hidden' }}
                  onClick={(e) => {
                    if (e.altKey) setExpandedDeep(row.id, !row.expanded);
                    else editor.state.setExpanded(row.id, !row.expanded);
                  }}
                >
                  <Icon name={row.expanded ? 'caretDown' : 'caretRight'} size={16} />
                </button>
                <Icon name={layerIcon(node)} size={16} className={styles.typeIcon} data-component={layerIcon(node) === 'component' || undefined} />
                {renamingId === row.id ? (
                  <RenameInput
                    initial={node.name}
                    onDone={(name) => {
                      editor.state.setRenaming(null);
                      const trimmed = name.trim();
                      if (trimmed && trimmed !== node.name) editor.history.run('Rename', (tx) => renameLayer(tx, row.id, trimmed));
                    }}
                  />
                ) : (
                  <span className={styles.name} data-strong={(node.type === 'FRAME' && row.depth === 0) || node.type === 'SECTION' || undefined}>
                    {node.name}
                  </span>
                )}
                <ModeTag node={node} />
                {node.id === thumbnailFrameId(editor.doc) && (
                  <span className={styles.thumbnailTag} title="File thumbnail" aria-hidden="true" data-testid="thumbnail-tag">
                    <Icon name="image" size={16} />
                  </span>
                )}
                {/* Kept out of the row's accessible name, which is the layer name. */}
                {suggested.has(row.id) && <span className={styles.suggested} aria-hidden="true" title="Suggested auto layout" />}
                <span className={styles.actions} data-persist={node.locked || !node.visible || undefined}>
                  <button
                    type="button"
                    className={styles.action}
                    data-on={node.locked || undefined}
                    aria-label={node.locked ? `Unlock ${node.name}` : `Lock ${node.name}`}
                    title={node.locked ? 'Unlock' : 'Lock'}
                    onClick={() => toggleNode(row.id, 'locked')}
                  >
                    <Icon name={node.locked ? 'lock' : 'unlock'} size={16} />
                  </button>
                  <button
                    type="button"
                    className={styles.action}
                    data-on={!node.visible || undefined}
                    aria-label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`}
                    title={node.visible ? 'Hide' : 'Show'}
                    onClick={() => toggleNode(row.id, 'visible')}
                  >
                    <Icon name={node.visible ? 'eye' : 'eyeOff'} size={16} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      </div>
      {rowMenu && (
        <Menu
          label="Layer actions"
          entries={objectMenuEntries(editor)}
          anchor={{ x: rowMenu.x, y: rowMenu.y, width: 0, height: 0 }}
          placement="point"
          onClose={closeRowMenu}
        />
      )}
    </section>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string) => void }) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (v: string) => {
    if (done.current) return;
    done.current = true;
    onDone(v);
  };
  return (
    <input
      className={styles.renameInput}
      aria-label="Layer name"
      value={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(value);
        if (e.key === 'Escape') finish(initial);
      }}
    />
  );
}

/** The variable modes set on a layer: the mode's name, or how many modes (listed on hover). Kept out of the row's accessible name. */
function ModeTag({ node }: { node: SceneNode }) {
  const editor = useEditor();
  const tags = Object.entries(node.explicitVariableModes ?? {}).flatMap(([collectionId, modeId]) => {
    const collection = editor.doc.get(collectionId);
    const mode = collection?.type === 'VARIABLE_COLLECTION' ? collection.modes.find((m) => m.modeId === modeId) : undefined;
    return collection && mode ? [{ collection: collection.name, mode: mode.name }] : [];
  });
  if (tags.length === 0) return null;
  return (
    <span className={styles.modeTag} title={tags.map((t) => `${t.collection}: ${t.mode}`).join('\n')} aria-hidden="true" data-testid="mode-tag">
      {tags.length === 1 ? tags[0]!.mode : `${tags.length} modes`}
    </span>
  );
}
