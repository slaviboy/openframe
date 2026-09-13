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

import type { CanvasKit, Surface } from 'canvaskit-wasm';
import type { Id } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import { useEffect, useRef, useState } from 'react';
import { DARK_CHROME, LIGHT_CHROME } from '@/editor/chrome/chrome-theme';
import { drawOverlay } from '@/editor/chrome/overlay-renderer';
import type { Editor } from '@/editor/editor';
import type { ToolManager } from '@/editor/tools/tool-manager';
import type { PointerInfo } from '@/editor/tools/types';
import { loadCanvasKit } from '@/engine/ck/canvaskit';
import { screenToWorld } from '@/editor/viewport/viewport';
import { SceneRenderer, type RenderOptions } from '@/engine/render/scene-renderer';
import { imageFilesOf } from '../images/import-image';
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
}

interface CanvasHostProps {
  editor: Editor;
  tools: ToolManager;
  theme: 'light' | 'dark';
  /** Show rulers and ruler guides. */
  rulers: boolean;
  /** Show the one-pixel grid at high zoom. */
  pixelGrid: boolean;
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
export function CanvasHost({ editor, tools, theme, rulers, pixelGrid, maskOutlines = false, outlines, onContextMenu, onDropFiles }: CanvasHostProps) {
  const maskOutlinesRef = useRef(maskOutlines);
  const dropRef = useRef(onDropFiles);
  const outlinesRef = useRef(outlines);
  const pixelGridRef = useRef(pixelGrid);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const themeRef = useRef(theme);
  const rulersRef = useRef(rulers);
  const contextMenuRef = useRef(onContextMenu);
  const [status, setStatus] = useState<Status>({ kind: 'loading' });

  useEffect(() => {
    contextMenuRef.current = onContextMenu;
    dropRef.current = onDropFiles;
  });

  // Dropping image files on the canvas places them at the drop point.
  useEffect(() => {
    const container = containerRef.current!;
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      const files = imageFilesOf(e.dataTransfer);
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
    maskOutlinesRef.current = maskOutlines;
    editor.requestRender();
  }, [outlines, pixelGrid, maskOutlines, editor]);

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
    let frame = 0;
    let disposed = false;
    let size = { width: 0, height: 0, dpr: 1 };

    const createSurface = () => {
      if (!ck) return;
      surface?.delete();
      surface = ck.MakeWebGLCanvasSurface(sceneCanvas) ?? ck.MakeSWCanvasSurface(sceneCanvas);
      if (!surface) setStatus({ kind: 'error', message: 'Could not create a drawing surface.' });
    };

    const renderScene = () => {
      if (!surface || !renderer) return;
      const v = editor.state.viewport;
      try {
        renderer.render(surface.getCanvas(), editor.doc, editor.scene, editor.pageId, { ...v, ...size }, { ...outlinesRef.current, cropping: editor.state.getSnapshot().croppingId });
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
      const pixel = image.readPixels(0, 0, { width: 1, height: 1, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB }) as Uint8Array | null;
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
        marquee: tools.moveTool.marquee,
        rotation: tools.moveTool.rotationLabel,
        guides: tools.snapGuides,
        measurements: tools.moveTool.measurements,
        gaps: tools.moveTool.gapIndicators,
        rulers: rulersRef.current,
        pixelGrid: pixelGridRef.current,
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

    loadCanvasKit()
      .then((instance) => {
        if (disposed) return;
        ck = instance;
        renderer = new SceneRenderer(instance, editor.images);
        resize();
        setStatus({ kind: 'ready' });
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
      schedule();
    };
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
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (tools.tool.active) return;
      tools.contextSelect(sample(e));
      contextMenuRef.current?.({ x: e.clientX, y: e.clientY, layers: tools.layersUnder(sample(e)), world: tools.toPointer(sample(e)).world });
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
      renderer?.dispose();
      surface?.delete();
    };
  }, [editor, tools]);

  return (
    <div ref={containerRef} className={styles.host} data-testid="canvas" data-canvas-host="" data-ready={status.kind === 'ready' || undefined}>
      <canvas ref={sceneRef} className={styles.layer} aria-hidden="true" />
      <canvas
        ref={overlayRef}
        className={styles.layer}
        role="application"
        aria-label="Design canvas"
        aria-roledescription="canvas"
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
