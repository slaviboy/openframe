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

/**
 * Image adjustments as an SkSL shader wrapping the image shader. Uniforms follow
 * IMAGE_ADJUSTMENTS order. Must stay in step with `adjustColor` in core/image/adjustments.ts,
 * which is its reference implementation (see image-render.test.ts).
 */
export const IMAGE_ADJUST_SKSL = `
uniform shader image;
uniform float exposure;
uniform float contrast;
uniform float saturation;
uniform float temperature;
uniform float tint;
uniform float highlights;
uniform float shadows;

const half3 LUMA = half3(0.2126, 0.7152, 0.0722);

half4 main(float2 p) {
  half4 c = image.eval(p);
  if (c.a <= 0.0) return c;
  half3 rgb = c.rgb / c.a;
  rgb = (rgb * pow(2.0, exposure) - 0.5) * (1.0 + contrast) + 0.5;
  half l = dot(rgb, LUMA);
  rgb = l + (rgb - l) * (1.0 + saturation);
  rgb += half3(0.1 * temperature + 0.05 * tint, -0.1 * tint, -0.1 * temperature + 0.05 * tint);
  half l2 = dot(clamp(rgb, 0.0, 1.0), LUMA);
  rgb += highlights * 0.25 * smoothstep(0.5, 1.0, l2) + shadows * 0.25 * (1.0 - smoothstep(0.0, 0.5, l2));
  return half4(clamp(rgb, 0.0, 1.0) * c.a, c.a);
}
`;
