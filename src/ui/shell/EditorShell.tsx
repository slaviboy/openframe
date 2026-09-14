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

import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AppSession } from '@/app/bootstrap';
import { applyUpdate, updates } from '@/platform/sw-register';
import { Icon } from '../icons/Icon';
import { SessionContext, useEditor, useEditorState, useSession } from '../hooks/useEditor';
import { commandSections, mainMenuEntries } from '../menus/menu-model';
import { FindPanel } from '../panels/find/FindPanel';
import { Inspector } from '../panels/inspector/Inspector';
import { AssetsPanel } from '../panels/assets/AssetsPanel';
import { LayersPanel } from '../panels/layers/LayersPanel';
import { PagesPanel } from '../panels/pages/PagesPanel';
import { VariablesView } from '../panels/variables/VariablesView';
import { VersionHistoryPanel } from '../panels/versions/VersionHistoryPanel';
import { PrototypePanel } from '../panels/prototype/PrototypePanel';
import { InlinePreview } from '../present/InlinePreview';
import { Menu } from '../primitives/Menu';
import { PropertyLabelsContext } from '../primitives/property-labels';
import { viewPrefs } from '../view/view-prefs';
import type { Box } from '../primitives/position';
import { NAV_RAIL_W, PANEL_GAP, SIDEBAR_LEFT_DEFAULT, SIDEBAR_LEFT_MAX, SIDEBAR_LEFT_MIN, SIDEBAR_RIGHT_W } from '../tokens';
import styles from './EditorShell.module.css';
import { Toolbar } from './Toolbar';
import { MissingFontsNotice } from '../dialogs/MissingFontsDialog';

/**
 * - `full`: navigation, both sidebars and the toolbar.
 * - `minimized` (⇧⌘\): sidebars collapse; the properties panel returns while layers are selected.
 * - `hidden` (⌘\): only the canvas.
 */
export type UiMode = 'full' | 'minimized' | 'hidden';

interface EditorShellProps {
  readonly session: AppSession;
  readonly uiMode: UiMode;
  readonly onRestoreUi: () => void;
  readonly children: ReactNode;
}

