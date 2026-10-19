
import * as THREE from "three";
import { createClient } from "@supabase/supabase-js";

// ======================================================
// STEAL AN AIM — configuración
// ======================================================

const SUPABASE_URL = "https://grevptschikwlrvipznp.supabase.co";
const SUPABASE_ANON_KEY =
  "sb_publishable_S9SMGx5VvcaJcUkOgY3CLA_XyW3uTgZ";

const AIM_TYPES = {
  common: {
    label: "Common", cost: 25, income: 2,
    color: 0xe7edf7, shape: "circle"
  },
  rare: {
    label: "Rare", cost: 100, income: 8,
    color: 0x49a6ff, shape: "diamond"
  },
  epic: {
    label: "Epic", cost: 350, income: 25,
    color: 0xc56aff, shape: "star"
  },
  legendary: {
    label: "Legendary", cost: 1000, income: 80,
    color: 0xffd84a, shape: "ring"
  }
};

const PLAYER_COLORS = [
  0x4be4ff, 0xff6a9c, 0x9cff57,
  0xffbc4b, 0xb38bff, 0xfff16b
];

const SKINS = {
  default: {
    id: "default", name: "ROOKIE", price: 0,
    body: 0x22c9d8, legs: 0x303b70,
    accent: "#22c9d8",
    description: "La skin original."
  },
  neon: {
    id: "neon", name: "NEON", price: 100,
    body: 0x00d9ff, legs: 0x142c55,
    accent: "#00d9ff",
    description: "Energía azul eléctrica."
  },
  desert: {
    id: "desert", name: "DESERT", price: 250,
    body: 0xc99b62, legs: 0x47362c,
    accent: "#d6a66b",
    description: "Tonos arena y carbón."
  },
  arctic: {
    id: "arctic", name: "ARCTIC", price: 400,
    body: 0xc9f2ff, legs: 0x437eaf,
    accent: "#8ce8ff",
    description: "Diseño inspirado en el hielo."
  },
  shadow: {
    id: "shadow", name: "SHADOW", price: 600,
    body: 0x6040a0, legs: 0x171522,
    accent: "#a78bfa",
    description: "Violeta y negro."
  }
};

// ======================================================
// DOM Y ESTADO
// ======================================================

const statusEl = document.querySelector("#status");
const loadingEl = document.querySelector("#loading");
const coinsEl = document.querySelector("#coins");
const onlineEl = document.querySelector("#online");
const toastEl = document.querySelector("#toast");

let toastTimer;

function toast(message) {
  if (!toastEl) {
    console.log(message);
    return;
  }

  toastEl.textContent = message;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 2600);
}

let supabase = null;
let user = null;
let gameChannel = null;

let myCoins = 0;
let players = new Map();
let aimRows = [];

let equippedSkin = "default";
let ownedSkins = new Set(["default"]);
let cosmeticsTab = "shop";

let aimMeshes = new Map();
let avatarMeshes = new Map();
let lastPositionBroadcast = 0;

let position = new THREE.Vector3(0, 0, 8);
let yaw = 0;

const keys = new Set();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

let isPointerDown = false;
let lastPointerX = 0;

// ======================================================
// TIENDA E INVENTARIO
// Crear el panel ANTES de llamar a renderCosmetics().
// ======================================================

const cosmeticsPanel = document.createElement("aside");
cosmeticsPanel.id = "cosmetics-panel";
cosmeticsPanel.className = "panel cosmetics";

cosmeticsPanel.innerHTML = `
  <div class="cosmetics-heading">
    <div>
      <span class="eyebrow">PERSONALIZACIÓN</span>
      <h2>Armería visual</h2>
    </div>
    <span class="cosmetics-count" id="skin-count">1 SKIN</span>
  </div>

  <div class="cosmetics-tabs">
    <button type="button" data-cosmetics-tab="shop">
      TIENDA
    </button>
    <button type="button" data-cosmetics-tab="inventory">
      INVENTARIO
    </button>
  </div>

  <div id="cosmetics-grid" class="cosmetics-grid"></div>

  <p class="cosmetics-footnote">
    Las compras se guardan en tu cuenta online.
  </p>
`;

document.body.appendChild(cosmeticsPanel);

