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

import { useMemo, useState } from 'react';
import { documentColorProfile } from '@/core/color/color-profile';
import { assetTree, COMPONENT_DRAG_TYPE, componentLeafName, insertInstance, localComponents, type AssetFolder, type LocalComponent } from '@/editor/commands/insert-instance';
import { Icon } from '../../icons/Icon';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import styles from '../find/FindPanel.module.css';
import assetStyles from './AssetsPanel.module.css';

/** Indentation per folder level. */
const INDENT = 12;
/** Thumbnail size in the grid view, in CSS pixels. */
const THUMBNAIL_SIZE = 64;

/** Base64 of binary data, in chunks so large images don't overflow the argument list. */
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** A component's thumbnail, drawn by the rendering engine from its current state. */
function ComponentThumbnail({ component }: { component: LocalComponent }) {
  const editor = useEditor();
  const revision = useDocumentRevision();
  const ready = useEditorState((s) => s.textLayoutReady);
  const src = useMemo(() => {
    const bytes = ready ? editor.thumbnails?.thumbnail(editor.doc, editor.scene, component.pageId, component.id, THUMBNAIL_SIZE, window.devicePixelRatio || 1, documentColorProfile(editor.doc)) : null;
    return bytes ? `data:image/png;base64,${base64(bytes)}` : null;
    // The document changes in place, so its revision is what says the thumbnail must be drawn again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, component.pageId, component.id, revision, ready]);
  return src ? <img className={assetStyles.thumbnail} src={src} alt="" draggable={false} /> : <span className={assetStyles.thumbnail} />;
}

/**
 * Assets tab (⌥2): the main components in this file, searchable by name and description, listed in folders (their
 * page, the sections and frames they're in, and the parts of their names before a slash) or flat. Clicking one
 * inserts an instance next to its main component; dragging one onto the canvas inserts it where it is dropped.
 */
export function AssetsPanel() {
  const editor = useEditor();
  useDocumentRevision();
  const [query, setQuery] = useState('');
  const [subFolders, setSubFolders] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const needle = query.trim().toLowerCase();
  // Descriptions are searched too, so they can tag components with keywords.
  const components = localComponents(editor).filter((c) => needle === '' || c.name.toLowerCase().includes(needle) || (c.description?.toLowerCase().includes(needle) ?? false));

  const item = (component: LocalComponent, label: string, depth: number) => (
    <li key={component.id}>
      <button
        type="button"
        className={view === 'grid' ? assetStyles.tile : styles.result}
        style={view === 'grid' ? undefined : { paddingLeft: `calc(var(--space-3) + ${depth * INDENT}px)` }}
        draggable
        title="Click to insert, or drag onto the canvas"
        onClick={() => insertInstance(editor, component.id)}
        onDragStart={(e) => {
          e.dataTransfer.setData(COMPONENT_DRAG_TYPE, component.id);
          e.dataTransfer.effectAllowed = 'copy';
        }}
      >
        {view === 'grid' ? <ComponentThumbnail component={component} /> : <Icon name="component" size={16} />}
        <span className={view === 'grid' ? assetStyles.tileName : styles.name}>{label}</span>
      </button>
    </li>
  );
  // In the grid view, a folder's components sit in a grid of tiles.
  const items = (components: readonly LocalComponent[], label: (c: LocalComponent) => string, depth: number, key: string): React.ReactNode[] =>
    view === 'grid' && components.length > 0
      ? [
          <li key={`grid-${key}`}>
            <ul className={assetStyles.grid}>{components.map((component) => item(component, label(component), depth))}</ul>
          </li>,
        ]
      : components.map((component) => item(component, label(component), depth));

  const folderItems = (folder: AssetFolder, depth: number): React.ReactNode[] => [
    ...folder.folders.map((child) => (
      <li key={`folder-${depth}-${child.name}`}>
        <div className={assetStyles.folder} style={{ paddingLeft: `calc(var(--space-3) + ${depth * INDENT}px)` }}>
          {child.name}
        </div>
        <ul className={assetStyles.group} role="group" aria-label={child.name}>
          {folderItems(child, depth + 1)}
        </ul>
      </li>
    )),
    ...items(folder.components, (component) => componentLeafName(component.name), depth, `${depth}-${folder.name}`),
  ];

  return (
    <section className={styles.panel} aria-label="Assets">
      <header className={styles.header}>
        <Icon name="search" size={16} className={styles.searchIcon} />
        <input
          className={styles.input}
          type="search"
          aria-label="Search assets"
          placeholder="Search assets"
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </header>
      <div className={assetStyles.options}>
        <button type="button" className={styles.chip} aria-pressed={view === 'list'} onClick={() => setView('list')}>
          List
        </button>
        <button type="button" className={styles.chip} aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
          Grid
        </button>
        <button type="button" className={styles.chip} aria-pressed={subFolders} onClick={() => setSubFolders(!subFolders)}>
          Show sub-folders
        </button>
      </div>
      <p className={styles.count} role="status" aria-live="polite">
        {components.length === 0 ? (needle === '' ? 'No components in this file' : 'No matching components') : 'Local components'}
      </p>
      <ul className={styles.results} aria-label="Local components">
        {subFolders ? folderItems(assetTree(editor, components), 0) : items(components, (component) => component.name, 0, 'flat')}
      </ul>
    </section>
  );
}
