// Online VPN — the digital body.
//
// Tap the H.A.R.T. core once per visit: the real unit cracks into 3D cubes from
// the core outward, the cubes 3D-print Ra.One's hooded head (or G.One's) from the
// bottom up, the head rains back down into cubes, and the cubes print the H.A.R.T.
// back bottom to top, each one turning into its own piece of the real unit as it
// lands. The heads are sculpted as signed distance fields and meshed with
// marching cubes, then shaded as fractured metal and glass plates.
import * as THREE from "three";
import { MarchingCubes } from "three/addons/objects/MarchingCubes.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const CELL = 6;                                       // H.A.R.T. cube size, viewBox units
const VIEW = { x0: -120, y0: -100, w: 640, h: 620 };  // canvas extent, viewBox units
const U = 100;                                        // viewBox units per world unit
const FOV = 30;
const HEAD = { y: -0.15, scale: 1.55 };
const FLOOR = -2.75;
const HOLD = Number(new URLSearchParams(location.search).get("hold")) || Infinity; // ?hold=ms freezes the show there, for tuning
const T = {
  assemble: 420, flight: 1100, spread: 1100,          // cubes leave for the head, bottom rows first
  eyes: 2950,
  collapse: 5400, collapseDur: 1000,                  // the head rains down, top first
  reform: 7600, reformSpread: 1100, reformDur: 900,   // the H.A.R.T. prints back, bottom first
  end: 9700,
};

