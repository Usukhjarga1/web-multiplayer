import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { io } from 'socket.io-client';

// Барилгын файл. Blender-ийн хувилбар руу солих бол '/models/school_blender.glb' гэж бич.
const SCHOOL_MODEL = '/models/school_blender.glb';

// ===== 1. ҮНДСЭН ХЭСЭГ: scene, camera, renderer =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// ===== 2. ГЭРЭЛ, ГАЗАР, БАРИЛГА =====
scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10, 20, 10);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(250, 250),
  new THREE.MeshStandardMaterial({ color: 0x8fbf7a }) // ногоон зүлэг
);
ground.rotation.x = -Math.PI / 2;
// scene.add(ground); // ногоон газар. Хэрэгтэй бол // -ийг арилгана

// Мөргөлдөх (нэвтэрч болохгүй) объектуудын жагсаалт
const collidables = [];
new GLTFLoader().load(SCHOOL_MODEL, (gltf) => {
  scene.add(gltf.scene);
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    if (/door|ctrl/i.test(o.name)) return; // хаалга, нүх хайчлагч объект саад болохгүй
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((m) => (m.side = THREE.DoubleSide)); // хоёр талаас нь мөргөлдөнө
    collidables.push(o);
  });
});

// ===== 3. COLLISION (хана руу орохгүй) =====
// Алхахын өмнө урд талд нь хана байгаа эсэхийг "туяа"-аар шалгана.
const RADIUS = 0.35; // avatar-ын "өргөн"
const ray = new THREE.Raycaster();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();

function blockedAlong(x, z, dx, dz, dist) {
  const px = -dz, pz = dx; // хажуу тийш чиглэл
  for (const off of [0, 0.25, -0.25]) { // голд нь, зүүн, баруун талд нэг нэг туяа
    _o.set(x + px * off, 1.0, z + pz * off);
    _d.set(dx, 0, dz);
    ray.set(_o, _d);
    ray.far = RADIUS + dist;
    if (ray.intersectObjects(collidables, false).length) return true;
  }
  return false;
}

// ===== 4. НЭРИЙН ШОШГО (canvas-аар зурсан текст) =====
function makeLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = 'white';
  ctx.font = 'bold 32px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })
  );
  sprite.scale.set(1.6, 0.4, 1);
  sprite.position.y = 2.2; // толгойн дээр
  return sprite;
}

// ===== 5. ӨӨРИЙН ТОГЛОГЧ =====
const myName = prompt('Нэрээ оруулна уу:') || 'Guest';
const player = new THREE.Group();
scene.add(player);
player.add(makeLabel(myName));

let mixer, idleAction, walkAction, currentAction;
let idleModel = null, walkClip = null;
const loader = new FBXLoader();

loader.load('/models/idle.fbx', (model) => {
  model.scale.setScalar(0.01);
  player.add(model);
  idleModel = model;
  mixer = new THREE.AnimationMixer(model);
  idleAction = mixer.clipAction(model.animations[0]);
  idleAction.play();
  currentAction = idleAction;

  loader.load('/models/walk.fbx', (anim) => {
    walkClip = anim.animations[0];
    walkAction = mixer.clipAction(walkClip);
  });
});

function fadeTo(action) {
  if (!action || !currentAction || action === currentAction) return;
  action.reset().play();
  currentAction.crossFadeTo(action, 0.2);
  currentAction = action;
}

// ===== 6. MULTIPLAYER =====
const socket = io('http://localhost:3000');
const others = {};

socket.on('connect', () => socket.emit('setName', myName));

function createOther(id, data) {
  if (!idleModel || !walkClip || others[id]) return;
  const group = new THREE.Group();
  const model = clone(idleModel);
  group.add(model);
  group.add(makeLabel(data.name || 'Guest'));
  group.position.set(data.x, 0, data.z);
  scene.add(group);

  const m = new THREE.AnimationMixer(model);
  const idle = m.clipAction(idleModel.animations[0]);
  const walk = m.clipAction(walkClip);
  idle.play();
  others[id] = {
    group, mixer: m, idle, walk, current: idle,
    target: new THREE.Vector3(data.x, 0, data.z),
    targetRy: data.ry || 0, moving: false,
  };
}

socket.on('init', (all) => {
  const wait = setInterval(() => {
    if (!idleModel || !walkClip) return;
    clearInterval(wait);
    for (const id in all) if (id !== socket.id) createOther(id, all[id]);
  }, 100);
});
socket.on('playerJoined', (d) => createOther(d.id, d));
socket.on('playerMoved', (d) => {
  const o = others[d.id];
  if (!o) return;
  o.target.set(d.x, 0, d.z);
  o.targetRy = d.ry;
  o.moving = d.moving;
});
socket.on('playerLeft', (id) => {
  if (!others[id]) return;
  scene.remove(others[id].group);
  delete others[id];
});

