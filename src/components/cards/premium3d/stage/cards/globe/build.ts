import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { rng, starGeometry } from "../../gfx";
import {
  BAND, BASE_PROFILE, BUSHES, COLORS, GLASS_THETA, GLOBE, INNER_R, PATH, PROFILES, bandRadiusAt, groundHeight, innerRadiusAt, placement, type ProfileName,
} from "../globe-model";
import { twoSided } from "../../../ar/model";
import { alphaAsMask, engravingMask, knitNormal, loadTexture, needleTexture, pathMaps } from "./textures";

/**
 * Builds the complete snow globe as a plain three.js group (metres, Y up, resting on Y = 0, logo facing +Z). Renderer-independent: the web card
 * adds it to its scene, and the AR exporters (Stage E) can build it with the "ar" profile. Platform differences are confined to materials and
 * density (see PROFILES); the geometry and layout are the same everywhere.
 */
export type GlobeOptions = {
  profile: ProfileName;
  /** Environment map for reflections (web). AR viewers bring their own lighting, so AR builds pass none. */
  envMap?: THREE.Texture | null;
  /** Lines engraved on the back of the base (already clamped, see engraving.ts). Empty: a plain engraved cartouche. Change later with setEngraving. */
  engraving?: string[];
  /** Base URL of the shipped asset files. */
  assets?: string;
};

export type GlobeParts = {
  root: THREE.Group;
  /** Named nodes the lighting and animation stages drive. */
  nodes: { glass: THREE.Mesh; star: THREE.Group; windows: THREE.Mesh[]; lanternLight: THREE.Object3D; lights: THREE.InstancedMesh | null; engraving: THREE.Mesh; chimneyTop: THREE.Object3D };
  /** Re-engraves the back of the base (only its mask texture is redrawn: the model is not rebuilt, so typing in the wizard stays cheap). */
  setEngraving(lines: string[]): void;
  /** Every material, so the caller can set the environment, shadows or export variants. */
  materials: THREE.Material[];
  dispose(): void;
};

const ASSETS = "/models/snow-globe";
/** Materials that glow (bloom on desktop). Every other material is kept below the bloom threshold. */
export const EMITTERS = new Set(["tree_lights", "star_gold", "lantern_bulb", "window_warm"]);
export const BLOOM_CAP = 3.0;

function capBrightness(m: THREE.Material) {
  const prev = m.onBeforeCompile.bind(m), prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    s.fragmentShader = s.fragmentShader.replace("#include <opaque_fragment>", `#include <opaque_fragment>
      gl_FragColor.rgb = min( gl_FragColor.rgb, vec3( ${BLOOM_CAP.toFixed(1)} ) );`);
  };
  m.customProgramCacheKey = () => `${prevKey()}|cap`;
}
const TAU = Math.PI * 2;

