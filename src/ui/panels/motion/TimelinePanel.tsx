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

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import { ANIMATED_PROPERTY_LABELS, animatedLayers, layerExtent, playheadAt, valueAt } from '@/core/motion/animation';
import type { Id } from '@/core/ids/ids';
import type { AnimationTrack, PageAnimation, PageNode, SceneNode } from '@/core/schema/document';
import { animationOf, deleteKeyframes, moveKeyframes, setAnimationDuration, setAnimationPlayback, setLayerExtent, setSegmentEasing, type KeyframeRef } from '@/editor/commands/motion';
import { EASING_LABELS, makeEasing } from '@/core/prototype/reactions';
import type { KeyframeEasing } from '@/core/schema/document';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { Icon } from '../../icons/Icon';
import { layerIcon } from '../../icons/layer-icons';
import { IconButton } from '../../primitives/IconButton';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import styles from './TimelinePanel.module.css';

/** How the playback button reads, in the order clicking it cycles through. */
const PLAYBACK_LABELS: Readonly<Record<PageAnimation['playback'], string>> = { LOOP: 'Loop', ONCE: 'Once', PING_PONG: 'Ping-pong' };
const PLAYBACK_ORDER: readonly PageAnimation['playback'][] = ['LOOP', 'ONCE', 'PING_PONG'];

/** How near a keyframe has to be dragged, on screen, for ⇧ to snap it to the playhead or another keyframe. */
const SNAP_REACH_PX = 8;

/** How far the timeline zooms in: at 50 a 2000 ms animation shows 40 ms across. */
const MAX_TIMELINE_ZOOM = 50;

/** A time in the timeline's own unit, for the fields and the ruler. */
const formatTime = (ms: number, unit: 'MS' | 'S') => (unit === 'MS' ? `${Math.round(ms)}` : (ms / 1000).toFixed(2));

/**
 * The Motion timeline, across the bottom in Motion mode: the playback controls, the animation's timing, a ruler with
 * the playhead, and a track for each animated layer showing its keyframes.
 */
