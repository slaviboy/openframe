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

import { Fragment, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { DEFAULT_SHAPE_FILL, solid } from '@/core/document/factory';
import { isStyle, localStyles, STYLE_SLOTS, type StyleSlot, type StyleType } from '@/core/document/styles';
import { defaultEffect, EFFECT_TYPES } from '@/core/effects/effects';
import type { Id } from '@/core/ids/ids';
import { defaultLayoutGuide } from '@/core/layout/layout-guides';
import { isGradientPaint, type SceneNode, type StyleNode } from '@/core/schema/document';
import {
  applyStyle,
  createStyle,
  createStyleFromSelection,
  deleteStyles,
  detachStyle,
  duplicateStyles,
  moveStyles,
  moveStylesToFolder,
  renameStyle,
  renameStyleFolder,
  setStyleDescription,
  styleFolder,
  styleLeafName,
  stylesInFolder,
  ungroupStyleFolder,
} from '@/editor/commands/styles';
import { Icon } from '../../icons/Icon';
import { useDocumentRevision, useEditor } from '../../hooks/useEditor';
import { IconButton } from '../../primitives/IconButton';
import { Menu, type MenuEntry } from '../../primitives/Menu';
import dialogStyles from '../../dialogs/Dialog.module.css';
import findStyles from '../find/FindPanel.module.css';
import { gradientCss } from './gradient-css';
import css from './StylesPanel.module.css';

/** Style types in the order the Local styles section lists them. */
const STYLE_TYPES: readonly StyleType[] = ['TEXT', 'FILL', 'EFFECT', 'GRID'];

const TYPE_LABELS: Readonly<Record<StyleType, string>> = { TEXT: 'Text styles', FILL: 'Color styles', EFFECT: 'Effect styles', GRID: 'Layout guide styles' };
const NEW_STYLE_LABELS: Readonly<Record<StyleType, string>> = { TEXT: 'Text style', FILL: 'Color style', EFFECT: 'Effect style', GRID: 'Layout guide style' };
const SLOT_LABELS: Readonly<Record<StyleSlot, string>> = { fill: 'fill', stroke: 'stroke', text: 'text', effect: 'effect', grid: 'layout guide' };

/** The values a style created from Local styles starts with. */
function defaultStyleValues(type: StyleType): Record<string, unknown> {
  switch (type) {
    case 'FILL':
      return { paints: [solid(DEFAULT_SHAPE_FILL)] };
    case 'TEXT':
      return { fontName: { family: 'Inter', style: 'Regular' }, fontSize: 12, lineHeight: { unit: 'AUTO' }, letterSpacing: { unit: 'PERCENT', value: 0 } };
    case 'EFFECT':
      return { effects: [defaultEffect(EFFECT_TYPES[0]!)] };
    case 'GRID':
      return { layoutGuides: [defaultLayoutGuide()] };
  }
}

/** A small preview of a style: its top paint, "Ag" for text, and an icon for effects and layout guides. */
export function StyleSwatch({ style }: { style: StyleNode }) {
  if (style.styleType === 'TEXT') return <span className={css.swatch} aria-hidden="true">Ag</span>;
  if (style.styleType === 'EFFECT') return <span className={`${css.swatch} ${css.effect}`} aria-hidden="true" />;
  if (style.styleType === 'GRID') return <Icon name="layoutGrid" size={16} aria-hidden="true" />;
  const paint = [...(style.paints ?? [])].reverse().find((p) => p.visible);
  const background =
    paint === undefined ? 'transparent' : paint.type === 'SOLID' ? `rgb(${paint.color.r * 255} ${paint.color.g * 255} ${paint.color.b * 255} / ${paint.opacity})` : isGradientPaint(paint) ? gradientCss(paint) : undefined;
  return <span className={`${css.swatch} ${background === undefined ? css.image : ''}`} style={background === undefined ? undefined : { background }} aria-hidden="true" />;
}

export function Dialog({ title, onClose, children, footer, onSubmit }: { title: string; onClose: () => void; children: ReactNode; footer: ReactNode; onSubmit?: () => void }) {
  const titleId = `dialog-${title.toLowerCase().replaceAll(' ', '-')}`;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.();
  };
  return createPortal(
    <div
      className={dialogStyles.backdrop}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={dialogStyles.dialog}
        onSubmit={submit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      >
        <h2 id={titleId} className={dialogStyles.title}>
          {title}
        </h2>
        <div className={dialogStyles.body}>{children}</div>
        <footer className={dialogStyles.footer}>{footer}</footer>
      </form>
    </div>,
    document.body,
  );
}

/** A style's name and description: creates a style (from the selection's slot, or with default values) or edits one. */
function StyleDialog({ title, submitLabel, name: initialName = '', description: initialDescription = '', onSubmit, onClose }: {
  title: string;
  submitLabel: string;
  name?: string;
  description?: string;
  onSubmit: (name: string, description: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      onSubmit={() => {
        if (name.trim() === '') return;
        onSubmit(name, description);
        onClose();
      }}
      footer={
        <>
          <button type="button" className={dialogStyles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={dialogStyles.primary} disabled={name.trim() === ''}>
            {submitLabel}
          </button>
        </>
      }
    >
      <input className={dialogStyles.input} aria-label="Style name" placeholder="Name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <textarea className={dialogStyles.input} aria-label="Style description" placeholder="Description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
    </Dialog>
  );
}

/** Asks for a name, for a new folder or a renamed one. */
export function NameDialog({ title, label, initial = '', submitLabel, onSubmit, onClose }: { title: string; label: string; initial?: string; submitLabel: string; onSubmit: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(initial);
  return (
    <Dialog
      title={title}
      onClose={onClose}
      onSubmit={() => {
        if (name.trim() === '') return;
        onSubmit(name);
        onClose();
      }}
      footer={
        <>
          <button type="button" className={dialogStyles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={dialogStyles.primary} disabled={name.trim() === ''}>
            {submitLabel}
          </button>
        </>
      }
    >
      <input className={dialogStyles.input} aria-label={label} value={name} autoFocus onChange={(e) => setName(e.target.value)} />
    </Dialog>
  );
}

/** The style picker for a slot of the selected layers: searchable styles by folder (descriptions on hover), and Create style. */
function StylePicker({ slot, ids, onClose }: { slot: StyleSlot; ids: readonly Id[]; onClose: () => void }) {
  const editor = useEditor();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const type = STYLE_SLOTS[slot].styleType;
  const needle = query.trim().toLowerCase();
  const found = localStyles(editor.doc, type).filter((style) => style.name.toLowerCase().includes(needle));
  if (creating) {
    return (
      <StyleDialog
        title="Create style"
        submitLabel="Create style"
        onSubmit={(name, description) => {
          editor.state.select([...ids]);
          createStyleFromSelection(editor, slot, name, description);
        }}
        onClose={onClose}
      />
    );
  }
  return (
    <Dialog
      title={TYPE_LABELS[type]}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={dialogStyles.secondary} onClick={onClose}>
            Close
          </button>
          <button type="button" className={dialogStyles.primary} onClick={() => setCreating(true)}>
            Create style
          </button>
        </>
      }
    >
      <input className={dialogStyles.input} type="search" aria-label="Search styles" placeholder="Search styles" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
      {found.length === 0 ? (
        <p>{localStyles(editor.doc, type).length === 0 ? 'No styles in this file yet.' : 'No matching styles.'}</p>
      ) : (
        <ul className={findStyles.results} aria-label="Styles">
          {found.map((style, i) => {
            const folder = styleFolder(style.name);
            return (
              <Fragment key={style.id}>
                {folder !== '' && folder !== styleFolder(found[i - 1]?.name ?? '') && <li className={css.folderLabel}>{folder.replaceAll('/', ' / ')}</li>}
                <li>
                  <button
                    type="button"
                    className={`${findStyles.result} ${css.pickerRow}`}
                    title={style.description}
                    onClick={() => {
                      applyStyle(editor, ids, slot, style.id);
                      onClose();
                    }}
                  >
                    <StyleSwatch style={style} />
                    {styleLeafName(style.name)}
                  </button>
                </li>
              </Fragment>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
}

/** The Apply styles button of a sidebar section: opens the style picker for the selected layers. */
export function StyleButton({ slot, ids }: { slot: StyleSlot; ids: readonly Id[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="styles" label={`Apply ${SLOT_LABELS[slot]} style`} aria-haspopup="dialog" onClick={() => setOpen(true)} />
      {open && <StylePicker slot={slot} ids={ids} onClose={() => setOpen(false)} />}
    </>
  );
}

/** The style applied to every selected layer in a slot: its name (click to switch styles) and Detach style. */
export function AppliedStyle({ slot, nodes }: { slot: StyleSlot; nodes: readonly SceneNode[] }) {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const { reference } = STYLE_SLOTS[slot];
  const refs = new Set(nodes.map((n) => (n as unknown as Record<string, unknown>)[reference]));
  const [ref] = refs;
  const style = refs.size === 1 && typeof ref === 'string' ? editor.doc.get(ref) : undefined;
  if (!isStyle(style)) return null;
  const ids = nodes.map((n) => n.id);
  return (
    <div className={css.applied} aria-label={`Applied ${SLOT_LABELS[slot]} style`} role="group">
      <button type="button" className={css.appliedName} title={style.description} onClick={() => setOpen(true)}>
        <StyleSwatch style={style} />
        <span>{style.name.split('/').map((part) => part.trim()).join(' / ')}</span>
      </button>
      <IconButton icon="detach" label="Detach style" onClick={() => detachStyle(editor, ids, slot)} />
      {open && <StylePicker slot={slot} ids={ids} onClose={() => setOpen(false)} />}
    </div>
  );
}

type Prompt =
  | { readonly kind: 'create'; readonly type: StyleType }
  | { readonly kind: 'edit'; readonly style: StyleNode }
  | { readonly kind: 'folder'; readonly ids: readonly Id[] }
  | { readonly kind: 'renameFolder'; readonly type: StyleType; readonly folder: string };

interface ContextMenu {
  readonly anchor: DOMRect;
  readonly entries: MenuEntry[];
}

/**
 * Local styles, in the right sidebar when nothing is selected: the file's styles grouped by type and folder. Click, ⇧-click
 * and ⌘-click select styles; drag them to reorder or move them to another folder; double-click a style to edit its name
 * and description; right-click for Edit style, Duplicate, Add new folder and Delete, or a folder for Rename, Ungroup and Delete.
 */
export function LocalStylesSection() {
  const editor = useEditor();
  useDocumentRevision();
  const [selected, setSelected] = useState<readonly Id[]>([]);
  const [anchor, setAnchor] = useState<Id | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [createMenu, setCreateMenu] = useState<DOMRect | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [dragging, setDragging] = useState<readonly Id[]>([]);
  const all = localStyles(editor.doc);
  const live = selected.filter((id) => all.some((style) => style.id === id));

  const select = (e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }, style: StyleNode, list: readonly StyleNode[]) => {
    if (e.metaKey || e.ctrlKey) {
      setSelected(live.includes(style.id) ? live.filter((id) => id !== style.id) : [...live, style.id]);
    } else if (e.shiftKey && anchor !== null && list.some((s) => s.id === anchor)) {
      const [from, to] = [list.findIndex((s) => s.id === anchor), list.findIndex((s) => s.id === style.id)].sort((a, b) => a - b);
      setSelected(list.slice(from, to! + 1).map((s) => s.id));
      return;
    } else {
      setSelected([style.id]);
    }
    setAnchor(style.id);
  };
  const targets = (style: StyleNode) => (live.includes(style.id) ? live : [style.id]);

  return (
    <section className={css.section} aria-label="Local styles">
      <header className={css.header}>
        <h3 className={css.title}>Local styles</h3>
        <IconButton icon="plus" label="Create style" aria-haspopup="menu" onClick={(e) => setCreateMenu(e.currentTarget.getBoundingClientRect())} />
      </header>
      {all.length === 0 && <p className={css.empty}>No local styles yet.</p>}
      {STYLE_TYPES.map((type) => {
        const list = all.filter((style) => style.styleType === type);
        if (list.length === 0) return null;
        return (
          <div key={type} className={css.group}>
            <h4 className={css.groupTitle}>{TYPE_LABELS[type]}</h4>
            <ul className={css.list} aria-label={TYPE_LABELS[type]}>
              {list.map((style, i) => {
                const folder = styleFolder(style.name);
                const previous = styleFolder(list[i - 1]?.name ?? '');
                const parts = folder === '' ? [] : folder.split('/');
                const shared = previous === '' ? 0 : previous.split('/').findIndex((part, k) => part !== parts[k]);
                const common = shared === -1 ? Math.min(parts.length, previous.split('/').length) : shared;
                return (
                  <Fragment key={style.id}>
                    {parts.slice(common).map((part, k) => {
                      const path = parts.slice(0, common + k + 1).join('/');
                      return (
                        <li
                          key={`${style.id}-folder-${path}`}
                          className={css.folder}
                          style={{ paddingInlineStart: `${(common + k) * 12 + 4}px` }}
                          aria-label={`Folder ${path.replaceAll('/', ' / ')}`}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setMenu({
                              anchor: new DOMRect(e.clientX, e.clientY, 0, 0),
                              entries: [
                                { kind: 'item', id: 'rename-folder', label: 'Rename folder', onSelect: () => setPrompt({ kind: 'renameFolder', type, folder: path }) },
                                { kind: 'item', id: 'ungroup', label: 'Ungroup', onSelect: () => ungroupStyleFolder(editor, type, path) },
                                { kind: 'separator', id: 'folder-separator' },
                                { kind: 'item', id: 'delete-folder', label: 'Delete', onSelect: () => deleteStyles(editor, stylesInFolder(editor, type, path).map((s) => s.id)) },
                              ],
                            });
                          }}
                        >
                          <Icon name="caretDown" size={16} aria-hidden="true" />
                          {part}
                        </li>
                      );
                    })}
                    <li
                      className={css.row}
                      data-selected={live.includes(style.id) || undefined}
                      style={{ paddingInlineStart: `${parts.length * 12 + 4}px` }}
                      draggable
                      title={style.description}
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', style.name);
                        setDragging(targets(style));
                      }}
                      onDragOver={(e) => {
                        if (dragging.length > 0 && all.some((s) => dragging.includes(s.id) && s.styleType === type)) e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const box = e.currentTarget.getBoundingClientRect();
                        moveStyles(editor, dragging, style.id, e.clientY < box.top + box.height / 2 ? 'before' : 'after');
                        setDragging([]);
                      }}
                      onDragEnd={() => setDragging([])}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const ids = targets(style);
                        if (!live.includes(style.id)) setSelected([style.id]);
                        setMenu({
                          anchor: new DOMRect(e.clientX, e.clientY, 0, 0),
                          entries: [
                            { kind: 'item', id: 'edit', label: 'Edit style', disabled: ids.length !== 1, onSelect: () => setPrompt({ kind: 'edit', style }) },
                            { kind: 'item', id: 'duplicate', label: ids.length === 1 ? 'Duplicate style' : 'Duplicate styles', onSelect: () => setSelected(duplicateStyles(editor, ids)) },
                            { kind: 'item', id: 'folder', label: 'Add new folder', onSelect: () => setPrompt({ kind: 'folder', ids }) },
                            { kind: 'separator', id: 'style-separator' },
                            { kind: 'item', id: 'delete', label: ids.length === 1 ? 'Delete style' : 'Delete styles', onSelect: () => deleteStyles(editor, ids) },
                          ],
                        });
                      }}
                    >
                      <button type="button" className={css.name} onClick={(e) => select(e, style, list)} onDoubleClick={() => setPrompt({ kind: 'edit', style })}>
                        <StyleSwatch style={style} />
                        {styleLeafName(style.name)}
                      </button>
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          </div>
        );
      })}
      {createMenu && (
        <Menu
          label="Style type"
          entries={STYLE_TYPES.map((type) => ({ kind: 'item', id: type, label: NEW_STYLE_LABELS[type], onSelect: () => setPrompt({ kind: 'create', type }) }))}
          anchor={createMenu}
          placement="bottom-start"
          onClose={() => setCreateMenu(null)}
        />
      )}
      {menu && <Menu label="Style actions" entries={menu.entries} anchor={menu.anchor} placement="bottom-start" onClose={() => setMenu(null)} />}
      {prompt?.kind === 'create' && (
        <StyleDialog
          title={`Create ${NEW_STYLE_LABELS[prompt.type].toLowerCase()}`}
          submitLabel="Create style"
          onSubmit={(name, description) => {
            const id = createStyle(editor, prompt.type, name, defaultStyleValues(prompt.type), description);
            if (id) setSelected([id]);
          }}
          onClose={() => setPrompt(null)}
        />
      )}
      {prompt?.kind === 'edit' && (
        <StyleDialog
          title="Edit style"
          submitLabel="Save"
          name={prompt.style.name}
          description={prompt.style.description ?? ''}
          onSubmit={(name, description) => {
            renameStyle(editor, prompt.style.id, name);
            setStyleDescription(editor, prompt.style.id, description);
          }}
          onClose={() => setPrompt(null)}
        />
      )}
      {prompt?.kind === 'folder' && (
        <NameDialog
          title="Add new folder"
          label="Folder name"
          submitLabel="Create folder"
          onSubmit={(name) => {
            const [first] = prompt.ids.map((id) => editor.doc.get(id)).filter(isStyle);
            const parent = first ? styleFolder(first.name) : '';
            moveStylesToFolder(editor, prompt.ids, parent ? `${parent}/${name}` : name);
          }}
          onClose={() => setPrompt(null)}
        />
      )}
      {prompt?.kind === 'renameFolder' && (
        <NameDialog
          title="Rename folder"
          label="Folder name"
          initial={styleLeafName(prompt.folder)}
          submitLabel="Rename"
          onSubmit={(name) => renameStyleFolder(editor, prompt.type, prompt.folder, name)}
          onClose={() => setPrompt(null)}
        />
      )}
    </section>
  );
}