function renderCosmetics() {
  const grid = cosmeticsPanel.querySelector("#cosmetics-grid");
  const count = cosmeticsPanel.querySelector("#skin-count");

  const items = Object.values(SKINS).filter(skin =>
    cosmeticsTab === "shop" || ownedSkins.has(skin.id)
  );

  count.textContent =
    `${ownedSkins.size} SKIN${ownedSkins.size === 1 ? "" : "S"}`;

  cosmeticsPanel
    .querySelectorAll("[data-cosmetics-tab]")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.cosmeticsTab === cosmeticsTab
      );
    });

  grid.innerHTML = items.map(skin => {
    const owned = ownedSkins.has(skin.id);
    const equipped = equippedSkin === skin.id;

    const action = owned ? "equip" : "buy";

    const buttonText = equipped
      ? "EQUIPADA"
      : owned
        ? "EQUIPAR"
        : `COMPRAR · ${skin.price} 🪙`;

    return `
      <article class="skin-card ${equipped ? "is-equipped" : ""}">
        <div
          class="skin-preview"
          style="--skin-accent:${skin.accent}"
        >
          <span class="skin-orbit"></span>

          <span class="skin-avatar">
            <span class="skin-head"></span>
            <span
              class="skin-body"
              style="background:#${skin.body.toString(16).padStart(6, "0")}"
            ></span>
            <span
              class="skin-legs"
              style="border-color:#${skin.legs.toString(16).padStart(6, "0")}"
            ></span>
          </span>

          <span class="skin-rarity">
            ${skin.id === "default" ? "BASE" : "SKIN"}
          </span>
        </div>

        <div class="skin-info">
          <h3>${skin.name}</h3>
          <p>${skin.description}</p>

          <button
            type="button"
            class="skin-action ${equipped ? "equipped" : ""}"
            data-skin-action="${action}"
            data-skin="${skin.id}"
            ${equipped ? "disabled" : ""}
          >${buttonText}</button>
        </div>
      </article>
    `;
  }).join("");

  if (items.length === 0) {
    grid.innerHTML = `
      <p class="cosmetics-empty">
        Todavía no tienes skins. ¡Visita la tienda!
      </p>
    `;
  }
}

// ======================================================
// ESCENA THREE.JS
// ======================================================

const gameEl = document.querySelector("#game");

if (!gameEl) {
  throw new Error('No se encuentra el elemento HTML con id="game".');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bdcff);
scene.fog = new THREE.Fog(0x9bdcff, 38, 100);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);

camera.position.set(0, 10, 16);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(
  Math.min(window.devicePixelRatio || 1, 1.5)
);

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

gameEl.appendChild(renderer.domElement);

scene.add(
  new THREE.HemisphereLight(0xffffff, 0x62718c, 2.1)
);

const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.position.set(-10, 20, 12);
sun.castShadow = true;
scene.add(sun);

const mat = (color, roughness = 0.8, metalness = 0) =>
  new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness
  });

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 100),
  mat(0x69c96c)
);

ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(
  100, 50, 0x479d58, 0x59b461
);

grid.position.y = 0.015;
scene.add(grid);

const path = new THREE.Mesh(
  new THREE.PlaneGeometry(9, 90),
  mat(0xd8d2b9)
);

path.rotation.x = -Math.PI / 2;
path.position.set(0, 0.025, 0);
scene.add(path);

const sidePath = new THREE.Mesh(
  new THREE.PlaneGeometry(70, 7),
  mat(0xd8d2b9)
);

sidePath.rotation.x = -Math.PI / 2;
sidePath.position.set(0, 0.03, 0);
scene.add(sidePath);

function boxMesh(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    material
  );

  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);

  return mesh;
}

function makeTree(x, z, scale = 1) {
  boxMesh(
    0.45 * scale, 1.5 * scale, 0.45 * scale,
    mat(0x80552f),
    x, 0.75 * scale, z
  );

  const crown = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.9 * scale, 0),
    mat(0x168d57)
  );

  crown.position.set(x, 1.9 * scale, z);
  crown.castShadow = true;
  scene.add(crown);
}

