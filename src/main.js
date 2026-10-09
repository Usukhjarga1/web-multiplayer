import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { io } from 'socket.io-client';

// ===== 1. ҮНДСЭН ХЭСЭГ: scene, camera, renderer =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

// ===== 2. ГЭРЭЛ, ШАЛ =====
scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.set(10, 20, 10);
scene.add(sun);

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({ color: 0xdddddd })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// ===== 3. НЭРИЙН ШОШГО (canvas-аар зурсан текст) =====
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

// ===== 4. ӨӨРИЙН TОГЛОГЧ =====
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

// ===== 5. MULTIPLAYER =====
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

// ===== 6. CHAT =====
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

// ===== 7. КЛАВИАТУР =====
const keys = {};
addEventListener('keydown', (e) => (keys[e.code] = true));
addEventListener('keyup', (e) => (keys[e.code] = false));

// ===== 8. ТОГЛООМЫН ГОЛ ДАВТАЛТ =====
const clock = new THREE.Clock();
const speed = 5;

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

  // Хөдөлгөөний чиглэл
  const dir = new THREE.Vector3(
      (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0),
      0,
      (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0)
  );

  if (dir.lengthSq() > 0) {
    dir.normalize();
    player.position.addScaledVector(dir, speed * dt);
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

  // Камер тоглогчийг дагана
  camera.position.set(player.position.x, 6, player.position.z + 10);
  camera.lookAt(player.position);

  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});