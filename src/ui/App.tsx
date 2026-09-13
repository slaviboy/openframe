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

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { bootstrap, type AppSession } from '@/app/bootstrap';
import type { Vec2 } from '@/core/math/vec';
import { placeImages } from '@/editor/commands/images';
import { screenToWorld } from '@/editor/viewport/viewport';
import { importImageFiles, pickImageFiles } from './images/image-actions';
import { IMAGE_ACCEPT } from './images/import-image';
import { Notice, PlaceImageHint, ToolHint } from './shell/Notice';
import { setSnapToPixelGrid } from '@/editor/interactions/transform';
import { StorageError } from '@/platform/idb/persistence';
import { CanvasHost, type CanvasContextMenu } from './canvas/CanvasHost';
import { clipboardCommands } from './clipboard/clipboard-commands';
import { ClipboardController } from './clipboard/clipboard-controller';
import { KeyboardController } from './keyboard/keyboard-controller';
import { canvasMenuEntries, guideMenuEntries, objectMenuEntries, pasteHereEntries, selectLayerEntries } from './menus/menu-model';
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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<(CanvasContextMenu & { pasteEntries: MenuEntry[] }) | null>(null);
  const [uiMode, setUiMode] = useState<UiMode>('full');
  const uiModeRef = useRef(uiMode);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsOpenRef = useRef(shortcutsOpen);
  const clipboardRef = useRef<ClipboardController | null>(null);
  // "Paste here" is built when the menu opens (an event), so render never touches the clipboard controller.
  const openContextMenu = useCallback((menu: CanvasContextMenu) => {
    const clipboard = clipboardRef.current;
    setContextMenu({ ...menu, pasteEntries: pasteHereEntries(clipboard?.canPaste() ?? false, () => void clipboard?.paste('default', menu.world)) });
  }, []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const closeDialog = useCallback(() => editor.state.openDialog(null), [editor]);
  const restoreUi = useCallback(() => setUiMode('full'), []);
  const [notice, setNotice] = useState<string | null>(null);
  const closeNotice = useCallback(() => setNotice(null), []);
  /** Imports image files and places them at a world point (default: the center of the visible canvas). */
  const placeFiles = useCallback(
    async (files: File[], world?: Vec2) => {
      const { images, errors } = await importImageFiles(editor, files);
      if (errors.length > 0) setNotice(errors.join(' '));
      if (images.length === 0) return;
      const insets = editor.canvasInsets;
      const center = { x: (insets.left + editor.canvasSize.width - insets.right) / 2, y: (insets.top + editor.canvasSize.height - insets.bottom) / 2 };
      placeImages(editor, images, world ?? screenToWorld(editor.state.viewport, center));
    },
    [editor],
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
        run: () => setPaletteOpen(true),
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
          void pickImageFiles(IMAGE_ACCEPT).then(async (files) => {
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
        <CanvasHost editor={editor} tools={tools} theme={theme} rulers={prefs.rulers} pixelGrid={prefs.pixelGrid} maskOutlines={prefs.maskOutlines} outlines={outlines} onContextMenu={openContextMenu} onDropFiles={dropFiles} />
      </EditorShell>
      {contextMenu && (
        <Menu
          label="Context menu"
          entries={
            editorState.selectedGuide
              ? guideMenuEntries(editor)
              : [
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
      {paletteOpen && <CommandPalette editor={editor} onClose={closePalette} />}
      {editorState.dialog === 'batchRename' && <BatchRenameDialog editor={editor} onClose={closeDialog} />}
      {editorState.dialog === 'nudgeAmount' && <NudgeDialog onClose={closeDialog} />}
      {editorState.tool === 'image' && <PlaceImageHint tools={tools} />}
      {editorState.tool === 'pickLayer' && <ToolHint text="Click a layer to use as the pattern source · Esc to cancel" />}
      {editorState.tool === 'eyedropper' && <ToolHint text="Click to apply a color from the canvas · Esc to cancel" />}
      {notice && <Notice message={notice} onClose={closeNotice} />}
    </>
  );
}
