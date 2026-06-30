/* ============================================================
   Centrul360 — shared 3D GLB spinning logo (header + menu)
   Load as: <script type="module" src="c360-logo.js"></script>
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mounts = []; let glbScene = null;
new GLTFLoader().load('brand_asset/3dsvg.glb', (g)=>{ glbScene = g.scene; mountAll(); animate(); }, undefined, (e)=>console.error('GLB load error', e));

function mountAll(){
  const head = document.getElementById('logo3d-head');
  const menu = document.getElementById('logo3d-menu');
  if(head) mounts.push(makeMount(head, { spin:0.5 }));
  if(menu) mounts.push(makeMount(menu, { spin:0.5 }));
}
function makeMount(canvas, opts){
  const renderer = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 100); cam.position.set(0, 0, 5);
  const key = new THREE.DirectionalLight(0xffffff, 4.5); key.position.set(5, 3, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 2.0); rim.position.set(-5, -2, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 1.3));
  const mat = new THREE.MeshPhysicalMaterial({ color:0xffffff, metalness:0.0, roughness:0.16, clearcoat:1.0, clearcoatRoughness:0.1, transmission:0.5, thickness:0.8, ior:1.45, transparent:true, opacity:1.0, envMapIntensity:1.5 });
  const model = glbScene.clone(true);
  model.traverse(o=>{ if(o.isMesh) o.material = mat; });
  const box = new THREE.Box3().setFromObject(model);
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const sz = box.getSize(new THREE.Vector3());
  model.scale.setScalar(2.4 / Math.max(sz.x, sz.y, sz.z));
  const tilt = new THREE.Group(); scene.add(tilt);
  const spinner = new THREE.Group(); spinner.add(model); tilt.add(spinner);
  function resize(){ const w = canvas.clientWidth || 64, h = canvas.clientHeight || 64; renderer.setSize(w, h, false); cam.aspect = w/h; cam.updateProjectionMatrix(); }
  resize(); window.addEventListener('resize', resize);
  return { canvas, renderer, scene, cam, spinner, opts };
}
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();
  for(const m of mounts){
    if(m.canvas.offsetParent === null) continue;
    const r = m.canvas.getBoundingClientRect();
    if(r.bottom <= 0 || r.top >= innerHeight) continue;
    m.spinner.rotation.y = reduce ? 0.6 : t * m.opts.spin;
    m.renderer.render(m.scene, m.cam);
  }
}
