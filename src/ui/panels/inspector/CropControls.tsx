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

import { CROP_ASPECT_LABELS, CROP_ASPECTS, cropZoomPercent, zoomCropPaint, type CropAspect, type CroppablePaint } from '@/core/image/crop';
import { imagePlacement } from '@/core/image/image-fit';
import type { Size } from '@/core/schema/document';
import { resizeCropToFit, setCropAspect } from '@/editor/interactions/crop';
import { useEditor, useEditorState } from '../../hooks/useEditor';
import primitives from '../../primitives/primitives.module.css';
import gradientStyles from './Gradient.module.css';

interface CropControlsProps<T extends CroppablePaint> {
  readonly label: string;
  readonly paint: T;
  /** Pixel size of the image or video being cropped. */
  readonly imageSize: Size;
  /** The single layer in crop mode. */
  readonly layerSize: Size;
  /** A continuous edit: coalesced between gesture start and end. */
  readonly onScrub: (edit: (paint: T) => T) => void;
  readonly onGestureStart: () => void;
  readonly onGestureEnd: () => void;
}

/** The controls shown while a fill is cropped on the canvas: the crop's aspect ratio, Resize to fit, and the zoom. */
export function CropControls<T extends CroppablePaint>({ label, paint, imageSize, layerSize, onScrub, onGestureStart, onGestureEnd }: CropControlsProps<T>) {
  const editor = useEditor();
  const cropAspect = useEditorState((s) => s.cropAspect);
  const placement = imagePlacement(paint, imageSize, layerSize);
  const zoom = placement ? Math.round(cropZoomPercent(placement.matrix, imageSize, layerSize)) : 0;
  return (
    <>
      <div className={gradientStyles.stopsHeader}>
        <select className={primitives.select} aria-label={`${label} crop aspect ratio`} value={cropAspect} onChange={(e) => setCropAspect(editor, e.target.value as CropAspect)}>
          {CROP_ASPECTS.map((aspect) => (
            <option key={aspect} value={aspect}>
              {CROP_ASPECT_LABELS[aspect]}
            </option>
          ))}
        </select>
        <button type="button" className={gradientStyles.textButton} onClick={() => resizeCropToFit(editor)}>
          Resize to fit
        </button>
      </div>
      <div className={gradientStyles.adjustRow}>
        <span aria-hidden="true">Zoom</span>
        <input
          type="range"
          min={10}
          max={500}
          step={1}
          aria-label={`${label} crop zoom`}
          value={zoom}
          onPointerDown={onGestureStart}
          onPointerUp={onGestureEnd}
          onPointerCancel={onGestureEnd}
          onBlur={onGestureEnd}
          onChange={(e) => {
            const percent = Number(e.target.value);
            onScrub((p) => zoomCropPaint(p, layerSize, percent));
          }}
        />
        <output data-testid="crop-zoom">{zoom}%</output>
      </div>
    </>
  );
}