for (let i = 0; i < 24; i++) {
  const x =
    (i % 2 ? 1 : -1) * (12 + Math.random() * 22);

  const z = -38 + i * 3.2;

  makeTree(x, z, 0.7 + Math.random() * 0.65);
}

function makeTextSprite(text, color = 0xffffff) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;

  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#141a35dd";
  ctx.beginPath();
  ctx.roundRect(8, 8, 496, 112, 24);
  ctx.fill();

  ctx.strokeStyle =
    "#" + color.toString(16).padStart(6, "0");

  ctx.lineWidth = 8;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 48px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 65);

  const texture = new THREE.CanvasTexture(canvas);

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true
    })
  );

  sprite.scale.set(4.2, 1.05, 1);
  return sprite;
}

for (let i = 0; i < 8; i++) {
  const x = i % 2 === 0 ? -12 : 12;
  const z = -28 + Math.floor(i / 2) * 18;
  const color = PLAYER_COLORS[i % PLAYER_COLORS.length];

  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(8, 0.35, 8),
    mat(0x333a56)
  );

  pad.position.set(x, 0.18, z);
  pad.receiveShadow = true;
  pad.castShadow = true;
  scene.add(pad);

  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(8.2, 0.12, 8.2),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.28
    })
  );

  rim.position.set(x, 0.1, z);
  scene.add(rim);

  boxMesh(
    1.5, 1.3, 0.35,
    mat(color),
    x, 0.9, z - 3.65
  );

  const label = makeTextSprite(`BASE ${i + 1}`, color);
  label.position.set(x, 2, z - 3.4);
  scene.add(label);
}

// ======================================================
// PERSONAJES Y SKINS
// ======================================================

function createAvatar(isLocal = false) {
  const avatar = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.8, 1.1, 0.45),
    mat(0x22c9d8)
  );

  body.position.y = 1.1;
  body.castShadow = true;
  body.userData.skinPart = "body";
  avatar.add(body);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.65, 0.65),
    mat(0xffd2aa)
  );

  head.position.y = 2;
  head.castShadow = true;
  avatar.add(head);

  for (const x of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.7, 0.3),
      mat(0x303b70)
    );

    leg.position.set(x, 0.35, 0);
    leg.castShadow = true;
    leg.userData.skinPart = "legs";
    avatar.add(leg);
  }

  if (isLocal) {
    avatar.userData.isLocal = true;
  }

  return avatar;
}

function applySkinToAvatar(avatar, skinId) {
  if (!avatar) return;

  const skin = SKINS[skinId] || SKINS.default;

  for (const part of avatar.children) {
    const material = part.material;

    if (!material?.color) continue;

    if (part.userData.skinPart === "body") {
      material.color.setHex(skin.body);
    }

    if (part.userData.skinPart === "legs") {
      material.color.setHex(skin.legs);
    }
  }
}

const localAvatar = createAvatar(true);
scene.add(localAvatar);
localAvatar.position.copy(position);

applySkinToAvatar(localAvatar, equippedSkin);

// ======================================================
// BASES Y AIM
// ======================================================

function baseIndexFor(id) {
  const list = [...players.keys()].sort();
  const index = Math.max(0, list.indexOf(id));
  return index % 8;
}

function basePositionForIndex(index) {
  return [
    index % 2 === 0 ? -12 : 12,
    0,
    -28 + Math.floor(index / 2) * 18
  ];
}

function basePositionFor(ownerId) {
  return basePositionForIndex(baseIndexFor(ownerId));
}

