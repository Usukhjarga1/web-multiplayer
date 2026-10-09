import * as THREE from 'three';

import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { io } from 'socket.io-client';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);

const camera = new THREE.PerspectiveCamera(
  70, window.innerWidth / window.innerHeight, 0.1, 1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

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

const player = new THREE.Group();
scene.add(player);

let mixer, idleAction, walkAction, currentAction;
let idleModel = null, walkClip = null;
const loader = new FBXLoader();

loader.load('/models/idle.fbx', (model) => {
  model.scale.setScalar(0.02); // Mixamo model том гардаг тул жижигрүүлнэ
  player.add(model);
  idleModel = model;
  mixer = new THREE.AnimationMixer(model);
  idleAction = mixer.clipAction(model.animations[0]);
  idleAction.play();
  currentAction = idleAction;

  loader.load('/models/walk.fbx', (anim) => {
    walkAction = mixer.clipAction(anim.animations[0]);
    walkClip = anim.animations[0];
  });
});

function fadeTo(action) {
  if (!action || action === currentAction) return;
  action.reset().play();
  currentAction.crossFadeTo(action, 0.2);
  currentAction = action;
}
const socket = io('http://localhost:3000');
const others = {};

function createOther(id, data) {
  if (!idleModel || !walkClip || others[id]) return;
  const group = new THREE.Group();
  const model = clone(idleModel);
  group.add(model);
  group.position.set(data.x, 0, data.z);
  scene.add(group);

  const m = new THREE.AnimationMixer(model);
  const idle = m.clipAction(idleModel.animations[0]);
  const walk = m.clipAction(walkClip);
  idle.play();
  others[id] = {
    group, mixer: m, idle, walk, current: idle,
    target: new THREE.Vector3(data.x, 0, data.z),
    targetRy: data.ry, moving: false,
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
  if (!o) return createOther(d.id, d);
  o.target.set(d.x, 0, d.z);
  o.targetRy = d.ry;
  o.moving = d.moving;
});
socket.on('playerLeft', (id) => {
  if (!others[id]) return;
  scene.remove(others[id].group);
  delete others[id];
});

setInterval(() => {
  socket.emit('update', {
    x: player.position.x,
    z: player.position.z,
    ry: player.rotation.y,
    moving: currentAction === walkAction,
  });
}, 66);

const keys = {};
window.addEventListener('keydown', (e) => (keys[e.code] = true));
window.addEventListener('keyup', (e) => (keys[e.code] = false));

const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const speed = 5;

  const dir = new THREE.Vector3(
  (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0),
  0,
  (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0)
);

if (dir.lengthSq() > 0) {
  dir.normalize();
  player.position.addScaledVector(dir, speed * dt);
  player.rotation.y = Math.atan2(dir.x, dir.z); // явж буй зүг рүүгээ эргэнэ
  fadeTo(walkAction);
} else {
  fadeTo(idleAction);
}

if (mixer) mixer.update(dt);
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

  camera.position.set(player.position.x, 6, player.position.z + 10);
  camera.lookAt(player.position);

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});