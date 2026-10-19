import * as THREE from "three";
import { createClient } from "@supabase/supabase-js";

// 1) Pega aquí los datos de tu proyecto Supabase (Project Settings > API).
const SUPABASE_URL = "PEGA_AQUI_TU_PROJECT_URL";
const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_PUBLISHABLE_OR_ANON_KEY";

const AIM_TYPES = {
  common:    { label: "Common", cost: 25, income: 2, color: 0xe7edf7, shape: "circle" },
  rare:      { label: "Rare", cost: 100, income: 8, color: 0x49a6ff, shape: "diamond" },
  epic:      { label: "Epic", cost: 350, income: 25, color: 0xc56aff, shape: "star" },
  legendary: { label: "Legendary", cost: 1000, income: 80, color: 0xffd84a, shape: "ring" }
};
const PLAYER_COLORS = [0x4be4ff, 0xff6a9c, 0x9cff57, 0xffbc4b, 0xb38bff, 0xfff16b];

const statusEl = document.querySelector("#status");
const loadingEl = document.querySelector("#loading");
const coinsEl = document.querySelector("#coins");
const onlineEl = document.querySelector("#online");
const toastEl = document.querySelector("#toast");
let toastTimer;
function toast(message) {
  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2600);
}

let supabase = null, user = null, gameChannel = null;
let myCoins = 0;
let players = new Map();
let aimRows = [];
let aimMeshes = new Map();
let avatarMeshes = new Map();
let lastPositionBroadcast = 0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bdcff);
scene.fog = new THREE.Fog(0x9bdcff, 38, 100);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
camera.position.set(0, 10, 16);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.querySelector("#game").appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x62718c, 2.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-10, 20, 12);
sun.castShadow = true;
scene.add(sun);

const mat = (color, roughness = 0.8, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), mat(0x69c96c));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(100, 50, 0x479d58, 0x59b461);
grid.position.y = 0.015;
scene.add(grid);

// Decor: path, rocks, blocky trees, and 8 base pads.
const path = new THREE.Mesh(new THREE.PlaneGeometry(9, 90), mat(0xd8d2b9));
path.rotation.x = -Math.PI / 2; path.position.set(0, 0.025, 0); scene.add(path);
const sidePath = new THREE.Mesh(new THREE.PlaneGeometry(70, 7), mat(0xd8d2b9));
sidePath.rotation.x = -Math.PI / 2; sidePath.position.set(0, 0.03, 0); scene.add(sidePath);

function boxMesh(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
  return mesh;
}
function makeTree(x, z, s = 1) {
  boxMesh(.45*s, 1.5*s, .45*s, mat(0x80552f), x, .75*s, z);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(.9*s, 0), mat(0x168d57));
  crown.position.set(x, 1.9*s, z); crown.castShadow = true; scene.add(crown);
}
for (let i = 0; i < 24; i++) {
  const x = (i % 2 ? 1 : -1) * (12 + Math.random() * 22);
  const z = -38 + i * 3.2;
  makeTree(x, z, .7 + Math.random() * .65);
}
for (let i = 0; i < 8; i++) {
  const x = i % 2 === 0 ? -12 : 12;
  const z = -28 + Math.floor(i / 2) * 18;
  const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
  const pad = new THREE.Mesh(new THREE.BoxGeometry(8, .35, 8), mat(0x333a56));
  pad.position.set(x, .18, z); pad.receiveShadow = true; pad.castShadow = true; scene.add(pad);
  const rim = new THREE.Mesh(new THREE.BoxGeometry(8.2, .12, 8.2), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .28 }));
  rim.position.set(x, .1, z); scene.add(rim);
  boxMesh(1.5, 1.3, .35, mat(color), x, .9, z - 3.65);
  const label = makeTextSprite(`BASE ${i + 1}`, color);
  label.position.set(x, 2, z - 3.4); scene.add(label);
}
function makeTextSprite(text, color = 0xffffff) {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#141a35dd"; ctx.beginPath(); ctx.roundRect(8, 8, 496, 112, 24); ctx.fill();
  ctx.strokeStyle = "#" + color.toString(16).padStart(6, "0"); ctx.lineWidth = 8; ctx.stroke();
  ctx.fillStyle = "#ffffff"; ctx.font = "bold 48px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(text, 256, 65);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true }));
  sprite.scale.set(4.2, 1.05, 1); return sprite;
}

