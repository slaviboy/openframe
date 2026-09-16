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
import { presentParams, presentUrl, type PresentationSession } from '@/app/present';
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
import { DRAG_FINISH_AT, dragDirection, dragProgress } from '@/core/prototype/drag-transition';
import { sharedVariants, sharedVideos } from '@/core/prototype/state-sharing';
import type { DocumentStore } from '@/core/document/store';
import { composeScene, frameAtPoint, layerRects, responsiveSize, SCALING_LABELS, SCALING_MODES, screenArea, scrollOffsetOf, type DeviceScreen, type PresentedScene, type ScalingMode } from '@/core/prototype/presentation';
import { DEVICE_FIT_LABELS, DEVICE_FITS, deviceBodyColors, deviceLayout, deviceOuterSize, deviceScreenSize, effectiveDevice, type DeviceFit, type PrototypeDevice } from '@/core/prototype/device';
import { MOBILE_DEVICE_CATEGORIES, presetsIn, type FramePreset } from '@/core/document/frame-presets';
import type { Size } from '@/core/schema/document';

type DevicePreset = Extract<PrototypeDevice, { kind: 'PRESET' }>;

/** The device laid out in the window, if the prototype plays in one. */
const deviceScreenIn = (device: DevicePreset | null, viewport: Size, fit: DeviceFit = 'FIT', frame = true, preset: FramePreset | null = null): DeviceScreen | null => {
  if (!device) return null;
  const shown = shownDevice(device, preset);
  const colors = deviceBodyColors(shown.model);
  return { name: shown.preset.name, ...deviceLayout(shown, viewport, 24, { fit, frame }), bodyColor: colors.body, edgeColor: colors.edge, frame };
};

/** The page's device as the device switcher shows it: another preset of its kind, or its own. */
const shownDevice = (device: DevicePreset, preset: FramePreset | null): DevicePreset => (preset && preset.id !== device.preset.id ? { ...device, preset } : device);

/** How far a screen of `size` scrolls in the window or its device. */
function screenScrollLimit(state: { readonly viewport: Size; readonly scaling: ScalingMode; readonly deviceScaling: ScalingMode | null; readonly device: DevicePreset | null; readonly deviceFit: DeviceFit; readonly deviceFrame: boolean; readonly devicePreset: FramePreset | null }, size: Size): number {
  const { scale, area } = screenArea(state.deviceScaling ?? state.scaling, state.viewport, size, deviceScreenIn(state.device, state.viewport, state.deviceFit, state.deviceFrame, state.devicePreset));
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
import { gamepadCode } from '@/core/prototype/gamepad';
import { useGamepadButtons } from '../hooks/useGamepadButtons';
import { AccessibilityMessage, AccessibleContent, SkipToContent } from './AccessibleContent';
import { FlowDescription } from './FlowDescription';
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
  /** An On drag transition follows the pointer: how far through it the drag is (0–1), instead of the time. */
  drag?: number;
  /** A drag let go before halfway: the transition runs back from where it was, and the player returns to `state`. */
  readonly back?: { readonly from: number; readonly state: PlayerState };
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
  /** Dragging through an On drag transition: the way it goes, and the player before it. */
  scrub?: { readonly direction: Vec2; readonly previous: PlayerState };
}

export interface PresentationViewProps {
  readonly session: PresentationSession;
  readonly startNodeId: Id | null;
  /** Presentation view opened with its toolbar, footer and flows sidebar hidden (the address's hide-ui=1). */
  readonly hideUi?: boolean | undefined;
  /**
   * Inline preview in the editor: compact chrome, keys only while the preview has focus, following edits to the
   * document and the frame selected on the canvas.
   */
  readonly inline?:
    | {
        readonly onClose: () => void;
        readonly onOpenPresentation: (frameId: Id | null) => void;
        /** The preview window's size, and resizing it (Resize window to 100%, Respect aspect ratio). */
        readonly windowSize: Size;
        readonly onResizeWindow: (size: Size) => void;
        readonly respectAspectRatio: boolean;
        readonly onRespectAspectRatio: (on: boolean) => void;
      }
    | undefined;
}

