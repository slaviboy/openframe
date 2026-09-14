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

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import type { PresentationSession } from '@/app/present';
import { evaluateEasing, type Easing } from '@/core/anim/easing';
import type { Id } from '@/core/ids/ids';
import type { Rect } from '@/core/math/rect';
import { flowsOf, overlaySettings } from '@/core/prototype/flows';
import {
  beginTemporary,
  delayedReactions,
  endTemporary,
  findReaction,
  hitTest,
  hotspots,
  keyReaction,
  mediaHitReached,
  mediaReactions,
  presentableFrames,
  runReaction,
  shownFrames,
  startPlayer,
  stepScreen,
  type PlayerEffect,
  type PlayerState,
  type PlayerStep,
} from '@/core/prototype/player';
import { composeScene, frameAtPoint, layerRects, SCALING_LABELS, SCALING_MODES, screenArea, scrollOffsetOf, type DeviceScreen, type PresentedScene, type ScalingMode } from '@/core/prototype/presentation';
import { deviceLayout, effectiveDevice, type PrototypeDevice } from '@/core/prototype/device';
import { MOBILE_DEVICE_CATEGORIES } from '@/core/document/frame-presets';
import type { Size } from '@/core/schema/document';

type DevicePreset = Extract<PrototypeDevice, { kind: 'PRESET' }>;

/** The device laid out in the window, if the prototype plays in one. */
const deviceScreenIn = (device: DevicePreset | null, viewport: Size): DeviceScreen | null => (device ? { name: device.preset.name, ...deviceLayout(device, viewport) } : null);

/** How far a screen of `size` scrolls in the window or its device. */
function screenScrollLimit(state: { readonly viewport: Size; readonly scaling: ScalingMode; readonly deviceScaling: ScalingMode | null; readonly device: DevicePreset | null }, size: Size): number {
  const { scale, area } = screenArea(state.deviceScaling ?? state.scaling, state.viewport, size, deviceScreenIn(state.device, state.viewport));
  return Math.max(0, size.height * scale - area.height) / scale;
}
import { toEasing, topLevelFrame, transitionDurationMs } from '@/core/prototype/reactions';
import { clampScroll, scrolledFrameStore, scrollFrameOf, scrollLimits, sharedScrollOffsets, wheelScrollTarget } from '@/core/prototype/scroll';
import type { Vec2 } from '@/core/math/vec';
import { SceneIndex } from '@/core/scene/scene-index';
import { buildRuntime, type RuntimeDocument } from '@/editor/prototype-runtime';
import { NO_VARIABLES } from '@/core/prototype/variables-runtime';
import type { Reaction, SceneNode } from '@/core/schema/document';
import { Menu, type MenuEntry } from '../primitives/Menu';
import type { Box } from '../primitives/position';
import { PresentationRenderer } from './presentation-renderer';
import styles from './PresentationView.module.css';

/** How long hotspot hints show after a click that misses every hotspot. */
const HINT_MS = 600;
/** How far the pointer moves while pressed before it's a drag. */
const DRAG_THRESHOLD = 5;
const MODIFIER_CODES: ReadonlySet<string> = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight']);
const CLOSE_OVERLAY: Reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'CLOSE' }] };

interface Playing {
  readonly effect: Extract<PlayerEffect, { type: 'transition' }>;
  readonly start: number;
  readonly duration: number;
  readonly easing: Easing | null;
}

interface Scrolling {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly duration: number;
  readonly easing: Easing | null;
}

interface Press {
  readonly chain: readonly Id[];
  readonly x: number;
  readonly y: number;
  dragged: boolean;
  /** A finger on a touch screen: dragging scrolls. */
  readonly touch: boolean;
  last: Vec2;
}

export interface PresentationViewProps {
  readonly session: PresentationSession;
  readonly startNodeId: Id | null;
  /**
   * Inline preview in the editor: compact chrome, keys only while the preview has focus, following edits to the
   * document and the frame selected on the canvas.
   */
  readonly inline?: { readonly onClose: () => void; readonly onOpenPresentation: (frameId: Id | null) => void } | undefined;
}