export function TimelinePanel() {
  const editor = useEditor();
  useDocumentRevision();
  const motion = useEditorState((s) => s.motion);
  const selection = useEditorState((s) => s.selection);
  const pageId = useEditorState((s) => s.activePageId);
  const page = editor.doc.get(pageId) as PageNode | undefined;
  const animation = animationOf(page);
  const layers = useMemo(() => animatedLayers(animation), [animation]);
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksRef = useRef<HTMLUListElement>(null);
  /** The box being swept over the tracks, in screen coordinates, while one is being dragged. */
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  // The timeline shows a window of the animation: the whole of it at zoom 1, and less the further it is zoomed in.
  const span = animation.duration / Math.max(1, motion.zoom);
  const offset = Math.min(Math.max(0, motion.offset), Math.max(0, animation.duration - span));
  const percent = (time: number) => `${((time - offset) / span) * 100}%`;
  /** Zooms to a factor, keeping the moment under `hold` (a share across the timeline) where it is. */
  const zoomTo = useCallback(
    (factor: number, hold = 0.5) => {
      const next = Math.min(MAX_TIMELINE_ZOOM, Math.max(1, factor));
      const nextSpan = animation.duration / next;
      const at = offset + hold * span;
      editor.state.setMotion({ zoom: next, offset: Math.min(Math.max(0, at - hold * nextSpan), Math.max(0, animation.duration - nextSpan)) });
    },
    [animation.duration, editor, offset, span],
  );
  /** The keyframes picked out on the timeline, which move and delete together, and share an easing. */
  const selected = motion.selectedKeyframes;
  const setSelected = useCallback((next: readonly KeyframeRef[] | ((current: readonly KeyframeRef[]) => readonly KeyframeRef[])) => {
    const state = editor.state.getSnapshot().motion;
    editor.state.setMotion({ selectedKeyframes: typeof next === 'function' ? next(state.selectedKeyframes) : next });
  }, [editor]);
  const isSelected = useCallback((ref: KeyframeRef) => selected.some((k) => k.nodeId === ref.nodeId && k.property === ref.property && k.time === ref.time), [selected]);

  /** Dragging keyframes: ⇧ snaps to tenths of the animation, and the selection follows to its new times. */
  const dragKeyframes = useCallback(
    (ref: KeyframeRef, e: ReactPointerEvent<HTMLButtonElement>) => {
      const lane = e.currentTarget.parentElement;
      if (!lane) return;
      const width = lane.getBoundingClientRect().width || 1;
      const startX = e.clientX;
      const picked = isSelected(ref) ? selected : [ref];
      setSelected(picked);
      const target = e.currentTarget;
      target.setPointerCapture(e.pointerId);
      let delta = 0;
      // ⇧ snaps the keyframe to the playhead, or to another keyframe it is dragged over.
      const snapTo = [motion.time, ...animation.tracks.flatMap((track) => track.keyframes.map((k) => k.time))];
      const move = (ev: PointerEvent) => {
        const raw = ((ev.clientX - startX) / width) * span;
        const at = ref.time + raw;
        const reach = (span / width) * SNAP_REACH_PX;
        const near = ev.shiftKey ? snapTo.filter((t) => Math.abs(t - at) <= reach).sort((a, b) => Math.abs(a - at) - Math.abs(b - at))[0] : undefined;
        delta = Math.round((near ?? at) - ref.time);
      };
      const up = (ev: PointerEvent) => {
        target.releasePointerCapture(ev.pointerId);
        target.removeEventListener('pointermove', move);
        target.removeEventListener('pointerup', up);
        if (delta !== 0 && moveKeyframes(editor, picked, delta)) {
          setSelected(picked.map((k) => ({ ...k, time: Math.max(0, k.time + delta) })));
        }
      };
      target.addEventListener('pointermove', move);
      target.addEventListener('pointerup', up);
    },
    [animation, editor, isSelected, motion.time, selected, setSelected, span],
  );

  // Playing moves the playhead until it is paused (or the animation ends, played once).
  useEffect(() => {
    if (!motion.playing) return;
    let frame = 0;
    const startedAt = performance.now() - motion.time;
    const step = () => {
      const { time, done } = playheadAt(animation, performance.now() - startedAt);
      editor.state.setMotion(done ? { time, playing: false } : { time });
      if (!done) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // The playhead is driven from here while playing; its own changes must not restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [motion.playing, animation, editor]);

  const seek = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const share = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
      editor.state.setMotion({ time: Math.round(offset + share * span), playing: false });
    },
    [editor, offset, span],
  );


  /**
   * Dragging across the tracks, starting on empty room rather than a keyframe, sweeps a box around the keyframes it
   * covers and picks them out. What each one is comes from the button itself, so no geometry has to be worked twice.
   */
  const sweep = (e: ReactPointerEvent<HTMLUListElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, select, input')) return;
    const container = tracksRef.current;
    if (!container) return;
    const from = { x: e.clientX, y: e.clientY };
    setMarquee({ left: from.x, top: from.y, width: 0, height: 0 });
    const move = (ev: PointerEvent) => {
      setMarquee({ left: Math.min(from.x, ev.clientX), top: Math.min(from.y, ev.clientY), width: Math.abs(ev.clientX - from.x), height: Math.abs(ev.clientY - from.y) });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setMarquee(null);
      const box = { left: Math.min(from.x, ev.clientX), right: Math.max(from.x, ev.clientX), top: Math.min(from.y, ev.clientY), bottom: Math.max(from.y, ev.clientY) };
      // A click with no drag in it clears the selection instead of sweeping nothing.
      if (box.right - box.left < 3 && box.bottom - box.top < 3) {
        setSelected([]);
        return;
      }
      const swept: KeyframeRef[] = [];
      for (const element of container.querySelectorAll<HTMLElement>('[data-keyframe]')) {
        const rect = element.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const [nodeId, property, time] = (element.dataset.keyframe ?? '').split('|');
        if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom && nodeId && property) {
          swept.push({ nodeId, property: property as KeyframeRef['property'], time: Number(time) });
        }
      }
      setSelected(swept);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** ⌘ (or Ctrl) with the wheel zooms the timeline around the pointer, as it does on the canvas. */
  const wheelZoom = (e: ReactWheelEvent<HTMLDivElement>) => {
    if (!e.metaKey && !e.ctrlKey) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const hold = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
    zoomTo(motion.zoom * Math.exp(-e.deltaY / 200), hold);
  };

  return (
    <section
      className={styles.timeline}
      aria-label="Timeline"
      data-recording={motion.autoKeyframe || undefined}
      data-testid="timeline"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (selected.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        deleteKeyframes(editor, selected);
        setSelected([]);
      }}
    >
      <header className={styles.controls}>
        <IconButton
          icon={motion.playing ? 'pause' : 'present'}
          label={motion.playing ? 'Pause' : 'Play'}
          onClick={() => editor.state.setMotion({ playing: !motion.playing })}
        />
        <IconButton
          icon="keyframe"
          label="Auto-keyframe"
          pressed={motion.autoKeyframe}
          onClick={() => editor.state.setMotion({ autoKeyframe: !motion.autoKeyframe })}
        />
        <label className={styles.field}>
          <span>Current</span>
          <input
            className={primitives.textInput}
            aria-label="Current time"
            value={formatTime(motion.time, motion.unit)}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (Number.isFinite(value)) editor.state.setMotion({ time: Math.max(0, Math.min(animation.duration, motion.unit === 'MS' ? value : value * 1000)), playing: false });
            }}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </label>
        <label className={styles.field}>
          <span>Duration</span>
          <NumberField
            label=""
            ariaLabel="Animation duration"
            testId="field-duration"
            min={1}
            max={600_000}
            decimals={motion.unit === 'MS' ? 0 : 2}
            value={motion.unit === 'MS' ? animation.duration : animation.duration / 1000}
            onChange={(value) => setAnimationDuration(editor, motion.unit === 'MS' ? value : value * 1000)}
          />
        </label>
        <button type="button" className={primitives.button} aria-label="Time unit" onClick={() => editor.state.setMotion({ unit: motion.unit === 'MS' ? 'S' : 'MS' })}>
          {motion.unit === 'MS' ? 'ms' : 's'}
        </button>
        <button
          type="button"
          className={primitives.button}
          aria-label="Playback"
          onClick={() => setAnimationPlayback(editor, PLAYBACK_ORDER[(PLAYBACK_ORDER.indexOf(animation.playback) + 1) % PLAYBACK_ORDER.length]!)}
        >
          {PLAYBACK_LABELS[animation.playback]}
        </button>
        <IconButton
          icon={motion.collapsed ? 'caretRight' : 'caretDown'}
          label="Collapse layers"
          pressed={motion.collapsed}
          onClick={() => editor.state.setMotion({ collapsed: !motion.collapsed })}
        />
        {/* Zoom sits at the far end of the controls, as the slider down the right of the reference's timeline does. */}
        <label className={styles.zoom}>
          <input
            type="range"
            aria-label="Timeline zoom"
            min={1}
            max={MAX_TIMELINE_ZOOM}
            step={0.1}
            value={motion.zoom}
            onChange={(e) => zoomTo(Number(e.target.value))}
            onKeyDown={(e) => e.stopPropagation()}
          />
          <span>{motion.zoom.toFixed(1)}×</span>
        </label>
      </header>

      <div className={styles.body}>
        <div className={styles.ruler} ref={rulerRef} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={animation.duration} aria-valuenow={Math.round(motion.time)} tabIndex={0} onPointerDown={seek} onWheel={wheelZoom}>
          {[0, 0.25, 0.5, 0.75, 1].map((share) => (
            <span key={share} className={styles.tick} style={{ left: `${share * 100}%` }}>
              {formatTime(offset + span * share, motion.unit)}
            </span>
          ))}
          <span className={styles.playhead} style={{ left: percent(motion.time) }} data-testid="playhead" />
        </div>

        {layers.length === 0 ? (
          <p className={styles.empty}>Select a layer and add a keyframe from the properties panel to animate it.</p>
        ) : (
          <ul className={styles.tracks} aria-label="Layer tracks" onPointerDown={sweep} ref={tracksRef}>
            {layers.map((id) => (
              <LayerTrack
                key={id}
                nodeId={id}
                animation={animation}
                collapsed={motion.collapsed}
                selected={selection.includes(id)}
                time={motion.time}
                percent={percent}
                visibleMs={span}
                isSelected={isSelected}
                onSelect={(ref, add) => setSelected(add ? (current) => [...current.filter((k) => !(k.nodeId === ref.nodeId && k.property === ref.property && k.time === ref.time)), ref] : [ref])}
                onSelectAll={setSelected}
                onDrag={dragKeyframes}
              />
            ))}
          </ul>
        )}
      </div>
      {marquee && <div className={styles.marquee} style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }} />}
    </section>
  );
}