export function EditorShell({ session, uiMode, onRestoreUi, children }: EditorShellProps) {
  const [leftWidth, setLeftWidth] = useState(SIDEBAR_LEFT_DEFAULT);
  const [mainMenuAnchor, setMainMenuAnchor] = useState<Box | null>(null);
  const closeMainMenu = useCallback(() => setMainMenuAnchor(null), []);
  const editorState = session.editor.state;
  const hasSelection = useSyncExternalStore(editorState.subscribe, () => editorState.getSnapshot().selection.length > 0);
  const findOpen = useSyncExternalStore(editorState.subscribe, () => editorState.getSnapshot().findOpen);
  const assetsOpen = useSyncExternalStore(editorState.subscribe, () => editorState.getSnapshot().assetsOpen);
  const variablesOpen = useSyncExternalStore(editorState.subscribe, () => editorState.getSnapshot().variablesOpen);
  const propertyLabels = useSyncExternalStore(viewPrefs.subscribe, () => viewPrefs.getSnapshot().propertyLabels);
  const versionHistoryOpen = useSyncExternalStore(editorState.subscribe, () => editorState.getSnapshot().versionHistoryOpen);
  const rightTab = useSyncExternalStore(editorState.subscribe, () => editorState.getSnapshot().rightTab);
  const inlinePreviewOpen = useSyncExternalStore(editorState.subscribe, () => editorState.getSnapshot().inlinePreviewOpen);
  const inlinePreviewKey = useSyncExternalStore(editorState.subscribe, () => editorState.getSnapshot().inlinePreviewKey);
  const viewingVersion = useSyncExternalStore(session.session.subscribe, () => session.session.getSnapshot().viewing !== null);
  // Version history replaces the properties panel while it is open, and while an earlier version is shown.
  const inVersionHistory = versionHistoryOpen || viewingVersion;

  const showLeft = uiMode === 'full';
  const showRight = uiMode === 'full' || (uiMode === 'minimized' && (hasSelection || inVersionHistory));

  // Panels float over the canvas; tell the editor which edges they cover (rulers sit beside them).
  useLayoutEffect(() => {
    session.editor.setCanvasInsets({
      left: showLeft ? PANEL_GAP * 2 + NAV_RAIL_W + leftWidth : 0,
      right: showRight ? PANEL_GAP * 2 + SIDEBAR_RIGHT_W : 0,
      top: 0,
      bottom: 0,
    });
  }, [session, showLeft, showRight, leftWidth]);

  return (
    <SessionContext.Provider value={session}>
      <div className={styles.shell} style={{ ['--left-w' as string]: `${leftWidth}px` }}>
        <div className={styles.canvasArea}>{children}</div>
        {showLeft && (
          <aside className={`${styles.panel} ${styles.left}`} aria-label="File navigation">
            <nav className={styles.rail} aria-label="Navigation">
              <button
                type="button"
                className={styles.logo}
                aria-label="Main menu"
                aria-haspopup="menu"
                aria-expanded={mainMenuAnchor !== null}
                data-menu-root=""
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMainMenuAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
                }}
              >
                <Icon name="logo" />
              </button>
              {mainMenuAnchor && (
                <Menu label="Main menu" entries={mainMenuEntries(session.editor)} anchor={mainMenuAnchor} placement="bottom-start" onClose={closeMainMenu} />
              )}
              <button
                type="button"
                className={styles.railTab}
                aria-current={!assetsOpen && !variablesOpen ? 'page' : undefined}
                title="File"
                onClick={() => {
                  editorState.setAssetsOpen(false);
                  editorState.setVariablesOpen(false);
                }}
              >
                <Icon name="file" />
                <span className={styles.railLabel}>File</span>
              </button>
              <button
                type="button"
                className={styles.railTab}
                aria-current={assetsOpen && !variablesOpen ? 'page' : undefined}
                title="Assets"
                onClick={() => {
                  editorState.setAssetsOpen(true);
                  editorState.setVariablesOpen(false);
                }}
              >
                <Icon name="component" />
                <span className={styles.railLabel}>Assets</span>
              </button>
              <button type="button" className={styles.railTab} aria-current={variablesOpen ? 'page' : undefined} title="Variables" onClick={() => editorState.setVariablesOpen(!variablesOpen)}>
                <Icon name="variables" />
                <span className={styles.railLabel}>Variables</span>
              </button>
              {/* File notifications sit at the bottom of the navigation bar. */}
              <MissingFontsNotice className={styles.railNotice} />
            </nav>
            <div className={styles.sidebar}>
              <FileHeader />
              {assetsOpen ? (
                <AssetsPanel />
              ) : (
                <>
                  <PagesPanel />
                  {findOpen ? <FindPanel /> : <LayersPanel />}
                </>
              )}
            </div>
            <ResizeHandle width={leftWidth} onWidth={setLeftWidth} />
          </aside>
        )}
        {uiMode === 'minimized' && (
          <button type="button" className={styles.restoreUi} aria-label="Show UI" title="Show UI" onClick={onRestoreUi}>
            <Icon name="sidebar" />
          </button>
        )}
        {showRight && (
          <aside className={`${styles.panel} ${styles.right}`} aria-label="Properties">
            {inVersionHistory ? (
              <VersionHistoryPanel />
            ) : (
              <>
                <RightHeader />
                {rightTab === 'prototype' ? (
                  <PrototypePanel />
                ) : (
                  <PropertyLabelsContext.Provider value={propertyLabels}>
                    <Inspector />
                  </PropertyLabelsContext.Provider>
                )}
              </>
            )}
          </aside>
        )}
        {uiMode !== 'hidden' && <Toolbar />}
        {inlinePreviewOpen && uiMode !== 'hidden' && <InlinePreview key={inlinePreviewKey} />}
        {variablesOpen && uiMode !== 'hidden' && <VariablesView onClose={() => editorState.setVariablesOpen(false)} />}
      </div>
    </SessionContext.Provider>
  );
}

function FileHeader() {
  const app = useSession();
  const state = useSyncExternalStore(app.session.subscribe, app.session.getSnapshot);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(state.file.name);
  const [menuAnchor, setMenuAnchor] = useState<Box | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);

  const commit = () => {
    setEditing(false);
    if (!name.trim()) setName(state.file.name);
    void app.renameFile(name).catch((error: unknown) => console.error('Openframe: rename failed', error));
  };

  const save = state.save;
  const statusText = state.viewing
    ? 'Viewing an earlier version'
    : save.state === 'saved'
      ? 'Saved locally'
      : save.state === 'error'
        ? `Not saved: ${save.error.message}`
        : 'Saving…';

  return (
    <div className={styles.fileHeader}>
      {editing ? (
        <input
          className={styles.fileNameInput}
          aria-label="File name"
          value={name}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setName(state.file.name);
              setEditing(false);
            }
          }}
        />
      ) : (
        <div className={styles.fileNameRow}>
          <button type="button" className={styles.fileName} disabled={state.viewing !== null} onClick={() => setEditing(true)} title="Rename file">
            {state.file.name}
          </button>
          <button
            type="button"
            className={styles.fileMenuButton}
            aria-label="File actions"
            aria-haspopup="menu"
            aria-expanded={menuAnchor !== null}
            data-menu-root=""
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenuAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
            }}
          >
            <Icon name="chevronDown" size={16} />
          </button>
          {menuAnchor && (
            <Menu
              label="File actions"
              entries={commandSections(app.editor, [['file.showVersionHistory'], ['file.saveLocalCopy', 'file.export']])}
              anchor={menuAnchor}
              placement="bottom-start"
              onClose={closeMenu}
            />
          )}
        </div>
      )}
      <span className={styles.saveStatus} data-state={save.state} role="status" aria-live="polite" data-testid="save-status">
        {statusText}
      </span>
      <UpdateNotice />
    </div>
  );
}

