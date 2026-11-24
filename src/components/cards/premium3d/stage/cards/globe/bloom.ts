"use client";

/* eslint-disable react-hooks/immutability -- the renderer's info counters are configured imperatively, as three.js expects */

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

/**
 * Desktop-only, selective bloom (decision D6): a soft halo only around what is far brighter than white in the HDR image (the star, the window
 * glow, the lantern and the tree lights, whose emissive is set above the threshold), never around the snow, the gold or reflections. Takes over rendering for this card's canvas only (a frame
 * callback with priority 1); the other cards never load it. Off: the scene renders exactly as without it.
 */
export function useGlobeBloom(wanted: boolean) {
  const { gl, scene, camera, size } = useThree();
  // adaptive: if this GPU cannot hold about 50 fps with bloom, bloom switches itself off for the visit (the glow halos remain)
  const [tooSlow, setTooSlow] = useState(false);
  const enabled = wanted && !tooSlow;
  const perf = useRef({ frames: 0, time: 0, warm: 0 });
  const composer = useMemo(() => {
    if (!enabled) return null;
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 2 });
    const c = new EffectComposer(gl, target);
    c.addPass(new RenderPass(scene, camera));
    c.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.45, 3.4)); // strength, radius, threshold (linear HDR)
    c.addPass(new OutputPass()); // tone mapping and sRGB, as the renderer does without post-processing
    return c;
  }, [enabled, gl, scene, camera]);
  useEffect(() => { if (composer) { composer.setPixelRatio(gl.getPixelRatio()); composer.setSize(size.width, size.height); } }, [composer, gl, size]);
  useEffect(() => () => { composer?.dispose(); }, [composer]);
  // several render calls per frame: count them all for the stats meter (three resets its counters on every call by default)
  useEffect(() => { if (!composer) return; gl.info.autoReset = false; return () => { gl.info.autoReset = true; }; }, [composer, gl]);
  useFrame((_, dt) => {
    if (!composer) return;
    gl.info.reset(); composer.render();
    const p = perf.current;
    if (p.warm < 90) { p.warm++; return; } // shaders compile and textures upload first
    p.frames++; p.time += dt;
    if (p.time >= 2) {
      const fps = p.frames / p.time;
      (window as unknown as { __globeBloom?: unknown }).__globeBloom = { on: true, fps: Math.round(fps) }; // read by the perf scripts
      if (fps < 50 && p.frames > 30) { setTooSlow(true); (window as unknown as { __globeBloom?: unknown }).__globeBloom = { on: false, fps: Math.round(fps) }; }
      p.frames = 0; p.time = 0;
    }
  }, enabled ? 1 : 0);
}
