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

import { COMPONENT_DRAG_TYPE, insertInstance } from '@/editor/commands/insert-instance';
import { instanceToSwap, swapInstanceFor } from '@/editor/commands/swap-instance';
import type { CanvasKit, Surface } from 'canvaskit-wasm';
import type { Id } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DARK_CHROME, LIGHT_CHROME } from '@/editor/chrome/chrome-theme';
import { drawOverlay } from '@/editor/chrome/overlay-renderer';
import type { Editor } from '@/editor/editor';
import type { ToolManager } from '@/editor/tools/tool-manager';
import type { PointerInfo } from '@/editor/tools/types';
import { loadCanvasKit } from '@/engine/ck/canvaskit';
import { screenToWorld } from '@/editor/viewport/viewport';
import type { ColorProfile } from '@/core/color/color';
import { documentColorProfile } from '@/core/color/color-profile';
import { SceneRenderer, type RenderOptions } from '@/engine/render/scene-renderer';
import { loadBundledFonts } from '@/engine/text/bundled-fonts';
import { TextShaper } from '@/engine/text/text-shaper';
import { apply } from '@/core/math/matrix';
import { pastedUrl } from '@/core/text/links';
import { containsEmoji } from '@/core/text/emoji';
import { loadEmojiFont } from '@/engine/text/bundled-fonts';
import { loadCjkSubsets } from '@/engine/text/cjk-fonts';
import { cjkScriptFor, containsCjk } from '@/core/text/cjk';
import { viewPrefs } from '../view/view-prefs';
import { emojiSuggest } from './emoji-suggest';
import { precacheDeferredAssets } from '@/platform/sw-register';
import { misspelledWordAt } from '@/core/text/spelling';
import { loadSpellChecker } from '../text/spell-checker';
import { worldToScreen } from '@/editor/viewport/viewport';
import {
  deleteText,
  endTextEdit,
  insertText,
  moveTextCaret,
  redoTextEdit,
  selectAllText,
  selectedText,
  applyLink,
  indentListItem,
  openLinkEditor,
  textEditTarget,
  textStyleRange,
  toggleList,
  undoTextEdit,
  type CaretMove,
} from '@/editor/interactions/text-edit';
import { stepTextProperty, toggleFontStyle, toggleTextDecoration } from '@/editor/commands/text';
import { autoLineHeight } from '@/editor/commands/builtin';
import type { Transaction } from '@/core/history/history';
import { addFontFaces } from '../fonts/font-faces';
import { imageFilesOf } from '../images/import-image';
import { videoFilesOf } from '../images/import-video';
import { svgFilesOf } from '../import/svg-files';
import { IS_MAC } from '../keyboard/keyboard-controller';
import { ClickCounter } from './click-counter';
import { cursorCss } from './cursors';
import styles from './CanvasHost.module.css';

export interface CanvasContextMenu {
  readonly x: number;
  readonly y: number;
  /** Layers under the pointer, for the "Select layer" submenu. */
  readonly layers: readonly Id[];
  /** Pointer position in world coordinates, for "Paste here". */
  readonly world: Vec2;
  /** A misspelled word under the pointer in the text being edited, with its suggestions. */
  readonly spelling?: { readonly start: number; readonly end: number; readonly suggestions: readonly string[] } | undefined;
}

interface CanvasHostProps {
  editor: Editor;
  tools: ToolManager;
  theme: 'light' | 'dark';
  /** Show rulers and ruler guides. */
  rulers: boolean;
  /** Show the one-pixel grid at high zoom. */
  pixelGrid: boolean;
  /** Show layout guides on frames. */
  layoutGuides?: boolean;
  /** Outline masks in green. */
  maskOutlines?: boolean;
  /** Outline mode and whether it includes hidden layers. */
  outlines: RenderOptions;
  /** Right-click on the canvas (after selecting the layer under the pointer), in client coordinates. */
  onContextMenu?: (point: CanvasContextMenu) => void;
  /** Image files dropped on the canvas, with the drop point in world coordinates. */
  onDropFiles?: (files: File[], world: Vec2) => void;
}

type Status = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