// Өөрийн байрлалыг секундэд ~15 удаа илгээнэ
setInterval(() => {
  socket.emit('update', {
    x: player.position.x,
    z: player.position.z,
    ry: player.rotation.y,
    moving: currentAction === walkAction,
  });
}, 66);

// ===== 7. CHAT =====
const chatBox = document.createElement('div');
chatBox.style.cssText =
  'position:fixed;left:10px;bottom:50px;width:320px;height:180px;overflow-y:auto;' +
  'background:rgba(0,0,0,0.5);color:white;font:13px Arial;padding:6px;border-radius:6px;';
document.body.appendChild(chatBox);

const chatInput = document.createElement('input');
chatInput.placeholder = 'Enter дарж бичээд илгээ...';
chatInput.style.cssText =
  'position:fixed;left:10px;bottom:10px;width:332px;padding:6px;border-radius:6px;border:none;';
document.body.appendChild(chatInput);

socket.on('chat', ({ name, text }) => {
  const line = document.createElement('div');
  line.textContent = `${name}: ${text}`; // textContent = аюулгүй (HTML болгохгүй)
  chatBox.appendChild(line);
  chatBox.scrollTop = chatBox.scrollHeight;
});

chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation(); // бичих үед W,A,S,D-ээр хүн хөдлөхгүй
  if (e.key === 'Enter' && chatInput.value.trim()) {
    socket.emit('chat', chatInput.value);
    chatInput.value = '';
  }
});
chatInput.addEventListener('keyup', (e) => e.stopPropagation());

// ===== 8. МЫШ КАМЕР =====
let camYaw = 0;        // хажуу тийш эргэлт
let camPitch = 0.9;    // дээш доош өнцөг
let camDist = 14;      // avatar-аас зай
let dragging = false;

renderer.domElement.style.cursor = 'grab';
renderer.domElement.addEventListener('mousedown', () => (dragging = true));
addEventListener('mouseup', () => (dragging = false));
addEventListener('mousemove', (e) => {
  if (!dragging) return;
  camYaw -= e.movementX * 0.005;
  camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.005, 0.15, 1.45);
});
renderer.domElement.addEventListener('wheel', (e) => {
  camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.01, 4, 40);
});

// ===== 9. КЛАВИАТУР =====
const keys = {};
addEventListener('keydown', (e) => (keys[e.code] = true));
addEventListener('keyup', (e) => (keys[e.code] = false));

// ===== 10. ТОГЛООМЫН ГОЛ ДАВТАЛТ =====
const clock = new THREE.Clock();
const speed = 5;
const camTarget = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // Камерын харж буй зүг рүү хөдөлнө
  const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const side = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const dir = new THREE.Vector3(
    -Math.sin(camYaw) * fwd + Math.cos(camYaw) * side,
    0,
    -Math.cos(camYaw) * fwd - Math.sin(camYaw) * side
  );

  if (dir.lengthSq() > 0) {
    dir.normalize();
    // X, Z тэнхлэгийг тусад нь шалгана: хана руу хазайж явахад ханыг дагаж гулгана
    const stepX = dir.x * speed * dt;
    if (stepX !== 0 && !blockedAlong(player.position.x, player.position.z, Math.sign(stepX), 0, Math.abs(stepX))) {
      player.position.x += stepX;
    }
    const stepZ = dir.z * speed * dt;
    if (stepZ !== 0 && !blockedAlong(player.position.x, player.position.z, 0, Math.sign(stepZ), Math.abs(stepZ))) {
      player.position.z += stepZ;
    }

    player.rotation.y = Math.atan2(dir.x, dir.z);
    fadeTo(walkAction);
  } else {
    fadeTo(idleAction);
  }

  if (mixer) mixer.update(dt);

  // Бусад тоглогчийг жигд хөдөлгөнө (lerp)
  for (const id in others) {
    const o = others[id];
    o.group.position.lerp(o.target, 0.2);
    let d = o.targetRy - o.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    o.group.rotation.y += d * 0.2;

    const want = o.moving ? o.walk : o.idle;
    if (want !== o.current) {
      want.reset().play();
      o.current.crossFadeTo(want, 0.2);
      o.current = want;
    }
    o.mixer.update(dt);
  }

  // Камер тоглогчийн эргэн тойронд эргэнэ
  camTarget.set(player.position.x, 1.5, player.position.z);
  camera.position.set(
    camTarget.x + Math.sin(camYaw) * Math.cos(camPitch) * camDist,
    camTarget.y + Math.sin(camPitch) * camDist,
    camTarget.z + Math.cos(camYaw) * Math.cos(camPitch) * camDist
  );
  camera.lookAt(camTarget);

  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