function makeAim(row) {
  const config = AIM_TYPES[row.aim_type] || AIM_TYPES.common;
  const group = new THREE.Group();

  const ringMat = new THREE.MeshStandardMaterial({
    color: config.color,
    emissive: config.color,
    emissiveIntensity: 0.65,
    metalness: 0.35,
    roughness: 0.25
  });

  group.add(
    new THREE.Mesh(
      new THREE.TorusGeometry(0.42, 0.09, 10, 32),
      ringMat
    )
  );

  group.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 12),
      ringMat
    )
  );

  if (config.shape === "diamond") {
    group.add(
      new THREE.Mesh(
        new THREE.OctahedronGeometry(0.3),
        ringMat
      )
    );
  } else if (config.shape === "star") {
    group.add(
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.32, 0),
        ringMat
      )
    );
  } else if (config.shape === "ring") {
    const secondRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.65, 0.045, 8, 32),
      ringMat
    );

    secondRing.rotation.x = Math.PI / 2;
    group.add(secondRing);
  }

  const index = baseIndexFor(row.owner_id);
  const [baseX, , baseZ] = basePositionForIndex(index);

  const owned = aimRows.filter(
    aim => aim.owner_id === row.owner_id
  );

  const ownIndex = Math.max(
    0,
    owned.findIndex(aim => aim.id === row.id)
  );

  group.position.set(
    baseX - 2.1 + (ownIndex % 3) * 2.1,
    1.7 + Math.floor(ownIndex / 3) * 0.2,
    baseZ - 1.7 + Math.floor(ownIndex / 3) * 1.8
  );

  group.userData.aimId = row.id;

  const label = makeTextSprite(
    `${config.label} +${config.income}/s`,
    config.color
  );

  label.position.y = 0.8;
  label.scale.set(2.5, 0.62, 1);
  group.add(label);

  scene.add(group);
  return group;
}

function renderAims() {
  const valid = new Set(aimRows.map(row => row.id));

  for (const [id, mesh] of aimMeshes) {
    if (!valid.has(id)) {
      scene.remove(mesh);
      aimMeshes.delete(id);
    }
  }

  for (const row of aimRows) {
    if (!aimMeshes.has(row.id)) {
      aimMeshes.set(row.id, makeAim(row));
    }
  }
}

function renderPlayers() {
  const alive = new Set(
    [...players.keys()].filter(id => id !== user?.id)
  );

  for (const [id, mesh] of avatarMeshes) {
    if (!alive.has(id)) {
      scene.remove(mesh);
      avatarMeshes.delete(id);
    }
  }

  for (const [id, player] of players) {
    if (id === user?.id) continue;

    if (!avatarMeshes.has(id)) {
      const avatar = createAvatar(false);
      scene.add(avatar);
      avatarMeshes.set(id, avatar);
    }

    const mesh = avatarMeshes.get(id);

    applySkinToAvatar(mesh, player.skin_id || "default");

    if (player.x != null && player.z != null) {
      mesh.position.set(player.x, 0, player.z);
    }
  }

  if (onlineEl) {
    onlineEl.textContent = String(players.size || 1);
  }
}

// ======================================================
// CARGA DEL ESTADO DEL JUGADOR
// ======================================================

async function refreshState() {
  if (!supabase || !user) return;

  const [
    { data: profile, error: profileError },
    { data: aims, error: aimsError },
    { data: ownedRows, error: skinsError }
  ] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .eq("id", user.id)
      .maybeSingle(),

    supabase
      .from("aims")
      .select("*"),

    supabase
      .from("player_skins")
      .select("skin_id")
      .eq("user_id", user.id)
  ]);

  if (profileError) throw profileError;
  if (aimsError) throw aimsError;
  if (skinsError) throw skinsError;

  if (profile) {
    myCoins = profile.coins ?? 0;

    if (coinsEl) {
      coinsEl.textContent = String(myCoins);
    }

    equippedSkin = SKINS[profile.skin_id]
      ? profile.skin_id
      : "default";

    applySkinToAvatar(localAvatar, equippedSkin);
  }

  aimRows = aims || [];
  renderAims();

  ownedSkins = new Set([
    "default",
    ...(ownedRows || []).map(row => row.skin_id)
  ]);

  // Si el perfil contiene una skin no disponible en el inventario,
  // no la mostramos como una skin comprada.
  if (!ownedSkins.has(equippedSkin)) {
    equippedSkin = "default";
    applySkinToAvatar(localAvatar, equippedSkin);
  }

  renderCosmetics();
}

// ======================================================
// EVENTOS DE LA TIENDA
// ======================================================