export async function buildSnowGlobe(o: GlobeOptions): Promise<GlobeParts> {
  const P = PROFILES[o.profile], base = o.assets ?? ASSETS;
  const owned: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => { owned.push(x); return x; };
  const materials: THREE.Material[] = [];
  const mat = <T extends THREE.Material>(m: T) => { materials.push(keep(m)); return m; };
  const root = new THREE.Group(); root.name = "mawica_snow_globe";

  // ---------- shared materials ----------
  const gold = mat(new THREE.MeshPhysicalMaterial({ name: "gold", color: "#f0c25e", metalness: 1, roughness: 0.16, clearcoat: 0.4, clearcoatRoughness: 0.1 }));
  const goldSatin = mat(new THREE.MeshPhysicalMaterial({ name: "gold_satin", color: "#e8b553", metalness: 1, roughness: 0.3 }));
  const lacquer = mat(new THREE.MeshPhysicalMaterial({ name: "red_lacquer", color: COLORS.lacquer, metalness: 0, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.045, sheen: 0.25, sheenColor: new THREE.Color("#ff6a5a"), sheenRoughness: 0.5 }));
  const [snowColor, snowNormal, snowArm] = await Promise.all(["snow_color", "snow_normal", "snow_arm"].map((n) => loadTexture(`${base}/tex/${n}.webp`, n === "snow_color")));
  for (const t of [snowColor, snowNormal, snowArm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; keep(t); }
  const snowMat = (repeat: number, extra: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => {
    const c = snowColor.clone(), n = snowNormal.clone(), a = snowArm.clone();
    for (const t of [c, n, a]) { t.repeat.set(repeat, repeat); t.needsUpdate = true; keep(t); }
    return mat(new THREE.MeshPhysicalMaterial({ name: "snow", color: "#ffffff", map: c, normalMap: n, normalScale: new THREE.Vector2(0.55, 0.55), roughnessMap: a, aoMap: a, aoMapIntensity: 0.6, roughness: 1, metalness: 0, sheen: 0.6, sheenColor: new THREE.Color("#dfe8ff"), sheenRoughness: 0.35, emissive: "#dfe6ff", emissiveIntensity: 0.13, envMapIntensity: 1.3, ...extra }));
  };

  // ---------- base ----------
  const baseGroup = new THREE.Group(); baseGroup.name = "base"; root.add(baseGroup);
  for (const seg of BASE_PROFILE) {
    const g = keep(new THREE.LatheGeometry(seg.pts.map(([r, y]) => new THREE.Vector2(r, y)), P.lathe));
    const m = new THREE.Mesh(g, seg.mat === "red" ? lacquer : gold); m.name = `base_${seg.mat}`; m.castShadow = m.receiveShadow = true; baseGroup.add(m);
  }
  // a band-shaped decal: the part of the red band between two angles, pushed out by `lift`, UV u across the angle range and v up the band
  const bandDecal = (phiCenter: number, phiWidth: number, y0: number, y1: number, lift: number, rows = 12) => {
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= rows; i++) { const y = y0 + ((y1 - y0) * i) / rows; pts.push(new THREE.Vector2(bandRadiusAt(y) + lift, y)); }
    // LatheGeometry measures phi from +Z towards +X; our "front" is +Z, so phiStart is centred on the requested angle
    // u grows with phi, which runs from +Z towards +X: seen from outside, the decal reads left to right
    return keep(new THREE.LatheGeometry(pts, Math.max(8, Math.round(48 * phiWidth)), phiCenter - phiWidth / 2, phiWidth));
  };
  // Mawica wordmark (front). Never redrawn: the official asset is the mask of a gold decal.
  const mark = keep(alphaAsMask(await loadTexture("/brand/mawica-mark.png")));
  const logoW = 0.084, logoH = logoW * (560 / 2000), logoY = (BAND.y0 + BAND.y1) / 2 + 0.0008;
  const logoPhi = logoW / bandRadiusAt(logoY);
  const logoMat = mat(new THREE.MeshPhysicalMaterial({ name: "gold_logo", color: "#f6cd6d", metalness: 1, roughness: 0.12, alphaMap: mark, alphaTest: 0.35, emissive: "#3a2306", emissiveIntensity: 0.6 }));
  const logo = new THREE.Mesh(bandDecal(0, logoPhi, logoY - logoH / 2, logoY + logoH / 2, 0.00025), logoMat); logo.name = "logo"; baseGroup.add(logo);

  // gold snowflakes and filigree scrolls around the band (real geometry, not painted on)
  const flakeGeo = keep(snowflakeGeometry(0.0078, 0.0007, P.lod < 1 ? 1 : 2));
  const flakes = new THREE.InstancedMesh(flakeGeo, gold, 6); flakes.name = "snowflakes"; flakes.castShadow = true;
  const flakeAngles = [0.8, 1.56, 2.36].flatMap((a) => [a, -a]);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
  flakeAngles.forEach((phi, i) => {
    const y = logoY, r = bandRadiusAt(y) + 0.00045, n = new THREE.Vector3(Math.sin(phi), 0.06, Math.cos(phi)).normalize();
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
    tmpM.compose(tmpV.set(Math.sin(phi) * r, y, Math.cos(phi) * r), tmpQ, tmpS.setScalar(i % 2 ? 1 : 1)); flakes.setMatrixAt(i, tmpM);
  });
  baseGroup.add(flakes);
  if (P.filigree) {
    const scrolls: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) for (const phi0 of [1.18, 1.96]) scrolls.push(filigreeGeometry(side * phi0, logoY, side, P.lathe > 80 ? 1 : 0.6));
    const fil = new THREE.Mesh(keep(mergeGeometries(scrolls)!), goldSatin); fil.name = "filigree"; fil.castShadow = true; baseGroup.add(fil);
    scrolls.forEach((g) => g.dispose());
  }
  // engraving on the back: a gold cartouche frame and the personal text as a gold decal (empty text: just the frame)
  const engW = 0.054, engH = 0.02, engY = logoY, engPhi = engW / bandRadiusAt(engY);
  let engTex = engravingMask(o.engraving ?? []);
  const engMat = mat(new THREE.MeshPhysicalMaterial({ name: "gold_engraving", color: "#efc566", metalness: 1, roughness: 0.22, alphaMap: engTex, alphaTest: 0.4 }));
  const engraving = new THREE.Mesh(bandDecal(Math.PI, engPhi, engY - engH / 2, engY + engH / 2, 0.0002), engMat); engraving.name = "engraving"; baseGroup.add(engraving);
  const frame = new THREE.Mesh(keep(cartoucheGeometry(Math.PI, engY, engPhi * 1.12, engH * 1.25)), goldSatin); frame.name = "engraving_frame"; baseGroup.add(frame);

  // ---------- glass ----------
  const [sw, sh] = P.sphere;
  const glassGeo = keep(new THREE.SphereGeometry(GLOBE.radius, sw, sh, 0, TAU, 0, GLASS_THETA));
  glassGeo.translate(0, GLOBE.centerY, 0);
  const glassMat = mat(glassMaterial(P.glass));
  const glass = new THREE.Mesh(glassGeo, glassMat); glass.name = "glass"; glass.renderOrder = 10; root.add(glass);

  // ---------- snow ground, with the skirt that seals it against the glass ----------
  const discR = innerRadiusAt(groundHeight(0.06, 0)) + 0.002;
  const { normal: pathN, ao: pathAo } = pathMaps(PATH, discR, P.tex); keep(pathN); keep(pathAo);
  const groundGeo = keep(groundGeometry(discR, o.profile === "desktop" ? 56 : o.profile === "mobile" ? 36 : 14, o.profile === "desktop" ? 160 : o.profile === "mobile" ? 96 : 44));
  const groundMat = snowMat(6, { normalMap: pathN, normalScale: new THREE.Vector2(1, 1), aoMap: pathAo, aoMapIntensity: 1 });
  // the fine snow grain rides on top of the path normal map (second UV set carries the tiling)
  groundMat.onBeforeCompile = (s) => {
    s.uniforms.grainMap = { value: snowNormal };
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D grainMap;").replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
      { vec3 g = texture2D( grainMap, vNormalMapUv * 14.0 ).xyz * 2.0 - 1.0; normal = normalize( normal + tbn * vec3( g.xy * 0.35, 0.0 ) ); }`);
  };
  const ground = new THREE.Mesh(groundGeo, groundMat); ground.name = "ground"; ground.receiveShadow = true; root.add(ground);
  const skirtTop = Math.acos((groundHeight(0.06, 0) - 0.001 - GLOBE.centerY) / INNER_R), skirtBottom = Math.acos((GLOBE.collarY - GLOBE.centerY) / INNER_R);
  const skirtGeo = keep(new THREE.SphereGeometry(INNER_R - 0.0004, sw, 6, 0, TAU, skirtTop, skirtBottom - skirtTop)); skirtGeo.translate(0, GLOBE.centerY, 0);
  // snow packed against the glass all the way down to the collar (seen through the front glass, and from inside across the globe)
  // plain, softly lit snow (no texture: a tiled map stretches into streaks over this curved band)
  const skirtMat = mat(new THREE.MeshPhysicalMaterial({ name: "snow_packed", color: "#f6f8fd", roughness: 0.95, sheen: 0.25, sheenColor: new THREE.Color("#dfe8ff"), sheenRoughness: 0.6, emissive: "#e4ebff", emissiveIntensity: 0.1, side: THREE.DoubleSide }));
  const skirt = new THREE.Mesh(skirtGeo, skirtMat); skirt.name = "ground_skirt"; root.add(skirt);
  const plug = new THREE.Mesh(keep(new THREE.CircleGeometry(0.0545, sw).rotateX(-Math.PI / 2).translate(0, GLOBE.collarY + 0.0006, 0)), skirt.material); plug.name = "ground_plug"; root.add(plug);

  const onGround = (id: string, obj: THREE.Object3D, sink = 0) => {
    const p = placement(id); obj.position.set(p.at[0], groundHeight(p.at[0], p.at[1]) - sink, p.at[1]); obj.rotation.y = p.turn; obj.name = id; root.add(obj); return obj;
  };

  // ---------- trees ----------
  const needles = keep(needleTexture(false, Math.min(512, P.tex))), snowyNeedles = keep(needleTexture(true, Math.min(512, P.tex)));
  const boughGeo = keep(boughGeometry(P.lod < 1 ? 3 : 6));
  const boughMat = mat(new THREE.MeshStandardMaterial({ name: "fir_needles", map: needles, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 }));
  const snowyBoughMat = mat(new THREE.MeshStandardMaterial({ name: "fir_needles_snow", map: snowyNeedles, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.82, metalness: 0 }));
  const bark = mat(new THREE.MeshStandardMaterial({ name: "bark", color: "#3e2a1e", roughness: 0.95 }));
  const core = mat(new THREE.MeshStandardMaterial({ name: "fir_core", color: "#0d2219", roughness: 1 }));
  const tree = firTree({ seed: 11, levels: P.tree.levels, perLevel: P.tree.perLevel, snow: 0.12, geo: boughGeo, mat: boughMat, snowMat: snowyBoughMat, bark, core, keep });
  const treeP = placement("tree"); tree.group.scale.setScalar(treeP.height);
  onGround("tree", tree.group, 0.001);
  // ornaments, garland lights and the star live on the main tree
  const decor = treeDecor(tree.radiusAt, P.ornaments, P.lights, keep, mat, P.lod);
  tree.group.add(decor.group);
  for (const [i, id] of (["pine-back-left", "pine-back", "pine-back-right", "pine-left", "pine-small-back", "pine-small-right"] as const).entries()) {
    const pine = firTree({ seed: 30 + i * 7, levels: P.pine.levels, perLevel: P.pine.perLevel, snow: 0.75, geo: boughGeo, mat: boughMat, snowMat: snowyBoughMat, bark, core, keep, slim: 0.82 });
    pine.group.scale.setScalar(placement(id).height); onGround(id, pine.group, 0.001);
  }

  // ---------- snow-covered shrubs (one instanced mesh of lumpy domes, dark green showing at the base) ----------
  {
    const dome = keep(new THREE.SphereGeometry(1, Math.round(18 * P.lod) + 2, Math.round(12 * P.lod) + 1, 0, TAU, 0, Math.PI * 0.62)); const dp = dome.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(dp, i), k = 1 + 0.12 * Math.sin(v.x * 9) * Math.sin(v.z * 8 + 1) + 0.06 * Math.sin(v.y * 15); dp.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k); }
    dome.computeVertexNormals();
    const shrubs = new THREE.InstancedMesh(dome, snowMat(2, { emissiveIntensity: 0.22, aoMapIntensity: 0 }), BUSHES.length); shrubs.name = "shrubs"; shrubs.castShadow = shrubs.receiveShadow = true;
    const under = new THREE.InstancedMesh(dome, mat(new THREE.MeshStandardMaterial({ name: "shrub_green", color: "#2c5a3c", roughness: 0.9 })), BUSHES.length);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), vv = new THREE.Vector3(), ss = new THREE.Vector3();
    BUSHES.forEach(([x, z, r], i) => {
      const y = groundHeight(x, z) - r * 0.25; qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 1.7);
      shrubs.setMatrixAt(i, mm.compose(vv.set(x, y + r * 0.08, z), qq, ss.set(r, r, r)));
      under.setMatrixAt(i, mm.compose(vv.set(x, y - r * 0.12, z), qq, ss.set(r * 0.98, r * 0.62, r * 0.98))); // green only peeks out at the foot
    });
    root.add(shrubs, under);
  }

  // ---------- snowman ----------
  const snowman = mergeByMaterial(buildSnowman(snowMat(3, { emissiveIntensity: 0.2, aoMapIntensity: 0.3 }), keep, mat, P.lod), keep);
  snowman.scale.setScalar(placement("snowman").height / 0.03); onGround("snowman", snowman, 0.0012);

  // ---------- presents ----------
  const satinRed = mat(new THREE.MeshPhysicalMaterial({ name: "present_red", color: "#a10f18", roughness: 0.38, sheen: 0.8, sheenColor: new THREE.Color("#ff9a9a"), clearcoat: 0.3, clearcoatRoughness: 0.3 }));
  const satinGold = mat(new THREE.MeshPhysicalMaterial({ name: "present_gold", color: "#d9a441", metalness: 0.65, roughness: 0.32, sheen: 0.5, sheenColor: new THREE.Color("#fff0c8") }));
  const boxGeo = keep(new RoundedBoxGeometry(1, 1, 1, P.lod < 1 ? 1 : 3, 0.06)), loopGeo = keep(new THREE.TorusGeometry(0.2, 0.055, P.lod < 1 ? 5 : 8, P.lod < 1 ? 10 : 20));
  ([["present-a", satinRed, satinGold, [1, 0.92, 1]], ["present-b", satinGold, satinRed, [1.15, 0.85, 0.95]], ["present-c", satinRed, satinGold, [1, 1, 1]]] as const).forEach(([id, body, ribbon, s]) => {
    const g = new THREE.Group(), h = placement(id).height;
    const b = new THREE.Mesh(boxGeo, body); b.scale.set(s[0], s[1], s[2]); b.position.y = s[1] / 2; b.castShadow = true; g.add(b);
    for (const [sx, sz] of [[0.14, 1.03], [1.03, 0.14]]) { const band = new THREE.Mesh(boxGeo, ribbon); band.scale.set(s[0] * sx, s[1] * 1.02, s[2] * sz); band.position.y = s[1] / 2; g.add(band); }
    for (const a of [0.7, -0.7]) { const loop = new THREE.Mesh(loopGeo, ribbon); loop.position.set(Math.sin(a) * 0.17, s[1] + 0.14, 0); loop.rotation.set(0, Math.PI / 2, a); g.add(loop); }
    mergeByMaterial(g, keep); g.scale.setScalar(h / (s[1] + 0.3)); onGround(id, g, 0.0006);
  });

  // ---------- authored models: cottage, reindeer, lantern ----------
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder); // the models' geometry is meshopt-compressed
  const load = async (name: string) => { try { return (await loader.loadAsync(`${base}/${name}${P.assetSuffix}.glb`)).scene; } catch { return null; } };
  const [cottage, reindeer, lantern] = await Promise.all([load("cottage"), load("reindeer"), load("lantern")]);
  const windows: THREE.Mesh[] = [];
  let chimneyTop: THREE.Object3D = new THREE.Object3D();
  const adopt = (scene: THREE.Object3D | null, id: string, sink = 0.0008) => {
    if (!scene) return null;
    scene.name = id;
    scene.traverse((n) => { const g = (n as THREE.Mesh).geometry; if (g) for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k); }); // only what the materials use
    mergeByMaterial(scene, keep); // one draw call per material (the cabin arrives as 16 meshes)
    scene.traverse((n) => {
      if (/chimney_top/i.test(n.name)) chimneyTop = n; // an empty marker (not a mesh): where the smoke rises from
      const m = n as THREE.Mesh; if (!m.isMesh) return;
      m.castShadow = m.receiveShadow = true;
      for (const mm of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
        materials.push(mm); owned.push(mm);
        if (/window|glass_warm/i.test(mm.name)) windows.push(m);
      }
    });
    return onGround(id, scene, sink);
  };
  adopt(cottage, "cottage"); adopt(reindeer, "reindeer", 0.0004); adopt(lantern, "lantern", 0.0006);
  // the lantern's lamp: a warm glowing bulb inside its glass head (the light itself is added by the scene)
  const lanternLight = new THREE.Object3D(); lanternLight.name = "lantern_light";
  if (lantern) { const top = new THREE.Box3().setFromObject(lantern).max.y; lanternLight.position.set(0, top - lantern.position.y - 0.0075, 0); lantern.add(lanternLight); }
  const bulb = new THREE.Mesh(keep(new THREE.SphereGeometry(0.0016, 12, 8)), mat(new THREE.MeshStandardMaterial({ name: "lantern_bulb", color: "#000", emissive: "#ffcf7a", emissiveIntensity: 6 })));
  lanternLight.add(bulb);

  // one draw call per material across the whole static world (tree cores and trunks, chimney, presents…); the parts later stages drive stay separate
  const live = new Set<THREE.Object3D>([glass, logo, engraving, bulb, ...windows]);
  decor.star.traverse((n) => live.add(n));
  mergeByMaterial(root, keep, (m) => live.has(m));

  // only true light sources may bloom: everything else (glass and gold reflections of the environment's studio lights, sunlit snow) is capped
  // just under the bloom threshold. After tone mapping the cap is invisible (it maps to near-white either way).
  for (const m of materials) if (!EMITTERS.has(m.name)) capBrightness(m);

  // every material reflects the environment (web); AR leaves it to the viewer
  if (o.envMap) for (const m of materials) if ("envMap" in m) { (m as THREE.MeshStandardMaterial).envMap = o.envMap; m.needsUpdate = true; }

  // AR: every instance becomes real geometry and every two-sided sheet gets real back faces (USDZ writes one instance and no double-sided flag)
  if (o.profile === "ar") prepareForAR(root, keep);

  root.updateMatrixWorld(true);
  return {
    root, materials,
    nodes: { glass, star: decor.star, windows, lanternLight, lights: decor.lights, engraving, chimneyTop },
    setEngraving(lines: string[]) {
      const next = engravingMask(lines), old = engTex;
      engMat.alphaMap = next; engTex = next; engMat.needsUpdate = true; old.dispose();
    },
    dispose() { owned.forEach((x) => x.dispose()); engTex.dispose(); },
  };
}

/** Glass for each platform. Desktop: real transmission (refraction through a 4 mm wall). Mobile: transparent with stronger edges (Fresnel). AR: plain opacity. */
function glassMaterial(kind: "transmission" | "fresnel" | "opacity") {
  if (kind === "transmission") {
    return new THREE.MeshPhysicalMaterial({ name: "glass", color: "#ffffff", metalness: 0, roughness: 0.0, transmission: 1, thickness: GLOBE.wall * 2, ior: 1.5, specularIntensity: 0.9, envMapIntensity: 0.55, side: THREE.DoubleSide });
  }
  const m = new THREE.MeshPhysicalMaterial({ name: "glass", color: "#ffffff", metalness: 0, roughness: 0.02, transparent: true, opacity: kind === "fresnel" ? 0.025 : 0.14, envMapIntensity: kind === "fresnel" ? 0.9 : 2.2, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false });
  if (kind === "fresnel") {
    m.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace("#include <opaque_fragment>", `#include <opaque_fragment>
        float fres = pow( 1.0 - saturate( dot( normalize( vNormal ), normalize( vViewPosition ) ) ), 3.0 );
        gl_FragColor.a = clamp( gl_FragColor.a + fres * 0.2 + max( dot( outgoingLight, vec3( 0.33 ) ) - 0.6, 0.0 ) * 0.6, 0.0, 0.5 );`);
    };
    m.customProgramCacheKey = () => "globe-glass-fresnel";
  }
  return m;
}

/** Six-armed snowflake: a hexagonal hub, arms with two pairs of side branches and a diamond tip, extruded `depth`. Faces +Z. */
function snowflakeGeometry(radius: number, depth: number, branchPairs = 2) {
  const parts: THREE.BufferGeometry[] = [];
  const bar = (len: number, w: number, x: number, y: number, a: number) => { const g = new THREE.BoxGeometry(w, len, depth); g.translate(0, len / 2, 0); g.rotateZ(a); g.translate(x, y, 0); parts.push(g); };
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    bar(radius, radius * 0.11, 0, 0, a);
    for (const [at, len] of ([[0.42, 0.34], [0.68, 0.24]] as const).slice(0, branchPairs)) for (const s of [-1, 1]) {
      const px = -Math.sin(a) * radius * at, py = Math.cos(a) * radius * at; bar(radius * len, radius * 0.085, px, py, a + s * 0.85);
    }
    const tip = new THREE.OctahedronGeometry(radius * 0.11, 0); tip.scale(0.75, 1.3, depth / (radius * 0.11)); tip.rotateZ(a); tip.translate(-Math.sin(a) * radius, Math.cos(a) * radius, 0); parts.push(tip);
  }
  const hub = new THREE.CylinderGeometry(radius * 0.2, radius * 0.2, depth, 6); hub.rotateX(Math.PI / 2); parts.push(hub);
  const g = mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p))!; parts.forEach((p) => p.dispose()); g.computeVertexNormals(); return g;
}

/** A filigree S-scroll: two opposed spirals joined by a stem, drawn as a fine round gold wire wrapped on the band at angle `phi0`. */
function filigreeGeometry(phi0: number, yc: number, dir: number, detail: number) {
  const pts: THREE.Vector3[] = [];
  const onBand = (u: number, v: number) => { const y = yc + v, r = bandRadiusAt(y) + 0.0003, phi = phi0 + (dir * u) / r; return new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r); };
  const spiral = (cx: number, cy: number, r0: number, turns: number, sgn: number, from: number) => {
    const out: [number, number][] = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = from + sgn * t * turns * TAU, r = r0 * (1 - 0.82 * t); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return out;
  };
  const S = 0.0062;
  const a = spiral(-S, S * 0.15, S * 0.9, 1.15, 1, -Math.PI / 2).reverse(), b = spiral(S, -S * 0.15, S * 0.9, 1.15, 1, Math.PI / 2);
  for (const [u, v] of [...a, ...b]) pts.push(onBand(u, v));
  const curve = new THREE.CatmullRomCurve3(pts);
  const main = new THREE.TubeGeometry(curve, Math.round(120 * detail), 0.00042, 5, false);
  // a small leaf bud between the curls
  const bud = new THREE.SphereGeometry(0.0009, 6, 4); bud.scale(1, 1.8, 0.5); const p = onBand(0, S * 0.75); bud.lookAt(p.clone().setY(0).normalize()); bud.translate(p.x, p.y, p.z);
  const g = mergeGeometries([main.toNonIndexed(), bud.toNonIndexed()])!; main.dispose(); bud.dispose(); return g;
}

/** A rounded-rectangle frame of gold wire around the engraving. */
function cartoucheGeometry(phiC: number, yc: number, phiW: number, h: number) {
  const r0 = bandRadiusAt(yc), w = phiW * r0, rad = h * 0.3, pts: THREE.Vector3[] = [];
  const shape: [number, number][] = [];
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 8; i++) { const a = a0 + (i / 8) * (Math.PI / 2); shape.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); } };
  // straight runs get points of their own: a long chord across the curved band would sink below its surface
  const run = (x0: number, y0: number, x1: number, y1: number) => { for (let i = 1; i < 16; i++) shape.push([x0 + ((x1 - x0) * i) / 16, y0 + ((y1 - y0) * i) / 16]); };
  corner(w / 2 - rad, h / 2 - rad, 0); run(w / 2 - rad, h / 2, -w / 2 + rad, h / 2);
  corner(-w / 2 + rad, h / 2 - rad, Math.PI / 2); run(-w / 2, h / 2 - rad, -w / 2, -h / 2 + rad);
  corner(-w / 2 + rad, -h / 2 + rad, Math.PI); run(-w / 2 + rad, -h / 2, w / 2 - rad, -h / 2);
  corner(w / 2 - rad, -h / 2 + rad, Math.PI * 1.5); run(w / 2, -h / 2 + rad, w / 2, h / 2 - rad);
  for (const [u, v] of shape) { const y = yc + v, r = bandRadiusAt(y) + 0.0003, phi = phiC + u / r; pts.push(new THREE.Vector3(Math.sin(phi) * r, y, Math.cos(phi) * r)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 160, 0.00045, 5, true);
}

/** The snow ground: a polar grid over the disc, lifted by groundHeight, trimmed so its edge follows the glass. UV = position on the disc. */
function groundGeometry(discR: number, rings: number, segs: number) {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, r = discR * Math.pow(t, 0.8);
    for (let j = 0; j <= segs; j++) {
      const a = (j / segs) * TAU; let x = Math.sin(a) * r, z = Math.cos(a) * r, y = groundHeight(x, z);
      // path: a shallow trough
      const d = distToPath(x, z); y -= 0.0012 * Math.exp(-(d * d) / 0.00003);
      const lim = innerRadiusAt(y) - 0.0004; if (Math.hypot(x, z) > lim) { const k = lim / Math.hypot(x, z); x *= k; z *= k; }
      pos.push(x, y, z); uv.push(x / (discR * 2) + 0.5, z / (discR * 2) + 0.5);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < segs; j++) { const a = i * (segs + 1) + j, b = a + segs + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
function distToPath(x: number, z: number) {
  let best = 1;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1], dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/**
 * One fir bough: a needle card along +Z (length 1, width 0.8) that droops towards its tip, crossed by a narrower card tilted up, so the bough has
 * body from every side. The needles are in the alpha-tested texture, so the outline is real needles, not a rectangle.
 */
function boughGeometry(N = 6) {
  const card = (width: number, roll: number) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, sag = -0.28 * u * u, c = Math.cos(roll), s = Math.sin(roll);
      for (const k of [-1, 1]) { const x = (k * width) / 2, y = sag + (k * width * 0.06); pos.push(x * c - y * s, x * s + y * c, u); uv.push(k < 0 ? 0 : 1, u); }
      if (i < N) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  };
  const a = card(0.8, 0), b = card(0.5, 1.1);
  const g = mergeGeometries([a, b])!; a.dispose(); b.dispose(); g.computeVertexNormals();
  // normals point up for both sides of the card, so double-sided needles are lit like foliage, not like a flat sheet
  const n = g.attributes.normal as THREE.BufferAttribute; for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.35, Math.abs(n.getY(i)) * 0.9 + 0.35, n.getZ(i) * 0.35);
  return g;
}

/**
 * A fir (height 1; scale the group to the real height). Whorls of boughs from long, drooping lower ones to short upturned shoots at the tip, a
 * dark core so gaps show shade, a visible trunk at the foot. `snow` (0..1): share of boughs drawn with the snow-laden needle texture.
 */
function firTree(o: { seed: number; levels: number; perLevel: number; snow: number; geo: THREE.BufferGeometry; mat: THREE.Material; snowMat: THREE.Material; bark: THREE.Material; core: THREE.Material; keep: <T extends { dispose(): void }>(x: T) => T; slim?: number }) {
  const rnd = rng(o.seed), slim = o.slim ?? 1;
  const radiusAt = (v: number) => (0.34 * Math.pow(1 - v, 0.92) + 0.015) * slim;
  const green: THREE.Matrix4[] = [], snowy: THREE.Matrix4[] = [], colG: THREE.Color[] = [], colS: THREE.Color[] = [];
  const q = new THREE.Quaternion(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1), roll = new THREE.Quaternion();
  for (let l = 0; l < o.levels; l++) {
    const v = l / (o.levels - 1), y = 0.08 + v * 0.86, n = Math.round(o.perLevel * (1 - v * 0.55)) + 3;
    for (let k = 0; k < n; k++) {
      const th = (k / n) * TAU + l * 2.39 + (rnd() - 0.5) * 0.4, pitch = -0.32 + 0.85 * Math.pow(v, 1.5) + (rnd() - 0.5) * 0.2, len = radiusAt(v) * (0.85 + rnd() * 0.3) + 0.03;
      dir.set(Math.cos(th) * Math.cos(pitch), Math.sin(pitch), Math.sin(th) * Math.cos(pitch));
      q.setFromUnitVectors(up, dir);
      const side = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)), cur = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
      roll.setFromAxisAngle(dir, Math.atan2(cur.clone().cross(side).dot(dir), cur.dot(side)) + (rnd() - 0.5) * 0.35); q.premultiply(roll);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(Math.cos(th) * 0.01, y + (rnd() - 0.5) * 0.02, Math.sin(th) * 0.01), q.clone(), new THREE.Vector3(len * 0.95, len, len));
      const c = new THREE.Color().setHSL(0.36 + (rnd() - 0.5) * 0.03, 0.42 + rnd() * 0.12, 0.42 + rnd() * 0.2 + v * 0.06);
      const isSnow = rnd() < o.snow * (0.6 + 0.6 * (1 - Math.abs(pitch)));
      (isSnow ? snowy : green).push(m); (isSnow ? colS : colG).push(isSnow ? c.lerp(new THREE.Color("#ffffff"), 0.35) : c);
    }
  }
  const group = new THREE.Group();
  const inst = (mats: THREE.Matrix4[], cols: THREE.Color[], material: THREE.Material) => {
    if (!mats.length) return;
    const im = new THREE.InstancedMesh(o.geo, material, mats.length); im.castShadow = true; im.receiveShadow = true;
    mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[i]); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; group.add(im);
  };
  inst(green, colG, o.mat); inst(snowy, colS, o.snowMat);
  const coreGeo = o.keep(new THREE.ConeGeometry(radiusAt(0) * 0.55, 0.88, 14, 1, true)); coreGeo.translate(0, 0.08 + 0.44, 0);
  group.add(new THREE.Mesh(coreGeo, o.core));
  const trunkGeo = o.keep(new THREE.CylinderGeometry(0.012, 0.022, 0.16, 10)); trunkGeo.translate(0, 0.07, 0);
  const trunk = new THREE.Mesh(trunkGeo, o.bark); trunk.castShadow = true; group.add(trunk);
  return { group, radiusAt };
}

/** Red and gold baubles with gold caps, warm garland lights in a spiral and the gold star, in the tree's unit space (height 1). */
function treeDecor(radiusAt: (v: number) => number, nOrn: number, nLights: number, keep: <T extends { dispose(): void }>(x: T) => T, mat: <T extends THREE.Material>(m: T) => T, lod = 1) {
  const group = new THREE.Group(), rnd = rng(5);
  const red = mat(new THREE.MeshPhysicalMaterial({ name: "ornament_red", color: COLORS.ornamentRed, metalness: 0.55, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05 }));
  const goldB = mat(new THREE.MeshPhysicalMaterial({ name: "ornament_gold", color: COLORS.ornamentGold, metalness: 1, roughness: 0.18 }));
  const ball = keep(new THREE.SphereGeometry(1, Math.round(20 * lod), Math.round(14 * lod)));
  const ims = [new THREE.InstancedMesh(ball, red, Math.ceil(nOrn / 2)), new THREE.InstancedMesh(ball, goldB, Math.floor(nOrn / 2))];
  const counts = [0, 0], m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  for (let i = 0; i < nOrn; i++) {
    const v = 0.06 + (i / nOrn) * 0.78, th = i * 2.4 + rnd() * 0.5, r = radiusAt(v) * 0.9, size = 0.022 + rnd() * 0.008;
    const which = i % 2, im = ims[which];
    m.compose(new THREE.Vector3(Math.cos(th) * r, 0.08 + v * 0.86 - 0.03, Math.sin(th) * r), q, s.setScalar(size)); im.setMatrixAt(counts[which]++, m);
  }
  ims.forEach((im) => { im.castShadow = true; group.add(im); });
  const beadMat = mat(new THREE.MeshStandardMaterial({ name: "tree_lights", color: "#000000", emissive: "#ffc46b", emissiveIntensity: 4.5, roughness: 0.4 }));
  const bead = keep(new THREE.SphereGeometry(1, Math.max(5, Math.round(8 * lod)), Math.max(4, Math.round(6 * lod))));
  const lights = new THREE.InstancedMesh(bead, beadMat, nLights);
  for (let i = 0; i < nLights; i++) {
    const u = i / nLights, th = u * TAU * 7.5, r = radiusAt(u * 0.92) * 0.98 + 0.005;
    m.compose(new THREE.Vector3(Math.cos(th) * r, 0.1 + u * 0.82 - 0.015, Math.sin(th) * r), q, s.setScalar(0.0085)); lights.setMatrixAt(i, m);
    lights.setColorAt(i, new THREE.Color(i % 3 === 0 ? "#fff1d0" : "#ffcf86"));
  }
  group.add(lights);
  const star = new THREE.Group(); star.name = "star"; star.position.y = 0.97;
  const starMat = mat(new THREE.MeshPhysicalMaterial({ name: "star_gold", color: "#f8d276", metalness: 1, roughness: 0.15, emissive: "#ffb43a", emissiveIntensity: 3.2 }));
  const starMesh = new THREE.Mesh(keep(starGeometry(0.065, 0.027, 0.02, 0.006)), starMat); star.add(starMesh);
  group.add(star);
  return { group, star, lights };
}

/**
 * Snowman, 30 mm tall: three packed-snow balls (softly uneven, settled into each other), glossy coal eyes with a catch-light, coal eyebrows,
 * rosy cheeks, a ridged carrot nose, a coal smile, twig arms with little fingers, a knitted red scarf with fringed tails and a beanie with a bobble.
 */
function buildSnowman(snow: THREE.Material, keep: <T extends { dispose(): void }>(x: T) => T, mat: <T extends THREE.Material>(m: T) => T, lod = 1) {
  const g = new THREE.Group(), rnd = rng(3);
  const packed = (r: number, seed: number) => {
    const s = keep(new THREE.SphereGeometry(r, Math.round(40 * lod), Math.round(30 * lod))), p = s.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i), d = v.clone().normalize();
      const n = 1 + 0.018 * Math.sin(d.x * 7 + seed) * Math.sin(d.y * 6 + seed * 2) * Math.sin(d.z * 8) + 0.008 * Math.sin(d.x * 23 + d.z * 19 + seed);
      v.multiplyScalar(n); v.y *= v.y < 0 ? 0.86 : 0.95; // flattened where it rests on the ball below
      p.setXYZ(i, v.x, v.y, v.z);
    }
    s.computeVertexNormals(); return s;
  };
  ([[0.0076, 0.0066, 1], [0.0058, 0.0174, 2], [0.0044, 0.0257, 3]] as const).forEach(([r, y, seed]) => { const b = new THREE.Mesh(packed(r, seed), snow); b.position.y = y; b.castShadow = b.receiveShadow = true; g.add(b); });
  const onBall = (cy: number, r: number, el: number, az: number) => new THREE.Vector3(Math.sin(az) * Math.cos(el) * r, cy + Math.sin(el) * r, Math.cos(az) * Math.cos(el) * r);
  const coal = mat(new THREE.MeshPhysicalMaterial({ name: "coal", color: "#0e0c0e", roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 }));
  const eyeGeo = keep(new THREE.SphereGeometry(0.00072, 12, 10)), pebble = keep(new THREE.IcosahedronGeometry(0.0006, 1));
  for (const az of [-0.33, 0.33]) { const e = new THREE.Mesh(eyeGeo, coal); e.position.copy(onBall(0.0257, 0.00425, 0.26, az)); e.scale.set(1, 1.15, 0.7); e.lookAt(e.position.clone().multiplyScalar(2)); g.add(e); }
  for (const az of [-0.36, 0.36]) { // eyebrows: little arcs of coal
    const brow = new THREE.Mesh(keep(new THREE.TorusGeometry(0.0009, 0.00022, 5, 10, Math.PI * 0.7)), coal);
    brow.position.copy(onBall(0.0257, 0.0043, 0.5, az)); brow.lookAt(brow.position.clone().setY(0.0257).multiplyScalar(2)); brow.rotateZ(Math.PI * 0.15 + (az > 0 ? -0.12 : 0.12)); g.add(brow);
  }
  const cheek = mat(new THREE.MeshStandardMaterial({ name: "cheek", color: "#f3a6a0", roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false }));
  for (const az of [-0.62, 0.62]) { const c = new THREE.Mesh(keep(new THREE.CircleGeometry(0.0009, 16)), cheek); c.position.copy(onBall(0.0257, 0.00445, -0.05, az)); c.lookAt(c.position.clone().setY(0.0257).multiplyScalar(2).setY(c.position.y)); g.add(c); }
  for (const el of [0.55, 0.15, -0.25]) { const b = new THREE.Mesh(pebble, coal); b.position.copy(onBall(0.0174, 0.0058, el, 0)); g.add(b); }
  for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(pebble, coal); b.scale.setScalar(0.55); b.position.copy(onBall(0.0257, 0.0043, -0.36 + Math.abs(i - 2) * 0.07, (i - 2) * 0.2)); g.add(b); } // a smile that turns up at the ends
  // carrot: a ridged, slightly bent cone
  const carrotGeo = keep(new THREE.ConeGeometry(0.00075, 0.0046, 12, 6)); const cp = carrotGeo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < cp.count; i++) { const y = cp.getY(i), ridge = 1 + 0.08 * Math.sin((y / 0.0046 + 0.5) * Math.PI * 7); cp.setXYZ(i, cp.getX(i) * ridge + 0.00035 * ((y / 0.0046) + 0.5) ** 2, y, cp.getZ(i) * ridge); }
  carrotGeo.computeVertexNormals(); carrotGeo.rotateX(Math.PI / 2); carrotGeo.translate(0, 0, 0.0023);
  const carrot = new THREE.Mesh(carrotGeo, mat(new THREE.MeshPhysicalMaterial({ name: "carrot", color: "#e8661e", roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color("#ffb070") }))); carrot.position.set(0, 0.0253, 0.0039); carrot.rotation.set(0.1, 0.12, 0); carrot.castShadow = true; g.add(carrot);
  const twig = mat(new THREE.MeshStandardMaterial({ name: "twig", color: "#3b2717", roughness: 0.9 }));
  for (const side of [-1, 1]) {
    const pts = [new THREE.Vector3(side * 0.0049, 0.0184, 0), new THREE.Vector3(side * 0.0084, 0.0204 + rnd() * 0.001, 0.0006), new THREE.Vector3(side * 0.0116, 0.0228, 0.0004)];
    const arm = new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.0003, 5)), twig); arm.castShadow = true; g.add(arm);
    for (const [dx, dy] of [[0.0015, 0.0017], [0.0019, 0.0004]]) g.add(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([pts[2], pts[2].clone().add(new THREE.Vector3(side * dx, dy, 0))]), 3, 0.00018, 4)), twig));
  }
  const knit = keep(knitNormal());
  const wool = (color: string, rep: number, sheen = "#ff8a80") => { const n = knit.clone(); n.repeat.set(rep, rep); n.needsUpdate = true; keep(n); return mat(new THREE.MeshPhysicalMaterial({ name: "wool", color, roughness: 0.9, normalMap: n, normalScale: new THREE.Vector2(0.9, 0.9), sheen: 1, sheenColor: new THREE.Color(sheen), sheenRoughness: 0.6 })); };
  const scarfMat = wool("#c0161f", 3);
  const wrap = new THREE.Mesh(keep(new THREE.TorusGeometry(0.0041, 0.0012, 10, 32)), scarfMat); wrap.rotation.x = Math.PI / 2; wrap.position.y = 0.022; wrap.scale.set(1, 1, 0.75); wrap.castShadow = true; g.add(wrap);
  const tailGeo = keep(new RoundedBoxGeometry(0.0022, 0.0078, 0.0007, 2, 0.0003));
  for (const [x, rz, ry] of [[0.0021, 0.16, 0.2], [0.0034, 0.3, 0.45]] as const) {
    const t = new THREE.Mesh(tailGeo, scarfMat); t.position.set(x, 0.0184, 0.0046); t.rotation.set(0.3, ry, rz); t.castShadow = true; g.add(t);
    for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.00011, 0.00011, 0.0009, 4)), scarfMat); f.position.set(-0.00075 + k * 0.0005, -0.0043, 0); t.add(f); } // fringe
  }
  const hatMat = wool("#a6131b", 2);
  const hat = new THREE.Mesh(keep(new THREE.LatheGeometry([[0, 0.0052], [0.0018, 0.0049], [0.0031, 0.0036], [0.0038, 0.002], [0.004, 0.0008], [0.0041, 0]].map(([r, y]) => new THREE.Vector2(r, y)).reverse(), 28)), hatMat);
  hat.position.y = 0.0279; hat.rotation.z = -0.14; hat.castShadow = true; g.add(hat);
  const fold = new THREE.Mesh(keep(new THREE.TorusGeometry(0.0041, 0.00085, 8, 32)), wool("#f2ece4", 2, "#ffffff")); fold.rotation.x = Math.PI / 2; fold.position.y = 0.0004; hat.add(fold);
  const bobble = new THREE.Mesh(keep(new THREE.IcosahedronGeometry(0.0014, 2)), wool("#f5efe6", 1, "#ffffff")); bobble.position.y = 0.0054; hat.add(bobble);
  return g;
}

/**
 * Draw-call reduction: collapses every plain mesh under `group` into one mesh per material (transforms baked in), keeping empties such as
 * markers. Instanced meshes are left as they are. Geometries are given a common set of attributes so they can be merged.
 */
export function mergeByMaterial(group: THREE.Object3D, keep: <T extends { dispose(): void }>(x: T) => T, skip: (m: THREE.Mesh) => boolean = () => false) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>(), victims: THREE.Mesh[] = [];
  let shadow = false;
  group.traverse((n) => {
    const m = n as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || skip(m)) return;
    const g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    (buckets.get(m.material) ?? buckets.set(m.material, []).get(m.material)!).push(g); victims.push(m); shadow ||= m.castShadow;
  });
  for (const m of victims) m.parent?.remove(m);
  for (const [material, geos] of buckets) {
    const names = Object.keys(geos[0].attributes).filter((k) => geos.every((g) => k in g.attributes && g.attributes[k].itemSize === geos[0].attributes[k].itemSize));
    const ready = geos.map((g) => { const x = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(x.attributes)) if (!names.includes(k)) x.deleteAttribute(k); x.morphAttributes = {}; return x; });
    const flat = mergeGeometries(ready)!, merged = keep(mergeVertices(flat, 1e-7)); flat.dispose(); geos.forEach((g) => g.dispose()); ready.forEach((g) => g.dispose()); // re-indexed: shared vertices stored once
    const mesh = new THREE.Mesh(merged, material); mesh.name = `${group.name || "merged"}_${material.name}`; mesh.castShadow = shadow; mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}

/**
 * Makes the model exportable to AR files: instanced meshes become one plain mesh each (instances baked in; a per-instance tint becomes the
 * material's average colour, since Quick Look ignores vertex colours), and double-sided sheets (needle cards, the snow band) get real back
 * faces. Lighting tricks that only exist in the web shaders are simply not exported.
 */
export function prepareForAR(root: THREE.Object3D, keep: <T extends { dispose(): void }>(x: T) => T) {
  root.updateMatrixWorld(true);
  const inst: THREE.InstancedMesh[] = [], sheets: THREE.Mesh[] = [];
  root.traverse((n) => { const m = n as THREE.Mesh; if ((m as THREE.InstancedMesh).isInstancedMesh) inst.push(m as THREE.InstancedMesh); else if (m.isMesh && !Array.isArray(m.material) && m.material.side === THREE.DoubleSide) sheets.push(m); });
  for (const im of inst) {
    const parts: THREE.BufferGeometry[] = [], m4 = new THREE.Matrix4(), avg = new THREE.Color(0, 0, 0), c = new THREE.Color();
    const src = im.geometry.index ? im.geometry.toNonIndexed() : im.geometry;
    for (let i = 0; i < im.count; i++) { im.getMatrixAt(i, m4); parts.push(src.clone().applyMatrix4(m4)); if (im.instanceColor) { im.getColorAt(i, c); avg.add(c); } }
    const merged = keep(mergeVertices(mergeGeometries(parts)!, 1e-7)); parts.forEach((g) => g.dispose()); if (src !== im.geometry) src.dispose();
    let material = im.material as THREE.MeshStandardMaterial;
    if (im.instanceColor && im.count) { material = keep(material.clone()); material.color.multiply(avg.multiplyScalar(1 / im.count)); }
    const mesh = new THREE.Mesh(merged, material); mesh.name = im.name || "instances"; mesh.position.copy(im.position); mesh.quaternion.copy(im.quaternion); mesh.scale.copy(im.scale);
    if (material.side === THREE.DoubleSide) sheets.push(mesh);
    im.parent!.add(mesh); im.removeFromParent();
  }
  // opaque pictures are written as JPEG (a fraction of PNG size); masks and anything with transparency stay PNG
  root.traverse((n) => {
    const m = (n as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (!m || Array.isArray(m)) return;
    const cutout = m.transparent || m.alphaTest > 0;
    for (const k of ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap"] as const) { const t = m[k]; if (t && !(cutout && (k === "map" || k === "emissiveMap"))) t.userData.mimeType = "image/jpeg"; }
    if (m.normalScale) m.normalScale.set(1, 1); // USD expects standard normal maps (ARKit checker)
  });
  const doneMats = new Set<THREE.Material>();
  for (const m of sheets) {
    const g = m.geometry.index ? m.geometry : mergeVertices(m.geometry);
    if (!g.attributes.normal) g.computeVertexNormals();
    m.geometry = keep(twoSided(g, 0.00002));
    const mat = m.material as THREE.Material; if (!doneMats.has(mat)) { mat.side = THREE.FrontSide; mat.needsUpdate = true; doneMats.add(mat); }
  }
}