/**
 * Presentation view: plays the prototype of a page. Hotspots respond to their triggers, After delay and Keyboard
 * interactions run, and transitions animate. The toolbar shows and hides the flows sidebar and holds the options
 * (hotspot hints and scaling) and fullscreen; the footer moves between screens and restarts the flow (R).
 */
export function PresentationView({ session, startNodeId, inline, hideUi = false }: PresentationViewProps) {
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
  // The device switcher (presentation view, for this session only; the file keeps its device): a similar device, how the
  // device fits the window, and whether its frame shows.
  const [deviceChoice, setDeviceChoice] = useState<FramePreset | null>(null);
  const [deviceFit, setDeviceFit] = useState<DeviceFit>('FIT');
  const [deviceFrame, setDeviceFrame] = useState(true);
  const resolvedDevice = effectiveDevice(doc, pageId);
  const device = resolvedDevice.kind === 'PRESET' && (!inlineMode || MOBILE_DEVICE_CATEGORIES.has(resolvedDevice.preset.category)) ? resolvedDevice : null;
  const shownPreset = device && deviceChoice && !inlineMode && deviceChoice.category === device.preset.category ? deviceChoice : (device?.preset ?? null);
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
  /** Enable keyboard shortcuts: R, ← and → and F (the prototype's own Key/Gamepad interactions always run). */
  const [shortcuts, setShortcuts] = useState(true);
  /** Hide UI: no toolbar, footer or flows sidebar (presentation view only). */
  const [uiHidden, setUiHidden] = useState(hideUi && inline === undefined);
  /** Accessibility mode: the content of the frames shown as HTML for screen readers (Skip to content, or Options). */
  const [accessible, setAccessible] = useState(false);
  const [accessibleMessage, setAccessibleMessage] = useState('');
  /** The scene the accessible content is placed on, updated as the frames shown or their places change. */
  const [accessibleScene, setAccessibleScene] = useState<PresentedScene | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<Box | null>(null);
  const [shareAnchor, setShareAnchor] = useState<Box | null>(null);
  const [deviceAnchor, setDeviceAnchor] = useState<Box | null>(null);
  const inlineHeaderRef = useRef<HTMLElement>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [screenBox, setScreenBox] = useState<Rect | null>(null);
  /** The scrolled frames and their offsets, as "name:x,y" (shown on the stage for tests and assistive tools). */
  const [scrollLabel, setScrollLabel] = useState('');
  const [dragLabel, setDragLabel] = useState('');
  /** Instances interactive components switched, as "instance=variant" (shown on the stage for tests). */
  const [variantLabel, setVariantLabel] = useState('');
  /** Variables set while playing, as "name=value" (shown on the stage for tests). */
  const [variableLabel, setVariableLabel] = useState('');
  /** The video fills shown, as "layer=playing" or "layer=paused" (shown on the stage for tests). */
  const [videoLabel, setVideoLabel] = useState('');
  /** How many animated GIFs of the frames shown are playing (shown on the stage for tests). */
  const [gifLabel, setGifLabel] = useState('0');
  /** Where the overlays shown sit, as "name:x,y" relative to the screen's top-left in its units (shown on the stage for tests). */
  const [overlayOriginLabel, setOverlayOriginLabel] = useState('');
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
    /** An animated Change to: the document as it was before the switch, and how far along the switch is. */
    variantAnimation: null as { doc: DocumentStore; instanceId: Id; start: number; duration: number; easing: Easing | null; smart: boolean } | null,
    hintRects: [] as Rect[],
    hintsUntil: 0,
    press: null as Press | null,
    hoverChain: [] as readonly Id[],
    scene: null as PresentedScene | null,
    scaling,
    showHints,
    accessible,
    /** Where the accessible content was last placed (the frames drawn and their places). */
    accessibleKey: '',
    follow,
    device: null as DevicePreset | null,
    deviceFit: 'FIT' as DeviceFit,
    deviceFrame: true,
    devicePreset: null as FramePreset | null,
    /** Responsive: the screen's frame laid out at another size in the prototype's copy, and which size that was. */
    frameSizes: [] as ReadonlyArray<readonly [Id, Size]>,
    responsiveKey: '',
    runtime: null as RuntimeDocument | null,
    /** Instances interactive components switched, and the variant each shows. */
    variantChanges: new Map<Id, Id>(),
    variantLabel: '',
    variableLabel: '',
    videoLabel: '',
    gifLabel: '0',
    overlayOriginLabel: '',
    deviceScaling: null as ScalingMode | null,
    frame: 0,
    box: '',
    scrollLabel: '',
    /** Whether a drag holds a transition ('dragging') or runs it back ('returning'). */
    dragLabel: '',
  });
  const drawRef = useRef<() => void>(() => {});
  // Responsive: the screen's frame is laid out at the window's size (or its device's screen) in the prototype's copy of
  // the document, rebuilt when that size or the screen changes.
  const responsiveRef = useRef<() => void>(() => {});

  const schedule = useCallback(() => {
    const state = live.current;
    if (!state.frame) state.frame = requestAnimationFrame(() => drawRef.current());
  }, []);

  useEffect(() => {
    responsiveRef.current = () => {
      const state = live.current;
      const current = state.player;
      const frame = current ? (editor.doc.get(current.frameId) as SceneNode | undefined) : undefined;
      const on = (state.deviceScaling ?? state.scaling) === 'RESPONSIVE' && state.viewport.width > 0;
      const size = on && current && frame ? responsiveSize(state.device ? deviceScreenSize(shownDevice(state.device, state.devicePreset)) : state.viewport, frame.size) : null;
      const key = size && current ? `${current.frameId}:${size.width}x${size.height}` : '';
      if (key === state.responsiveKey) return;
      state.responsiveKey = key;
      state.frameSizes = size && current ? [[current.frameId, size]] : [];
      const next = buildRuntime(editor.doc, pageId, { variants: [...state.variantChanges], variables: current?.variables ?? NO_VARIABLES, frameSizes: state.frameSizes }, editor.textLayout);
      state.runtime = next;
      state.renderer?.setDocument(next);
      setRuntime(next);
      schedule();
    };
  });

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
          if (effect.resetComponents) {
            // Reset component state: the destination's interactive components go back to their variants in the file.
            for (const instanceId of [...state.variantChanges.keys()]) {
              if (topLevelFrame(editor.doc, instanceId) !== effect.to) continue;
              state.variantChanges.delete(instanceId);
              rebuild = true;
            }
          }
          if (effect.from && !effect.overlay) {
            // State sharing: a matching destination's interactive components and videos take the states of the frame left.
            if (!effect.resetComponents) {
              for (const [instanceId, variantId] of sharedVariants(editor.doc, effect.from, effect.to, state.variantChanges)) {
                if (state.variantChanges.get(instanceId) === variantId) continue;
                state.variantChanges.set(instanceId, variantId);
                rebuild = true;
              }
            }
            if (!effect.resetVideo) for (const pair of sharedVideos(doc, effect.from, effect.to)) state.renderer?.shareVideo(pair.from, pair.to);
          }
        } else if (effect.type === 'media') {
          state.renderer?.controlVideo(effect.nodeId, effect.action, effect.amount);
        } else if (effect.type === 'changeTo') {
          // Interactive components: the instance switches variant in the prototype's copy of the document (the file isn't changed).
          const duration = transitionDurationMs(effect.transition);
          const animated = duration > 0 && effect.transition.type !== 'INSTANT' && state.variantChanges.get(effect.instanceId) !== effect.variantId;
          // The switch animates from the copy in use now, which still shows the variant being left.
          if (animated) {
            state.variantAnimation = { doc, instanceId: effect.instanceId, start: now, duration, easing: toEasing(effect.transition.easing), smart: effect.transition.type === 'SMART_ANIMATE' };
          }
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
        const next = buildRuntime(editor.doc, pageId, { variants: [...state.variantChanges], variables: step.state.variables ?? NO_VARIABLES, frameSizes: state.frameSizes }, editor.textLayout);
        state.runtime = next;
        state.renderer?.setDocument(next);
        setRuntime(next);
      }
      // Follow prototype: the canvas selection follows the screen the preview shows.
      if (state.follow && step.state && step.state.frameId !== state.player?.frameId) editor.state.select([step.state.frameId]);
      state.player = step.state;
      setPlayer(step.state);
      responsiveRef.current();
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
      // Restarting drops the prototype's copy: Responsive lays the screen out again.
      state.responsiveKey = '';
      state.frameSizes = [];
      state.scrolling = null;
      state.scrollY = 0;
      state.variantAnimation = null;
      state.renderer?.setVariantAnimation(null);
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
    state.accessible = accessible;
    state.follow = follow;
    state.device = device;
    state.deviceScaling = deviceScaling;
    state.deviceFit = deviceFit;
    state.deviceFrame = deviceFrame;
    state.devicePreset = shownPreset;
    responsiveRef.current();
    schedule();
  }, [scaling, showHints, accessible, follow, device, deviceScaling, deviceFit, deviceFrame, shownPreset, schedule]);

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
      let current = state.player;
      if (!state.renderer || !current) {
        state.renderer?.draw(null, background, []);
        return;
      }
      const now = performance.now();
      let playing = null;
      if (state.playing) {
        const running = state.playing;
        const elapsed = Math.min(1, (now - running.start) / running.duration);
        // A drag holds the transition where the pointer is; a drag let go early runs it back.
        const t = running.drag ?? (running.back ? running.back.from * (1 - elapsed) : elapsed);
        const done = running.drag === undefined && (running.back ? t <= 0 : t >= 1);
        if (done) {
          state.playing = null;
          if (running.back) {
            current = running.back.state;
            state.player = current;
            setPlayer(current);
          }
        } else playing = { effect: running.effect, progress: running.easing ? evaluateEasing(running.easing, t) : 1 };
        const phase = running.drag !== undefined ? 'dragging' : running.back && !done ? 'returning' : '';
        if (phase !== state.dragLabel) {
          state.dragLabel = phase;
          setDragLabel(phase);
        }
      }
      if (state.scrolling) {
        const t = Math.min(1, (now - state.scrolling.start) / state.scrolling.duration);
        const progress = state.scrolling.easing ? evaluateEasing(state.scrolling.easing, t) : 1;
        state.scrollY = state.scrolling.from + (state.scrolling.to - state.scrolling.from) * progress;
        if (t >= 1) state.scrolling = null;
      }
      if (state.variantAnimation) {
        const variant = state.variantAnimation;
        const t = Math.min(1, (now - variant.start) / variant.duration);
        const progress = variant.easing ? evaluateEasing(variant.easing, t) : 1;
        state.renderer.setVariantAnimation(t >= 1 ? null : { from: variant.doc, instanceId: variant.instanceId, progress, smart: variant.smart });
        if (t >= 1) state.variantAnimation = null;
      }
      if (state.nestedScrolling) {
        const nested = state.nestedScrolling;
        const t = Math.min(1, (now - nested.start) / nested.duration);
        const progress = nested.easing ? evaluateEasing(nested.easing, t) : 1;
        state.frameScroll.set(nested.frameId, { x: nested.from.x + (nested.to.x - nested.from.x) * progress, y: nested.from.y + (nested.to.y - nested.from.y) * progress });
        if (t >= 1) state.nestedScrolling = null;
      }
      const scene = composeScene(doc, current, state.viewport, state.deviceScaling ?? state.scaling, state.scrollY, playing, deviceScreenIn(state.device, state.viewport, state.deviceFit, state.deviceFrame, state.devicePreset));
      state.scene = scene;
      // Accessibility mode places its content on the scene whenever the frames drawn or their places change.
      if (state.accessible) {
        const key = scene.items.map((item) => (item.kind === 'frame' ? `${item.frameId}@${Math.round(item.x)},${Math.round(item.y)},${Math.round(item.width)}` : item.kind)).join('|');
        if (key !== state.accessibleKey) {
          state.accessibleKey = key;
          setAccessibleScene(scene);
        }
      }
      const origins = scene.items
        .flatMap((item) =>
          item.kind === 'frame' && current.overlays.includes(item.frameId)
            ? [`${doc.get(item.frameId)?.name ?? item.frameId}:${Math.round((item.x - scene.screen.x) / scene.screen.scale)},${Math.round((item.y - scene.screen.y) / scene.screen.scale)}`]
            : [],
        )
        .join(';');
      if (origins !== state.overlayOriginLabel) {
        state.overlayOriginLabel = origins;
        setOverlayOriginLabel(origins);
      }
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
      if (state.playing || state.scrolling || state.nestedScrolling || state.variantAnimation || now < state.hintsUntil + 50) schedule();
    };
  });

  // A new copy of the document (variants switched, variables set, a responsive layout) is drawn once the view uses it:
  // a draw asked for while it was being built would still lay out the previous one.
  useEffect(() => {
    schedule();
  }, [runtime, schedule]);

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
      responsiveRef.current();
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

  // The accessibility message dismisses itself.
  useEffect(() => {
    if (!accessibleMessage) return;
    const timer = window.setTimeout(() => setAccessibleMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [accessibleMessage]);

  // After delay interactions of the frames shown run once their delay passes.
  const shownKey = player ? shownFrames(player).join('|') : '';
  useEffect(() => {
    const current = live.current.player;
    if (!current || !shownKey) return;
    const timers = delayedReactions(doc, current).map(({ nodeId, reaction, timeout }) => window.setTimeout(() => run(reaction, nodeId), timeout));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [doc, run, shownKey]);

  // Keyboard interactions, and R (restart), ← and → (screens), F (fullscreen) and Z (device scaling). Inline, only while the preview has focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.tagName === 'A' || target.closest('[role="menu"]'))) return;
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
      if (keys.length !== 1 || !shortcuts) return;
      if (e.code === 'KeyR') restartAt(start);
      else if (e.code === 'ArrowRight') step(1);
      else if (e.code === 'ArrowLeft') step(-1);
      else if (e.code === 'KeyF' && !inlineMode) toggleFullscreen();
      else if (e.code === 'KeyZ' && live.current.device && !inlineMode) setDeviceFit((fit) => DEVICE_FITS[(DEVICE_FITS.indexOf(fit) + 1) % DEVICE_FITS.length]!);
      else return;
      e.preventDefault();
      // Inline, the keys don't reach the editor's shortcuts.
      e.stopPropagation();
    };
    const target: HTMLElement | Window | null = inlineMode ? rootRef.current : window;
    target?.addEventListener('keydown', onKeyDown as EventListener);
    return () => target?.removeEventListener('keydown', onKeyDown as EventListener);
  }, [doc, restartAt, run, start, step, toggleFullscreen, inlineMode, shortcuts]);

  // Key/Gamepad interactions from a connected gamepad's buttons (in presentation view; the inline preview takes keys only).
  useGamepadButtons(!inlineMode, (button) => {
    const current = live.current.player;
    const found = current ? keyReaction(doc, current, [gamepadCode(button)]) : null;
    if (found) run(found.reaction, found.nodeId);
  });

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
      const previous = state.player;
      const before = state.playing;
      if (drag) run(drag.reaction, drag.nodeId);
      // Drag moves back and forward through the transition it starts, instead of playing it.
      const started = state.playing;
      if (drag && previous && started && started !== before && started.effect.transition.type !== 'INSTANT' && state.player !== previous) {
        press.scrub = { direction: dragDirection(started.effect.transition, { x: point.x - press.x, y: point.y - press.y }), previous };
      }
    }
    if (press?.scrub && state.playing) {
      state.playing.drag = dragProgress(press.scrub.direction, { x: point.x - press.x, y: point.y - press.y }, state.scene?.screen ?? { width: 0, height: 0 });
      schedule();
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

  /** Letting go of a drag through a transition: past halfway it finishes from where it is; before, it goes back to the screen it left. */
  const releaseScrub = (press: Press) => {
    const state = live.current;
    const scrubbed = state.playing;
    if (!press.scrub || scrubbed?.drag === undefined) return;
    const t = scrubbed.drag;
    const now = performance.now();
    state.playing =
      t >= DRAG_FINISH_AT
        ? { effect: scrubbed.effect, start: now - t * scrubbed.duration, duration: scrubbed.duration, easing: scrubbed.easing }
        : { effect: scrubbed.effect, start: now, duration: Math.max(1, t * scrubbed.duration), easing: scrubbed.easing, back: { from: t, state: press.scrub.previous } };
    schedule();
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const state = live.current;
    const press = state.press;
    state.press = null;
    if (!press) return;
    releaseScrub(press);
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
  /** Turns accessibility mode on or off (announcing it when on). */
  const setAccessibility = (on: boolean) => {
    live.current.accessibleKey = '';
    setAccessible(on);
    setAccessibleMessage(on ? 'Now adapting content for screen readers' : '');
    schedule();
  };
  /** Hide UI, or show it again: the address keeps hide-ui=1 while it is hidden, so reopening it keeps the UI hidden. */
  const setHidden = (hidden: boolean) => {
    setUiHidden(hidden);
    setMenuAnchor(null);
    const url = new URL(window.location.href);
    if (hidden) url.searchParams.set('hide-ui', '1');
    else url.searchParams.delete('hide-ui');
    window.history.replaceState(window.history.state, '', url);
    setAccessibleMessage(hidden ? 'The toolbar and footer are hidden. Select Show UI to show them again.' : '');
  };
  /** A link or button of the accessible content was activated: its layer's On click interaction runs. */
  const activate = (nodeId: Id) => {
    const found = findReaction(doc, [nodeId], 'ON_CLICK');
    if (found) run(found.reaction, found.nodeId);
  };
  // Inline preview at 100%: the window the current screen needs — the frame, or the device around it (with its margin).
  const resizeTo100 = () => {
    const frame = player ? (doc.get(player.frameId) as SceneNode | undefined) : undefined;
    if (!inline || !frame) return;
    const content = device ? deviceOuterSize(device) : frame.size;
    const margin = device ? 48 : 0;
    const header = inlineHeaderRef.current?.offsetHeight ?? 0;
    inline.onResizeWindow({ width: Math.ceil(content.width + margin), height: Math.ceil(content.height + margin + header) });
  };
  // Respect aspect ratio (without a device): the window's height follows its width in the current frame's proportions.
  const aspectFrame = inline?.respectAspectRatio && !device && player ? (doc.get(player.frameId) as SceneNode | undefined) : undefined;
  const aspectWidth = inline?.windowSize.width ?? 0;
  const aspectHeight = aspectFrame && aspectFrame.size.width > 0 ? Math.round((aspectWidth * aspectFrame.size.height) / aspectFrame.size.width) : null;
  const onResizeWindow = inline?.onResizeWindow;
  useEffect(() => {
    if (aspectHeight === null || !onResizeWindow) return;
    onResizeWindow({ width: aspectWidth, height: aspectHeight + (inlineHeaderRef.current?.offsetHeight ?? 0) });
  }, [aspectHeight, aspectWidth, onResizeWindow]);
  const menuEntries: MenuEntry[] = [
    { kind: 'item', id: 'hints', label: 'Show hints on click', checked: showHints, onSelect: () => setShowHints((on) => !on) },
    { kind: 'item', id: 'accessible', label: 'Adapt content for screen readers', checked: accessible, onSelect: () => setAccessibility(!accessible) },
    ...(inlineMode
      ? []
      : ([
          { kind: 'item', id: 'shortcuts', label: 'Enable keyboard shortcuts', checked: shortcuts, onSelect: () => setShortcuts((on) => !on) },
          { kind: 'item', id: 'hide-ui', label: 'Hide UI', onSelect: () => setHidden(true) },
        ] satisfies MenuEntry[])),
    ...(inline
      ? ([
          { kind: 'item', id: 'follow', label: 'Follow prototype', checked: follow, onSelect: () => setFollow((on) => !on) },
          { kind: 'item', id: 'resize-100', label: device ? 'Resize device to 100%' : 'Resize window to 100%', onSelect: resizeTo100 },
          ...(device ? [] : [{ kind: 'item', id: 'respect-aspect', label: 'Respect aspect ratio', checked: inline.respectAspectRatio, onSelect: () => inline.onRespectAspectRatio(!inline.respectAspectRatio) } satisfies MenuEntry]),
        ] satisfies MenuEntry[])
      : []),
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
  // Share prototype › Copy link: the address of presentation view playing the flow selected (this file, in this browser).
  const copyLink = () => {
    const params = presentParams(window.location.search);
    if (!params) return;
    void navigator.clipboard?.writeText(presentUrl(window.location.href, { ...params, nodeId: start })).then(
      () => setLinkCopied(true),
      () => undefined,
    );
  };
  const shareEntries: MenuEntry[] = [{ kind: 'item', id: 'copy-link', label: 'Copy link', onSelect: copyLink }];
  // The device switcher: devices like this one, the device scaling options, and the device's frame.
  const deviceEntries: MenuEntry[] = device
    ? [
        ...presetsIn(device.preset.category).map((preset): MenuEntry => ({ kind: 'item', id: preset.id, label: preset.name, checked: preset.id === shownPreset?.id, onSelect: () => setDeviceChoice(preset) })),
        { kind: 'separator', id: 'fit-separator' },
        ...DEVICE_FITS.map((fit): MenuEntry => ({ kind: 'item', id: fit, label: DEVICE_FIT_LABELS[fit], checked: deviceFit === fit, onSelect: () => setDeviceFit(fit) })),
        { kind: 'separator', id: 'frame-separator' },
        { kind: 'item', id: 'frame', label: 'Show device frame', checked: deviceFrame, onSelect: () => setDeviceFrame((on) => !on) },
      ]
    : [];

  return (
    <div ref={rootRef} className={inlineMode ? styles.inlineRoot : styles.root} {...(inlineMode ? { role: 'region', 'aria-label': 'Preview', tabIndex: 0 } : {})}>
      {!inlineMode && <SkipToContent onActivate={() => setAccessibility(true)} />}
      {inline && (
        <header ref={inlineHeaderRef} className={styles.toolbar}>
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
      {!inline && !uiHidden && <header className={styles.toolbar}>
        <button type="button" className={styles.button} aria-pressed={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}>
          Flows
        </button>
        <span className={styles.title}>
          {session.fileName}
          {player && <span className={styles.screenName}>{nameOf(player.frameId)}</span>}
        </span>
        {linkCopied && (
          <span className={styles.screenName} aria-live="polite">
            Link copied
          </span>
        )}
        <button
          type="button"
          className={styles.button}
          aria-haspopup="menu"
          aria-expanded={shareAnchor !== null}
          data-menu-root=""
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setLinkCopied(false);
            setShareAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
          }}
        >
          Share prototype
        </button>
        {optionsButton}
        <button type="button" className={styles.button} onClick={toggleFullscreen}>
          Fullscreen
        </button>
      </header>}
      <div className={styles.body}>
        {sidebarOpen && !inlineMode && !uiHidden && (
          <aside className={styles.sidebar} aria-label="Flows">
            {flows.length === 0 ? (
              <p className={styles.muted}>This page has no flows.</p>
            ) : (
              <ul className={styles.flows}>
                {flows.map((flow) => (
                  <li key={flow.nodeId}>
                    <button type="button" className={styles.flow} aria-current={start === flow.nodeId ? 'true' : undefined} onClick={() => restartAt(flow.nodeId)}>
                      <span className={styles.flowName}>{flow.name}</span>
                    </button>
                    {/* Outside the button: its links open on their own. */}
                    {flow.description && <FlowDescription text={flow.description} className={styles.muted} label={`${flow.name} description`} />}
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
          data-device={shownPreset?.name}
          data-device-model={device?.model}
          data-device-fit={device ? deviceFit : undefined}
          data-device-frame={device ? String(deviceFrame) : undefined}
          data-variants={variantLabel}
          data-variables={variableLabel}
          data-videos={videoLabel}
          data-animated-gifs={gifLabel}
          data-overlay-origins={overlayOriginLabel}
          data-drag={dragLabel || undefined}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            const press = live.current.press;
            live.current.press = null;
            if (press) releaseScrub(press);
          }}
          onWheel={onWheel}
        >
          <canvas ref={canvasRef} className={styles.canvas} />
          {screenBox && <div className={styles.screenBox} data-testid="presentation-screen" style={{ left: screenBox.x, top: screenBox.y, width: screenBox.width, height: screenBox.height }} />}
          {accessible && player && accessibleScene && <AccessibleContent doc={doc} index={sceneIndex} scene={accessibleScene} frameIds={shownFrames(player)} onActivate={activate} />}
          {!player && <p className={styles.message}>Add a frame to this page to present it.</p>}
          {error && (
            <p className={styles.message} role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
      {!uiHidden && (
        <footer className={styles.footer}>
          <button type="button" className={styles.button} aria-label="Previous screen" disabled={screenIndex <= 0} onClick={() => step(-1)}>
            ←
          </button>
          <span role="status">{screenIndex >= 0 ? `${screenIndex + 1} / ${screens.length}` : ''}</span>
          <button type="button" className={styles.button} aria-label="Next screen" disabled={screenIndex < 0 || screenIndex >= screens.length - 1} onClick={() => step(1)}>
            →
          </button>
          {device && !inlineMode && (
            <button
              type="button"
              className={styles.button}
              aria-haspopup="menu"
              aria-expanded={deviceAnchor !== null}
              aria-label="Switch device"
              data-menu-root=""
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                setDeviceAnchor((open) => (open ? null : { x: r.x, y: r.y, width: r.width, height: r.height }));
              }}
            >
              {shownPreset?.name}
            </button>
          )}
          {!inlineMode && (
            <button type="button" className={styles.button} onClick={() => restartAt(start)}>
              Restart
            </button>
          )}
        </footer>
      )}
      {uiHidden && (
        <button type="button" className={styles.button} style={{ position: 'absolute', top: 8, right: 8, zIndex: 10 }} onClick={() => setHidden(false)}>
          Show UI
        </button>
      )}
      <AccessibilityMessage text={accessibleMessage} />
      {menuAnchor && <Menu label="Options" entries={menuEntries} anchor={menuAnchor} placement="bottom-start" onClose={closeMenu} />}
      {shareAnchor && <Menu label="Share prototype" entries={shareEntries} anchor={shareAnchor} placement="bottom-start" onClose={() => setShareAnchor(null)} />}
      {deviceAnchor && device && <Menu label="Switch device" entries={deviceEntries} anchor={deviceAnchor} placement="bottom-start" onClose={() => setDeviceAnchor(null)} />}
    </div>
  );
}
