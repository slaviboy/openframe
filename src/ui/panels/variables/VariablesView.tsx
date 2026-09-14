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

import { Fragment, useEffect, useRef, useState } from 'react';
import type { Id } from '@/core/ids/ids';
import type { VariableCollectionNode, VariableNode } from '@/core/schema/document';
import { collectionVariables, isVariable, localCollections, variableLookup, VARIABLE_SCOPES } from '@/core/variables/document';
import { isAlias, wouldCreateAliasCycle, type VariableColor, type VariableType } from '@/core/variables/resolve';
import { styleFolder, styleLeafName } from '@/editor/commands/styles';
import {
  addMode,
  createCollection,
  createVariable,
  deleteCollection,
  deleteMode,
  deleteVariables,
  detachAlias,
  duplicateMode,
  duplicateVariables,
  exportCollectionMode,
  importMode,
  moveMode,
  renameCollection,
  renameMode,
  renameVariable,
  setDefaultMode,
  setVariableAlias,
  setVariableCodeSyntax,
  setVariableDescription,
  setVariableScopes,
  setVariableValue,
  type CodeSyntaxPlatform,
} from '@/editor/commands/variables';
import { useDocumentRevision, useEditor } from '../../hooks/useEditor';
import dialogStyles from '../../dialogs/Dialog.module.css';
import { IconButton } from '../../primitives/IconButton';
import { Menu, type MenuEntry } from '../../primitives/Menu';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import findStyles from '../find/FindPanel.module.css';
import { ColorControl } from '../inspector/ColorControl';
import { Dialog, NameDialog } from '../inspector/StylesPanel';
import css from './VariablesView.module.css';

const TYPES: readonly VariableType[] = ['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'];
const TYPE_LABELS: Readonly<Record<VariableType, string>> = { COLOR: 'Color', FLOAT: 'Number', STRING: 'String', BOOLEAN: 'Boolean' };
const TYPE_MARKS: Readonly<Record<VariableType, string>> = { COLOR: '◼', FLOAT: '#', STRING: 'T', BOOLEAN: '◐' };
const PLATFORMS: ReadonlyArray<readonly [CodeSyntaxPlatform, string]> = [
  ['WEB', 'Web'],
  ['ANDROID', 'Android'],
  ['iOS', 'iOS'],
];
const SCOPE_LABELS: Readonly<Record<string, string>> = {
  ALL_FILLS: 'All fills',
  FRAME_FILL: 'Frame fill',
  SHAPE_FILL: 'Shape fill',
  TEXT_FILL: 'Text fill',
  STROKE_COLOR: 'Stroke',
  EFFECT_COLOR: 'Effects',
  CORNER_RADIUS: 'Corner radius',
  WIDTH_HEIGHT: 'Width and height',
  GAP: 'Gap and padding',
  OPACITY: 'Layer opacity',
  STROKE_FLOAT: 'Stroke',
  EFFECT_FLOAT: 'Effects',
  FONT_WEIGHT: 'Font weight',
  FONT_SIZE: 'Font size',
  LINE_HEIGHT: 'Line height',
  LETTER_SPACING: 'Letter spacing',
  PARAGRAPH_SPACING: 'Paragraph spacing',
  PARAGRAPH_INDENT: 'Paragraph indent',
  TEXT_CONTENT: 'Text content',
  FONT_FAMILY: 'Font family',
  FONT_STYLE: 'Font weight or style',
};

type Prompt =
  | { readonly kind: 'renameCollection'; readonly collection: VariableCollectionNode }
  | { readonly kind: 'renameMode'; readonly collectionId: Id; readonly modeId: string; readonly name: string }
  | { readonly kind: 'renameVariable'; readonly variable: VariableNode }
  | { readonly kind: 'edit'; readonly variable: VariableNode }
  | { readonly kind: 'alias'; readonly variable: VariableNode; readonly modeId: string };

interface ContextMenu {
  readonly anchor: DOMRect;
  readonly label: string;
  readonly entries: MenuEntry[];
}

const noop = () => {};