/**
 * Presentation view: plays the prototype of a page. Hotspots respond to their triggers, After delay and Keyboard
 * interactions run, and transitions animate. The toolbar shows and hides the flows sidebar and holds the options
 * (hotspot hints and scaling) and fullscreen; the footer moves between screens and restarts the flow (R).
 */
export function PresentationView({ session, startNodeId, inline }: PresentationViewProps) {
  const { editor } = session;
  const inlineMode = inline !== undefined;
  // Interactive components play in a copy of the document with the variants they switched to.
  const [runtime, setRuntime] = useState<RuntimeDocument | null>(null);
  const doc = runtime?.doc ?? editor.doc;
  const sceneIndex = runtime?.index ?? editor.scene;
  const pageId = editor.pageId;
  // Read each render: the inline preview follows edits to the document.
  const [, setRevision] = useState(0);
  const flows = flowsOf(doc, pageId);
  const screens = presentableFrames(doc, pageId);
  const rootRef = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(false);
  const page = doc.get(pageId);
  // The prototype settings: the background behind the prototype, and the device it plays in (inline, only phones, tablets and watches).
  const background = page?.type === 'PAGE' ? (page.prototypeBackground ?? page.backgroundColor) : { r: 0.12, g: 0.12, b: 0.12, a: 1 };
  const resolvedDevice = effectiveDevice(doc, pageId);
  const device = resolvedDevice.kind === 'PRESET' && (!inlineMode || MOBILE_DEVICE_CATEGORIES.has(resolvedDevice.preset.category)) ? resolvedDevice : null;
  // Custom size and Presentation fit the prototype to the window.
  const deviceScaling: ScalingMode | null = !inlineMode && (resolvedDevice.kind === 'CUSTOM' || resolvedDevice.kind === 'PRESENTATION') ? 'FILL' : null;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [start, setStart] = useState<Id | null>(startNodeId ?? flows[0]?.nodeId ?? null);
  const [player, setPlayer] = useState<PlayerState | null>(() => startPlayer(doc, pageId, startNodeId ?? flows[0]?.nodeId ?? null));
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scaling, setScaling] = useState<ScalingMode>('FIT');
  const [showHints, setShowHints] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<Box | null>(null);
  const [screenBox, setScreenBox] = useState<Rect | null>(null);
  /** The scrolled frames and their offsets, as "name:x,y" (shown on the stage for tests and assistive tools). */
  const [scrollLabel, setScrollLabel] = useState('');
  /** Instances interactive components switched, as "instance=variant" (shown on the stage for tests). */
  const [variantLabel, setVariantLabel] = useState('');
  /** Variables set while playing, as "name=value" (shown on the stage for tests). */
  const [variableLabel, setVariableLabel] = useState('');
  /** The video fills shown, as "layer=playing" or "layer=paused" (shown on the stage for tests). */
  const [videoLabel, setVideoLabel] = useState('');
  /** How many animated GIFs of the frames shown are playing (shown on the stage for tests). */
  const [gifLabel, setGifLabel] = useState('0');
  const closeMenu = () => setMenuAnchor(null);

  // Mutable playback state the draw loop and input handlers share.
  const live = useRef({
    player,
    renderer: null as PresentationRenderer | null,
    viewport: { width: 0, height: 0 },
    playing: null as Playing | null,
    scrollY: 0,
    scrolling: null as Scrolling | null,
    /** Scroll offsets of the frames that scroll (kept when leaving a screen, so returning shows it scrolled as it was). */
    frameScroll: new Map<Id, Vec2>(),
    nestedScrolling: null as { frameId: Id; from: Vec2; to: Vec2; start: number; duration: number; easing: Easing | null } | null,
    hintRects: [] as Rect[],
    hintsUntil: 0,
    press: null as Press | null,
    hoverChain: [] as readonly Id[],
    scene: null as PresentedScene | null,
    scaling,
    showHints,
    follow,
    device: null as DevicePreset | null,
    runtime: null as RuntimeDocument | null,
    /** Instances interactive components switched, and the variant each shows. */
    variantChanges: new Map<Id, Id>(),
    variantLabel: '',
    variableLabel: '',
    videoLabel: '',
    gifLabel: '0',
    deviceScaling: null as ScalingMode | null,
    frame: 0,
    box: '',
    scrollLabel: '',
  });
  const drawRef = useRef<() => void>(() => {});

  const schedule = useCallback(() => {
    const state = live.current;
    if (!state.frame) state.frame = requestAnimationFrame(() => drawRef.current());
  }, []);

  /** Applies a step of the player: its state, and its effects (transitions, scrolling, links). */
  const apply = useCallback(
    (step: PlayerStep) => {
      const state = live.current;
      const now = performance.now();
      let rebuild = false;
      for (const effect of step.effects) {
        if (effect.type === 'transition') {
          const duration = transitionDurationMs(effect.transition);
          state.playing = duration > 0 ? { effect, start: now, duration, easing: effect.transition.type === 'INSTANT' ? null : toEasing(effect.transition.easing) } : null;
          if (!effect.overlay) {
            state.scrollY = 0;
            state.scrolling = null;
          }
          if (effect.resetScroll) {
            for (const id of [...state.frameScroll.keys()]) if (topLevelFrame(doc, id) === effect.to) state.frameScroll.delete(id);
          } else if (effect.from && !effect.overlay) {
            // State sharing: a matching destination takes the scroll positions of the frame left.
            for (const [id, offset] of sharedScrollOffsets(doc, sceneIndex, effect.from, effect.to, state.frameScroll)) state.frameScroll.set(id, offset);
          }
          if (effect.resetVideo) state.renderer?.resetVideos(effect.to);
        } else if (effect.type === 'media') {
          state.renderer?.controlVideo(effect.nodeId, effect.action, effect.amount);
        } else if (effect.type === 'changeTo') {
          // Interactive components: the instance switches variant in the prototype's copy of the document (the file isn't changed).
          state.variantChanges.set(effect.instanceId, effect.variantId);
          rebuild = true;
        } else if (effect.type === 'openUrl') {
          window.open(effect.url, '_blank', 'noopener,noreferrer');
        } else if (effect.type === 'scrollTo' && scrollFrameOf(doc, effect.nodeId)) {
          // Scroll to a layer in a scrolling frame: that frame scrolls to bring it to its top-left.
          const frameId = scrollFrameOf(doc, effect.nodeId)!;
          const frameBounds = sceneIndex.worldBounds(frameId);
          const nodeBounds = sceneIndex.worldBounds(effect.nodeId);
          if (frameBounds && nodeBounds) {
            const to = clampScroll({ x: nodeBounds.x - frameBounds.x, y: nodeBounds.y - frameBounds.y }, scrollLimits(doc, sceneIndex, frameId));
            const from = state.frameScroll.get(frameId) ?? { x: 0, y: 0 };
            const duration = transitionDurationMs(effect.transition);
            if (duration > 0 && effect.transition.type !== 'INSTANT') state.nestedScrolling = { frameId, from, to, start: now, duration, easing: toEasing(effect.transition.easing) };
            else state.frameScroll.set(frameId, to);
          }
        } else if (effect.type === 'scrollTo' && step.state) {
          const offset = scrollOffsetOf(sceneIndex, step.state.frameId, effect.nodeId);
          const node = doc.get(step.state.frameId) as SceneNode | undefined;
          if (offset !== null && node) {
            const to = Math.min(Math.max(0, offset), screenScrollLimit(state, node.size));
            const duration = transitionDurationMs(effect.transition);
            state.scrolling = duration > 0 && effect.transition.type !== 'INSTANT' ? { from: state.scrollY, to, start: now, duration, easing: toEasing(effect.transition.easing) } : null;
            if (!state.scrolling) state.scrollY = to;
          }
        }
      }
      // Switched variants and variables set play in a copy of the document with those changes (bound layers follow).
      if (rebuild || step.state.variables !== state.player?.variables) {
        const next = buildRuntime(editor.doc, pageId, { variants: [...state.variantChanges], variables: step.state.variables ?? NO_VARIABLES }, editor.textLayout);
        state.runtime = next;
        state.renderer?.setDocument(next);
        setRuntime(next);
      }
      // Follow prototype: the canvas selection follows the screen the preview shows.
      if (state.follow && step.state && step.state.frameId !== state.player?.frameId) editor.state.select([step.state.frameId]);
      state.player = step.state;
      setPlayer(step.state);
      schedule();
    },
    [doc, editor, pageId, sceneIndex, schedule],
  );

  const run = useCallback(
    (reaction: Reaction, hotspotId: Id | null = null) => {
      const current = live.current.player;
      if (current) apply(runReaction(doc, current, reaction, hotspotId));
    },
    [apply, doc],
  );

  const restartAt = useCallback(
    (nodeId: Id | null) => {
      const next = startPlayer(doc, pageId, nodeId);
      const state = live.current;
      state.playing = null;
      state.scrolling = null;
      state.scrollY = 0;
      // Restarting resets interactive components to their variants in the file.
      if (state.runtime) {
        state.runtime = null;
        state.variantChanges.clear();
        state.renderer?.setDocument(null);
        setRuntime(null);
      }
      setStart(nodeId);
      if (next) apply({ state: next, effects: [] });
    },
    [apply, doc, pageId],
  );

  const step = useCallback(
    (delta: 1 | -1) => {
      const current = live.current.player;
      const next = current && stepScreen(doc, current, delta);
      if (next) apply(next);
    },
    [apply, doc],
  );

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  useEffect(() => {
    const state = live.current;
    state.scaling = scaling;
    state.showHints = showHints;
    state.follow = follow;
    state.device = device;
    state.deviceScaling = deviceScaling;
    schedule();
  }, [scaling, showHints, follow, device, deviceScaling, schedule]);

  // Inline preview: edits redraw the frames, and selecting another frame on the canvas jumps to it.
  useEffect(() => {
    if (!inlineMode) return;
    const offHistory = editor.history.subscribe((change) => {
      if (change.source === 'preview') return;
      // Edits start interactive components over from the file.
      live.current.runtime = null;
      live.current.variantChanges.clear();
      setRuntime(null);
      live.current.renderer?.setDocument(null);
      const current = live.current.player;
      if (current && !doc.has(current.frameId)) restartAt(null);
      setRevision((revision) => revision + 1);
    });
    let lastFrame: Id | null = null;
    const offState = editor.state.subscribe(() => {
      const selected = editor.selection[0];
      const frame = selected ? topLevelFrame(doc, selected) : null;
      if (!frame || frame === lastFrame) return;
      lastFrame = frame;
      if (live.current.player?.frameId !== frame) restartAt(frame);
    });
    return () => {
      offHistory();
      offState();
    };
  }, [inlineMode, editor, doc, restartAt]);

  useEffect(() => {
    drawRef.current = () => {
      const state = live.current;
      state.frame = 0;
      const current = state.player;
      if (!state.renderer || !current) {
        state.renderer?.draw(null, background, []);
        return;
      }
      const now = performance.now();
      let playing = null;
      if (state.playing) {
        const t = Math.min(1, (now - state.playing.start) / state.playing.duration);
        if (t >= 1) state.playing = null;
        else playing = { effect: state.playing.effect, progress: state.playing.easing ? evaluateEasing(state.playing.easing, t) : 1 };
      }
      if (state.scrolling) {
        const t = Math.min(1, (now - state.scrolling.start) / state.scrolling.duration);
        const progress = state.scrolling.easing ? evaluateEasing(state.scrolling.easing, t) : 1;
        state.scrollY = state.scrolling.from + (state.scrolling.to - state.scrolling.from) * progress;
        if (t >= 1) state.scrolling = null;
      }
      if (state.nestedScrolling) {
        const nested = state.nestedScrolling;
        const t = Math.min(1, (now - nested.start) / nested.duration);
        const progress = nested.easing ? evaluateEasing(nested.easing, t) : 1;
        state.frameScroll.set(nested.frameId, { x: nested.from.x + (nested.to.x - nested.from.x) * progress, y: nested.from.y + (nested.to.y - nested.from.y) * progress });
        if (t >= 1) state.nestedScrolling = null;
      }
      const scene = composeScene(doc, current, state.viewport, state.deviceScaling ?? state.scaling, state.scrollY, playing, deviceScreenIn(state.device, state.viewport));
      state.scene = scene;
      // The videos of the frames shown play, and the view keeps drawing while they do.
      const videos = state.renderer.syncVideos(shownFrames(current));
      state.renderer.draw(scene, background, now < state.hintsUntil ? state.hintRects : [], state.frameScroll);
      // Animated GIFs play too (their players are made as their frames draw).
      const gifs = state.renderer.animatingGifs(shownFrames(current));
      if (videos.some((video) => video.playing) || gifs > 0) schedule();
      if (String(gifs) !== state.gifLabel) {
        state.gifLabel = String(gifs);
        setGifLabel(String(gifs));
      }
      const videoText = videos.map((video) => `${doc.get(video.nodeId)?.name ?? video.nodeId}=${video.playing ? 'playing' : 'paused'}`).join(';');
      if (videoText !== state.videoLabel) {
        state.videoLabel = videoText;
        setVideoLabel(videoText);
      }
      const label = [...state.frameScroll]
        .filter(([, offset]) => offset.x !== 0 || offset.y !== 0)
        .map(([id, offset]) => `${doc.get(id)?.name ?? id}:${Math.round(offset.x)},${Math.round(offset.y)}`)
        .join(';');
      if (label !== state.scrollLabel) {
        state.scrollLabel = label;
        setScrollLabel(label);
      }
      const variants = [...state.variantChanges].map(([instance, variant]) => `${doc.get(instance)?.name ?? instance}=${editor.doc.get(variant)?.name ?? variant}`).join(';');
      if (variants !== state.variantLabel) {
        state.variantLabel = variants;
        setVariantLabel(variants);
      }
      const variables = Object.entries(current.variables?.values ?? {})
        .map(([id, modes]) => `${editor.doc.get(id)?.name ?? id}=${Object.values(modes).map((value) => (typeof value === 'object' ? 'color' : String(value))).join('|')}`)
        .join(';');
      if (variables !== state.variableLabel) {
        state.variableLabel = variables;
        setVariableLabel(variables);
      }
      const box = `${scene.screen.x},${scene.screen.y},${scene.screen.width},${scene.screen.height}`;
      if (box !== state.box) {
        state.box = box;
        setScreenBox({ x: scene.screen.x, y: scene.screen.y, width: scene.screen.width, height: scene.screen.height });
      }
      if (state.playing || state.scrolling || state.nestedScrolling || now < state.hintsUntil + 50) schedule();
    };
  });

  // The rendering engine, sized to the stage.
  useEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;
    const state = live.current;
    // Inline, the editor keeps its own text layout.
    const renderer = new PresentationRenderer(editor, canvas, schedule, !inlineMode);
    let disposed = false;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      state.viewport = { width: rect.width, height: rect.height };
      renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
      schedule();
    };
    const observer = new ResizeObserver(resize);
    renderer.load().then(
      () => {
        if (disposed) return;
        state.renderer = renderer;
        observer.observe(container);
        resize();
        setReady(true);
      },
      (reason: unknown) => {
        console.warn(reason);
        if (!disposed) setError('The rendering engine failed to load.');
      },
    );
    return () => {
      disposed = true;
      observer.disconnect();
      if (state.frame) cancelAnimationFrame(state.frame);
      state.frame = 0;
      state.renderer = null;
      renderer.dispose();
    };
  }, [editor, schedule, inlineMode]);

  // When video hits and When video ends interactions of the frames shown run as their videos play.
  useEffect(() => {
    const renderer = live.current.renderer;
    if (!renderer) return;
    const times = new Map<string, number>();
    renderer.onVideoTime = (hash, time, ended) => {
      const current = live.current.player;
      if (!current) return;
      const previous = times.get(hash) ?? -1;
      times.set(hash, ended ? -1 : time);
      for (const found of mediaReactions(doc, current)) {
        if (found.videoHash !== hash) continue;
        const { trigger } = found.reaction;
        if (trigger.type === 'ON_MEDIA_END' ? ended : trigger.type === 'ON_MEDIA_HIT' && !ended && mediaHitReached(previous, time, trigger.mediaHitTime)) run(found.reaction, found.nodeId);
      }
    };
    return () => {
      renderer.onVideoTime = null;
    };
  }, [doc, run, ready]);

  // After delay interactions of the frames shown run once their delay passes.
  const shownKey = player ? shownFrames(player).join('|') : '';
  useEffect(() => {
    const current = live.current.player;
    if (!current || !shownKey) return;
    const timers = delayedReactions(doc, current).map(({ nodeId, reaction, timeout }) => window.setTimeout(() => run(reaction, nodeId), timeout));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [doc, run, shownKey]);

  // Keyboard interactions, and R (restart), ← and → (screens) and F (fullscreen). Inline, only while the preview has focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('[role="menu"]'))) return;
      if (MODIFIER_CODES.has(e.code) || e.repeat) return;
      const current = live.current.player;
      if (!current) return;
      const keys = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Meta', e.code].filter((key): key is string => typeof key === 'string');
      const found = keyReaction(doc, current, keys);
      if (found) {
        e.preventDefault();
        e.stopPropagation();
        run(found.reaction, found.nodeId);
        return;
      }
      if (keys.length !== 1) return;
      if (e.code === 'KeyR') restartAt(start);
      else if (e.code === 'ArrowRight') step(1);
      else if (e.code === 'ArrowLeft') step(-1);
      else if (e.code === 'KeyF' && !inlineMode) toggleFullscreen();
      else return;
      e.preventDefault();
      // Inline, the keys don't reach the editor's shortcuts.
      e.stopPropagation();
    };
    const target: HTMLElement | Window | null = inlineMode ? rootRef.current : window;
    target?.addEventListener('keydown', onKeyDown as EventListener);
    return () => target?.removeEventListener('keydown', onKeyDown as EventListener);
  }, [doc, restartAt, run, start, step, toggleFullscreen, inlineMode]);

  /** The shown frame and the layers under a pointer, hit tested where scrolled content is. */
  const locate = (e: { readonly currentTarget: Element; readonly clientX: number; readonly clientY: number }) => {
    const state = live.current;
    const rect = e.currentTarget.getBoundingClientRect();
    const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = state.scene && state.player ? frameAtPoint(state.scene, state.player, point) : null;
    if (!hit) return { point, hit, chain: [] as Id[] };
    const scrolled = [...state.frameScroll].some(([id, offset]) => (offset.x !== 0 || offset.y !== 0) && topLevelFrame(doc, id) === hit.frameId);
    if (!scrolled) return { point, hit, chain: hitTest(doc, sceneIndex, hit.frameId, hit.local) };
    const store = scrolledFrameStore(doc, hit.frameId, state.frameScroll);
    const index = new SceneIndex(store);
    index.ensure(pageId);
    return { point, hit, chain: hitTest(store, index, hit.frameId, hit.local) };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0 || !live.current.player) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // A pointer that is no longer active can't be captured.
    }
    const { point, chain } = locate(e);
    live.current.press = { chain, x: point.x, y: point.y, dragged: false, touch: e.pointerType === 'touch', last: point };
    const down = findReaction(doc, chain, 'MOUSE_DOWN');
    if (down) run(down.reaction, down.nodeId);
    const pressing = findReaction(doc, chain, 'ON_PRESS');
    const current = live.current.player;
    if (pressing && current) apply(beginTemporary(doc, current, pressing.nodeId, pressing.reaction));
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const state = live.current;
    const { point, chain } = locate(e);
    const press = state.press;
    if (press && !press.dragged && Math.hypot(point.x - press.x, point.y - press.y) > DRAG_THRESHOLD) {
      press.dragged = true;
      const drag = findReaction(doc, press.chain, 'ON_DRAG');
      if (drag) run(drag.reaction, drag.nodeId);
    }
    if (press?.touch && press.dragged) {
      // Dragging a finger scrolls the content the other way, following it.
      scrollBy(press.chain, { x: press.last.x - point.x, y: press.last.y - point.y });
      press.last = point;
    }
    const previous = state.hoverChain;
    if (previous.length === chain.length && previous.every((id, i) => id === chain[i])) return;
    state.hoverChain = chain;
    for (const id of previous.filter((candidate) => !chain.includes(candidate))) {
      const current = state.player;
      if (current?.temporary?.trigger === 'ON_HOVER' && current.temporary.nodeId === id) apply(endTemporary(current));
      const leave = findReaction(doc, [id], 'MOUSE_LEAVE');
      if (leave) run(leave.reaction, leave.nodeId);
    }
    const entered = chain.filter((candidate) => !previous.includes(candidate));
    for (const id of entered) {
      const enter = findReaction(doc, [id], 'MOUSE_ENTER');
      if (enter) run(enter.reaction, enter.nodeId);
    }
    const hover = findReaction(doc, chain, 'ON_HOVER');
    const current = state.player;
    if (hover && current && !current.temporary && entered.includes(hover.nodeId)) apply(beginTemporary(doc, current, hover.nodeId, hover.reaction));
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const state = live.current;
    const press = state.press;
    state.press = null;
    if (!press) return;
    const pressed = state.player;
    if (pressed?.temporary?.trigger === 'ON_PRESS') apply(endTemporary(pressed));
    const { hit, chain } = locate(e);
    const up = findReaction(doc, chain, 'MOUSE_UP');
    if (up) run(up.reaction, up.nodeId);
    if (press.dragged) return;
    const click = findReaction(doc, chain, 'ON_CLICK');
    if (click) {
      run(click.reaction, click.nodeId);
      return;
    }
    const current = state.player;
    const top = current?.overlays.at(-1);
    if (current && top && hit?.frameId !== top && overlaySettings(doc.get(top) as SceneNode | undefined).closeOnClickOutside) {
      apply(runReaction(doc, current, CLOSE_OVERLAY));
      return;
    }
    // A click that misses every hotspot shows where they are.
    if (current && state.showHints && state.scene) {
      const scene = state.scene;
      state.hintRects = shownFrames(current).flatMap((frameId) => layerRects(sceneIndex, scene, frameId, hotspots(doc, frameId)));
      state.hintsUntil = performance.now() + HINT_MS;
      schedule();
    }
  };

  const onWheel = (e: ReactWheelEvent) => scrollBy(locate(e).chain, { x: e.deltaX, y: e.deltaY });

  /** Scrolls by a distance on screen: the deepest frame of the layers under the pointer that scrolls and has room to move that way, or else a screen taller than the window. */
  function scrollBy(chain: readonly Id[], screenDelta: Vec2): void {
    const state = live.current;
    const current = state.player;
    if (!current || !state.scene) return;
    const delta = { x: screenDelta.x / state.scene.screen.scale, y: screenDelta.y / state.scene.screen.scale };
    const target = chain.length > 0 ? wheelScrollTarget(doc, sceneIndex, [...chain], delta, state.frameScroll) : null;
    if (target) {
      const offset = state.frameScroll.get(target) ?? { x: 0, y: 0 };
      state.nestedScrolling = null;
      state.frameScroll.set(target, clampScroll({ x: offset.x + delta.x, y: offset.y + delta.y }, scrollLimits(doc, sceneIndex, target)));
      schedule();
      return;
    }
    // Otherwise a screen taller than the window scrolls.
    const node = doc.get(current.frameId) as SceneNode | undefined;
    if (!node) return;
    const limit = screenScrollLimit(state, node.size);
    if (limit <= 0) return;
    state.scrolling = null;
    state.scrollY = Math.min(limit, Math.max(0, state.scrollY + delta.y));
    schedule();
  }

  const screenIndex = player ? screens.indexOf(player.frameId) : -1;
  const nameOf = (id: Id) => doc.get(id)?.name ?? '';
  const menuEntries: MenuEntry[] = [
    { kind: 'item', id: 'hints', label: 'Show hints on click', checked: showHints, onSelect: () => setShowHints((on) => !on) },
    ...(inlineMode ? [{ kind: 'item', id: 'follow', label: 'Follow prototype', checked: follow, onSelect: () => setFollow((on) => !on) } satisfies MenuEntry] : []),
    { kind: 'separator', id: 'scaling-separator' },
    ...SCALING_MODES.map((mode): MenuEntry => ({ kind: 'item', id: mode, label: SCALING_LABELS[mode], checked: scaling === mode, onSelect: () => setScaling(mode) })),
  ];
  const optionsButton = (
    <button
      type="button"
      className={styles.button}
      aria-haspopup="menu"
      aria-expanded={menuAnchor !== null}
      data-menu-root=""
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setMenuAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
      }}
    >
      Options
    </button>
  );

  return (
    <div ref={rootRef} className={inlineMode ? styles.inlineRoot : styles.root} {...(inlineMode ? { role: 'region', 'aria-label': 'Preview', tabIndex: 0 } : {})}>
      {inline && (
        <header className={styles.toolbar}>
          <span className={styles.title}>{player ? nameOf(player.frameId) : 'Preview'}</span>
          <button type="button" className={styles.button} onClick={() => restartAt(start)}>
            Restart
          </button>
          {optionsButton}
          <button type="button" className={styles.button} aria-label="Open in presentation view" title="Open in presentation view" onClick={() => inline.onOpenPresentation(player?.frameId ?? null)}>
            ↗
          </button>
          <button type="button" className={styles.button} aria-label="Close preview" title="Close preview" onClick={inline.onClose}>
            ✕
          </button>
        </header>
      )}
      {!inline && <header className={styles.toolbar}>
        <button type="button" className={styles.button} aria-pressed={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}>
          Flows
        </button>
        <span className={styles.title}>
          {session.fileName}
          {player && <span className={styles.screenName}>{nameOf(player.frameId)}</span>}
        </span>
        {optionsButton}
        <button type="button" className={styles.button} onClick={toggleFullscreen}>
          Fullscreen
        </button>
      </header>}
      <div className={styles.body}>
        {sidebarOpen && !inlineMode && (
          <aside className={styles.sidebar} aria-label="Flows">
            {flows.length === 0 ? (
              <p className={styles.muted}>This page has no flows.</p>
            ) : (
              <ul className={styles.flows}>
                {flows.map((flow) => (
                  <li key={flow.nodeId}>
                    <button type="button" className={styles.flow} aria-current={start === flow.nodeId ? 'true' : undefined} onClick={() => restartAt(flow.nodeId)}>
                      <span className={styles.flowName}>{flow.name}</span>
                      {flow.description && <span className={styles.muted}>{flow.description}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        )}
        <div
          ref={containerRef}
          className={styles.stage}
          data-testid="presentation"
          data-ready={ready || undefined}
          data-screen={player ? nameOf(player.frameId) : undefined}
          data-overlays={player ? player.overlays.map(nameOf).join(',') : undefined}
          data-scroll={scrollLabel}
          data-device={device?.preset.name}
          data-variants={variantLabel}
          data-variables={variableLabel}
          data-videos={videoLabel}
          data-animated-gifs={gifLabel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (live.current.press = null)}
          onWheel={onWheel}
        >
          <canvas ref={canvasRef} className={styles.canvas} />
          {screenBox && <div className={styles.screenBox} data-testid="presentation-screen" style={{ left: screenBox.x, top: screenBox.y, width: screenBox.width, height: screenBox.height }} />}
          {!player && <p className={styles.message}>Add a frame to this page to present it.</p>}
          {error && (
            <p className={styles.message} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      <footer className={styles.footer}>
        <button type="button" className={styles.button} aria-label="Previous screen" disabled={screenIndex <= 0} onClick={() => step(-1)}>
          ←
        </button>
        <span role="status">{screenIndex >= 0 ? `${screenIndex + 1} / ${screens.length}` : ''}</span>
        <button type="button" className={styles.button} aria-label="Next screen" disabled={screenIndex < 0 || screenIndex >= screens.length - 1} onClick={() => step(1)}>
          →
        </button>
        {!inlineMode && (
          <button type="button" className={styles.button} onClick={() => restartAt(start)}>
            Restart
          </button>
        )}
      </footer>
      {menuAnchor && <Menu label="Options" entries={menuEntries} anchor={menuAnchor} placement="bottom-start" onClose={closeMenu} />}
    </div>
  );
}