// ---------- small math ----------
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function ellipsoid(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const x = (px - cx) / rx, y = (py - cy) / ry, z = (pz - cz) / rz;
  const k0 = len3(x, y, z), k1 = len3(x / rx, y / ry, z / rz);
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// ---------- the heads, as signed distance fields (head space: y up, z toward the viewer) ----------
function raSkull(x, y, z) {
  const ax = Math.abs(x);
  let d = ellipsoid(x, y, z, 0, 0.28, -0.05, 0.74, 0.8, 0.86);              // cranium
  d = smin(d, ellipsoid(x, y, z, 0, -0.22, 0.22, 0.58, 0.52, 0.58), 0.25);  // face
  d = smin(d, ellipsoid(ax, y, z, 0.43, -0.15, 0.45, 0.2, 0.12, 0.22), 0.1); // cheekbones
  d = smin(d, ellipsoid(x, y, z, 0, -0.7, 0.22, 0.42, 0.24, 0.42), 0.18);   // jaw
  d = smin(d, ellipsoid(x, y, z, 0, -0.86, 0.42, 0.2, 0.1, 0.16), 0.1);     // chin
  d = smin(d, ellipsoid(ax, y, z, 0.26, 0.16, 0.62, 0.24, 0.07, 0.12), 0.08); // brow ridge
  d = smax(d, -ellipsoid(ax, y, z, 0.27, 0.0, 0.7, 0.2, 0.15, 0.3), 0.06);  // eye sockets
  d = smax(d, -ellipsoid(x, y, z, 0, -0.28, 0.74, 0.09, 0.14, 0.25), 0.04); // nasal cavity
  d = smax(d, -ellipsoid(ax, y, z, 0.74, 0.06, 0.2, 0.14, 0.26, 0.36), 0.1); // temples
  d = smax(d, -ellipsoid(ax, y, z, 0.44, -0.46, 0.52, 0.13, 0.14, 0.18), 0.1); // cheek hollows
  d = smax(d, -ellipsoid(x, y, z, 0, -0.6, 0.66, 0.3, 0.022, 0.2), 0.015);  // bite line
  if (y < -0.5 && y > -0.72 && ax < 0.3 && z > 0.4) {                       // teeth
    d += (1 - Math.abs(Math.sin((x * Math.PI) / 0.075))) * 0.012;
  }
  return d;
}

// the hood: the head sits deep in a cavity, seen through an oval opening
function raHood(x, y, z) {
  let d = ellipsoid(x, y, z, 0, 0.3, -0.02, 1.04, 1.2, 1.12);                 // hood
  d = smin(d, ellipsoid(x, y, z, 0, 0.95, -0.35, 0.62, 0.62, 0.7), 0.35);     // soft peak, up and back
  d = smin(d, ellipsoid(x, y, z, 0, -0.72, -0.08, 0.95, 0.62, 0.9), 0.3);     // wraps under the jaw
  // heavy folds hanging from the crown
  const a = Math.atan2(x, z + 0.1);
  d += 0.035 * Math.sin(a * 9 + y * 1.5) * smin(1, Math.max(0, 1.2 - Math.abs(y + 0.2)), 0.3);
  d = smax(d, -ellipsoid(x, y, z, 0, 0.28, 0.02, 0.9, 1.06, 1.02), 0.05);    // the cavity the head sits in
  const open = Math.sqrt((x / 0.6) ** 2 + ((y + 0.1) / 0.9) ** 2) - 1;        // the face opening
  d = smax(d, -Math.max(open, 0.1 - z), 0.04);
  return smax(d, -(y + 1.12), 0.06);                                          // open at the bottom, no body
}

// G.One: a sculpted human face (eyeballs are separate meshes) with swept-back hair
function gFace(x, y, z) {
  const ax = Math.abs(x);
  let d = ellipsoid(x, y, z, 0, 0.25, -0.05, 0.66, 0.82, 0.8);                // cranium
  d = smin(d, ellipsoid(x, y, z, 0, -0.25, 0.2, 0.5, 0.62, 0.5), 0.25);       // face
  d = smin(d, ellipsoid(ax, y, z, 0.38, -0.08, 0.42, 0.16, 0.1, 0.17), 0.12); // cheekbones
  d = smin(d, ellipsoid(ax, y, z, 0.3, -0.62, 0.15, 0.2, 0.24, 0.34), 0.15);  // angular jaw
  d = smin(d, ellipsoid(x, y, z, 0, -0.86, 0.42, 0.17, 0.11, 0.15), 0.1);     // chin
  d = smin(d, ellipsoid(ax, y, z, 0.22, 0.17, 0.6, 0.22, 0.06, 0.1), 0.08);   // heavy brow
  d = smax(d, -ellipsoid(ax, y, z, 0.23, 0.02, 0.66, 0.15, 0.085, 0.16), 0.05); // eye sockets
  d = smin(d, ellipsoid(ax, y, z, 0.23, 0.055, 0.6, 0.13, 0.04, 0.07), 0.03); // hooded upper lids
  d = smin(d, ellipsoid(ax, y, z, 0.23, -0.06, 0.6, 0.12, 0.025, 0.06), 0.03); // lower lids
  d = smin(d, ellipsoid(x, y, z, 0, -0.1, 0.7, 0.05, 0.2, 0.08), 0.06);       // nose bridge
  d = smin(d, ellipsoid(x, y, z, 0, -0.3, 0.78, 0.07, 0.06, 0.07), 0.05);     // nose tip
  d = smin(d, ellipsoid(ax, y, z, 0.065, -0.32, 0.7, 0.045, 0.04, 0.05), 0.03); // nose wings
  d = smax(d, -ellipsoid(ax, y, z, 0.04, -0.355, 0.72, 0.02, 0.012, 0.03), 0.01); // nostrils
  d = smin(d, ellipsoid(x, y, z, 0, -0.5, 0.69, 0.17, 0.035, 0.06), 0.03);    // upper lip
  d = smin(d, ellipsoid(x, y, z, 0, -0.575, 0.68, 0.15, 0.04, 0.06), 0.03);   // lower lip
  d = smax(d, -ellipsoid(x, y, z, 0, -0.535, 0.74, 0.17, 0.008, 0.08), 0.008); // mouth line
  d = smax(d, -ellipsoid(x, y, z, 0, -0.43, 0.73, 0.02, 0.05, 0.02), 0.01);   // philtrum
  d = smax(d, -ellipsoid(ax, y, z, 0.17, -0.54, 0.66, 0.025, 0.025, 0.04), 0.02); // mouth corners
  d = smin(d, ellipsoid(ax, y, z, 0.66, -0.05, -0.02, 0.06, 0.16, 0.1), 0.05); // ears
  return smax(d, -(y + 0.95), 0.05);                                           // face only
}
function gHair(x, y, z) {
  let d = ellipsoid(x, y, z, 0, 0.3, -0.08, 0.72, 0.9, 0.87);                 // cap over the cranium
  d = smin(d, ellipsoid(x, y, z, 0.04, 0.84, 0.3, 0.44, 0.2, 0.32), 0.15);    // front swept up and back
  const front = clamp01((z + 0.3) / 0.7);
  const hairline = lerp(-0.15, 0.56, front) - 0.1 * clamp01((Math.abs(x) - 0.35) / 0.3); // lower at the temples
  return Math.max(d, hairline - y);
}
const gSkin = (x, y, z) => Math.max(gFace(x, y, z), x);                          // viewer's left: a human face
const gHairHalf = (x, y, z) => Math.max(gHair(x, y, z), x);
const gCubeHalf = (x, y, z) => Math.max(Math.min(gFace(x, y, z), gHair(x, y, z)), -x); // viewer's right: only cubes

// Mesh an SDF over head space [-2, 2]^3. A coarse pass finds where the surface
// can be, so the exact SDF only runs near it.
async function mesh(sdf, res = 96) {
  const mc = new MarchingCubes(res, new THREE.MeshBasicMaterial(), false, false, 220000);
  const { field, size, halfsize: half, isolation } = mc;
  const toH = (i) => ((i - half) / half) * 2;
  const step = 4 / res, C = 4, cs = Math.ceil(size / C) + 1;
  const coarse = new Float32Array(cs * cs * cs);
  for (let z = 0; z < cs; z++) for (let y = 0; y < cs; y++) for (let x = 0; x < cs; x++) {
    coarse[x + y * cs + z * cs * cs] = sdf(toH(x * C), toH(y * C), toH(z * C));
  }
  const near = step * C * 1.8;
  for (let z = 0; z < size; z++) {
    const cz = Math.round(z / C) * cs * cs, hz = toH(z);
    for (let y = 0; y < size; y++) {
      const cy = cz + Math.round(y / C) * cs, hy = toH(y), row = y * size + z * size * size;
      for (let x = 0; x < size; x++) {
        const c = coarse[cy + Math.round(x / C)];
        const d = Math.abs(c) > near ? c : sdf(toH(x), hy, hz);
        field[row + x] = isolation - d * 600;
      }
    }
    if (z % 8 === 7) await new Promise((r) => setTimeout(r));
  }
  mc.update();
  const n = mc.count * 3;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(mc.positionArray.slice(0, n), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(mc.normalArray.slice(0, n), 3));
  geo.scale(2, 2, 2);
  mc.geometry.dispose();
  mc.material.dispose();
  return geo;
}

const heads = {};
function buildHead(side) {
  heads[side] ??= (async () => side === "ra"
    ? { plates: await mesh(raSkull), cloth: await mesh(raHood) }
    : { skin: await mesh(gSkin), hair: await mesh(gHairHalf), cubeHalf: await mesh(gCubeHalf) })();
  return heads[side];
}
// Warm both heads up while the visitor is still reading the page.
export async function prepare() {
  await buildHead("ra");
  await buildHead("g");
}

// ---------- materials ----------
const NOISE = /* glsl */ `
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  // cellular noise: x = distance to the nearest cell point, y = to the second nearest
  vec2 voronoi(vec3 p, out vec3 id) {
    vec3 i = floor(p), f = fract(p);
    float f1 = 8.0, f2 = 8.0;
    id = i;
    for (int z = -1; z <= 1; z++)
    for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec3 g = vec3(float(x), float(y), float(z));
      vec3 r = g + hash33(i + g) - f;
      float d = dot(r, r);
      if (d < f1) { f2 = f1; f1 = d; id = i + g; } else if (d < f2) { f2 = d; }
    }
    return vec2(sqrt(f1), sqrt(f2));
  }
`;

// Shared by both materials: hide everything above the print line (rising while
// the head is built) and above the cut line (falling while it crumbles), with a
// hot seam along whichever line is active.
function withPrintLine(material, uniforms, cellScale, body) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vObj;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvObj = position;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
        varying vec3 vObj;
        uniform vec3 uHot;
        uniform float uPrint, uCut, uGlow;
        ${NOISE}`)
      .replace("#include <clipping_planes_fragment>", `#include <clipping_planes_fragment>
        vec3 cellId;
        vec2 vor = voronoi(vObj * ${cellScale.toFixed(2)}, cellId);
        vec3 cellRnd = hash33(cellId + 17.0);
        float h = vObj.y + (cellRnd.x - 0.5) * 0.09;   // plate-jagged edge
        float line = min(uPrint, uCut);
        if (h > line) discard;
        float seam = 1.0 - smoothstep(0.0, 0.07, line - h);`);
    for (const [chunk, code] of body) {
      shader.fragmentShader = shader.fragmentShader.replace(chunk, code);
    }
  };
  return material;
}

// fractured plates: dark metal shards with glowing red/blue glass between them
function platesMaterial(uniforms, glassRatio, cellScale, crackGlow) {
  const m = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  return withPrintLine(m, uniforms, cellScale, [
    ["#include <color_fragment>", `#include <color_fragment>
      float glass = step(${(1 - glassRatio).toFixed(2)}, cellRnd.y);
      float crack = 1.0 - smoothstep(0.0, 0.045, vor.y - vor.x);
      float wire = (1.0 - glass) * step(0.72, cellRnd.x) * step(0.93, fract(dot(vObj, vec3(23.0, 17.0, 11.0))));
      diffuseColor.rgb = mix(vec3(0.03, 0.03, 0.034) * (0.6 + 0.8 * cellRnd.z), uHot * 0.07, glass);`],
    ["#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = mix(0.18 + 0.3 * cellRnd.x, 0.06, glass);`],
    ["#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
      metalnessFactor = mix(0.95, 0.15, glass);`],
    ["#include <normal_fragment_begin>", `#include <normal_fragment_begin>
      normal = normalize(normal + (hash33(cellId + 3.0) - 0.5) * 0.45);  // every plate tilted its own way`],
    ["#include <emissivemap_fragment>", `
      totalEmissiveRadiance = uHot * uGlow * (crack * ${crackGlow.toFixed(2)} + glass * (0.1 + 0.55 * cellRnd.z) + wire * 1.1) + uHot * seam * 4.0;`],
  ]);
}

