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

import { FileBrowserDialog } from './dialogs/FileBrowserDialog';
import { isPackageFile, openFromDisk, openLocalFile, saveLocalCopy, saveResultNotice, saveToDisk } from '@/app/local-files';
import { canOpenFromDisk } from '@/platform/disk-file';
import { presentFile } from '@/app/present';
import { PackageError } from '@/platform/package';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { bootstrap, type AppSession } from '@/app/bootstrap';
import { addAnnotation } from '@/editor/commands/annotations';
import { CheckDesignsDialog } from './dialogs/CheckDesignsDialog';
import type { Vec2 } from '@/core/math/vec';
import { placeImages } from '@/editor/commands/images';
import { screenToWorld } from '@/editor/viewport/viewport';
import { importImageFiles, pickImageFiles } from './images/image-actions';
import { IMAGE_ACCEPT } from './images/import-image';
import { VIDEO_ACCEPT } from './images/import-video';
import { isSvgFile, readSvgFile } from './import/svg-files';
import { placeSvgs, type PlaceableSvg } from '@/editor/commands/import-svg';
import { Notice, PlaceImageHint, ToolHint } from './shell/Notice';
import { setSnapToPixelGrid } from '@/editor/interactions/transform';
import { StorageError } from '@/platform/idb/persistence';
import { CanvasHost, type CanvasContextMenu } from './canvas/CanvasHost';
import { LinkPopover } from './canvas/LinkPopover';
import { FlowRenamePopover } from './canvas/FlowRenamePopover';
import { LayoutValuePopover } from './canvas/LayoutValuePopover';
import { spellingEntries } from './menus/spelling-menu';
import { EmojiSuggestions } from './canvas/EmojiSuggestions';
import { MissingFontsDialog } from './dialogs/MissingFontsDialog';
import { clipboardCommands } from './clipboard/clipboard-commands';
import { ClipboardController } from './clipboard/clipboard-controller';
import { KeyboardController } from './keyboard/keyboard-controller';
import { canvasMenuEntries, connectionMenuEntries, guideMenuEntries, objectMenuEntries, pasteHereEntries, selectLayerEntries } from './menus/menu-model';
import { BatchRenameDialog } from './dialogs/BatchRenameDialog';
import { NudgeDialog } from './dialogs/NudgeDialog';
import { CommandPalette } from './palette/CommandPalette';
import { Menu, type MenuEntry } from './primitives/Menu';
import { EditorShell, type UiMode } from './shell/EditorShell';
import { ShortcutsPanel } from './shortcuts/ShortcutsPanel';
import { shortcutUsage } from './shortcuts/shortcut-usage';
import { THEME_COMMANDS } from './theme/theme-store';
import { useThemePreference } from './theme/useTheme';
import { VIEW_PREF_COMMANDS, viewPrefs } from './view/view-prefs';
import { instanceSlotOf } from '@/core/document/instances';
import { slotLimitWarning } from '@/core/document/component-properties';
import type { ChangeSet } from '@/core/history/history';
import { AddInstancesDialog } from './dialogs/AddInstancesDialog';
import { ExportDialog } from './dialogs/ExportDialog';

type LoadState = { kind: 'loading' } | { kind: 'ready'; session: AppSession } | { kind: 'error'; message: string };

export function App() {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const theme = useThemePreference();

  useEffect(() => {
    let session: AppSession | null = null;
    let canceled = false;
    bootstrap()
      .then((s) => {
        if (canceled) {
          s.dispose();
          return;
        }
        session = s;
        setLoad({ kind: 'ready', session: s });
      })
      .catch((error: unknown) => {
        console.error(error);
        const message =
          error instanceof StorageError ? error.message : 'Openframe could not start. Local storage may be disabled in this browser.';
        setLoad({ kind: 'error', message });
      });
    return () => {
      canceled = true;
      session?.dispose();
    };
  }, []);

  if (load.kind === 'loading') {
    return <div className="app-status" aria-busy="true" />;
  }
  if (load.kind === 'error') {
    return (
      <div className="app-status" role="alert">
        {load.message}
      </div>
    );
  }
  return <ReadyApp session={load.session} theme={theme} />;
}

