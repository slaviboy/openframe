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
 * Glass refraction field, in layer coordinates, for a displacement map. The layer is approximated by
 * a rounded box (or an ellipse). Inside, within `depth` pixels of the edge, red and green encode the
 * outward edge normal scaled by how close the point is to the edge (0.5 = no displacement), so the
 * backdrop near the edge is sampled from further out, like looking through a lens.
 * Uniforms: width, height, corner, ellipse (1 for ellipses), depth.
 */
export const GLASS_FIELD_SKSL = `
uniform float width;
uniform float height;
uniform float corner;
uniform float ellipse;
uniform float depth;

float sdf(float2 p) {
  float2 halfSize = float2(width, height) * 0.5;
  if (ellipse > 0.5) {
    return (length(p / halfSize) - 1.0) * min(halfSize.x, halfSize.y);
  }
  float r = min(corner, min(halfSize.x, halfSize.y));
  float2 q = abs(p) - halfSize + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

half4 main(float2 xy) {
  float2 p = xy - float2(width, height) * 0.5;
  float d = sdf(p);
  float e = 0.5;
  float2 g = float2(sdf(p + float2(e, 0.0)) - sdf(p - float2(e, 0.0)), sdf(p + float2(0.0, e)) - sdf(p - float2(0.0, e)));
  float len = length(g);
  float2 n = len > 0.0 ? g / len : float2(0.0);
  float inside = -d;
  float f = inside > 0.0 && depth > 0.0 ? 1.0 - smoothstep(0.0, depth, inside) : 0.0;
  return half4(0.5 + 0.5 * n.x * f, 0.5 + 0.5 * n.y * f, 0.5, 1.0);
}
`;