/** The easings a segment can take on the timeline: the prototype presets and springs, plus Hold, which waits and jumps. */
const EASING_CHOICES: readonly (readonly [string, string])[] = [
  ['LINEAR', 'Linear'],
  ['EASE_IN', EASING_LABELS.EASE_IN],
  ['EASE_OUT', EASING_LABELS.EASE_OUT],
  ['EASE_IN_AND_OUT', EASING_LABELS.EASE_IN_AND_OUT],
  ['EASE_IN_BACK', EASING_LABELS.EASE_IN_BACK],
  ['EASE_OUT_BACK', EASING_LABELS.EASE_OUT_BACK],
  ['EASE_IN_AND_OUT_BACK', EASING_LABELS.EASE_IN_AND_OUT_BACK],
  ['GENTLE', EASING_LABELS.GENTLE],
  ['QUICK', EASING_LABELS.QUICK],
  ['BOUNCY', EASING_LABELS.BOUNCY],
  ['SLOW', EASING_LABELS.SLOW],
  ['CUSTOM_CUBIC_BEZIER', EASING_LABELS.CUSTOM_CUBIC_BEZIER],
  ['CUSTOM_SPRING', EASING_LABELS.CUSTOM_SPRING],
  ['HOLD', 'Hold'],
];

const easingLabel = (easing: KeyframeEasing) => EASING_CHOICES.find(([type]) => type === easing.type)?.[1] ?? 'Linear';