/** Saves JSON as a file. */
function downloadJson(name: string, json: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A string value: edited in place, committed on Return or blur, reverted with Escape. */
function StringValue({ label, value, onCommit }: { label: string; value: string; onCommit: (value: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      className={css.text}
      aria-label={label}
      value={draft ?? value}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}

/** A variable's value in a mode: a value editor for its type, or the variable it aliases with Detach alias. */
function ValueCell({ variable, modeId, modeName, onAlias }: { variable: VariableNode; modeId: string; modeName: string; onAlias: () => void }) {
  const editor = useEditor();
  const value = variable.valuesByMode[modeId];
  const label = `${variable.name} ${modeName}`;
  if (isAlias(value)) {
    const target = editor.doc.get(value.id);
    return (
      <span className={css.alias}>
        <button type="button" className={css.aliasName} aria-label={`${label} alias`} title="Change the alias" onClick={onAlias}>
          {target?.name ?? 'Missing variable'}
        </button>
        <IconButton icon="detach" label={`Detach alias ${label}`} onClick={() => detachAlias(editor, variable.id, modeId)} />
      </span>
    );
  }
  switch (variable.resolvedType) {
    case 'COLOR': {
      const color = (typeof value === 'object' ? value : { r: 1, g: 1, b: 1, a: 1 }) as VariableColor;
      return (
        <ColorControl
          label={label}
          color={{ r: color.r, g: color.g, b: color.b, a: 1 }}
          opacity={color.a}
          onGestureStart={noop}
          onGestureEnd={noop}
          onColor={(next) => setVariableValue(editor, variable.id, modeId, { r: next.r, g: next.g, b: next.b, a: color.a })}
          onOpacity={(opacity) => setVariableValue(editor, variable.id, modeId, { ...color, a: opacity })}
        />
      );
    }
    case 'FLOAT':
      return <NumberField label="" ariaLabel={label} value={typeof value === 'number' ? value : undefined} onChange={(next) => setVariableValue(editor, variable.id, modeId, next)} />;
    case 'STRING':
      return <StringValue label={label} value={typeof value === 'string' ? value : ''} onCommit={(next) => setVariableValue(editor, variable.id, modeId, next)} />;
    case 'BOOLEAN':
      return (
        <label className={css.boolean}>
          <input type="checkbox" aria-label={label} checked={value === true} onChange={(e) => setVariableValue(editor, variable.id, modeId, e.target.checked)} />
          {value === true ? 'True' : 'False'}
        </label>
      );
  }
}

/** Create alias: the variables of the same type (in any collection) that the value can follow without a cycle. */
function AliasPicker({ variable, modeId, onClose }: { variable: VariableNode; modeId: string; onClose: () => void }) {
  const editor = useEditor();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const lookup = variableLookup(editor.doc);
  const candidates = localCollections(editor.doc).flatMap((collection) =>
    collectionVariables(editor.doc, collection.id)
      .filter((v) => v.resolvedType === variable.resolvedType && !wouldCreateAliasCycle(lookup, variable.id, v.id) && v.name.toLowerCase().includes(needle))
      .map((v) => ({ variable: v, collection })),
  );
  return (
    <Dialog
      title="Create alias"
      onClose={onClose}
      footer={
        <button type="button" className={dialogStyles.secondary} onClick={onClose}>
          Close
        </button>
      }
    >
      <input className={dialogStyles.input} type="search" aria-label="Search variables to alias" placeholder="Search variables" value={query} autoFocus onChange={(e) => setQuery(e.target.value)} />
      {candidates.length === 0 ? (
        <p>No variables of this type to alias.</p>
      ) : (
        <ul className={findStyles.results} aria-label="Variables to alias">
          {candidates.map(({ variable: candidate, collection }) => (
            <li key={candidate.id}>
              <button
                type="button"
                className={findStyles.result}
                title={candidate.description}
                onClick={() => {
                  setVariableAlias(editor, variable.id, modeId, candidate.id);
                  onClose();
                }}
              >
                {candidate.name}
                <span className={css.muted}>{collection.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

/** Edit variable: name, description, scopes (not for booleans) and code syntax. */
function EditVariableDialog({ variable, onClose }: { variable: VariableNode; onClose: () => void }) {
  const editor = useEditor();
  const [name, setName] = useState(variable.name);
  const [description, setDescription] = useState(variable.description ?? '');
  const scopeOptions = variable.resolvedType === 'BOOLEAN' ? [] : VARIABLE_SCOPES[variable.resolvedType];
  const [allScopes, setAllScopes] = useState(variable.scopes === undefined);
  const [scopes, setScopes] = useState<readonly string[]>(variable.scopes ?? scopeOptions);
  const [codeSyntax, setCodeSyntax] = useState<Record<CodeSyntaxPlatform, string>>({ WEB: variable.codeSyntax?.WEB ?? '', ANDROID: variable.codeSyntax?.ANDROID ?? '', iOS: variable.codeSyntax?.iOS ?? '' });
  const [error, setError] = useState('');
  const save = () => {
    if (name.trim() !== variable.name && !renameVariable(editor, variable.id, name)) {
      setError('Another variable in this collection has that name.');
      return;
    }
    setVariableDescription(editor, variable.id, description);
    if (scopeOptions.length > 0) setVariableScopes(editor, [variable.id], allScopes ? ['ALL_SCOPES'] : scopes);
    for (const [platform] of PLATFORMS) setVariableCodeSyntax(editor, variable.id, platform, codeSyntax[platform]);
    onClose();
  };
  return (
    <Dialog
      title="Edit variable"
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" className={dialogStyles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className={dialogStyles.primary} disabled={name.trim() === ''}>
            Save
          </button>
        </>
      }
    >
      <input className={dialogStyles.input} aria-label="Variable name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      {error && <p className={dialogStyles.error}>{error}</p>}
      <textarea className={dialogStyles.input} aria-label="Variable description" placeholder="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      {scopeOptions.length > 0 && (
        <fieldset className={css.fieldset}>
          <legend>Scope</legend>
          <label className={css.check}>
            <input type="checkbox" checked={allScopes} onChange={(e) => setAllScopes(e.target.checked)} />
            Show in all supported properties
          </label>
          {!allScopes &&
            scopeOptions.map((scope) => (
              <label key={scope} className={css.check}>
                <input type="checkbox" checked={scopes.includes(scope)} onChange={(e) => setScopes(e.target.checked ? [...scopes, scope] : scopes.filter((s) => s !== scope))} />
                {SCOPE_LABELS[scope] ?? scope}
              </label>
            ))}
        </fieldset>
      )}
      <fieldset className={css.fieldset}>
        <legend>Code syntax</legend>
        {PLATFORMS.map(([platform, label]) => (
          <label key={platform} className={css.syntax}>
            <span>{label}</span>
            <input className={dialogStyles.input} aria-label={`${label} code syntax`} value={codeSyntax[platform]} onChange={(e) => setCodeSyntax({ ...codeSyntax, [platform]: e.target.value })} />
          </label>
        ))}
      </fieldset>
    </Dialog>
  );
}

/**
 * The variables view (Variables tab of the navigation bar), over the canvas: the file's collections, and the selected
 * collection's variables in a table with a column per mode. Variables are searched by name, group or value and
 * filtered by type; names with slashes are grouped. Click, ⇧-click and ⌘-click select variables and ⇧Return
 * duplicates them; right-click a variable, a value, a mode or a collection for more actions.
 */
export function VariablesView({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  useDocumentRevision();
  const collections = localCollections(editor.doc);
  const [selectedCollection, setSelectedCollection] = useState<Id | null>(null);
  const collection = collections.find((c) => c.id === selectedCollection) ?? collections[0];
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<VariableType | 'ALL'>('ALL');
  const [selected, setSelected] = useState<readonly Id[]>([]);
  const [anchor, setAnchor] = useState<Id | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const [createMenu, setCreateMenu] = useState<DOMRect | null>(null);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [status, setStatus] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const importTarget = useRef<{ collectionId: Id; modeId?: string } | null>(null);

  // Escape closes the view even when focus has left it (keys inside the view are handled on the view itself).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || prompt || menu || createMenu) return;
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [prompt, menu, createMenu, onClose]);

  const needle = query.trim().toLowerCase();
  const matches = (variable: VariableNode) =>
    needle === '' ||
    variable.name.toLowerCase().includes(needle) ||
    Object.values(variable.valuesByMode).some((value) => (typeof value === 'string' ? value.toLowerCase().includes(needle) : typeof value === 'number' ? String(value).includes(needle) : false));
  const variables = collection ? collectionVariables(editor.doc, collection.id).filter((v) => (typeFilter === 'ALL' || v.resolvedType === typeFilter) && matches(v)) : [];
  const live = selected.filter((id) => variables.some((v) => v.id === id));

  const at = (e: React.MouseEvent) => new DOMRect(e.clientX, e.clientY, 0, 0);
  const pickImport = (collectionId: Id, modeId?: string) => {
    importTarget.current = modeId === undefined ? { collectionId } : { collectionId, modeId };
    fileInput.current?.click();
  };
  const importFiles = async (files: FileList | null) => {
    const target = importTarget.current;
    importTarget.current = null;
    if (!files || !target) return;
    for (const file of Array.from(files)) {
      try {
        const json = JSON.parse(await file.text()) as unknown;
        const name = file.name.replace(/(\.tokens)?\.json$/i, '');
        const result = importMode(editor, target.collectionId, json, target.modeId === undefined ? { name } : { modeId: target.modeId });
        setStatus(result ? `Imported ${file.name}: ${result.created} created, ${result.updated} updated` : `Couldn't import ${file.name}`);
      } catch {
        setStatus(`${file.name} isn't a valid JSON file`);
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  };
  const exportModeFile = (c: VariableCollectionNode, modeId: string, modeName: string) => {
    const json = exportCollectionMode(editor, c.id, modeId);
    if (json) downloadJson(`${c.name}.${modeName}.tokens.json`, json);
  };
  const select = (e: React.MouseEvent, variable: VariableNode) => {
    if (e.metaKey || e.ctrlKey) {
      setSelected(live.includes(variable.id) ? live.filter((id) => id !== variable.id) : [...live, variable.id]);
    } else if (e.shiftKey && anchor !== null && variables.some((v) => v.id === anchor)) {
      const [from, to] = [variables.findIndex((v) => v.id === anchor), variables.findIndex((v) => v.id === variable.id)].sort((a, b) => a - b);
      setSelected(variables.slice(from, to! + 1).map((v) => v.id));
      return;
    } else {
      setSelected([variable.id]);
    }
    setAnchor(variable.id);
  };

  return (
    <section
      className={css.view}
      aria-label="Variables"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape' && !prompt && !menu && !createMenu) {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <header className={css.header}>
        <h2 className={css.title}>Variables</h2>
        <IconButton icon="close" label="Close variables" onClick={onClose} />
      </header>
      <div className={css.body}>
        <nav className={css.sidebar} aria-label="Collections">
          <div className={css.sidebarHeader}>
            <span>Collections</span>
            <IconButton icon="plus" label="Create collection" onClick={() => setSelectedCollection(createCollection(editor))} />
          </div>
          <ul className={css.collections}>
            {collections.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={css.collection}
                  aria-pressed={c.id === collection?.id}
                  onClick={() => setSelectedCollection(c.id)}
                  onDoubleClick={() => setPrompt({ kind: 'renameCollection', collection: c })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenu({
                      anchor: at(e),
                      label: 'Collection actions',
                      entries: [
                        { kind: 'item', id: 'rename', label: 'Rename collection', onSelect: () => setPrompt({ kind: 'renameCollection', collection: c }) },
                        { kind: 'item', id: 'import', label: 'Import modes', onSelect: () => pickImport(c.id) },
                        { kind: 'item', id: 'export', label: 'Export modes', onSelect: () => c.modes.forEach((mode) => exportModeFile(c, mode.modeId, mode.name)) },
                        { kind: 'separator', id: 'collection-separator' },
                        { kind: 'item', id: 'delete', label: 'Delete collection', onSelect: () => deleteCollection(editor, c.id) },
                      ],
                    });
                  }}
                >
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className={css.main}>
          {!collection ? (
            <div className={css.empty}>
              <p>No variable collections yet.</p>
              <button type="button" className={dialogStyles.primary} onClick={() => setSelectedCollection(createCollection(editor))}>
                Create collection
              </button>
            </div>
          ) : (
            <>
              <div className={css.toolbar}>
                <input className={css.search} type="search" aria-label="Search variables" placeholder="Search variables" value={query} spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
                <select className={primitives.select} aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as VariableType | 'ALL')}>
                  <option value="ALL">All types</option>
                  {TYPES.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
                <button type="button" className={dialogStyles.primary} aria-haspopup="menu" onClick={(e) => setCreateMenu(e.currentTarget.getBoundingClientRect())}>
                  Create variable
                </button>
              </div>
              <div className={css.tableWrap}>
                <table
                  className={css.table}
                  aria-label={`${collection.name} variables`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.shiftKey && live.length > 0) {
                      e.preventDefault();
                      setSelected(duplicateVariables(editor, live));
                    }
                  }}
                >
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      {collection.modes.map((mode, index) => (
                        <th key={mode.modeId} scope="col">
                          <button
                            type="button"
                            className={css.modeHeader}
                            title={index === 0 ? 'Default mode' : undefined}
                            onDoubleClick={() => setPrompt({ kind: 'renameMode', collectionId: collection.id, modeId: mode.modeId, name: mode.name })}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              const last = collection.modes.length - 1;
                              setMenu({
                                anchor: at(e),
                                label: 'Mode actions',
                                entries: [
                                  { kind: 'item', id: 'rename', label: 'Rename mode', onSelect: () => setPrompt({ kind: 'renameMode', collectionId: collection.id, modeId: mode.modeId, name: mode.name }) },
                                  { kind: 'item', id: 'duplicate', label: 'Duplicate mode', onSelect: () => duplicateMode(editor, collection.id, mode.modeId) },
                                  { kind: 'item', id: 'default', label: 'Set as default', disabled: index === 0, onSelect: () => setDefaultMode(editor, collection.id, mode.modeId) },
                                  { kind: 'item', id: 'left', label: 'Move column left', disabled: index === 0, onSelect: () => moveMode(editor, collection.id, mode.modeId, index - 1) },
                                  { kind: 'item', id: 'right', label: 'Move column right', disabled: index === last, onSelect: () => moveMode(editor, collection.id, mode.modeId, index + 1) },
                                  { kind: 'separator', id: 'file-separator' },
                                  { kind: 'item', id: 'import', label: 'Import mode', onSelect: () => pickImport(collection.id, mode.modeId) },
                                  { kind: 'item', id: 'export', label: 'Export mode', onSelect: () => exportModeFile(collection, mode.modeId, mode.name) },
                                  { kind: 'separator', id: 'delete-separator' },
                                  { kind: 'item', id: 'delete', label: 'Delete mode', disabled: last === 0, onSelect: () => deleteMode(editor, collection.id, mode.modeId) },
                                ],
                              });
                            }}
                          >
                            {mode.name}
                          </button>
                        </th>
                      ))}
                      <th scope="col" className={css.addMode}>
                        <IconButton icon="plus" label="New variable mode" onClick={() => addMode(editor, collection.id)} />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {variables.length === 0 && (
                      <tr>
                        <td colSpan={collection.modes.length + 2} className={css.none}>
                          {needle !== '' || typeFilter !== 'ALL' ? 'No matching variables' : 'No variables in this collection'}
                        </td>
                      </tr>
                    )}
                    {variables.map((variable, i) => {
                      const group = styleFolder(variable.name);
                      const showGroup = group !== '' && group !== styleFolder(variables[i - 1]?.name ?? '');
                      const ids = live.includes(variable.id) ? live : [variable.id];
                      return (
                        <Fragment key={variable.id}>
                          {showGroup && (
                            <tr className={css.group}>
                              <th scope="rowgroup" colSpan={collection.modes.length + 2}>
                                {group.replaceAll('/', ' / ')}
                              </th>
                            </tr>
                          )}
                          <tr data-selected={live.includes(variable.id) || undefined}>
                            <th scope="row">
                              <button
                                type="button"
                                className={css.name}
                                title={variable.description}
                                style={{ paddingInlineStart: `${group === '' ? 4 : 16}px` }}
                                onClick={(e) => select(e, variable)}
                                onDoubleClick={() => setPrompt({ kind: 'renameVariable', variable })}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  if (!live.includes(variable.id)) setSelected([variable.id]);
                                  setMenu({
                                    anchor: at(e),
                                    label: 'Variable actions',
                                    entries: [
                                      { kind: 'item', id: 'edit', label: 'Edit variable', disabled: ids.length !== 1, onSelect: () => setPrompt({ kind: 'edit', variable }) },
                                      { kind: 'item', id: 'duplicate', label: ids.length === 1 ? 'Duplicate variable' : 'Duplicate variables', shortcut: '⇧↩', onSelect: () => setSelected(duplicateVariables(editor, ids)) },
                                      { kind: 'separator', id: 'variable-separator' },
                                      { kind: 'item', id: 'delete', label: ids.length === 1 ? 'Delete variable' : 'Delete variables', onSelect: () => deleteVariables(editor, ids) },
                                    ],
                                  });
                                }}
                              >
                                <span className={css.type} aria-label={TYPE_LABELS[variable.resolvedType]}>
                                  {TYPE_MARKS[variable.resolvedType]}
                                </span>
                                {styleLeafName(variable.name)}
                              </button>
                            </th>
                            {collection.modes.map((mode) => (
                              <td
                                key={mode.modeId}
                                onContextMenu={(e) => {
                                  e.preventDefault();
                                  setMenu({
                                    anchor: at(e),
                                    label: 'Value actions',
                                    entries: [
                                      { kind: 'item', id: 'alias', label: 'Create alias', onSelect: () => setPrompt({ kind: 'alias', variable, modeId: mode.modeId }) },
                                      { kind: 'item', id: 'detach', label: 'Detach alias', disabled: !isAlias(variable.valuesByMode[mode.modeId]), onSelect: () => detachAlias(editor, variable.id, mode.modeId) },
                                    ],
                                  });
                                }}
                              >
                                <ValueCell variable={variable} modeId={mode.modeId} modeName={mode.name} onAlias={() => setPrompt({ kind: 'alias', variable, modeId: mode.modeId })} />
                              </td>
                            ))}
                            <td />
                          </tr>
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className={css.status} role="status" aria-live="polite">
            {status}
          </p>
        </div>
      </div>
      <input ref={fileInput} type="file" accept=".json,application/json" multiple hidden onChange={(e) => void importFiles(e.currentTarget.files)} />
      {createMenu && collection && (
        <Menu
          label="Variable type"
          entries={TYPES.map((type) => ({
            kind: 'item',
            id: type,
            label: TYPE_LABELS[type],
            onSelect: () => {
              const id = createVariable(editor, collection.id, type);
              if (id) setSelected([id]);
            },
          }))}
          anchor={createMenu}
          placement="bottom-start"
          onClose={() => setCreateMenu(null)}
        />
      )}
      {menu && <Menu label={menu.label} entries={menu.entries} anchor={menu.anchor} placement="bottom-start" onClose={() => setMenu(null)} />}
      {prompt?.kind === 'renameCollection' && (
        <NameDialog title="Rename collection" label="Collection name" initial={prompt.collection.name} submitLabel="Rename" onSubmit={(name) => renameCollection(editor, prompt.collection.id, name)} onClose={() => setPrompt(null)} />
      )}
      {prompt?.kind === 'renameMode' && (
        <NameDialog title="Rename mode" label="Mode name" initial={prompt.name} submitLabel="Rename" onSubmit={(name) => renameMode(editor, prompt.collectionId, prompt.modeId, name)} onClose={() => setPrompt(null)} />
      )}
      {prompt?.kind === 'renameVariable' && (
        <NameDialog
          title="Rename variable"
          label="Variable name"
          initial={prompt.variable.name}
          submitLabel="Rename"
          onSubmit={(name) => {
            if (!renameVariable(editor, prompt.variable.id, name) && name.trim() !== prompt.variable.name) setStatus('Another variable in this collection has that name.');
          }}
          onClose={() => setPrompt(null)}
        />
      )}
      {prompt?.kind === 'edit' && isVariable(editor.doc.get(prompt.variable.id)) && <EditVariableDialog variable={editor.doc.get(prompt.variable.id) as VariableNode} onClose={() => setPrompt(null)} />}
      {prompt?.kind === 'alias' && <AliasPicker variable={prompt.variable} modeId={prompt.modeId} onClose={() => setPrompt(null)} />}
    </section>
  );
}