cosmeticsPanel.addEventListener("click", async event => {
  const tabButton = event.target.closest("[data-cosmetics-tab]");

  if (tabButton) {
    cosmeticsTab = tabButton.dataset.cosmeticsTab;
    renderCosmetics();
    return;
  }

  const button = event.target.closest("[data-skin-action]");
  if (!button) return;

  if (!supabase || !user) {
    toast("Conéctate al mundo online antes de usar la tienda.");
    return;
  }

  const skinId = button.dataset.skin;
  const action = button.dataset.skinAction;

  if (!SKINS[skinId]) return;

  button.disabled = true;
  button.textContent = "PROCESANDO...";

  try {
    const { error } = await supabase.rpc(
      action === "buy" ? "buy_skin" : "equip_skin",
      { skin_id_input: skinId }
    );

    if (error) throw error;

    await refreshState();

    toast(
      action === "buy"
        ? `¡Has desbloqueado ${SKINS[skinId].name}!`
        : `Skin ${SKINS[skinId].name} equipada.`
    );
  } catch (error) {
    console.error("Error de la tienda:", error);
    toast(error.message || "No se pudo completar la operación.");
  } finally {
    renderCosmetics();
  }
});

renderCosmetics();

// ======================================================
// CONTROLES Y ROBO DE AIM
// ======================================================

window.addEventListener("keydown", event => {
  keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", event => {
  keys.delete(event.key.toLowerCase());
});

window.addEventListener("blur", () => {
  keys.clear();
  isPointerDown = false;
});

renderer.domElement.addEventListener("pointerdown", event => {
  isPointerDown = true;
  lastPointerX = event.clientX;
});

window.addEventListener("pointerup", () => {
  isPointerDown = false;
});

window.addEventListener("pointermove", event => {
  if (isPointerDown && event.clientX > 250) {
    yaw -= (event.clientX - lastPointerX) * 0.005;
    lastPointerX = event.clientX;
  }
});

renderer.domElement.addEventListener("click", async event => {
  if (!user || !supabase) return;

  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(
    [...aimMeshes.values()],
    true
  );

  if (!hits.length) return;

  let object = hits[0].object;

  while (object && !object.userData.aimId) {
    object = object.parent;
  }

  if (!object?.userData.aimId) return;

  const row = aimRows.find(
    aim => aim.id === object.userData.aimId
  );

  if (!row) return;

  if (row.owner_id === user.id) {
    toast("¡Ese aim ya es tuyo!");
    return;
  }

  const [baseX, , baseZ] = basePositionFor(row.owner_id);

  if (
    position.distanceTo(new THREE.Vector3(baseX, 0, baseZ)) > 16
  ) {
    toast("Acércate a la base de ese jugador para robar.");
    return;
  }

  const { error } = await supabase.rpc(
    "steal_aim",
    { target_aim_id: row.id }
  );

  if (error) {
    toast(error.message);
  } else {
    toast("¡ROBO CONSEGUIDO! 🥷");
    await refreshState();
  }
});

// ======================================================
// CONEXIÓN SUPABASE Y MULTIJUGADOR
// ======================================================

async function startOnline() {
  if (
    !SUPABASE_URL.startsWith("https://") ||
    SUPABASE_URL.includes("TU_ID_REAL") ||
    !SUPABASE_ANON_KEY.startsWith("sb_publishable_")
  ) {
    if (statusEl) {
      statusEl.textContent =
        "Revisa la URL y la clave publicable de Supabase.";
    }

    if (loadingEl) loadingEl.classList.remove("hidden");
    return;
  }

  try {
    supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY
    );

    const { data, error } =
      await supabase.auth.signInAnonymously();

    if (error) throw error;

    user = data.user;

    if (!user) {
      throw new Error("Supabase no devolvió un usuario.");
    }

    const { error: joinError } = await supabase.rpc(
      "join_game",
      { player_name: "Player-" + user.id.slice(0, 4) }
    );

    if (joinError) throw joinError;

    await refreshState();

    gameChannel = supabase.channel("world", {
      config: {
        presence: { key: user.id }
      }
    });

    gameChannel
      .on("presence", { event: "sync" }, () => {
        const state = gameChannel.presenceState();
        const next = new Map();

        for (const [key, entries] of Object.entries(state)) {
          const player = entries[0];

          if (player) {
            next.set(key, { ...player, id: key });
          }
        }

        players = next;
        renderPlayers();
        renderAims();
      })
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "aims"
        },
        () => refreshState().catch(console.error)
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players"
        },
        () => refreshState().catch(console.error)
      )
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await gameChannel.track({
            x: position.x,
            z: position.z,
            name: "Player-" + user.id.slice(0, 4),
            skin_id: equippedSkin
          });

          if (loadingEl) {
            loadingEl.classList.add("hidden");
          }

          if (statusEl) {
            statusEl.textContent = "Conectado al mundo online.";
          }

          toast("¡Conectado al mundo online!");
        }
      });
  } catch (error) {
    console.error("Error conectando a Supabase:", error);

    if (statusEl) {
      statusEl.textContent =
        "No se pudo conectar: " +
        error.message +
        ". Revisa Supabase y supabase.sql.";
    }

    toast("Error al conectar con el mundo online.");
  }
}