/**
 * Mounts the CanvasKit scene canvas and the Canvas 2D chrome overlay. It subscribes to
 * editor render requests and draws at most once per animation frame; React never
 * re-renders on document changes.
 */
export function CanvasHost({ editor, tools, theme, rulers, pixelGrid, layoutGuides = true, maskOutlines = false, outlines, onContextMenu, onDropFiles }: CanvasHostProps) {
  const maskOutlinesRef = useRef(maskOutlines);
  const dropRef = useRef(onDropFiles);
  const outlinesRef = useRef(outlines);
  const pixelGridRef = useRef(pixelGrid);
  const layoutGuidesRef = useRef(layoutGuides);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);
  const themeRef = useRef(theme);
  const rulersRef = useRef(rulers);
  const contextMenuRef = useRef(onContextMenu);
  // Exposed as data-spelling once the spell checker is installed (E2E waits for it).
  const [spellingReady, setSpellingReady] = useState(false);
  // The keyboard's selection box is drawn on the canvas, so the host says when one is out.
  const subscribeState = useCallback((listener: () => void) => editor.state.subscribe(listener), [editor]);
  const keyboardBox = useSyncExternalStore(subscribeState, () => editor.state.getSnapshot().keyboardBox);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    contextMenuRef.current = onContextMenu;
    dropRef.current = onDropFiles;
  });

  // Dropping image files on the canvas places them at the drop point.
  useEffect(() => {
    const container = containerRef.current!;
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files') && !e.dataTransfer?.types.includes(COMPONENT_DRAG_TYPE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      // A component dragged from the Assets tab becomes an instance at the drop point. Holding ⌥ (Alt) swaps
      // the instance under the pointer instead, and ⌥⌘ (Alt+Ctrl) an instance nested in a frame or component.
      const componentId = e.dataTransfer?.getData(COMPONENT_DRAG_TYPE);
      if (componentId) {
        e.preventDefault();
        const bounds = container.getBoundingClientRect();
        const world = screenToWorld(editor.state.viewport, { x: e.clientX - bounds.left, y: e.clientY - bounds.top });
        const target = e.altKey ? instanceToSwap(editor, world, IS_MAC ? e.metaKey : e.ctrlKey) : null;
        if (target) swapInstanceFor(editor, target, componentId);
        else insertInstance(editor, componentId, world);
        return;
      }
      const files = [...imageFilesOf(e.dataTransfer), ...videoFilesOf(e.dataTransfer), ...svgFilesOf(e.dataTransfer)];
      if (files.length === 0) return;
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      dropRef.current?.(files, screenToWorld(editor.state.viewport, { x: e.clientX - rect.left, y: e.clientY - rect.top }));
    };
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    return () => {
      container.removeEventListener('dragover', onDragOver);
      container.removeEventListener('drop', onDrop);
    };
  }, [editor]);

  useEffect(() => {
    themeRef.current = theme;
    editor.requestRender();
  }, [theme, editor]);

  useEffect(() => {
    outlinesRef.current = outlines;
    pixelGridRef.current = pixelGrid;
    layoutGuidesRef.current = layoutGuides;
    maskOutlinesRef.current = maskOutlines;
    editor.requestRender();
  }, [outlines, pixelGrid, layoutGuides, maskOutlines, editor]);

  useEffect(() => {
    rulersRef.current = rulers;
    tools.setRulersVisible(rulers);
  }, [rulers, tools]);

  useEffect(() => {
    const container = containerRef.current!;
    const sceneCanvas = sceneRef.current!;
    const overlayCanvas = overlayRef.current!;
    const overlay = overlayCanvas.getContext('2d')!;
    let ck: CanvasKit | null = null;
    let surface: Surface | null = null;
    let renderer: SceneRenderer | null = null;
    let shaper: TextShaper | null = null;
    let unsubscribeFonts = () => {};
    let unsubscribeEmoji = () => {};
    let unsubscribeCjk = () => {};
    let unsubscribeSpelling = () => {};
    const textInput = textInputRef.current!;
    // Caret blink phase while editing text; restarts visible whenever the selection changes.
    let caretVisible = true;
    let lastTextEdit = editor.state.getSnapshot().textEdit;
    let frame = 0;
    let disposed = false;
    let size = { width: 0, height: 0, dpr: 1 };
    let surfaceProfile: ColorProfile = 'SRGB';

    const createSurface = () => {
      if (!ck) return;
      surface?.delete();
      // The surface uses the file's color space, so Display P3 colors keep their wider gamut.
      surfaceProfile = documentColorProfile(editor.doc);
      const colorSpace = surfaceProfile === 'DISPLAY_P3' ? ck.ColorSpace.DISPLAY_P3 : ck.ColorSpace.SRGB;
      surface = ck.MakeWebGLCanvasSurface(sceneCanvas, colorSpace) ?? ck.MakeSWCanvasSurface(sceneCanvas);
      if (!surface) setStatus({ kind: 'error', message: 'Could not create a drawing surface.' });
    };

    const renderScene = () => {
      // Changing the file's color profile recreates the surface in the new color space.
      if (surface && documentColorProfile(editor.doc) !== surfaceProfile) createSurface();
      if (!surface || !renderer) return;
      const v = editor.state.viewport;
      try {
        renderer.render(
          surface.getCanvas(),
          editor.doc,
          editor.scene,
          editor.pageId,
          { ...v, ...size },
          { ...outlinesRef.current, cropping: editor.state.getSnapshot().croppingId, colorProfile: surfaceProfile },
        );
        surface.flush();
      } catch (error) {
        console.error('Openframe: scene render failed', error);
      }
    };

    // The eyedropper reads the scene color under a point. WebGL does not preserve the drawing
    // buffer between frames, so the scene is rendered and read back in the same task.
    editor.setCanvasSampler((screen) => {
      if (!surface || !renderer || !ck) return null;
      const x = Math.floor(screen.x * size.dpr);
      const y = Math.floor(screen.y * size.dpr);
      if (x < 0 || y < 0 || x >= sceneCanvas.width || y >= sceneCanvas.height) return null;
      renderScene();
      const image = surface.makeImageSnapshot([x, y, x + 1, y + 1]);
      const pixel = image.readPixels(0, 0, {
        width: 1,
        height: 1,
        colorType: ck.ColorType.RGBA_8888,
        alphaType: ck.AlphaType.Unpremul,
        colorSpace: surfaceProfile === 'DISPLAY_P3' ? ck.ColorSpace.DISPLAY_P3 : ck.ColorSpace.SRGB,
      }) as Uint8Array | null;
      image.delete();
      return pixel ? { r: pixel[0]! / 255, g: pixel[1]! / 255, b: pixel[2]! / 255, a: 1 } : null;
    });

    const draw = () => {
      frame = 0;
      if (disposed) return;
      renderScene();
      drawOverlay(overlay, {
        editor,
        theme: themeRef.current === 'dark' ? DARK_CHROME : LIGHT_CHROME,
        marquee: tools.moveTool.marquee ?? tools.textTool.draftRect,
        connectDrag: tools.moveTool.connectDrag,
        flowTagDrag: tools.moveTool.flowTagDrag,
        connectionDrag: tools.moveTool.connectionDrag,
        textEdit: editor.state.getSnapshot().textEdit ? { caretVisible } : null,
        rotation: tools.moveTool.rotationLabel,
        radiusHandles: tools.moveTool.radiusHandleView,
        radiusLabel: tools.moveTool.radiusLabel,
        arcHandles: tools.moveTool.arcHandleView,
        arcLabel: tools.moveTool.arcLabel,
        vectorLasso: tools.vectorEdit.lassoPath,
        vectorPaintHover: tools.vectorEdit.paintHover,
        vectorEraser: tools.vectorEdit.eraserTrail,
        vectorWidthHover: tools.vectorEdit.widthHoverPoint,
        vectorCutLine: tools.vectorEdit.cutLine,
        guides: tools.snapGuides,
        measurements: tools.moveTool.measurements,
        gaps: tools.moveTool.gapIndicators,
        insertion: tools.moveTool.flowInsertion ?? tools.moveTool.reorderInsertion,
        rulers: rulersRef.current,
        pixelGrid: pixelGridRef.current,
        layoutGuides: layoutGuidesRef.current,
        maskOutlines: maskOutlinesRef.current,
        eyedropper: tools.eyedropperSample,
        hoveredGuide: tools.hoveredGuide,
        width: size.width,
        height: size.height,
        dpr: size.dpr,
      });
      container.style.cursor = cursorCss(tools.cursor());
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size = { width: rect.width, height: rect.height, dpr };
      for (const c of [sceneCanvas, overlayCanvas]) {
        c.width = Math.max(1, Math.round(rect.width * dpr));
        c.height = Math.max(1, Math.round(rect.height * dpr));
      }
      editor.canvasSize = { width: rect.width, height: rect.height };
      createSurface();
      schedule();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const unsubscribe = editor.onRender(schedule);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      surface?.delete();
      surface = null;
    };
    const onContextRestored = () => {
      createSurface();
      schedule();
    };
    sceneCanvas.addEventListener('webglcontextlost', onContextLost);
    sceneCanvas.addEventListener('webglcontextrestored', onContextRestored);

    Promise.all([loadCanvasKit(), loadBundledFonts()])
      .then(([instance, fonts]) => {
        if (disposed) return;
        ck = instance;
        renderer = new SceneRenderer(instance, editor.images);
        shaper = new TextShaper(instance, fonts);
        renderer.setTextShaper(shaper);
        // User fonts: the ones loaded at startup now, and any added later.
        const registered = new Set<string>();
        const registerUserFonts = () => {
          const added = editor.fonts.list().filter((f) => !registered.has(f.id));
          if (added.length === 0 || !shaper) return;
          for (const font of added) registered.add(font.id);
          shaper.registerFonts(added);
          addFontFaces(added);
          editor.refitText();
          editor.requestRender();
        };
        registerUserFonts();
        unsubscribeFonts = editor.fonts.subscribe(registerUserFonts);
        // The color emoji font is large, so it loads only once some text contains emoji.
        let emojiRequested = false;
        const loadEmojiWhenUsed = () => {
          if (emojiRequested) return;
          for (const node of editor.doc.nodes()) {
            if (node.type !== 'TEXT' || !containsEmoji(node.characters)) continue;
            emojiRequested = true;
            loadEmojiFont()
              .then((font) => {
                if (disposed || !shaper) return;
                shaper.registerFallbackFonts([font]);
                editor.refitText();
                editor.requestRender();
              })
              .catch((error: unknown) => console.error(error));
            break;
          }
          if (emojiRequested) unsubscribeEmoji();
        };
        unsubscribeEmoji = editor.history.subscribe(loadEmojiWhenUsed);
        loadEmojiWhenUsed();
        // CJK characters shape with the bundled Noto Sans SC/TC/JP/KR, loading only the subsets the text needs.
        const requestedCjk = new Set<string>();
        const loadCjkWhenUsed = () => {
          for (const node of editor.doc.nodes()) {
            if (node.type !== 'TEXT' || !containsCjk(node.characters)) continue;
            loadCjkSubsets(cjkScriptFor(node.characters, node.fontName.family), node.characters, requestedCjk)
              .then((fonts) => {
                if (disposed || !shaper || fonts.length === 0) return;
                shaper.registerCjkSubsets(fonts);
                // Auto-sized boxes measured before the characters had glyphs fit them now.
                editor.refitText();
                editor.requestRender();
              })
              .catch((error: unknown) => console.error(error));
          }
        };
        unsubscribeCjk = editor.history.subscribe(loadCjkWhenUsed);
        loadCjkWhenUsed();
        // Spelling: the dictionary loads the first time text is edited with Check spelling on, and follows the preference.
        const syncSpelling = () => {
          const wanted = viewPrefs.getSnapshot().spellCheck && editor.state.getSnapshot().textEdit !== null;
          if (!viewPrefs.getSnapshot().spellCheck) {
            if (editor.spelling) editor.setSpellChecker(null);
            return;
          }
          if (!wanted || editor.spelling) return;
          loadSpellChecker()
            .then((checker) => {
              if (disposed || !viewPrefs.getSnapshot().spellCheck) return;
              editor.setSpellChecker(checker);
              setSpellingReady(true);
            })
            .catch((error: unknown) => console.error(error));
        };
        const unsubscribePrefs = viewPrefs.subscribe(syncSpelling);
        const unsubscribeState = editor.state.subscribe(syncSpelling);
        unsubscribeSpelling = () => {
          unsubscribePrefs();
          unsubscribeState();
        };
        syncSpelling();
        editor.setTextLayout(shaper);
        editor.setGeometry(renderer);
        editor.setThumbnails(renderer);
        resize();
        setStatus({ kind: 'ready' });
        precacheDeferredAssets();
      })
      .catch((error: unknown) => {
        console.error(error);
        setStatus({ kind: 'error', message: 'The rendering engine failed to load.' });
      });

    // Pointer input
    const clicks = new ClickCounter();
    const sample = (e: PointerEvent | MouseEvent, clickCount = clicks.current): Omit<PointerInfo, 'world'> => {
      const rect = overlayCanvas.getBoundingClientRect();
      return {
        screen: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        button: e.button,
        shift: e.shiftKey,
        alt: e.altKey,
        mod: IS_MAC ? e.metaKey : e.ctrlKey,
        ctrl: e.ctrlKey,
        pointerType: 'pointerType' in e ? e.pointerType : 'mouse',
        pressure: 'pressure' in e ? e.pressure : 0.5,
        clickCount,
      };
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      e.preventDefault();
      overlayCanvas.setPointerCapture(e.pointerId);
      (document.activeElement as HTMLElement | null)?.blur?.();
      tools.pointerDown(sample(e, clicks.press(e.clientX, e.clientY, e.timeStamp, e.button)));
      // Clicks inside the text being edited keep keyboard input going to it.
      if (editor.state.getSnapshot().textEdit) textInput.focus({ preventScroll: true });
      schedule();
    };

    // Text editing input: a hidden textarea receives typing, IME composition and clipboard events.
    const syncTextInput = () => {
      const textEdit = editor.state.getSnapshot().textEdit;
      if (textEdit !== lastTextEdit) {
        caretVisible = true;
        lastTextEdit = textEdit;
        schedule();
      }
      // The link editor's address field takes keyboard input while it is open.
      if (textEdit && !editor.state.getSnapshot().linkEditing && document.activeElement !== textInput) textInput.focus({ preventScroll: true });
      if (!textEdit && document.activeElement === textInput) textInput.blur();
      // Keep the textarea at the caret so IME candidate windows appear next to it.
      const target = textEdit && textEditTarget(editor);
      if (target && editor.textLayout) {
        const c = editor.textLayout.caretAt(target.node, target.selection.focus);
        const p = worldToScreen(editor.state.viewport, apply(editor.scene.worldTransform(target.node.id), { x: c.x, y: c.top }));
        textInput.style.transform = `translate(${Math.round(p.x)}px, ${Math.round(p.y)}px)`;
      }
    };
    const unsubscribeText = editor.state.subscribe(syncTextInput);
    const blink = window.setInterval(() => {
      if (!editor.state.getSnapshot().textEdit) return;
      caretVisible = !caretVisible;
      schedule();
    }, 530);
    const onBeforeInput = (e: InputEvent) => {
      if (e.isComposing || !editor.state.getSnapshot().textEdit) return;
      e.preventDefault();
      switch (e.inputType) {
        case 'insertText':
        case 'insertReplacementText':
          insertText(editor, e.data ?? e.dataTransfer?.getData('text/plain') ?? '', { smartSymbols: viewPrefs.getSnapshot().smartSymbols });
          break;
        case 'insertLineBreak':
        case 'insertParagraph':
          insertText(editor, '\n');
          break;
        case 'deleteContentBackward':
          deleteText(editor, 'backward');
          break;
        case 'deleteWordBackward':
          deleteText(editor, 'backward', 'word');
          break;
        case 'deleteSoftLineBackward':
        case 'deleteHardLineBackward':
          deleteText(editor, 'backward', 'paragraph');
          break;
        case 'deleteContentForward':
          deleteText(editor, 'forward');
          break;
        case 'deleteWordForward':
          deleteText(editor, 'forward', 'word');
          break;
        case 'deleteSoftLineForward':
        case 'deleteHardLineForward':
          deleteText(editor, 'forward', 'paragraph');
          break;
        case 'historyUndo':
          undoTextEdit(editor);
          break;
        case 'historyRedo':
          redoTextEdit(editor);
          break;
      }
      schedule();
    };
    const onCompositionEnd = (e: CompositionEvent) => {
      if (e.data) insertText(editor, e.data);
      textInput.value = '';
      schedule();
    };
    // ⇧⌘V pastes as plain text: a pasted address then isn't turned into a link.
    let plainPaste = false;
    const onTextKeyDown = (e: KeyboardEvent) => {
      if (!editor.state.getSnapshot().textEdit || e.isComposing) return;
      plainPaste = e.code === 'KeyV' && e.shiftKey && (IS_MAC ? e.metaKey : e.ctrlKey);
      // An open emoji list takes ↑/↓, Return, Tab and Esc.
      if (emojiSuggest.handleKey(e, editor)) {
        schedule();
        return;
      }
      if (onTextFormatKey(e)) {
        schedule();
        return;
      }
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      const extend = e.shiftKey;
      const word = IS_MAC ? e.altKey : e.ctrlKey;
      const move = (m: CaretMove, w = false) => {
        e.preventDefault();
        moveTextCaret(editor, m, { extend, word: w });
        schedule();
      };
      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          e.stopPropagation();
          endTextEdit(editor);
          schedule();
          return;
        case 'ArrowLeft':
          return IS_MAC && e.metaKey ? move('lineStart') : move('left', word);
        case 'ArrowRight':
          return IS_MAC && e.metaKey ? move('lineEnd') : move('right', word);
        case 'ArrowUp':
          return IS_MAC && e.metaKey ? move('textStart') : move('up');
        case 'ArrowDown':
          return IS_MAC && e.metaKey ? move('textEnd') : move('down');
        case 'Home':
          return move(e.ctrlKey ? 'textStart' : 'lineStart');
        case 'End':
          return move(e.ctrlKey ? 'textEnd' : 'lineEnd');
        case 'Tab':
          e.preventDefault();
          // In a list, Tab and ⇧Tab change the indentation; elsewhere Tab types a tab.
          if (!indentListItem(editor, e.shiftKey ? -1 : 1) && !e.shiftKey) insertText(editor, '\t');
          schedule();
          return;
        // Handled here rather than in beforeinput: WebKit fires no beforeinput when the hidden textarea is empty.
        case 'Backspace':
        case 'Delete': {
          e.preventDefault();
          const unit = IS_MAC ? (e.metaKey ? 'paragraph' : e.altKey ? 'word' : 'grapheme') : e.ctrlKey ? 'word' : 'grapheme';
          deleteText(editor, e.key === 'Backspace' ? 'backward' : 'forward', unit);
          schedule();
          return;
        }
      }
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'a') {
        e.preventDefault();
        selectAllText(editor);
      } else if (key === 'b' || key === 'i') {
        // Bold / italic on the selected characters (or the whole layer with a caret).
        e.preventDefault();
        const target = textEditTarget(editor);
        if (target && !editor.history.inTransaction) {
          const axis = key === 'b' ? 'bold' : 'italic';
          editor.history.run(axis === 'bold' ? 'Bold' : 'Italic', (tx) => toggleFontStyle(tx, target.node, axis, editor.textLayout?.availableFonts() ?? [], textStyleRange(editor, target.node.id)));
        }
      } else if (key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redoTextEdit(editor);
        else undoTextEdit(editor);
      } else if (key === 'y' && !IS_MAC) {
        e.preventDefault();
        redoTextEdit(editor);
      }
      schedule();
    };
    /**
     * Formatting shortcuts while editing, applied to the selected characters (or the whole layer with
     * a caret): underline (⌥U / Ctrl+U), strikethrough (⇧⌘X), and font size, weight, letter spacing
     * and line height steps on , and . (matched by physical key, since modifiers change `key`).
     */
    const onTextFormatKey = (e: KeyboardEvent): boolean => {
      const target = textEditTarget(editor);
      if (!target || editor.history.inTransaction) return false;
      const mod = IS_MAC ? e.metaKey : e.ctrlKey;
      const range = textStyleRange(editor, target.node.id);
      const run = (label: string, apply: (tx: Transaction) => void) => {
        e.preventDefault();
        editor.history.run(label, apply);
        return true;
      };
      if (e.code === 'KeyU' && mod && e.shiftKey && !e.altKey) {
        e.preventDefault();
        openLinkEditor(editor);
        return true;
      }
      if (e.code === 'KeyU' && (IS_MAC ? e.altKey && !e.metaKey && !e.ctrlKey : e.ctrlKey && !e.altKey) && !e.shiftKey) {
        return run('Underline', (tx) => toggleTextDecoration(tx, target.node, 'UNDERLINE', range));
      }
      if (e.code === 'KeyX' && mod && e.shiftKey && !e.altKey) return run('Strikethrough', (tx) => toggleTextDecoration(tx, target.node, 'STRIKETHROUGH', range));
      // Lists: ⌘⇧8 bullets (also ⌥8 on macOS), ⌘⇧7 numbers, ⌘] / ⌘[ indentation of list items.
      if ((mod && e.shiftKey && !e.altKey && (e.code === 'Digit8' || e.code === 'Digit7')) || (IS_MAC && e.altKey && !mod && !e.shiftKey && e.code === 'Digit8')) {
        e.preventDefault();
        toggleList(editor, e.code === 'Digit7' ? 'ORDERED' : 'UNORDERED');
        return true;
      }
      if (mod && !e.altKey && !e.shiftKey && (e.code === 'BracketRight' || e.code === 'BracketLeft')) {
        if (!indentListItem(editor, e.code === 'BracketRight' ? 1 : -1)) return false;
        e.preventDefault();
        return true;
      }
      if (e.code !== 'Period' && e.code !== 'Comma') return false;
      const direction = e.code === 'Period' ? 1 : -1;
      const property =
        mod && e.shiftKey && !e.altKey ? 'fontSize' : mod && e.altKey && !e.shiftKey ? 'fontWeight' : !mod && e.altKey && e.shiftKey ? 'lineHeight' : !mod && e.altKey ? 'letterSpacing' : null;
      if (!property) return false;
      const context = { fonts: editor.textLayout?.availableFonts() ?? [], autoLineHeight: (size: number) => autoLineHeight(editor, size) };
      return run('Change text', (tx) => stepTextProperty(tx, target.node, property, direction, context, range));
    };
    const onTextCopy = (e: ClipboardEvent) => {
      if (!editor.state.getSnapshot().textEdit) return;
      e.preventDefault();
      e.clipboardData?.setData('text/plain', selectedText(editor));
      if (e.type === 'cut') {
        deleteText(editor, 'backward');
        schedule();
      }
    };
    const onTextPaste = (e: ClipboardEvent) => {
      if (!editor.state.getSnapshot().textEdit) return;
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const plain = plainPaste;
      plainPaste = false;
      // Pasting an address over selected characters links them instead of replacing them.
      const textEdit = editor.state.getSnapshot().textEdit;
      const url = !plain && textEdit && textEdit.anchor !== textEdit.focus ? pastedUrl(text) : null;
      if (!url || !applyLink(editor, url)) insertText(editor, text);
      schedule();
    };
    textInput.addEventListener('beforeinput', onBeforeInput);
    textInput.addEventListener('compositionend', onCompositionEnd);
    textInput.addEventListener('keydown', onTextKeyDown);
    textInput.addEventListener('copy', onTextCopy);
    textInput.addEventListener('cut', onTextCopy);
    textInput.addEventListener('paste', onTextPaste);
    const onPointerMove = (e: PointerEvent) => {
      const events = e.getCoalescedEvents?.() ?? [];
      tools.pointerMove(sample(events.at(-1) ?? e));
      schedule();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (overlayCanvas.hasPointerCapture(e.pointerId)) overlayCanvas.releasePointerCapture(e.pointerId);
      tools.pointerUp(sample(e));
      schedule();
    };
    const onPointerLeave = () => {
      if (!tools.tool.active) editor.state.setHover(null);
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = overlayCanvas.getBoundingClientRect();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? rect.height : 1;
      tools.wheel({
        screen: { x: e.clientX - rect.left, y: e.clientY - rect.top },
        deltaX: e.deltaX * unit,
        deltaY: e.deltaY * unit,
        ctrlOrMeta: e.ctrlKey || e.metaKey,
        shift: e.shiftKey,
      });
    };
    /** The misspelled word at a world point in the text being edited, with up to five suggestions. */
    const spellingAt = (world: Vec2): CanvasContextMenu['spelling'] => {
      const target = textEditTarget(editor);
      const checker = editor.spelling;
      if (!target || !checker || !editor.textLayout) return undefined;
      const local = editor.scene.toLocal(target.node.id, world);
      if (!local) return undefined;
      const word = misspelledWordAt(target.node.characters, editor.textLayout.offsetAt(target.node, local), checker);
      return word ? { start: word.start, end: word.end, suggestions: checker.suggest(word.word).slice(0, 5) } : undefined;
    };
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (tools.tool.active) return;
      tools.contextSelect(sample(e));
      const world = tools.toPointer(sample(e)).world;
      contextMenuRef.current?.({ x: e.clientX, y: e.clientY, layers: tools.layersUnder(sample(e)), world, spelling: spellingAt(world) });
      schedule();
    };

    overlayCanvas.addEventListener('pointerdown', onPointerDown);
    overlayCanvas.addEventListener('pointermove', onPointerMove);
    overlayCanvas.addEventListener('pointerup', onPointerUp);
    overlayCanvas.addEventListener('pointercancel', onPointerUp);
    overlayCanvas.addEventListener('pointerleave', onPointerLeave);
    overlayCanvas.addEventListener('wheel', onWheel, { passive: false });
    overlayCanvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
      unsubscribe();
      sceneCanvas.removeEventListener('webglcontextlost', onContextLost);
      sceneCanvas.removeEventListener('webglcontextrestored', onContextRestored);
      overlayCanvas.removeEventListener('pointerdown', onPointerDown);
      overlayCanvas.removeEventListener('pointermove', onPointerMove);
      overlayCanvas.removeEventListener('pointerup', onPointerUp);
      overlayCanvas.removeEventListener('pointercancel', onPointerUp);
      overlayCanvas.removeEventListener('pointerleave', onPointerLeave);
      overlayCanvas.removeEventListener('wheel', onWheel);
      overlayCanvas.removeEventListener('contextmenu', onContextMenu);
      editor.setCanvasSampler(null);
      unsubscribeText();
      window.clearInterval(blink);
      textInput.removeEventListener('beforeinput', onBeforeInput);
      textInput.removeEventListener('compositionend', onCompositionEnd);
      textInput.removeEventListener('keydown', onTextKeyDown);
      textInput.removeEventListener('copy', onTextCopy);
      textInput.removeEventListener('cut', onTextCopy);
      textInput.removeEventListener('paste', onTextPaste);
      editor.setTextLayout(null);
      editor.setGeometry(null);
      editor.setThumbnails(null);
      unsubscribeFonts();
      unsubscribeEmoji();
      unsubscribeCjk();
      unsubscribeSpelling();
      editor.setSpellChecker(null);
      renderer?.dispose();
      shaper?.dispose();
      surface?.delete();
    };
  }, [editor, tools]);

  return (
    <div
      ref={containerRef}
      className={styles.host}
      data-testid="canvas"
      data-canvas-host=""
      data-ready={status.kind === 'ready' || undefined}
      data-spelling={spellingReady || undefined}
      data-keyboard-box={keyboardBox !== null || undefined}
    >
      <canvas ref={sceneRef} className={styles.layer} aria-hidden="true" />
      <canvas ref={overlayRef} className={styles.layer} role="application" aria-label="Design canvas" aria-roledescription="canvas" tabIndex={-1} />
      <textarea
        ref={textInputRef}
        className={styles.textInput}
        aria-label="Text editor"
        data-testid="text-input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        tabIndex={-1}
      />
      {status.kind === 'error' && (
        <div className={styles.message} role="alert">
          {status.message}
        </div>
      )}
    </div>
  );
}