// cloth for the hood (or the suit), folded, with a soft sheen
function clothMaterial(uniforms, color, sheen, scales) {
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: 1, metalness: 0, sheen: 0.8, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.8,
    envMapIntensity: 0.25, side: THREE.DoubleSide,
  });
  return withPrintLine(m, uniforms, 3.0, [
    ["#include <normal_fragment_begin>", `#include <normal_fragment_begin>
      normal = normalize(normal + vec3(sin(vObj.y * 7.0 + sin(vObj.x * 3.0) * 2.0) * 0.6 + sin(atan(vObj.x, vObj.z + 0.1) * 14.0), 0.0, cos(vObj.x * 6.0 + vObj.y * 2.0) * 0.5) * 0.22);
      ${scales ? `vec3 scaleId; vec2 sc = voronoi(vObj * 26.0, scaleId); normal = normalize(normal + (hash33(scaleId) - 0.5) * 0.35);` : ""}`],
    ["#include <emissivemap_fragment>", "totalEmissiveRadiance = uHot * seam * 4.0;"],
  ]);
}

// skin for G.One's human half: warm, slightly glossy, with dark hair and brows
function skinMaterial(uniforms) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x5a3626, roughness: 0.42, sheen: 0.35, sheenColor: new THREE.Color(0x9fb8d8), sheenRoughness: 0.6,
    clearcoat: 0.12, clearcoatRoughness: 0.45, side: THREE.DoubleSide,
  });
  return withPrintLine(m, uniforms, 6.0, [
    ["#include <color_fragment>", `#include <color_fragment>
      float brow = smoothstep(0.03, 0.0, abs(vObj.y - (0.175 + 0.04 * abs(vObj.x) - 0.08 * max(0.0, abs(vObj.x) - 0.3)))) * step(0.07, abs(vObj.x)) * step(abs(vObj.x), 0.4) * step(0.5, vObj.z);
      float dark = brow * 0.9;
      diffuseColor.rgb = mix(diffuseColor.rgb * (0.9 + 0.2 * cellRnd.z), vec3(0.012, 0.01, 0.01), dark);`],
    ["#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.62, dark);`],
    ["#include <normal_fragment_begin>", `#include <normal_fragment_begin>
      normal = normalize(normal + (hash33(floor(vObj * 140.0)) - 0.5) * 0.04);   // pores`],
    ["#include <emissivemap_fragment>", "totalEmissiveRadiance = uHot * seam * 4.0;"],
  ]);
}

