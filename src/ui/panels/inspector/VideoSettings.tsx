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

import { useRef, useState } from 'react';
import { IMAGE_SCALE_MODE_LABELS, withVideo } from '@/core/image/image-paint';
import type { Id } from '@/core/ids/ids';
import type { ImageScaleMode, Size, VideoPaint } from '@/core/schema/document';
import { useEditor, useEditorState } from '../../hooks/useEditor';
import { readVideoFile, VIDEO_ACCEPT } from '../../images/import-video';
import { useImageUrl } from '../../images/useImageUrl';
import primitives from '../../primitives/primitives.module.css';
import { CropControls } from './CropControls';
import gradientStyles from './Gradient.module.css';

/** Modes offered in the menu. Crop starts crop mode on the canvas, so it needs a single layer (`onCrop`). */
const MENU_MODES: readonly ImageScaleMode[] = ['FILL', 'FIT', 'TILE'];

interface VideoSettingsProps {
  readonly label: string;
  readonly paint: VideoPaint;
  /** A discrete edit as its own undo step. */
  readonly onEdit: (label: string, edit: (paint: VideoPaint) => VideoPaint) => void;
  /** A continuous edit: coalesced between gesture start and end. */
  readonly onScrub: (edit: (paint: VideoPaint) => VideoPaint) => void;
  readonly onGestureStart: () => void;
  readonly onGestureEnd: () => void;
  /** Starts crop mode for this paint (a single layer only). */
  readonly onCrop?: (() => void) | undefined;
  /** The single selected layer, for crop mode controls (aspect ratio, Resize to fit, zoom). */
  readonly cropLayer?: { readonly id: Id; readonly size: Size } | undefined;
}

/** Video fill settings: a player previewing the video (play, pause, scrub to a time), its fill mode, cropping, and replacing the video. */
export function VideoSettings({ label, paint, onEdit, onScrub, onGestureStart, onGestureEnd, onCrop, cropLayer }: VideoSettingsProps) {
  const editor = useEditor();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const croppingId = useEditorState((s) => s.croppingId);
  const canCrop = onCrop !== undefined && paint.imageSize !== undefined;
  const cropping = cropLayer !== undefined && croppingId === cropLayer.id && paint.scaleMode === 'CROP' && paint.imageSize !== undefined;
  const modes = paint.scaleMode === 'CROP' || canCrop ? [...MENU_MODES, 'CROP' as const] : MENU_MODES;
  const videoUrl = useImageUrl(paint.videoHash);
  const posterUrl = useImageUrl(paint.imageHash);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const { video, poster } = await readVideoFile(file);
      await editor.images.add(poster);
      await editor.images.add(video);
      onEdit('Set video', (p) => withVideo(p, { hash: poster.hash, width: video.width, height: video.height }, video.hash));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The video could not be added.');
    }
  };

  return (
    <li className={gradientStyles.stops} aria-label={`${label} video settings`}>
      <div className={gradientStyles.stopsHeader}>
        <select
          className={primitives.select}
          aria-label={`${label} video mode`}
          value={paint.scaleMode}
          onChange={(e) => {
            const mode = e.target.value as ImageScaleMode;
            if (mode === 'CROP' && canCrop) onCrop();
            else onEdit('Change video mode', ({ scalingFactor, imageTransform: _transform, ...rest }) => ({ ...rest, scaleMode: mode, ...(mode === 'TILE' ? { scalingFactor: scalingFactor ?? 1 } : {}) }));
          }}
        >
          {modes.map((mode) => (
            <option key={mode} value={mode}>
              {IMAGE_SCALE_MODE_LABELS[mode]}
            </option>
          ))}
        </select>
        {canCrop && !cropping && (
          <button type="button" className={gradientStyles.textButton} onClick={onCrop}>
            Crop video
          </button>
        )}
      </div>
      {cropping && cropLayer && (
        <CropControls label={label} paint={paint} imageSize={paint.imageSize!} layerSize={cropLayer.size} onScrub={onScrub} onGestureStart={onGestureStart} onGestureEnd={onGestureEnd} />
      )}
      {videoUrl && <video src={videoUrl} poster={posterUrl} controls muted playsInline preload="metadata" aria-label={`${label} video preview`} style={{ width: '100%', borderRadius: 4 }} />}
      <button type="button" className={gradientStyles.textButton} onClick={() => input.current?.click()}>
        Replace video
      </button>
      <input
        ref={input}
        type="file"
        accept={VIDEO_ACCEPT}
        hidden
        aria-label={`${label} video file`}
        onChange={(e) => {
          void choose(e.currentTarget.files?.[0]);
          e.currentTarget.value = '';
        }}
      />
      {error && <p role="alert">{error}</p>}
    </li>
  );
}