function ReadyApp({ session, theme }: { session: AppSession; theme: 'light' | 'dark' }) {
  const { editor, tools } = session;
  const editorState = useSyncExternalStore(editor.state.subscribe, editor.state.getSnapshot);
  const prefs = useSyncExternalStore(viewPrefs.subscribe, viewPrefs.getSnapshot);
  const outlines = useMemo(() => ({ outlines: prefs.outlines, includeHidden: prefs.outlineHidden }), [prefs.outlines, prefs.outlineHidden]);
  const [palette, setPalette] = useState<'commands' | 'components' | null>(null);
  const [contextMenu, setContextMenu] = useState<(CanvasContextMenu & { pasteEntries: MenuEntry[] }) | null>(null);
  const [uiMode, setUiMode] = useState<UiMode>('full');
  const uiModeRef = useRef(uiMode);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [checkDesigns, setCheckDesigns] = useState(false);
  const shortcutsOpenRef = useRef(shortcutsOpen);
  const clipboardRef = useRef<ClipboardController | null>(null);
  // "Paste here" is built when the menu opens (an event), so render never touches the clipboard controller.
  const openContextMenu = useCallback((menu: CanvasContextMenu) => {
    const clipboard = clipboardRef.current;
    setContextMenu({ ...menu, pasteEntries: pasteHereEntries(clipboard?.canPaste() ?? false, () => void clipboard?.paste('default', menu.world)) });
  }, []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const closePalette = useCallback(() => setPalette(null), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeDialog = useCallback(() => editor.state.openDialog(null), [editor]);
  const restoreUi = useCallback(() => setUiMode('full'), []);
  const [notice, setNotice] = useState<string | null>(null);
  const openInput = useRef<HTMLInputElement>(null);
  const [filesOpen, setFilesOpen] = useState(false);
  // Opening an .openframe file makes it a new local file and reloads into it.
  const openPackage = useCallback(
    async (file: File) => {
      try {
        await openLocalFile(session, file);
      } catch (error) {
        setNotice(error instanceof PackageError ? error.message : 'The file could not be opened.');
      }
    },
    [session],
  );
  useEffect(
    () =>
      editor.commands.register(
        {
          id: 'file.browse',
          label: 'Files…',
          category: 'File',
          run: () => setFilesOpen(true),
        },
        {
          id: 'file.saveLocalCopy',
          label: 'Save local copy…',
          category: 'File',
          run: () => void saveLocalCopy(session).catch(() => setNotice('The file could not be saved.')),
        },
        {
          id: 'file.open',
          label: 'Open file…',
          category: 'File',
          run: () => {
            // Opened from disk, the file saves back to where it came from; elsewhere the file input opens a copy.
            if (!canOpenFromDisk()) {
              openInput.current?.click();
              return;
            }
            void openFromDisk(session).catch((error: unknown) => setNotice(error instanceof PackageError ? error.message : 'The file could not be opened.'));
          },
        },
        {
          id: 'file.save',
          label: 'Save',
          category: 'File',
          shortcuts: ['Mod+S'],
          run: () =>
            void saveToDisk(session).then(
              (result) => {
                const text = saveResultNotice(result);
                if (text) setNotice(text);
              },
              () => setNotice('The file could not be saved.'),
            ),
        },
        {
          id: 'file.saveAs',
          label: 'Save as…',
          category: 'File',
          run: () =>
            void saveToDisk(session, true).then(
              (result) => {
                const text = saveResultNotice(result);
                if (text) setNotice(text);
              },
              () => setNotice('The file could not be saved.'),
            ),
        },
        {
          id: 'view.present',
          label: 'Present',
          category: 'View',
          shortcuts: ['Mod+Alt+Enter'],
          run: () => presentFile(session),
        },
        {
          id: 'file.showVersionHistory',
          label: 'Show version history',
          category: 'File',
          run: () => editor.state.setVersionHistoryOpen(true),
        },
      ),
    [editor, session],
  );
  const closeNotice = useCallback(() => {
    setNotice(null);
    editor.state.setNotice(null);
  }, [editor]);
  // A change that takes a slot of an instance past its limits shows a warning.
  useEffect(
    () =>
      editor.history.subscribe((changes: ChangeSet) => {
        if (changes.source !== 'commit') return;
        for (const id of changes.structural) {
          const warning = instanceSlotOf(editor.doc, id) === id ? slotLimitWarning(editor.doc, id) : null;
          if (warning) {
            editor.state.setNotice(warning);
            return;
          }
        }
      }),
    [editor],
  );
  /** Imports image files and places them at a world point (default: the center of the visible canvas). */
  const placeFiles = useCallback(
    async (files: File[], world?: Vec2) => {
      const packageFile = files.find(isPackageFile);
      if (packageFile) {
        await openPackage(packageFile);
        return;
      }
      // SVG files import as editable vectors, not images.
      const svgs: PlaceableSvg[] = [];
      const svgErrors: string[] = [];
      for (const file of files.filter(isSvgFile)) {
        try {
          svgs.push(await readSvgFile(file));
        } catch (error) {
          svgErrors.push(error instanceof Error ? error.message : `${file.name} could not be imported.`);
        }
      }
      const { images, errors } = await importImageFiles(
        editor,
        files.filter((file) => !isSvgFile(file)),
      );
      const skipped = [...new Set(svgs.flatMap((item) => item.svg.skipped.map((what) => what.replace(/^.*: /, ''))))];
      const notices = [...svgErrors, ...errors, ...(skipped.length > 0 ? [`Some SVG content wasn't imported: ${skipped.join(', ')}.`] : [])];
      if (notices.length > 0) setNotice(notices.join(' '));
      if (images.length === 0 && svgs.length === 0) return;
      const insets = editor.canvasInsets;
      const center = { x: (insets.left + editor.canvasSize.width - insets.right) / 2, y: (insets.top + editor.canvasSize.height - insets.bottom) / 2 };
      const point = world ?? screenToWorld(editor.state.viewport, center);
      if (images.length > 0) placeImages(editor, images, point);
      if (svgs.length > 0) placeSvgs(editor, svgs, point);
    },
    [editor, openPackage],
  );
  const dropFiles = useCallback((files: File[], world: Vec2) => void placeFiles(files, world), [placeFiles]);

  useEffect(() => {
    uiModeRef.current = uiMode;
    shortcutsOpenRef.current = shortcutsOpen;
  });

  useEffect(() => {
    setSnapToPixelGrid(prefs.snapToPixelGrid);
  }, [prefs.snapToPixelGrid]);

  useEffect(() => {
    editor.setNudgeAmounts(prefs.nudgeSmall, prefs.nudgeBig);
  }, [editor, prefs.nudgeSmall, prefs.nudgeBig]);

  useEffect(() => {
    // UI commands must be registered before the keyboard controller builds its keymap.
    const disposeUiCommands = editor.commands.register(
      {
        id: 'view.commandPalette',
        label: 'Command palette',
        category: 'View',
        shortcuts: ['Mod+K', 'Mod+/'],
        run: () => setPalette('commands'),
      },
      {
        id: 'view.drawMode',
        label: 'Draw mode',
        category: 'View',
        checked: () => editor.state.getSnapshot().mode === 'draw',
        // Draw and Design share the editor; the toolbar and the panels change with the mode.
        run: () => editor.state.setMode(editor.state.getSnapshot().mode === 'draw' ? 'design' : 'draw'),
      },
      {
        id: 'edit.checkDesigns',
        label: 'Check designs',
        category: 'Edit',
        // The check reads the page against the variables, styles and libraries the file already has.
        run: () => setCheckDesigns(true),
      },
      {
        id: 'view.comments',
        label: 'Show comments',
        category: 'View',
        shortcuts: ['Shift+C'],
        checked: () => !editor.state.getSnapshot().commentsHidden,
        run: () => editor.state.setCommentsHidden(!editor.state.getSnapshot().commentsHidden),
      },
      {
        id: 'dev.annotate',
        label: 'Annotate',
        category: 'View',
        enabled: () => editor.state.getSnapshot().selection.length === 1,
        // A note is left on one layer at a time, and is written in the Annotations section.
        run: () => {
          const [id] = editor.state.getSnapshot().selection;
          if (id !== undefined) addAnnotation(editor, id);
        },
        shortcuts: ['Shift+T'],
      },
      {
        id: 'view.devMode',
        label: 'Dev Mode',
        category: 'View',
        shortcuts: ['Shift+D'],
        checked: () => editor.state.getSnapshot().mode === 'dev',
        // Dev Mode reads the design rather than editing it: the inspect panel takes the properties panel's place.
        run: () => editor.state.setMode(editor.state.getSnapshot().mode === 'dev' ? 'design' : 'dev'),
      },
      {
        id: 'view.assetsTab',
        label: 'Assets',
        category: 'View',
        shortcuts: ['Alt+2'],
        checked: () => editor.state.getSnapshot().assetsOpen,
        run: () => editor.state.setAssetsOpen(!editor.state.getSnapshot().assetsOpen),
      },
      {
        id: 'view.quickInsert',
        label: 'Quick insert',
        category: 'View',
        shortcuts: ['Shift+I'],
        run: () => setPalette('components'),
      },
      {
        id: 'view.toggleHideUi',
        label: 'Show/hide UI',
        category: 'View',
        shortcuts: ['Mod+\\'],
        checked: () => uiModeRef.current === 'hidden',
        run: () => setUiMode((mode) => (mode === 'hidden' ? 'full' : 'hidden')),
      },
      {
        id: 'view.toggleMinimizeUi',
        label: 'Minimize UI',
        category: 'View',
        shortcuts: ['Mod+Shift+\\'],
        checked: () => uiModeRef.current === 'minimized',
        run: () => setUiMode((mode) => (mode === 'minimized' ? 'full' : 'minimized')),
      },
      {
        id: 'view.focusToolbar',
        label: 'Focus toolbar',
        category: 'View',
        shortcuts: ['F6', 'Ctrl+F6'],
        run: () => {
          const toolbar = document.querySelector('[role="toolbar"][aria-label="Tools"]');
          (toolbar?.querySelector<HTMLElement>('[data-tool-button][aria-pressed="true"]') ?? toolbar?.querySelector<HTMLElement>('[data-tool-button]'))?.focus();
        },
      },
      {
        id: 'tools.placeObject',
        label: 'Place object',
        category: 'Tools',
        shortcuts: ['Enter'],
        palette: false,
        enabled: () => tools.canPlaceObject(),
        run: () => void tools.placeObject(),
      },
      {
        id: 'preferences.nudgeAmount',
        label: 'Nudge amount…',
        category: 'View',
        run: () => editor.state.openDialog('nudgeAmount'),
      },
      {
        id: 'help.keyboardShortcuts',
        label: 'Keyboard shortcuts',
        category: 'Help',
        shortcuts: ['Ctrl+Shift+/'],
        checked: () => shortcutsOpenRef.current,
        run: () => setShortcutsOpen((open) => !open),
      },
      {
        id: 'tools.image',
        label: 'Place image',
        category: 'Tools',
        shortcuts: ['Mod+Shift+K'],
        checked: () => editor.state.getSnapshot().tool === 'image',
        run: () => {
          void pickImageFiles(`${IMAGE_ACCEPT},${VIDEO_ACCEPT}`).then(async (files) => {
            if (files.length === 0) return;
            const { images, errors } = await importImageFiles(editor, files);
            if (errors.length > 0) setNotice(errors.join(' '));
            if (images.length === 0) return;
            tools.imageTool.load(images);
            editor.state.setTool('image');
          });
        },
      },
      ...THEME_COMMANDS,
      ...VIEW_PREF_COMMANDS,
    );
    const clipboard = new ClipboardController(editor, setNotice, document, (files) => void placeFiles(files));
    clipboardRef.current = clipboard;
    const disposeClipboardCommands = editor.commands.register(...clipboardCommands(clipboard));
    const keyboard = new KeyboardController(editor, tools);
    const disposeUsage = keyboard.onShortcut((commandId) => shortcutUsage.markUsed(commandId));
    // Test hook for E2E assertions (reads state / runs commands). Not present in production builds.
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
      (window as unknown as { __openframe?: AppSession }).__openframe = session;
    }
    return () => {
      disposeUsage();
      keyboard.dispose();
      disposeClipboardCommands();
      clipboard.dispose();
      disposeUiCommands();
    };
  }, [editor, tools, session, placeFiles]);

  return (
    <>
      <EditorShell session={session} uiMode={uiMode} onRestoreUi={restoreUi}>
        <CanvasHost editor={editor} tools={tools} theme={theme} rulers={prefs.rulers} pixelGrid={prefs.pixelGrid} layoutGuides={prefs.layoutGuides} maskOutlines={prefs.maskOutlines} outlines={outlines} onContextMenu={openContextMenu} onDropFiles={dropFiles} />
        {editorState.textEdit && <LinkPopover />}
        {editorState.layoutValueEdit && <LayoutValuePopover />}
        {editorState.flowRename && <FlowRenamePopover />}
        {editorState.textEdit && <EmojiSuggestions />}
        {editorState.dialog === 'missingFonts' && <MissingFontsDialog editor={editor} onClose={closeDialog} />}
      </EditorShell>
      {contextMenu && (
        <Menu
          label="Context menu"
          entries={
            editorState.selectedGuide
              ? guideMenuEntries(editor)
              : editorState.selectedConnections.length > 0 && editorState.rightTab === 'prototype'
                ? connectionMenuEntries(editor)
                : [
                  ...spellingEntries(editor, contextMenu.spelling),
                  ...selectLayerEntries(editor, contextMenu.layers),
                  ...contextMenu.pasteEntries,
                  ...(editor.selection.length > 0 ? objectMenuEntries(editor) : canvasMenuEntries(editor)),
                ]
          }
          anchor={{ x: contextMenu.x, y: contextMenu.y, width: 0, height: 0 }}
          placement="point"
          onClose={closeContextMenu}
        />
      )}
      {shortcutsOpen && uiMode !== 'hidden' && <ShortcutsPanel editor={editor} onClose={closeShortcuts} />}
      {palette && <CommandPalette editor={editor} mode={palette} onClose={closePalette} />}
      {checkDesigns && <CheckDesignsDialog editor={editor} onClose={() => setCheckDesigns(false)} />}
      {editorState.addInstancesSlotId && <AddInstancesDialog editor={editor} slotId={editorState.addInstancesSlotId} onClose={() => editor.state.openAddInstances(null)} />}
      {editorState.dialog === 'batchRename' && <BatchRenameDialog editor={editor} onClose={closeDialog} />}
      {editorState.dialog === 'nudgeAmount' && <NudgeDialog onClose={closeDialog} />}
      {editorState.dialog === 'export' && <ExportDialog editor={editor} onClose={closeDialog} />}
      <input
        ref={openInput}
        type="file"
        accept=".openframe"
        aria-label="Open an Openframe file"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) void openPackage(file);
        }}
      />
      {filesOpen && <FileBrowserDialog session={session} onClose={() => setFilesOpen(false)} />}
      {editorState.tool === 'image' && <PlaceImageHint tools={tools} />}
      {editorState.tool === 'pickLayer' && <ToolHint text="Click a layer to use as the pattern source · Esc to cancel" />}
      {editorState.tool === 'eyedropper' && <ToolHint text="Click to apply a color from the canvas · Esc to cancel" />}
      {(notice ?? editorState.notice) && <Notice message={(notice ?? editorState.notice)!} onClose={closeNotice} />}
    </>
  );
}