const localAvatar = new THREE.Group();
const body = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.1, .45), mat(0x22c9d8));
body.position.y = 1.1; body.castShadow = true; localAvatar.add(body);
const head = new THREE.Mesh(new THREE.BoxGeometry(.65, .65, .65), mat(0xffd2aa));
head.position.y = 2; head.castShadow = true; localAvatar.add(head);
const legs = [];
for (const x of [-.22, .22]) {
  const leg = new THREE.Mesh(new THREE.BoxGeometry(.25, .7, .3), mat(0x303b70));
  leg.position.set(x, .35, 0); leg.castShadow = true; localAvatar.add(leg); legs.push(leg);
}
scene.add(localAvatar);
let position = new THREE.Vector3(0, 0, 8);
localAvatar.position.copy(position);
const keys = new Set();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let yaw = 0;
let isPointerDown = false;
let lastPointerX = 0;

window.addEventListener("keydown", e => { keys.add(e.key.toLowerCase()); });
window.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
renderer.domElement.addEventListener("pointerdown", e => { isPointerDown = true; lastPointerX = e.clientX; });
window.addEventListener("pointerup", () => isPointerDown = false);
window.addEventListener("pointermove", e => {
  if (isPointerDown && e.clientX > 250) {
    yaw -= (e.clientX - lastPointerX) * 0.005;
    lastPointerX = e.clientX;
  }
});
renderer.domElement.addEventListener("click", async e => {
  if (!user || !supabase) return;
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([...aimMeshes.values()], true);
  if (!hits.length) return;
  let obj = hits[0].object;
  while (obj && !obj.userData.aimId) obj = obj.parent;
  if (!obj?.userData.aimId) return;
  const row = aimRows.find(a => a.id === obj.userData.aimId);
  if (!row) return;
  if (row.owner_id === user.id) { toast("¡Ese aim ya es tuyo!"); return; }
  if (position.distanceTo(new THREE.Vector3(...basePositionFor(row.owner_id))) > 16) {
    toast("Acércate a la base de ese jugador para robar.");
    return;
  }
  const { error } = await supabase.rpc("steal_aim", { target_aim_id: row.id });
  if (error) toast(error.message.includes("not found") ? "Ese aim ya no está disponible." : error.message);
  else toast("¡ROBO CONSEGUIDO! 🥷");
});