/** The easing a choice stands for; Linear is no easing at all, and a custom one starts from its default shape. */
const easingFor = (type: string): KeyframeEasing | undefined =>
  type === 'LINEAR' ? undefined : type === 'CUSTOM_CUBIC_BEZIER' || type === 'CUSTOM_SPRING' ? makeEasing(type) : ({ type } as KeyframeEasing);

/** One layer's tracks: a row per animated property (or one row for the layer, collapsed), with its keyframes. */
function LayerTrack({
  nodeId,
  animation,
  collapsed,
  selected,
  time,
  percent,
  visibleMs,
  isSelected,
  onSelect,
  onSelectAll,
  onDrag,
}: {
  nodeId: Id;
  animation: PageAnimation;
  collapsed: boolean;
  selected: boolean;
  time: number;
  percent: (time: number) => string;
  visibleMs: number;
  isSelected: (ref: KeyframeRef) => boolean;
  onSelect: (ref: KeyframeRef, add: boolean) => void;
  onSelectAll: (refs: readonly KeyframeRef[]) => void;
  onDrag: (ref: KeyframeRef, e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const editor = useEditor();
  const node = editor.doc.get(nodeId) as SceneNode | undefined;
  const tracks = animation.tracks.filter((track) => track.nodeId === nodeId);
  if (!node) return null;
  // The layer wears the icon and, for a component or an instance, the color it has in the layers panel.
  const icon = layerIcon(node);
  return (
    <li className={styles.layer} data-selected={selected || undefined} data-component={icon === 'component' || icon === 'instance' || undefined}>
      {/* Picking a layer here selects it on the canvas and all of its keyframes, which Delete then clears together. */}
      <button
        type="button"
        className={styles.layerName}
        onClick={() => {
          editor.state.select([nodeId]);
          onSelectAll(tracks.flatMap((track) => track.keyframes.map((k) => ({ nodeId, property: track.property, time: k.time }))));
        }}
      >
        <Icon name={icon} size={16} />
        {node.name}
      </button>
      <div className={styles.layerRows}>
        <TrackSpan nodeId={nodeId} animation={animation} percent={percent} visibleMs={visibleMs} />
        {collapsed ? (
          <TrackRow label={node.name} nodeId={nodeId} tracks={tracks} percent={percent} time={time} isSelected={isSelected} onSelect={onSelect} onSelectAll={onSelectAll} onDrag={onDrag} />
        ) : (
          tracks.map((track) => (
            <TrackRow key={track.property} label={ANIMATED_PROPERTY_LABELS[track.property]} nodeId={nodeId} tracks={[track]} percent={percent} time={time} isSelected={isSelected} onSelect={onSelect} onSelectAll={onSelectAll} onDrag={onDrag} />
          ))
        )}
      </div>
    </li>
  );
}

/**
 * A layer's animation as one bar across the timeline: dragging the bar moves the whole track, and pulling either end
 * stretches it, so everything the layer does runs later, earlier, longer or shorter together.
 */
function TrackSpan({ nodeId, animation, percent, visibleMs }: { nodeId: Id; animation: PageAnimation; percent: (time: number) => string; visibleMs: number }) {
  const editor = useEditor();
  const laneRef = useRef<HTMLDivElement>(null);
  const extent = layerExtent(animation, nodeId);
  if (!extent) return null;

  const drag = (end: 'both' | 'from' | 'to') => (e: ReactPointerEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const width = laneRef.current?.getBoundingClientRect().width || 1;
    const startX = e.clientX;
    const origin = extent;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const delta = ((ev.clientX - startX) / width) * visibleMs;
      const from = end === 'to' ? origin.from : Math.max(0, origin.from + delta);
      const to = end === 'from' ? origin.to : origin.to + delta;
      // Pulling one end past the other holds the track at nothing wide rather than turning it inside out.
      setLayerExtent(editor, nodeId, Math.min(from, to), Math.max(from, to));
    };
    const up = (ev: PointerEvent) => {
      target.releasePointerCapture(ev.pointerId);
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
  };

  return (
    <div className={styles.spanLane} ref={laneRef}>
      <div
        className={styles.span}
        role="button"
        tabIndex={-1}
        aria-label={`${editor.doc.get(nodeId)?.name ?? 'Layer'} track from ${Math.round(extent.from)} to ${Math.round(extent.to)} ms`}
        style={{ left: percent(extent.from), width: `calc(${percent(extent.to)} - ${percent(extent.from)})` }}
        onPointerDown={drag('both')}
      >
        <span className={styles.spanHandle} data-end="from" role="button" tabIndex={-1} aria-label="Track start" onPointerDown={drag('from')} />
        <span className={styles.spanHandle} data-end="to" role="button" tabIndex={-1} aria-label="Track end" onPointerDown={drag('to')} />
      </div>
    </div>
  );
}

/** A row of keyframes: the diamonds sit where their keyframes are, and clicking one moves the playhead to it. */
function TrackRow({
  label,
  nodeId,
  tracks,
  percent,
  time,
  isSelected,
  onSelect,
  onSelectAll,
  onDrag,
}: {
  label: string;
  nodeId: Id;
  tracks: readonly AnimationTrack[];
  percent: (time: number) => string;
  time: number;
  isSelected: (ref: KeyframeRef) => boolean;
  onSelect: (ref: KeyframeRef, add: boolean) => void;
  onSelectAll: (refs: readonly KeyframeRef[]) => void;
  onDrag: (ref: KeyframeRef, e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const editor = useEditor();
  return (
    <div className={styles.track} role="group" aria-label={`${label} track`}>
      <button type="button" className={styles.trackName} aria-label={`Select ${label} keyframes`} onClick={() => onSelectAll(tracks.flatMap((track) => track.keyframes.map((k) => ({ nodeId, property: track.property, time: k.time }))))}>
        {label}
      </button>
      <div className={styles.trackLane}>
        {tracks.flatMap((track) =>
          track.keyframes.slice(0, -1).map((keyframe, i) => {
            const next = track.keyframes[i + 1]!;
            const easing = keyframe.easing;
            return (
              <label
                key={`segment-${track.property}-${keyframe.time}`}
                className={styles.segment}
                style={{ left: percent(keyframe.time), width: `calc(${percent(next.time)} - ${percent(keyframe.time)})` }}
                title={`${ANIMATED_PROPERTY_LABELS[track.property]}: ${easing ? easingLabel(easing) : 'Linear'}`}
              >
                <span className={styles.segmentLine} data-eased={easing ? '' : undefined} />
                <select
                  aria-label={`${ANIMATED_PROPERTY_LABELS[track.property]} easing from ${Math.round(keyframe.time)} ms`}
                  value={easing?.type ?? 'LINEAR'}
                  onChange={(e) => setSegmentEasing(editor, { nodeId, property: track.property, time: keyframe.time }, easingFor(e.target.value))}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  {EASING_CHOICES.map(([type, label]) => (
                    <option key={type} value={type}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            );
          }),
        )}
        {tracks.flatMap((track) =>
          track.keyframes.map((keyframe) => {
            const ref: KeyframeRef = { nodeId, property: track.property, time: keyframe.time };
            return (
              <button
                key={`${track.property}-${keyframe.time}`}
                type="button"
                className={styles.keyframe}
                data-keyframe={`${nodeId}|${track.property}|${keyframe.time}`}
                style={{ left: percent(keyframe.time) }}
                aria-label={`${ANIMATED_PROPERTY_LABELS[track.property]} keyframe at ${Math.round(keyframe.time)} ms`}
                aria-pressed={isSelected(ref)}
                data-current={keyframe.time === Math.round(time) || undefined}
                data-selected={isSelected(ref) || undefined}
                title={`${ANIMATED_PROPERTY_LABELS[track.property]}: ${Math.round(valueAt(track, keyframe.time) * 100) / 100}`}
                onPointerDown={(e) => {
                  onSelect(ref, e.shiftKey);
                  onDrag(ref, e);
                }}
                onDoubleClick={() => editor.state.setMotion({ time: keyframe.time, playing: false })}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}
