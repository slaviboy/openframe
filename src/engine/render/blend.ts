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

import type { Blender, CanvasKit, EmbindEnumEntity } from 'canvaskit-wasm';
import type { BlendMode } from '@/core/schema/document';

/**
 * Maps document blend modes to Skia. PLUS_DARKER has no native Skia mode and is
 * implemented as a runtime blender (premultiplied linear burn:
 * rgb = max(0, src + dst − srcα·dstα), α = srcα + dstα·(1 − srcα)).
 */
export class BlendModes {
  private plusDarker: Blender | null = null;

  constructor(private readonly ck: CanvasKit) {}

  /** Returns a native mode, or a Blender for modes Skia lacks. PASS_THROUGH/NORMAL → SrcOver. */
  resolve(mode: BlendMode): { mode: EmbindEnumEntity } | { blender: Blender } {
    const B = this.ck.BlendMode;
    switch (mode) {
      case 'PASS_THROUGH':
      case 'NORMAL':
        return { mode: B.SrcOver };
      case 'DARKEN':
        return { mode: B.Darken };
      case 'MULTIPLY':
        return { mode: B.Multiply };
      case 'PLUS_DARKER':
        return { blender: this.getPlusDarker() };
      case 'COLOR_BURN':
        return { mode: B.ColorBurn };
      case 'LIGHTEN':
        return { mode: B.Lighten };
      case 'SCREEN':
        return { mode: B.Screen };
      case 'PLUS_LIGHTER':
        return { mode: B.Plus };
      case 'COLOR_DODGE':
        return { mode: B.ColorDodge };
      case 'OVERLAY':
        return { mode: B.Overlay };
      case 'SOFT_LIGHT':
        return { mode: B.SoftLight };
      case 'HARD_LIGHT':
        return { mode: B.HardLight };
      case 'DIFFERENCE':
        return { mode: B.Difference };
      case 'EXCLUSION':
        return { mode: B.Exclusion };
      case 'HUE':
        return { mode: B.Hue };
      case 'SATURATION':
        return { mode: B.Saturation };
      case 'COLOR':
        return { mode: B.Color };
      case 'LUMINOSITY':
        return { mode: B.Luminosity };
    }
  }

  dispose(): void {
    this.plusDarker?.delete();
    this.plusDarker = null;
  }

  private getPlusDarker(): Blender {
    if (!this.plusDarker) {
      const effect = this.ck.RuntimeEffect.MakeForBlender(
        `half4 main(half4 src, half4 dst) {
           return half4(max(src.rgb + dst.rgb - src.a * dst.a, 0), src.a + dst.a * (1 - src.a));
         }`,
      );
      if (!effect) throw new Error('Failed to compile plus-darker blender');
      this.plusDarker = effect.makeBlender([]);
      effect.delete();
    }
    return this.plusDarker;
  }
}