function basePositionFor(ownerId) {
  return basePositionForIndex(baseIndexFor(ownerId));
}
function baseIndexFor(id) {
  const list = [...players.keys()].sort();
  const idx = Math.max(0, list.indexOf(id));
  return idx % 8;
}
function basePositionForIndex(idx) {
  return [idx % 2 === 0 ? -12 : 12, 0, -28 + Math.floor(idx / 2) * 18];
}
function makeAim(row, index) {
  const config = AIM_TYPES[row.aim_type] || AIM_TYPES.common;
  const g = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color: config.color, emissive: config.color, emissiveIntensity: .65, metalness: .35, roughness: .25 });
  const torus = new THREE.Mesh(new THREE.TorusGeometry(.42, .09, 10, 32), ringMat);
  g.add(torus);
  const center = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 12), ringMat);
  g.add(center);
  if (config.shape === "diamond") {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.3), ringMat); g.add(gem);
  } else if (config.shape === "star") {
    const star = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 0), ringMat); g.add(star);
  } else if (config.shape === "ring") {
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(.65, .045, 8, 32), ringMat); ring2.rotation.x = Math.PI / 2; g.add(ring2);
  }
  const idx = baseIndexFor(row.owner_id);
  const [bx, , bz] = basePositionForIndex(idx);
  const owned = aimRows.filter(a => a.owner_id === row.owner_id);
  const ownIndex = Math.max(0, owned.findIndex(a => a.id === row.id));
  g.position.set(bx - 2.1 + (ownIndex % 3) * 2.1, 1.7 + Math.floor(ownIndex / 3) * .2, bz - 1.7 + Math.floor(ownIndex / 3) * 1.8);
  g.userData.aimId = row.id;
  const label = makeTextSprite(`${config.label} +${config.income}/s`, config.color);
  label.position.y = .8; label.scale.set(2.5, .62, 1); g.add(label);
  scene.add(g); return g;
}
function renderAims() {
  const valid = new Set(aimRows.map(a => a.id));
  for (const [id, mesh] of aimMeshes) if (!valid.has(id)) { scene.remove(mesh); aimMeshes.delete(id); }
  for (const row of aimRows) {
    if (!aimMeshes.has(row.id)) aimMeshes.set(row.id, makeAim(row));
  }
}
function renderPlayers() {
  const alive = new Set([...players.keys()].filter(id => id !== user?.id));
  for (const [id, mesh] of avatarMeshes) if (!alive.has(id)) { scene.remove(mesh); avatarMeshes.delete(id); }
  for (const [id, p] of players) {
    if (id === user?.id) continue;
    if (!avatarMeshes.has(id)) {
      const g = new THREE.Group();
      const c = PLAYER_COLORS[baseIndexFor(id)];
      const b = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.1, .45), mat(c)); b.position.y = 1.1; b.castShadow = true; g.add(b);
      const h = new THREE.Mesh(new THREE.BoxGeometry(.65, .65, .65), mat(0xffd2aa)); h.position.y = 2; h.castShadow = true; g.add(h);
      scene.add(g); avatarMeshes.set(id, g);
    }
    const mesh = avatarMeshes.get(id);
    if (p.x != null && p.z != null) mesh.position.set(p.x, 0, p.z);
  }
  onlineEl.textContent = String(players.size || 1);
}
async function refreshState() {
  if (!supabase || !user) return;
  const [{ data: profile }, { data: aims }] = await Promise.all([
    supabase.from("players").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("aims").select("*")
  ]);
  if (profile) { myCoins = profile.coins; coinsEl.textContent = String(myCoins); }
  if (aims) { aimRows = aims; renderAims(); }
}
async function startOnline() {
  if (SUPABASE_URL.startsWith("PEGA_") || SUPABASE_ANON_KEY.startsWith("PEGA_")) {
    statusEl.innerHTML = 'El mundo 3D ya está listo, pero falta conectar Supabase.<br><br>Abre <b>README.md</b> y sigue los pasos.';
    return;
  }
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) throw error;
    user = data.user;
    const { error: joinError } = await supabase.rpc("join_game", { player_name: "Player-" + user.id.slice(0, 4) });
    if (joinError) throw joinError;
    await refreshState();
    gameChannel = supabase.channel("world", { config: { presence: { key: user.id } } });
    gameChannel
      .on("presence", { event: "sync" }, () => {
        const state = gameChannel.presenceState();
        const next = new Map();
        for (const [key, entries] of Object.entries(state)) {
          const p = entries[0];
          next.set(key, { ...p, id: key });
        }
        players = next;
        renderPlayers();
        renderAims();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "aims" }, refreshState)
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, refreshState)
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await gameChannel.track({ x: position.x, z: position.z, name: "Player-" + user.id.slice(0, 4) });
          loadingEl.classList.add("hidden");
          toast("¡Conectado al mundo online!");
        }
      });
  } catch (e) {
    statusEl.textContent = "No se pudo conectar: " + e.message + ". Revisa la configuración del README.";
  }
}
document.querySelectorAll("[data-buy]").forEach(button => button.addEventListener("click", async () => {
  if (!supabase || !user) return toast("Primero conecta Supabase siguiendo el README.");
  const type = button.dataset.buy;
  const { error } = await supabase.rpc("buy_aim", { aim_type_input: type });
  if (error) toast(error.message);
  else { toast("¡Aim comprado!"); await refreshState(); }
}));
document.querySelector("#collect").addEventListener("click", async () => {
  if (!supabase || !user) return toast("Primero conecta Supabase siguiendo el README.");
  const { data, error } = await supabase.rpc("collect_coins");
  if (error) toast(error.message);
  else { toast(`+${data} monedas 🪙`); await refreshState(); }
});

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
const clock = new THREE.Clock();
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .05);
  const forward = (keys.has("w") || keys.has("arrowup") ? 1 : 0) - (keys.has("s") || keys.has("arrowdown") ? 1 : 0);
  const strafe = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  if (forward || strafe) {
    const speed = 7 * dt;
    position.x += (Math.sin(yaw) * forward + Math.cos(yaw) * strafe) * speed;
    position.z += (Math.cos(yaw) * forward - Math.sin(yaw) * strafe) * speed;
    position.x = THREE.MathUtils.clamp(position.x, -38, 38);
    position.z = THREE.MathUtils.clamp(position.z, -43, 43);
    localAvatar.position.set(position.x, 0, position.z);
    localAvatar.rotation.y = yaw;
  }
  camera.position.x += (position.x + Math.sin(yaw) * 10 - camera.position.x) * .08;
  camera.position.z += (position.z + Math.cos(yaw) * 10 - camera.position.z) * .08;
  camera.position.y += (10 - camera.position.y) * .08;
  camera.lookAt(position.x, 1, position.z);
  const t = performance.now() * .001;
  for (const mesh of aimMeshes.values()) { mesh.position.y += Math.sin(t * 2 + mesh.position.x) * .002; mesh.rotation.y += dt * .7; }
  if (gameChannel && user && performance.now() - lastPositionBroadcast > 120) {
    lastPositionBroadcast = performance.now();
    gameChannel.track({ x: position.x, z: position.z, name: "Player-" + user.id.slice(0, 4) });
  }
  renderer.render(scene, camera);
}
animate();
startOnline();