function UpdateNotice() {
  const app = useSession();
  const update = useSyncExternalStore(updates.subscribe, updates.getSnapshot);
  if (!update.updateAvailable) return null;
  return (
    <div className={styles.update} role="status">
      <span>A new version is ready.</span>
      <button
        type="button"
        className={styles.updateButton}
        onClick={() => {
          // Make sure every committed edit is durable before the page reloads.
          void app.autosaver.flush().finally(applyUpdate);
        }}
      >
        Reload
      </button>
    </div>
  );
}

/** Multi-edit text: shown while several text layers are selected; edits them all at once (also Return). */
function MultiEditTextButton() {
  const editor = useEditor();
  const selection = useEditorState((s) => s.selection);
  const editing = useEditorState((s) => s.textEdit !== null);
  const allText = selection.length > 1 && selection.every((id) => editor.doc.get(id)?.type === 'TEXT');
  if (!allText || editing) return null;
  return (
    <button type="button" className={styles.zoomButton} disabled={!editor.commands.isEnabled('text.edit')} onClick={() => editor.commands.run('text.edit')}>
      Multi-edit text
    </button>
  );
}

/** Multi-edit variants: shown for a selection in a component set; while on, the button ends it (Q does both). */
function MultiEditVariantsButton() {
  const editor = useEditor();
  useEditorState((s) => s.selection);
  const active = useEditorState((s) => s.multiEditSetId !== null);
  if (!active && !editor.commands.isEnabled('object.multiEditVariants')) return null;
  return (
    <button type="button" className={styles.zoomButton} aria-pressed={active} onClick={() => editor.commands.run('object.multiEditVariants')}>
      {active ? 'Exit multi-edit' : 'Multi-edit variants'}
    </button>
  );
}

function RightHeader() {
  const editor = useEditor();
  const zoom = useEditorState((s) => s.viewports[s.activePageId]?.zoom ?? 1);
  const rightTab = useEditorState((s) => s.rightTab);
  const [anchor, setAnchor] = useState<Box | null>(null);
  const close = useCallback(() => setAnchor(null), []);
  return (
    <div className={styles.rightHeader}>
      <div className={styles.tabs} role="tablist" aria-label="Properties panel">
        {(['design', 'prototype'] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={rightTab === tab} className={styles.tab} data-active={rightTab === tab || undefined} onClick={() => editor.state.setRightTab(tab)}>
            {tab === 'design' ? 'Design' : 'Prototype'}
          </button>
        ))}
      </div>
      <MultiEditTextButton />
      <MultiEditVariantsButton />
      <button type="button" className={styles.zoomButton} title="Preview (⇧Space)" onClick={() => editor.commands.run('view.inlinePreview')}>
        Preview
      </button>
      <button type="button" className={styles.zoomButton} title="Present (opens a new tab)" onClick={() => editor.commands.run('view.present')}>
        Present
      </button>
      <button
        type="button"
        className={styles.zoomButton}
        data-testid="zoom-level"
        aria-label="Zoom and view options"
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        data-menu-root=""
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
        }}
      >
        {Math.round(zoom * 100)}%
        <Icon name="chevronDown" size={16} />
      </button>
      {anchor && (
        <Menu
          label="Zoom and view options"
          entries={commandSections(editor, [
            ['view.zoomIn', 'view.zoomOut', 'view.zoomToFit', 'view.zoomToSelection'],
            ['view.zoom50', 'view.zoom100', 'view.zoom200'],
            ['view.togglePixelGrid', 'view.toggleSnapToPixelGrid', 'view.toggleLayoutGuides'],
            ['view.toggleRulers', 'view.toggleOutlines', 'view.toggleOutlineHidden', 'view.toggleMaskOutlines'],
            ['view.togglePropertyLabels'],
          ])}
          anchor={anchor}
          placement="bottom-start"
          onClose={close}
        />
      )}
    </div>
  );
}

function ResizeHandle({ width, onWidth }: { width: number; onWidth: (w: number) => void }) {
  const start = useRef<{ x: number; w: number } | null>(null);
  return (
    <div
      className={styles.resizeHandle}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_LEFT_MIN}
      aria-valuemax={SIDEBAR_LEFT_MAX}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') onWidth(Math.max(SIDEBAR_LEFT_MIN, width - 10));
        if (e.key === 'ArrowRight') onWidth(Math.min(SIDEBAR_LEFT_MAX, width + 10));
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, w: width };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onWidth(Math.min(SIDEBAR_LEFT_MAX, Math.max(SIDEBAR_LEFT_MIN, start.current.w + e.clientX - start.current.x)));
      }}
      onPointerUp={() => {
        start.current = null;
      }}
    />
  );
}
