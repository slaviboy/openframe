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

import { useState } from 'react';
import { assetTree, COMPONENT_DRAG_TYPE, componentLeafName, localComponents, type AssetFolder, type LocalComponent } from '@/editor/commands/insert-instance';
import { applyLibraryUpdates, importLibrary, importedLibraries, removeLibrary, swapLibrary } from '@/editor/commands/libraries';
import { readPackage } from '@/platform/package';
import { pickPackageFile } from '../../images/pick-package';
import { Icon } from '../../icons/Icon';
import { useDocumentRevision, useEditor } from '../../hooks/useEditor';
import styles from '../find/FindPanel.module.css';
import assetStyles from './AssetsPanel.module.css';
import { ComponentDetailsDialog } from './ComponentDetailsDialog';
import { IconPicker } from './IconPicker';
import { ComponentThumbnail } from './ComponentThumbnail';

/** Indentation per folder level. */
const INDENT = 12;
/**
 * Assets tab (⌥2): the main components in this file, searchable by name and description, listed in folders (their
 * page, the sections and frames they're in, and the parts of their names before a slash) or flat. Clicking one
 * opens its details, with Insert instance; dragging one onto the canvas inserts it where it is dropped.
 */
export function AssetsPanel() {
  const editor = useEditor();
  useDocumentRevision();
  const [query, setQuery] = useState('');
  const [subFolders, setSubFolders] = useState(true);
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [details, setDetails] = useState<LocalComponent | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const libraries = importedLibraries(editor);
  const needle = query.trim().toLowerCase();

  /** Reads a newer copy of a library and says what it would change, then takes it. */
  const review = async (pageId: string, name: string) => {
    setMessage(null);
    const file = await pickPackageFile();
    if (!file) return;
    try {
      const { store, images } = await readPackage(new Uint8Array(await file.arrayBuffer()));
      for (const image of images) await editor.images.add(image);
      const updates = applyLibraryUpdates(editor, pageId, store);
      if (updates === null) {
        setMessage('That is not a library page.');
        return;
      }
      const parts = [
        updates.changed.length > 0 ? `${updates.changed.length} redrawn` : '',
        updates.added.length > 0 ? `${updates.added.length} added` : '',
        updates.removed.length > 0 ? `${updates.removed.length} no longer in the file` : '',
      ].filter((part) => part !== '');
      setMessage(parts.length === 0 ? `${name} is already up to date.` : `${name}: ${parts.join(', ')}.`);
    } catch {
      setMessage('That file could not be read as an Openframe file.');
    }
  };

  /** Picks another Openframe file and brings its components in as a library. */
  const bringIn = async () => {
    setMessage(null);
    const file = await pickPackageFile();
    if (!file) return;
    try {
      const { store, images } = await readPackage(new Uint8Array(await file.arrayBuffer()));
      for (const image of images) await editor.images.add(image);
      const name = file.name.replace(/\.openframe$/i, '') || 'Library';
      const result = importLibrary(editor, store, name);
      setMessage(result === null ? `${name} has no components to lend.` : `Brought in ${result.components === 1 ? '1 component' : `${result.components} components`} from ${name}.`);
    } catch {
      setMessage('That file could not be read as an Openframe file.');
    }
  };
  // Descriptions are searched too, so they can tag components with keywords.
  const components = localComponents(editor).filter((c) => needle === '' || c.name.toLowerCase().includes(needle) || (c.description?.toLowerCase().includes(needle) ?? false));

  const item = (component: LocalComponent, label: string, depth: number) => (
    <li key={component.id}>
      <button
        type="button"
        className={view === 'grid' ? assetStyles.tile : styles.result}
        style={view === 'grid' ? undefined : { paddingLeft: `calc(var(--space-3) + ${depth * INDENT}px)` }}
        draggable
        title="Click for details, or drag onto the canvas"
        onClick={() => setDetails(component)}
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
      {/* Libraries brought in from other files: their components are listed below with the file's own. */}
      <section className={assetStyles.libraries} aria-label="Libraries">
        <div className={assetStyles.options}>
          <button type="button" className={styles.chip} onClick={() => void bringIn()}>
            Import library
          </button>
          {message !== null && (
            <span className={styles.count} role="status">
              {message}
            </span>
          )}
        </div>
        {libraries.length > 0 && (
          <ul className={assetStyles.libraryList} aria-label="Imported libraries">
            {libraries.map((library) => (
              <li key={library.pageId}>
                <button type="button" className={styles.chip} onClick={() => editor.state.setActivePage(library.pageId)}>
                  {library.name}
                </button>
                <span className={styles.count}>{library.components === 1 ? '1 component' : `${library.components} components`}</span>
                <button type="button" className={styles.chip} aria-label={`Check ${library.name} for updates`} onClick={() => void review(library.pageId, library.name)}>
                  Check for updates
                </button>
                {libraries.length > 1 && (
                  <select
                    className={styles.chip}
                    aria-label={`Swap ${library.name} for another library`}
                    value=""
                    onChange={(e) => {
                      if (e.target.value === '') return;
                      const moved = swapLibrary(editor, library.pageId, e.target.value);
                      setMessage(moved === 0 ? 'Nothing was using that library.' : `${moved === 1 ? '1 instance' : `${moved} instances`} now use the other library.`);
                      e.target.value = '';
                    }}
                  >
                    <option value="">Swap for…</option>
                    {libraries
                      .filter((other) => other.pageId !== library.pageId)
                      .map((other) => (
                        <option key={other.pageId} value={other.pageId}>
                          {other.name}
                        </option>
                      ))}
                  </select>
                )}
                <button type="button" className={styles.chip} aria-label={`Remove library ${library.name}`} onClick={() => removeLibrary(editor, library.pageId)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className={styles.count} role="status" aria-live="polite">
        {components.length === 0 ? (needle === '' ? 'No components in this file' : 'No matching components') : 'Local components'}
      </p>
      <ul className={styles.results} aria-label="Local components">
        {subFolders ? folderItems(assetTree(editor, components), 0) : items(components, (component) => component.name, 0, 'flat')}
      </ul>
      <IconPicker />
      {details && <ComponentDetailsDialog component={details} onClose={() => setDetails(null)} />}
    </section>
  );
}
