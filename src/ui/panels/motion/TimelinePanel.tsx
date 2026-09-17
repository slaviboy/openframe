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

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ANIMATED_PROPERTY_LABELS, animatedLayers, playheadAt, valueAt } from '@/core/motion/animation';
import type { Id } from '@/core/ids/ids';
import type { AnimationTrack, PageAnimation, PageNode, SceneNode } from '@/core/schema/document';
import { animationOf, deleteKeyframes, moveKeyframes, setAnimationDuration, setAnimationPlayback, type KeyframeRef } from '@/editor/commands/motion';
import { useDocumentRevision, useEditor, useEditorState } from '../../hooks/useEditor';
import { Icon } from '../../icons/Icon';
import { IconButton } from '../../primitives/IconButton';
import { NumberField } from '../../primitives/NumberField';
import primitives from '../../primitives/primitives.module.css';
import styles from './TimelinePanel.module.css';

/** How the playback button reads, in the order clicking it cycles through. */
const PLAYBACK_LABELS: Readonly<Record<PageAnimation['playback'], string>> = { LOOP: 'Loop', ONCE: 'Once', PING_PONG: 'Ping-pong' };
const PLAYBACK_ORDER: readonly PageAnimation['playback'][] = ['LOOP', 'ONCE', 'PING_PONG'];

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
  /** The keyframes picked out on the timeline, which move and delete together. */
  const [selected, setSelected] = useState<readonly KeyframeRef[]>([]);
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
      const move = (ev: PointerEvent) => {
        const raw = ((ev.clientX - startX) / width) * animation.duration;
        const snap = animation.duration / 10;
        delta = Math.round(ev.shiftKey ? Math.round((ref.time + raw) / snap) * snap - ref.time : raw);
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
    [animation.duration, editor, isSelected, selected],
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
      editor.state.setMotion({ time: Math.round(share * animation.duration), playing: false });
    },
    [animation.duration, editor],
  );

  const percent = (time: number) => `${(time / Math.max(1, animation.duration)) * 100}%`;

  return (
    <section
      className={styles.timeline}
      aria-label="Timeline"
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
      </header>

      <div className={styles.body}>
        <div className={styles.ruler} ref={rulerRef} role="slider" aria-label="Playhead" aria-valuemin={0} aria-valuemax={animation.duration} aria-valuenow={Math.round(motion.time)} tabIndex={0} onPointerDown={seek}>
          {[0, 0.25, 0.5, 0.75, 1].map((share) => (
            <span key={share} className={styles.tick} style={{ left: `${share * 100}%` }}>
              {formatTime(animation.duration * share, motion.unit)}
            </span>
          ))}
          <span className={styles.playhead} style={{ left: percent(motion.time) }} data-testid="playhead" />
        </div>

        {layers.length === 0 ? (
          <p className={styles.empty}>Select a layer and add a keyframe from the properties panel to animate it.</p>
        ) : (
          <ul className={styles.tracks} aria-label="Layer tracks">
            {layers.map((id) => (
              <LayerTrack
                key={id}
                nodeId={id}
                animation={animation}
                collapsed={motion.collapsed}
                selected={selection.includes(id)}
                time={motion.time}
                percent={percent}
                isSelected={isSelected}
                onSelect={(ref, add) => setSelected(add ? (current) => [...current.filter((k) => !(k.nodeId === ref.nodeId && k.property === ref.property && k.time === ref.time)), ref] : [ref])}
                onDrag={dragKeyframes}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** One layer's tracks: a row per animated property (or one row for the layer, collapsed), with its keyframes. */
function LayerTrack({
  nodeId,
  animation,
  collapsed,
  selected,
  time,
  percent,
  isSelected,
  onSelect,
  onDrag,
}: {
  nodeId: Id;
  animation: PageAnimation;
  collapsed: boolean;
  selected: boolean;
  time: number;
  percent: (time: number) => string;
  isSelected: (ref: KeyframeRef) => boolean;
  onSelect: (ref: KeyframeRef, add: boolean) => void;
  onDrag: (ref: KeyframeRef, e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const editor = useEditor();
  const node = editor.doc.get(nodeId) as SceneNode | undefined;
  const tracks = animation.tracks.filter((track) => track.nodeId === nodeId);
  if (!node) return null;
  return (
    <li className={styles.layer} data-selected={selected || undefined}>
      <button type="button" className={styles.layerName} onClick={() => editor.state.select([nodeId])}>
        <Icon name="rectangle" size={16} />
        {node.name}
      </button>
      <div className={styles.layerRows}>
        {collapsed ? (
          <TrackRow label={node.name} nodeId={nodeId} tracks={tracks} percent={percent} time={time} isSelected={isSelected} onSelect={onSelect} onDrag={onDrag} />
        ) : (
          tracks.map((track) => (
            <TrackRow key={track.property} label={ANIMATED_PROPERTY_LABELS[track.property]} nodeId={nodeId} tracks={[track]} percent={percent} time={time} isSelected={isSelected} onSelect={onSelect} onDrag={onDrag} />
          ))
        )}
      </div>
    </li>
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
  onDrag,
}: {
  label: string;
  nodeId: Id;
  tracks: readonly AnimationTrack[];
  percent: (time: number) => string;
  time: number;
  isSelected: (ref: KeyframeRef) => boolean;
  onSelect: (ref: KeyframeRef, add: boolean) => void;
  onDrag: (ref: KeyframeRef, e: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const editor = useEditor();
  return (
    <div className={styles.track} role="group" aria-label={`${label} track`}>
      <span className={styles.trackName}>{label}</span>
      <div className={styles.trackLane}>
        {tracks.flatMap((track) =>
          track.keyframes.map((keyframe) => {
            const ref: KeyframeRef = { nodeId, property: track.property, time: keyframe.time };
            return (
              <button
                key={`${track.property}-${keyframe.time}`}
                type="button"
                className={styles.keyframe}
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
                onClick={() => editor.state.setMotion({ time: keyframe.time, playing: false })}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}