// hair: near-black, swept back, with a cool sheen picking up the rim light
function hairMaterial(uniforms) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x050404, roughness: 0.55, sheen: 0.45, sheenColor: new THREE.Color(0x3c4a60), sheenRoughness: 0.45, side: THREE.DoubleSide,
  });
  return withPrintLine(m, uniforms, 5.0, [
    ["#include <normal_fragment_begin>", `#include <normal_fragment_begin>
      normal = normalize(normal + (hash33(floor(vec3(vObj.x * 160.0, vObj.y * 30.0, vObj.z * 14.0))) - 0.5) * 0.22); // strands running back`],
    ["#include <emissivemap_fragment>", "totalEmissiveRadiance = uHot * seam * 4.0;"],
  ]);
}

// ---------- the H.A.R.T. as cubes (only seen while cubes are in flight) ----------
const WHITE = [255, 255, 255];
const mix3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
function hartCell(x, y, HOT) {
  const dx = x - 200, dy = y - 200, d = Math.hypot(dx, dy);
  const ang = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
  if (d > 201) return null;
  if (d <= 16) return { c: WHITE, e: 1 };
  if (d <= 60) return { c: mix3(WHITE, HOT, (d - 16) / 44), e: 1 };
  if (d <= 92) return Math.abs(d - 72) < 3.5 ? { c: HOT, e: 0.7 } : { c: [8, 9, 12], e: 0 };
  if (d <= 100) return { c: HOT, e: 0.9 };
  if (d < 104) return { c: [6, 7, 10], e: 0 };
  if (d <= 152) return ang % 36 < 3.5 || ang % 36 > 32.5 ? { c: HOT, e: 1 } : { c: [40, 44, 52], e: 0 };
  if (d <= 168) return Math.abs(d - 160) < 3 && Math.floor(ang / 4) % 2 === 0 ? { c: HOT, e: 0.6 } : { c: [10, 11, 15], e: 0 };
  return { c: mix3([18, 20, 25], [78, 84, 96], 0.5 + 0.5 * Math.cos((ang - 315) * Math.PI / 180)), e: 0 };
}

// The unit exactly as it looks right now (its animations are frozen), as an image
// the 2D canvas can cut into cube-sized pieces. Computed styles are inlined
// because a standalone SVG can't see the page's CSS.
function snapshot(unit, scale) {
  const clone = unit.cloneNode(true);
  const src = unit.querySelectorAll("*"), dst = clone.querySelectorAll("*");
  const PROPS = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-opacity", "fill-opacity", "opacity", "stop-color", "stop-opacity"];
  src.forEach((el, i) => {
    const d = dst[i];
    d.removeAttribute("class");
    if (el.closest("defs") && el.tagName !== "stop") return;
    const cs = getComputedStyle(el);
    for (const p of PROPS) { const v = cs.getPropertyValue(p); if (v) d.setAttribute(p, v); }
    if (cs.transform && cs.transform !== "none") d.setAttribute("transform", `translate(200 200) ${cs.transform} translate(-200 -200)`);
  });
  clone.removeAttribute("class");
  clone.setAttribute("width", 400 * scale);
  clone.setAttribute("height", 400 * scale);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(clone));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function glowSprite(rgb) {
  const s = document.createElement("canvas");
  s.width = s.height = 64;
  const g = s.getContext("2d"), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},0.9)`);
  grad.addColorStop(0.35, `rgba(${rgb},0.35)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return s;
}

// area-weighted points on the side of a mesh that faces the viewer
function sampleSurface(geo, count, kind, out) {
  const p = geo.attributes.position.array, nrm = geo.attributes.normal.array;
  const tris = [], cum = [];
  let total = 0;
  for (let i = 0; i < p.length; i += 9) {
    const nz = nrm[i + 2] + nrm[i + 5] + nrm[i + 8];
    if (nz < -0.6) continue;
    const ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    const vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    total += 0.5 * len3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    tris.push(i);
    cum.push(total);
  }
  for (let s = 0; s < count; s++) {
    const r = Math.random() * total;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
    const i = tris[lo];
    let a = Math.random(), b = Math.random();
    if (a + b > 1) { a = 1 - a; b = 1 - b; }
    const c = 1 - a - b;
    const at = (o) => p[i + o] * c + p[i + 3 + o] * a + p[i + 6 + o] * b;
    const an = (o) => nrm[i + o] * c + nrm[i + 3 + o] * a + nrm[i + 6 + o] * b;
    const nl = len3(an(0), an(1), an(2)) || 1;
    out.push({ x: at(0), y: at(1), z: at(2), nx: an(0) / nl, ny: an(1) / nl, nz: an(2) / nl, kind });
  }
}