// ======================================================
// TIENDA ORIGINAL DE AIM
// ======================================================

document.querySelectorAll("[data-buy]").forEach(button => {
  button.addEventListener("click", async () => {
    if (!supabase || !user) {
      toast("Primero conecta Supabase.");
      return;
    }

    const type = button.dataset.buy;

    try {
      button.disabled = true;

      const { error } = await supabase.rpc(
        "buy_aim",
        { aim_type_input: type }
      );

      if (error) throw error;

      toast("¡Aim comprado!");
      await refreshState();
    } catch (error) {
      toast(error.message || "No se pudo comprar el aim.");
    } finally {
      button.disabled = false;
    }
  });
});

const collectButton = document.querySelector("#collect");

if (collectButton) {
  collectButton.addEventListener("click", async () => {
    if (!supabase || !user) {
      toast("Primero conecta Supabase.");
      return;
    }

    try {
      collectButton.disabled = true;

      const { data, error } = await supabase.rpc(
        "collect_coins"
      );

      if (error) throw error;

      toast(`+${data} monedas 🪙`);
      await refreshState();
    } catch (error) {
      toast(error.message || "No se pudieron recoger monedas.");
    } finally {
      collectButton.disabled = false;
    }
  });
}

// ======================================================
// RESIZE Y BUCLE DEL JUEGO
// ======================================================

function resizeGame() {
  const width = window.innerWidth;
  const height = Math.max(window.innerHeight, 1);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio || 1, 1.5)
  );

  renderer.setSize(width, height);
}

window.addEventListener("resize", resizeGame);
resizeGame();

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);

  const forward =
    (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
    (keys.has("s") || keys.has("arrowdown") ? 1 : 0);

  const strafe =
    (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
    (keys.has("a") || keys.has("arrowleft") ? 1 : 0);

  if (forward || strafe) {
    const length = Math.hypot(forward, strafe) || 1;
    const speed = 7 * dt;

    position.x += (
      Math.sin(yaw) * forward +
      Math.cos(yaw) * strafe
    ) / length * speed;

    position.z += (
      Math.cos(yaw) * forward -
      Math.sin(yaw) * strafe
    ) / length * speed;

    position.x = THREE.MathUtils.clamp(
      position.x, -38, 38
    );

    position.z = THREE.MathUtils.clamp(
      position.z, -43, 43
    );

    localAvatar.position.set(position.x, 0, position.z);
    localAvatar.rotation.y = yaw;
  }

  camera.position.x += (
    position.x + Math.sin(yaw) * 10 - camera.position.x
  ) * 0.08;

  camera.position.z += (
    position.z + Math.cos(yaw) * 10 - camera.position.z
  ) * 0.08;

  camera.position.y += (10 - camera.position.y) * 0.08;

  camera.lookAt(position.x, 1, position.z);

  const time = performance.now() * 0.001;

  for (const mesh of aimMeshes.values()) {
    mesh.rotation.y += dt * 0.7;
    mesh.position.y +=
      Math.sin(time * 2 + mesh.position.x) * 0.002;
  }

  if (
    gameChannel &&
    user &&
    performance.now() - lastPositionBroadcast > 120
  ) {
    lastPositionBroadcast = performance.now();

    gameChannel.track({
      x: position.x,
      z: position.z,
      name: "Player-" + user.id.slice(0, 4),
      skin_id: equippedSkin
    }).catch(error => {
      console.error("Error actualizando presencia:", error);
    });
  }

  renderer.render(scene, camera);
}

animate();
startOnline();
