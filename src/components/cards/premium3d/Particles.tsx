"use client";

/* eslint-disable react-hooks/immutability -- frame loop: typed arrays and Three.js objects are mutated imperatively by design */
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { layerCount, type AmbientLayer, type AmbientPreset } from "./ambient";
import { FOV } from "./timeline";
import type { Shared } from "./rig";

/** Additive "light" blending that adds colour but leaves canvas alpha alone (plain additive leaves dark specks on a transparent canvas). */
export const ADD_LIGHT = {
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.SrcAlphaFactor,
  blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor,
  blendDstAlpha: THREE.OneFactor,
} as const;

const VERT = /* glsl */ `
  attribute float aRand;
  uniform float uScale; uniform float uSize; uniform float uTime; uniform float uTwinkle; uniform float uOpacity; uniform float uFar; uniform float uStretch;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float dist = max(0.001, -mv.z);
    gl_PointSize = clamp(uSize * uScale / dist * uStretch, 1.0, 160.0);
    float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * 1.8 + aRand * 60.0)) * 0.75;
    float nearFade = smoothstep(0.7, 2.2, dist);
    float farFade = 1.0 - smoothstep(uFar * 0.5, uFar, dist);
    vA = uOpacity * tw * nearFade * farFade;
    gl_Position = projectionMatrix * mv;
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uColor; uniform vec2 uDir; uniform float uStretch; varying float vA;
  void main() {
    // wind-blown flakes are stretched along their direction of travel (a short streak), calm ones are round
    vec2 p = gl_PointCoord - 0.5;
    p = vec2(dot(p, uDir), dot(p, vec2(-uDir.y, uDir.x)));
    p.x /= uStretch;
    float d = length(p) * 2.0;
    float a = smoothstep(1.0, 0.0, d); a *= a;
    gl_FragColor = vec4(uColor, a * vA);
  }
`;

function Layer({ layer, count, shared }: { layer: AmbientLayer; count: number; shared: { current: Shared } }) {
  const { camera, gl } = useThree();
  const pts = useRef<THREE.Points>(null);
  const init = useRef(false);
  const data = useMemo(() => {
    let s = 1234567 + count * 7 + Math.round(layer.size * 1000);
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    return { pos: new Float32Array(count * 3), rand: Float32Array.from({ length: count }, () => rnd()), rnd };
  }, [count, layer.size]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
        uniforms: {
          uScale: { value: 600 }, uSize: { value: layer.size }, uTime: { value: 0 }, uTwinkle: { value: layer.twinkle ?? 0 },
          uOpacity: { value: layer.opacity }, uFar: { value: layer.box.far }, uColor: { value: new THREE.Color(...layer.color) }, uStretch: { value: 1 }, uDir: { value: new THREE.Vector2(0, -1) },
        },
        ...(layer.glow ? ADD_LIGHT : {}),
      }),
    [layer],
  );
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.pos, 3));
    g.setAttribute("aRand", new THREE.BufferAttribute(data.rand, 1));
    return g;
  }, [data]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const sh = shared.current;
    const { sx, sy, near, far } = layer.box;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const pos = data.pos;
    if (!init.current) {
      for (let i = 0; i < count; i++) {
        pos[i * 3] = cx + (data.rnd() * 2 - 1) * sx;
        pos[i * 3 + 1] = cy + (data.rnd() * 2 - 1) * sy;
        pos[i * 3 + 2] = cz - (near + data.rnd() * (far - near));
      }
      init.current = true;
    }
    const t = sh.t;
    const wind = sh.wind * layer.windInfluence;
    const zr = far - near;
    for (let i = 0; i < count; i++) {
      const k = i * 3;
      const ph = data.rand[i] * 6.2831;
      let x = pos[k] + (Math.sin(t * 0.7 + ph) * layer.sway + wind * 1.7 + Math.sin(t * 0.31 + ph * 2) * wind * 0.8) * dt;
      let y = pos[k + 1] - (layer.speed * (0.7 + data.rand[i] * 0.6) + Math.sin(t * 0.9 + ph) * 0.12) * dt;
      let z = pos[k + 2] + Math.cos(t * 0.5 + ph) * 0.06 * dt;
      let dy = y - cy; if (dy < -sy) dy += 2 * sy; else if (dy > sy) dy -= 2 * sy; y = cy + dy;
      let dx = x - cx;
      if (dx < -sx) dx += 2 * sx; else if (dx > sx) dx -= 2 * sx; x = cx + dx;
      let dz = cz - z; // distance in front of the camera
      if (dz < near) dz += zr; else if (dz > far) dz -= zr; z = cz - dz;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    }
    (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const u = material.uniforms;
    u.uTime.value = t;
    u.uScale.value = gl.domElement.height / (2 * Math.tan((FOV * Math.PI) / 360));
    u.uOpacity.value = layer.opacity * (layer.glow ? 1 : sh.storm);
    if (!layer.glow) {
      const vx = wind * 1.7, vy = -layer.speed; // world velocity, mostly sideways in a storm
      const len = Math.hypot(vx, vy) || 1;
      u.uDir.value.set(vx / len, vy / len);
      u.uStretch.value = 1 + Math.min(1.6, Math.abs(wind) * 0.55 * layer.windInfluence);
    }
  });

  return <points ref={pts} geometry={geometry} material={material} frustumCulled={false} renderOrder={layer.glow ? 3 : 2} />;
}

/** The storm. Layers at different depths fall and drift at different speeds; the wind drops as the envelope settles. */
export function Particles({ preset, mobile, shared }: { preset: AmbientPreset; mobile: boolean; shared: { current: Shared } }) {
  return (
    <group>
      {preset.layers.map((l) => (
        <Layer key={l.id} layer={l} count={layerCount(l, mobile, preset)} shared={shared} />
      ))}
    </group>
  );
}