// ---------- the show ----------
export async function play(hart, side) {
  const unit = hart.querySelector(".unit");
  const root = document.documentElement;
  const HOT = getComputedStyle(root).getPropertyValue("--hot").trim().replace("#", "").match(/../g).map((h) => parseInt(h, 16));
  const hot = new THREE.Color().setRGB(HOT[0] / 255, HOT[1] / 255, HOT[2] / 255, THREE.SRGBColorSpace);

  hart.classList.add("frozen");
  const W = hart.getBoundingClientRect().width, k = W / 400, dpr = Math.min(2, window.devicePixelRatio || 1);
  const [real, head] = await Promise.all([snapshot(unit, k * dpr).catch(() => null), buildHead(side)]);

  // ---- two canvases over the unit: WebGL for the 3D world, 2D on top for the real unit's pieces
  const place = (c) => Object.assign(c.style, {
    left: VIEW.x0 * k + "px", top: VIEW.y0 * k + "px", width: VIEW.w * k + "px", height: VIEW.h * k + "px",
  });
  const gl = document.createElement("canvas");
  gl.className = "voxels gl";
  place(gl);
  const tiles = document.createElement("canvas");
  tiles.className = "voxels tiles";
  place(tiles);
  tiles.style.filter = getComputedStyle(unit).filter;
  tiles.width = Math.round(VIEW.w * k * dpr);
  tiles.height = Math.round(VIEW.h * k * dpr);
  hart.append(gl, tiles);
  const ctx = tiles.getContext("2d");
  ctx.scale(dpr * k, dpr * k);
  ctx.translate(-VIEW.x0, -VIEW.y0);
  const flash = glowSprite(HOT.join(","));

  // ---- renderer, camera framed so the z = 0 plane lines up with the 2D canvas exactly
  const renderer = new THREE.WebGLRenderer({ canvas: gl, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(dpr);
  renderer.setSize(VIEW.w * k, VIEW.h * k, false);
  renderer.setClearColor(0x030305, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = side === "ra" ? 0.35 : 0.7;
  const cy = -((VIEW.y0 + VIEW.h / 2) - 200) / U;
  const camera = new THREE.PerspectiveCamera(FOV, VIEW.w / VIEW.h, 0.1, 100);
  camera.position.set(0, cy, (VIEW.h / U / 2) / Math.tan((FOV / 2) * Math.PI / 180));
  camera.lookAt(0, cy, 0);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(VIEW.w * k * dpr, VIEW.h * k * dpr), 0.75, 0.32, 0.8));
  composer.addPass(new OutputPass());

  // ---- lights: cold light from above on the cloth, the H.A.R.T.'s colour from behind
  scene.add(new THREE.AmbientLight(0x16161c, 0.5));
  const key = new THREE.DirectionalLight(0xd2d4e2, side === "ra" ? 1.1 : 0.7);
  key.position.set(0.6, 4, 2.5);
  const rimL = new THREE.DirectionalLight(hot, 5);
  rimL.position.set(-3, 1.5, -2.5);
  const rimR = new THREE.DirectionalLight(hot, 3.5);
  rimR.position.set(3, 0.5, -2);
  const face = new THREE.DirectionalLight(side === "ra" ? 0xdfe6ff : 0xffd9bf, side === "ra" ? 1.1 : 1.6);
  face.position.set(side === "ra" ? -1.2 : -3, side === "ra" ? 2.6 : 1.2, side === "ra" ? 3 : 1.6); // G: hard side light, half the face in shadow
  scene.add(key, rimL, rimR, face);

  // ---- the head
  const uniforms = { uHot: { value: hot }, uPrint: { value: -10 }, uCut: { value: 10 }, uGlow: { value: 1 } };
  const group = new THREE.Group();
  group.position.set(0, HEAD.y, 0);
  group.scale.setScalar(HEAD.scale);
  const inner = new THREE.PointLight(hot, 5, 1.5, 2);
  inner.position.set(0, -0.1, 1.15);
  if (side === "ra") {
    group.add(
      new THREE.Mesh(head.plates, platesMaterial(uniforms, 0.3, 9, 1.7)),
      new THREE.Mesh(head.cloth, clothMaterial(uniforms, 0x09090c, 0x2c2c38, false)),
      inner);
  } else {
    group.add(new THREE.Mesh(head.skin, skinMaterial(uniforms)), new THREE.Mesh(head.hair, hairMaterial(uniforms)), inner);
  }

  // eyes: a burning slit (Ra) or a level, icy one (G), each lighting its socket
  const eyes = [];
  for (const s of side === "ra" ? [-1, 1] : [-1]) { // G's other eye is made of cubes
    const geo = new THREE.SphereGeometry(1, 24, 12);
    const glowMat = new THREE.MeshBasicMaterial({ color: hot.clone().multiplyScalar(7) });
    const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(10) });
    const glow = new THREE.Mesh(geo, glowMat), core = new THREE.Mesh(geo, coreMat);
    if (side === "ra") {
      glow.scale.set(0.12, 0.022, 0.03); glow.position.set(s * 0.27, -0.01, 0.47); glow.rotation.z = s * 0.45;
      core.scale.set(0.075, 0.006, 0.012); core.position.set(s * 0.27, -0.01, 0.5); core.rotation.z = s * 0.45;
    } else {
      glow.scale.set(0.042, 0.042, 0.012); glow.position.set(s * 0.23, 0.005, 0.612);  // an icy iris on the eyeball
      core.scale.set(0.011, 0.011, 0.008); core.position.set(s * 0.235, 0.015, 0.623);
    }
    const light = new THREE.PointLight(hot, 0, 0.6, 2);
    light.position.set(s * 0.27, 0, 0.6);
    group.add(glow, core, light);
    eyes.push({ glow, core, light, glowMat, coreMat });
  }
  // G's human eyeball, behind the lids
  const sclera = new THREE.Mesh(new THREE.SphereGeometry(0.1, 32, 16), new THREE.MeshPhysicalMaterial({ color: 0xc9c2bb, roughness: 0.15, clearcoat: 1 }));
  sclera.position.set(-0.23, 0.01, 0.52);
  sclera.visible = false;
  if (side === "g") group.add(sclera);
  scene.add(group);

  // ---- the cubes: one per H.A.R.T. cell
  const cells = [];
  for (let y = CELL / 2; y < 400; y += CELL) for (let x = CELL / 2; x < 400; x += CELL) {
    const c = hartCell(x, y, HOT);
    if (c) cells.push({ x, y, ...c });
  }
  const N = cells.length;
  const targets = [];
  if (side === "ra") {
    sampleSurface(head.plates, Math.round(N * 0.6), "plate", targets);
    sampleSurface(head.cloth, N - targets.length, "cloth", targets);
  } else {
    sampleSurface(head.cubeHalf, Math.round(N * 0.64), "cube", targets);  // these cubes stay: they are the face
    sampleSurface(head.skin, N - targets.length, "skin", targets);
  }
  for (let i = targets.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [targets[i], targets[j]] = [targets[j], targets[i]]; }
  let yMin = Infinity, yMax = -Infinity;
  for (const t of targets) { yMin = Math.min(yMin, t.y); yMax = Math.max(yMax, t.y); }
  const span = yMax - yMin;

  const cubeMat = new THREE.MeshStandardMaterial({ metalness: 0.75, roughness: 0.3 });
  cubeMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec3 aEmissive;\nvarying vec3 vEmissive;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEmissive = aEmissive;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vEmissive;")
      .replace("#include <emissivemap_fragment>", "totalEmissiveRadiance = vEmissive;");
  };
  const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
  const emissiveAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  cubeGeo.setAttribute("aEmissive", emissiveAttr);
  const cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, N);
  cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cubes.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
  cubes.frustumCulled = false;
  scene.add(cubes);

  const toLinear = (c) => new THREE.Color().setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace);
  const FACE = { metal: new THREE.Color(0.035, 0.035, 0.04), hood: new THREE.Color(0.012, 0.012, 0.016), skin: new THREE.Color(0.3, 0.12, 0.07) };
  const zAxis = new THREE.Vector3(0, 0, 1);
  const P = cells.map((c, i) => {
    const t = targets[i], hd = Math.hypot(c.x - 200, c.y - 200) / 201, tYN = (t.y - yMin) / span;
    const glass = t.kind === "plate" && Math.random() < 0.28;
    const hartColor = toLinear(c.c);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
    let faceColor = t.kind === "plate" ? FACE.metal : t.kind === "cloth" ? FACE.hood : FACE.skin, faceEm = new THREE.Color(0, 0, 0);
    if (glass) { faceColor = hot.clone().multiplyScalar(0.25); faceEm = hot.clone().multiplyScalar(0.8); }
    if (t.kind === "cube") { // shiny blue blocks; the ones around the eye burn
      const eye = Math.hypot(t.x - 0.23, t.y - 0.01, t.z - 0.6) < 0.085;
      faceColor = hot.clone().multiplyScalar(0.22 + Math.random() * 0.3);
      faceEm = hot.clone().multiplyScalar(eye ? 2.6 : 0.03 + Math.random() ** 4 * 0.6);
    }
    return {
      hx: (c.x - 200) / U, hy: -(c.y - 200) / U,
      hartColor, hartEm: hartColor.clone().multiplyScalar(0.08 + c.e * 0.9),
      faceColor, faceEm, persist: t.kind === "cube",
      align: new THREE.Quaternion().setFromUnitVectors(zAxis, new THREE.Vector3(t.nx, t.ny, t.nz)),
      t, tYN, local: new THREE.Vector3(t.x, t.y, t.z), normal: new THREE.Vector3(t.nx, t.ny, t.nz),
      dep: hd * 300 + Math.random() * 60,                                   // cracks open from the core outward
      drift: new THREE.Vector3((c.x - 200) / U * 0.06 + (Math.random() - 0.5) * 0.08, -(c.y - 200) / U * 0.06 + (Math.random() - 0.5) * 0.08, 0.25 + Math.random() * 0.35),
      swirl: [(Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.2],
      qRand: q,
      ad: T.assemble + tYN * T.spread + Math.random() * 120,                // head prints bottom-up
      cd: T.collapse + (1 - tYN) * T.collapseDur,                           // and rains down top-first
      rd: T.reform + (1 - c.y / 400) * T.reformSpread + Math.random() * 60, // H.A.R.T. prints bottom-up
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Quaternion(), spin: new THREE.Vector3(),
      falling: false, rest: null, restRot: null,
      pile: Math.random() ** 2 * 0.18 * Math.max(0, 1 - Math.abs(t.x) / 2.5),
    };
  });
  // print and cut lines in head space, as a fraction of the head's height
  const printYN = (t) => (t - T.assemble - T.flight - 170) / T.spread;
  const cutYN = (t) => 1 - (t - T.collapse) / T.collapseDur;

  // ---- frame loop
  const m4 = new THREE.Matrix4(), scl = new THREE.Vector3(), tmp = new THREE.Vector3(), start3 = new THREE.Vector3();
  const id = new THREE.Quaternion(), spinQ = new THREE.Quaternion();
  const color = new THREE.Color(), em = new THREE.Color();
  const HART_SIZE = (CELL / U) * 0.98, FACE_SIZE = 0.045, BLOCK_SIZE = 0.064;
  const worldAlign = new THREE.Quaternion();
  // compile every shader before the clock starts, so the first frames are not lost to a stall
  await renderer.compileAsync(scene, camera);
  composer.render();
  let glitchUntil = 0, last = performance.now(), first = true;
  const t0 = last;

  await new Promise((resolve) => {
    requestAnimationFrame(function frame(now) {
      const t = Math.min(now - t0, HOLD), dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      // the head turns to face you as it prints, then holds, swaying a little
      const turn = easeOut(clamp01(t / T.eyes));
      group.rotation.y = lerp(side === "ra" ? -0.7 : 0.55, side === "ra" ? -0.12 : 0.05, turn) + (t > T.eyes ? 0.18 * easeInOut(clamp01((t - T.eyes) / 2200)) + 0.03 * Math.sin(t / 700) : 0);
      group.rotation.x = side === "ra" ? 0.1 : 0.04;
      group.position.x = now < glitchUntil ? (Math.random() - 0.5) * 0.08 : 0;
      if (t > T.eyes && t < T.collapse && now > glitchUntil + 260 && Math.random() < 0.05) glitchUntil = now + 70;
      group.updateMatrixWorld();

      const pYN = printYN(t), cYN = t < T.collapse ? 2 : cutYN(t);
      uniforms.uPrint.value = yMin + pYN * span;
      uniforms.uCut.value = yMin + cYN * span;
      uniforms.uGlow.value = now < glitchUntil ? 0.35 : 0.85 + 0.15 * Math.sin(t / 90);

      const eyeY = 0, eyesOn = uniforms.uPrint.value > eyeY + 0.05 && uniforms.uCut.value > eyeY;
      const ignite = clamp01((t - T.eyes) / 250);
      const flicker = ignite < 1 ? (Math.random() < 0.5 ? 1 : 0.2) : 0.85 + 0.15 * Math.sin(t / 55);
      const power = eyesOn && t > T.eyes ? ignite * flicker * (now < glitchUntil ? 0.3 : 1) * (side === "ra" ? 1 : 0.35) : 0;
      for (const e of eyes) {
        e.glow.visible = e.core.visible = power > 0.02;
        e.glowMat.color.copy(hot).multiplyScalar(3.2 * power);
        e.coreMat.color.setScalar(4.5 * power);
        e.light.intensity = 1.2 * power;
      }
      sclera.visible = uniforms.uPrint.value > 0.12 && uniforms.uCut.value > 0.02;
      inner.intensity = (side === "ra" ? 3 : 2.5) * clamp01((t - T.assemble - T.flight) / 1200) * (t > T.collapse ? clamp01(cYN) : 1);

      const solid = [], flashes = [];
      for (let i = 0; i < N; i++) {
        const p = P[i];
        let size = 0, c0 = p.hartColor, c1 = p.hartColor, e0 = p.hartEm, e1 = p.hartEm, ck = 0;
        if (t < p.dep) {
          solid.push(i);                                           // still part of the real unit
        } else if (t < p.ad) {                                       // cracked loose, drifting forward
          const q = easeOut(clamp01((t - p.dep) / 350));
          p.pos.set(p.hx + p.drift.x * q, p.hy + p.drift.y * q, p.drift.z * q);
          p.rot.slerpQuaternions(id, p.qRand, 0.15 * q);
          size = HART_SIZE;
        } else if (t < T.collapse) {                                 // flying to the head, then printed into it
          const q = easeInOut(clamp01((t - p.ad) / T.flight)), arc = Math.sin(Math.PI * q);
          start3.set(p.hx + p.drift.x, p.hy + p.drift.y, p.drift.z);
          tmp.copy(p.local).applyMatrix4(group.matrixWorld);
          p.pos.lerpVectors(start3, tmp, q);
          p.pos.x += p.swirl[0] * arc; p.pos.y += p.swirl[1] * arc * 0.5; p.pos.z += 1.3 * arc;
          if (p.persist) { // a block of G's face: settles flush with the surface and stays
            worldAlign.copy(group.quaternion).multiply(p.align);
            p.rot.slerpQuaternions(p.qRand, worldAlign, q);
            size = lerp(HART_SIZE, BLOCK_SIZE, q);
          } else {
            p.rot.slerpQuaternions(id, p.qRand, 0.15 + 0.85 * q);
            size = p.tYN < pYN ? 0 : lerp(HART_SIZE, FACE_SIZE, q);
          }
          c1 = p.faceColor; e1 = p.faceEm; ck = q;
        } else if (t < T.reform) {                                   // raining down
          if (!p.falling && t >= p.cd) {
            p.falling = true;
            p.pos.copy(p.local).applyMatrix4(group.matrixWorld);
            tmp.copy(p.normal).transformDirection(group.matrixWorld);
            p.vel.set(tmp.x * (0.5 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.6, tmp.y * 0.6 + Math.random() * 0.8, tmp.z * 0.6 + Math.random() * 0.4);
            if (!p.persist) p.rot.copy(p.qRand);
            p.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(3 + Math.random() * 7);
          }
          if (p.falling) {
            p.vel.y -= 16 * dt;
            p.pos.addScaledVector(p.vel, dt);
            const floor = FLOOR + p.pile;
            if (p.pos.y < floor) {
              p.pos.y = floor;
              if (p.vel.y < -1.5) { p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; p.spin.multiplyScalar(0.6); }
              else { p.vel.y = 0; p.vel.x *= 0.88; p.vel.z *= 0.88; p.spin.multiplyScalar(0.85); }
            }
            const ang = p.spin.length() * dt;
            if (ang > 1e-4) p.rot.premultiply(spinQ.setFromAxisAngle(tmp.copy(p.spin).normalize(), ang));
            size = p.persist ? BLOCK_SIZE : FACE_SIZE;
          } else if (p.persist) {
            p.pos.copy(p.local).applyMatrix4(group.matrixWorld);
            p.rot.copy(group.quaternion).multiply(p.align);
            size = BLOCK_SIZE;
          }
          c0 = c1 = p.faceColor; e0 = e1 = p.faceEm;
        } else {                                                     // printing the H.A.R.T. back, bottom-up
          if (!p.rest) { p.rest = p.pos.clone(); p.restRot = p.rot.clone(); }
          const raw = (t - p.rd) / T.reformDur;
          if (raw >= 1) {
            solid.push(i);                                           // landed: it is the real unit again
            if (raw < 1.27) flashes.push(i, 1 - (raw - 1) / 0.27);
          } else if (raw > 0) {
            const q = easeOut(raw);
            p.pos.set(lerp(p.rest.x, p.hx, q), lerp(p.rest.y, p.hy, q) + Math.sin(Math.PI * q) * 0.9, lerp(p.rest.z, 0, q));
            p.rot.slerpQuaternions(p.restRot, id, q);
            size = lerp(p.persist ? BLOCK_SIZE : FACE_SIZE, HART_SIZE, q);
            c0 = p.faceColor; e0 = p.faceEm; ck = q;
          } else {
            size = FACE_SIZE;
            c0 = c1 = p.faceColor; e0 = e1 = p.faceEm;
          }
        }
        m4.compose(p.pos, p.rot, scl.setScalar(size));
        cubes.setMatrixAt(i, m4);
        color.copy(c0).lerp(c1, ck);
        cubes.setColorAt(i, color);
        em.copy(e0).lerp(e1, ck);
        emissiveAttr.setXYZ(i, em.r, em.g, em.b);
      }
      cubes.instanceMatrix.needsUpdate = true;
      cubes.instanceColor.needsUpdate = true;
      emissiveAttr.needsUpdate = true;
      composer.render();

      // the real unit, piece by piece
      ctx.clearRect(VIEW.x0, VIEW.y0, VIEW.w, VIEW.h);
      if (solid.length && real) {
        ctx.save();
        ctx.beginPath();
        for (const i of solid) ctx.rect(cells[i].x - CELL / 2, cells[i].y - CELL / 2, CELL, CELL);
        ctx.clip();
        ctx.drawImage(real, 0, 0, 400, 400);
        ctx.restore();
      }
      ctx.globalCompositeOperation = "lighter";
      for (let f = 0; f < flashes.length; f += 2) {
        const c = cells[flashes[f]];
        ctx.globalAlpha = 0.6 * flashes[f + 1];
        ctx.drawImage(flash, c.x - CELL * 1.8, c.y - CELL * 1.8, CELL * 3.6, CELL * 3.6);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      if (first) { // first frame is up: the canvases now show the unit exactly
        first = false;
        unit.style.transition = "none";
        unit.style.opacity = "0";
        gl.style.opacity = "1";
      }
      if (t < T.end) return requestAnimationFrame(frame);
      resolve();
    });
  });

  // every piece is back: hand over to the live unit on the same frame
  unit.style.opacity = "";
  hart.classList.remove("frozen");
  tiles.remove();
  gl.style.opacity = "0";
  requestAnimationFrame(() => { unit.style.transition = ""; });
  setTimeout(() => {
    gl.remove();
    composer.dispose();
    pmrem.dispose();
    scene.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
    renderer.dispose();
    renderer.forceContextLoss();
  }, 600);
}
