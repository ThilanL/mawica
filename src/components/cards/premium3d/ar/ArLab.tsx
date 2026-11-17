"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { USDZExporter } from "three/addons/exporters/USDZExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { AR_LENGTH, buildGiftAR } from "@/components/cards/premium3d/ar/gift-ar";

type Exported = { glb: ArrayBuffer; usdz: ArrayBuffer; usdzStatic: ArrayBuffer; glbStatic: ArrayBuffer };

/** Exports the generic (non-personal) AR gift in every format. The animated files carry the opening clip; the static ones show the opened pose (reduced motion). */
async function exportAll(): Promise<Exported> {
  const gift = buildGiftAR(), clip = gift.clip();
  try {
    const gltf = new GLTFExporter(), usdz = new USDZExporter();
    const glb = (await gltf.parseAsync(gift.scene, { binary: true, animations: [clip], maxTextureSize: 1024 })) as ArrayBuffer;
    const usdzAnim = await usdz.parseAsync(gift.scene, { animations: [clip], animationFrameRate: 30, quickLookCompatible: true });
    gift.pose(AR_LENGTH); // opened, at rest
    const glbStatic = (await gltf.parseAsync(gift.scene, { binary: true, maxTextureSize: 1024 })) as ArrayBuffer;
    const usdzStatic = await usdz.parseAsync(gift.scene, { quickLookCompatible: true });
    return { glb, usdz: usdzAnim.buffer as ArrayBuffer, usdzStatic: usdzStatic.buffer as ArrayBuffer, glbStatic };
  } finally { gift.dispose(); }
}

const b64 = (b: ArrayBuffer) => { let s = ""; const u = new Uint8Array(b); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

/** Development lab: exports the AR gift, reloads the exported GLB and plays it, and reports its size in metres. 404 in production (see page.tsx). */
export function ArLab() {
  const host = useRef<HTMLDivElement>(null);
  const [info, setInfo] = useState<string>("exporting…");
  useEffect(() => {
    let stop = false, raf = 0; const el = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setSize(el.clientWidth, el.clientHeight); el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#8a8a8a");
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // neutral studio light, close to what AR viewers use
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({ color: "#b9b4ad", roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
    scene.add(new THREE.GridHelper(1, 10, "#555", "#777")); // 10 cm grid
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.01, 20); camera.position.set(0.9, 0.75, 1.25);
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 0.2, 0); controls.update();
    const clock = new THREE.Clock(); let mixer: THREE.AnimationMixer | null = null;
    const q = new URLSearchParams(location.search), seek = q.has("t") ? Number(q.get("t")) : null;

    const exporting = exportAll().then(async (x) => {
      const gltf = await new GLTFLoader().parseAsync(x.glb.slice(0), "");
      if (stop) return x;
      scene.add(gltf.scene);
      const box = new THREE.Box3().setFromObject(gltf.scene), size = box.getSize(new THREE.Vector3());
      let tris = 0; gltf.scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3; });
      mixer = new THREE.AnimationMixer(gltf.scene); const action = mixer.clipAction(gltf.animations[0]); action.play();
      if (seek !== null) { action.paused = true; action.time = seek; mixer.update(0); }
      const kb = (b: ArrayBuffer) => `${(b.byteLength / 1024).toFixed(0)} KB`;
      const report = { glb: kb(x.glb), glbStatic: kb(x.glbStatic), usdz: kb(x.usdz), usdzStatic: kb(x.usdzStatic), clip: `${gltf.animations[0].duration.toFixed(2)} s, ${gltf.animations[0].tracks.length} tracks`, closedBox_m: [size.x, size.y, size.z].map((v) => v.toFixed(3)), minY_m: box.min.y.toFixed(4), triangles: Math.round(tris) };
      setInfo(JSON.stringify(report, null, 1));
      (window as unknown as { __arReport?: unknown }).__arReport = report;
      return x;
    });
    (window as unknown as { __arExport?: () => Promise<Record<string, string>> }).__arExport = async () => { const x = await exporting; return { glb: b64(x.glb), glbStatic: b64(x.glbStatic), usdz: b64(x.usdz), usdzStatic: b64(x.usdzStatic) }; };

    const loop = () => { raf = requestAnimationFrame(loop); if (mixer && seek === null) mixer.update(clock.getDelta()); renderer.render(scene, camera); };
    loop();
    return () => { stop = true; cancelAnimationFrame(raf); controls.dispose(); pmrem.dispose(); renderer.dispose(); el.removeChild(renderer.domElement); };
  }, []);
  return (
    <div className="relative h-dvh w-full">
      <div ref={host} className="absolute inset-0" />
      <pre data-testid="ar-report" className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-black/60 p-2 font-mono text-[11px] text-white">{info}</pre>
    </div>
  );
}
