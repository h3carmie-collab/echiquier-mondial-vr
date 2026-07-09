import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAT, MARKERS } from './markers-data.js';
import { COUNTRIES } from './countries-data.js';

// ---------------------------------------------------------------
// Réglages rapides
// ---------------------------------------------------------------
const RADIUS = 1.3;           // rayon du globe (plus petit = "Terre" plus compacte)
const CAMERA_DISTANCE = 3.2;
const PINCH_THRESHOLD = 0.028;   // distance pouce-index (m) pour détecter un pincement
const TOUCH_THRESHOLD = 0.14;    // distance doigt-point (m) pour "toucher" un pays
const ROTATE_SENSITIVITY = 3.4;

// (Séismes -> USGS direct, Conflits/tension -> ACLED direct : aucune clé World Monitor nécessaire.)
// Lien "voir sur World Monitor" reste utile pour approfondir un pays -> table ISO2.
const ISO2_TO_NAME = {
  US: 'United States of America', CA: 'Canada', BR: 'Brazil', GB: 'United Kingdom',
  FR: 'France', DE: 'Germany', IT: 'Italy', ES: 'Spain', PL: 'Poland', NL: 'Netherlands',
  RU: 'Russia', CN: 'China', IN: 'India', JP: 'Japan', KR: 'South Korea', TW: 'Taiwan',
  AU: 'Australia', NZ: 'New Zealand', SA: 'Saudi Arabia', NG: 'Nigeria', ZA: 'South Africa',
  MX: 'Mexico', AR: 'Argentina', TR: 'Turkey', EG: 'Egypt', IR: 'Iran', IQ: 'Iraq',
  IL: 'Israel', UA: 'Ukraine', PK: 'Pakistan', ID: 'Indonesia', VN: 'Vietnam',
  PH: 'Philippines', TH: 'Thailand', MY: 'Malaysia', SG: 'Singapore', AE: 'United Arab Emirates',
  QA: 'Qatar', SY: 'Syria', YE: 'Yemen', ET: 'Ethiopia', KE: 'Kenya', CO: 'Colombia',
  VE: 'Venezuela', CL: 'Chile', PE: 'Peru', SE: 'Sweden', NO: 'Norway', FI: 'Finland',
  GR: 'Greece', PT: 'Portugal', BE: 'Belgium', CH: 'Switzerland', AT: 'Austria',
  RO: 'Romania', KP: 'North Korea', AF: 'Afghanistan', MM: 'Myanmar', SD: 'Sudan',
  LY: 'Libya', DZ: 'Algeria', MA: 'Morocco', BD: 'Bangladesh',
};

// ---------------------------------------------------------------
// Bouton VR custom (fonctionne sans dépendance externe)
// ---------------------------------------------------------------
function createVRButton(renderer) {
  const button = document.createElement('button');
  function stylize(el) {
    el.style.position = 'relative';
    el.style.padding = '14px 26px';
    el.style.border = '1px solid #c9a227';
    el.style.borderRadius = '6px';
    el.style.background = 'rgba(201,162,39,0.15)';
    el.style.color = '#f4f1e8';
    el.style.font = '600 14px system-ui, sans-serif';
    el.style.letterSpacing = '.05em';
    el.style.outline = 'none';
    el.style.cursor = 'pointer';
  }
  function showEnterVR() {
    let currentSession = null;
    async function onSessionStarted(session) {
      session.addEventListener('end', onSessionEnded);
      await renderer.xr.setSession(session);
      button.textContent = 'QUITTER LA VR';
      currentSession = session;
    }
    function onSessionEnded() {
      currentSession.removeEventListener('end', onSessionEnded);
      button.textContent = 'ENTRER EN VR';
      currentSession = null;
    }
    button.style.display = '';
    button.textContent = 'ENTRER EN VR';
    button.onclick = () => {
      if (currentSession === null) {
        navigator.xr.requestSession('immersive-vr', {
          optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
        }).then(onSessionStarted);
      } else {
        currentSession.end();
      }
    };
  }
  function showNotFound() {
    button.style.display = '';
    button.style.cursor = 'auto';
    button.textContent = 'VR NON DISPONIBLE ICI';
  }
  if ('xr' in navigator) {
    stylize(button);
    button.style.display = 'none';
    navigator.xr.isSessionSupported('immersive-vr')
      .then(supported => supported ? showEnterVR() : showNotFound())
      .catch(showNotFound);
    return button;
  } else {
    const msg = document.createElement('a');
    msg.href = 'https://immersiveweb.dev/';
    msg.textContent = 'WEBXR NON SUPPORTÉ PAR CE NAVIGATEUR';
    stylize(msg);
    msg.style.textDecoration = 'none';
    return msg;
  }
}

// ---------------------------------------------------------------
// Texture Terre (dessinée à partir des vraies frontières, projection équirectangulaire)
// ---------------------------------------------------------------
function buildEarthTexture() {
  const W = 2048, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');

  const oceanGrad = ctx.createLinearGradient(0, 0, 0, H);
  oceanGrad.addColorStop(0, '#173247');
  oceanGrad.addColorStop(1, '#0d1c29');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(60,90,115,0.35)';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = (lon + 180) / 360 * W;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let f = 0; f <= 1; f += 0.1667) {
    const y = f * H;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  const sx = W / 2000, sy = H / 1000;
  ctx.save();
  ctx.scale(sx, sy);
  for (const c of COUNTRIES) {
    try {
      const p = new Path2D(c.d);
      ctx.fillStyle = c.hl ? '#f2ead0' : '#eae5d6';
      ctx.strokeStyle = c.hl ? '#57492a' : '#3a3428';
      ctx.lineWidth = c.hl ? 1.4 : 0.9;
      ctx.fill(p);
      ctx.stroke(p);
    } catch (e) { /* ignore malformed path */ }
  }
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '', yy = y;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line, x, yy);
      line = words[n] + ' ';
      yy += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, yy);
}

// petite "puce" toujours visible : catégorie + titre court
function makeChipSprite(marker) {
  const c = CAT[marker.cat];
  const W = 420, H = 90;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10,13,18,0.85)';
  roundRect(ctx, 0, 0, W, H, 16); ctx.fill();
  ctx.strokeStyle = c.color; ctx.lineWidth = 2.5;
  roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 16); ctx.stroke();
  ctx.fillStyle = c.color;
  ctx.beginPath(); ctx.arc(30, H / 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f4f1e8';
  ctx.font = '700 24px system-ui, sans-serif';
  ctx.fillText(marker.title, 52, H / 2 + 8);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  sprite.scale.set(0.62, 0.62 * H / W, 1);
  return sprite;
}

// fiche détaillée : visible seulement quand le pays est sélectionné / touché
function makeCardSprite(marker) {
  const c = CAT[marker.cat];
  const W = 512, H = 200;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(10,13,18,0.92)';
  roundRect(ctx, 0, 0, W, H, 18); ctx.fill();
  ctx.strokeStyle = '#2c313a'; ctx.lineWidth = 3;
  roundRect(ctx, 1.5, 1.5, W - 3, H - 3, 18); ctx.stroke();
  ctx.fillStyle = c.color;
  ctx.fillRect(0, 0, 10, H);
  ctx.fillStyle = c.color;
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText(c.label, 32, 40);
  ctx.fillStyle = '#f4f1e8';
  ctx.font = '700 30px system-ui, sans-serif';
  wrapText(ctx, marker.title, 32, 82, W - 60, 34);
  ctx.fillStyle = '#b7bcc3';
  ctx.font = '400 20px system-ui, sans-serif';
  wrapText(ctx, marker.body, 32, 140, W - 60, 26);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true }));
  sprite.scale.set(1.7, 1.7 * H / W, 1);
  sprite.visible = false;
  return sprite;
}

// ---------------------------------------------------------------
// Scène
// ---------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050a);

{
  const starGeo = new THREE.BufferGeometry();
  const starCount = 3000;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 40 + Math.random() * 60;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.08, sizeAttenuation: true })));
}

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0, 0.4, CAMERA_DISTANCE);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
document.getElementById('vrbutton-wrap').appendChild(createVRButton(renderer));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.6;
controls.maxDistance = 9;
controls.rotateSpeed = 0.5;

scene.add(new THREE.AmbientLight(0x8899aa, 1.1));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.1);
sun.position.set(5, 3, 5);
scene.add(sun);

const globeGroup = new THREE.Group();
scene.add(globeGroup);

document.getElementById('loading').style.display = 'flex';
let stylizedTex = buildEarthTexture();
const globeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS, 96, 96),
  new THREE.MeshPhongMaterial({ map: stylizedTex, shininess: 6, specular: 0x0a0a0a })
);
globeGroup.add(globeMesh);

// ---------------------------------------------------------------
// Vue "réaliste" façon Google Earth : imagerie satellite (Blue Marble),
// avec relief (bump map) et océans brillants (specular map).
// ---------------------------------------------------------------
let realisticLoaded = false;
let currentView = 'stylized';
const textureLoader = new THREE.TextureLoader();
textureLoader.crossOrigin = 'anonymous';

function loadRealisticTextures() {
  return Promise.all([
    new Promise((resolve, reject) => textureLoader.load(
      'https://unpkg.com/three-globe@2.31.0/example/img/earth-blue-marble.jpg',
      resolve, undefined, reject)),
    new Promise((resolve) => textureLoader.load(
      'https://unpkg.com/three-globe@2.31.0/example/img/earth-topology.png',
      resolve, undefined, () => resolve(null))),
    new Promise((resolve) => textureLoader.load(
      'https://unpkg.com/three-globe@2.31.0/example/img/earth-water.png',
      resolve, undefined, () => resolve(null))),
  ]);
}

function setView(mode) {
  currentView = mode;
  if (mode === 'stylized') {
    globeMesh.material.map = stylizedTex;
    globeMesh.material.bumpMap = null;
    globeMesh.material.specularMap = null;
    globeMesh.material.bumpScale = 0;
    globeMesh.material.needsUpdate = true;
    if (viewToggle) viewToggle.textContent = 'VUE RÉALISTE (SATELLITE)';
  } else {
    if (viewToggle) viewToggle.textContent = 'VUE DONNÉES (FRONTIÈRES)';
    if (realisticLoaded) {
      applyRealisticMaterial();
    } else {
      if (viewToggle) viewToggle.textContent = 'CHARGEMENT…';
      loadRealisticTextures().then(([map, bump, water]) => {
        globeMesh.userData.realisticMap = map;
        globeMesh.userData.realisticBump = bump;
        globeMesh.userData.realisticWater = water;
        realisticLoaded = true;
        applyRealisticMaterial();
        if (viewToggle) viewToggle.textContent = 'VUE DONNÉES (FRONTIÈRES)';
      }).catch(() => {
        if (viewToggle) viewToggle.textContent = 'ÉCHEC — VUE DONNÉES';
        currentView = 'stylized';
        setTimeout(() => setView('stylized'), 1500);
      });
    }
  }
}

function applyRealisticMaterial() {
  const map = globeMesh.userData.realisticMap;
  if (!map) return;
  map.colorSpace = THREE.SRGBColorSpace;
  globeMesh.material.map = map;
  if (globeMesh.userData.realisticBump) {
    globeMesh.material.bumpMap = globeMesh.userData.realisticBump;
    globeMesh.material.bumpScale = 0.01;
  }
  if (globeMesh.userData.realisticWater) {
    globeMesh.material.specularMap = globeMesh.userData.realisticWater;
    globeMesh.material.specular = new THREE.Color(0x333333);
    globeMesh.material.shininess = 12;
  }
  globeMesh.material.needsUpdate = true;
}

const viewToggle = document.getElementById('view-toggle');
if (viewToggle) {
  viewToggle.addEventListener('click', () => setView(currentView === 'stylized' ? 'realistic' : 'stylized'));
}
// vue réaliste par défaut au chargement
setView('realistic');

const atmoMat = new THREE.ShaderMaterial({
  transparent: true,
  side: THREE.BackSide,
  uniforms: { glowColor: { value: new THREE.Color(0x3d7ea6) } },
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    uniform vec3 glowColor;
    void main() {
      float intensity = pow(0.62 - dot(vNormal, vec3(0,0,1.0)), 2.5);
      gl_FragColor = vec4(glowColor, intensity * 0.6);
    }
  `
});
globeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(RADIUS * 1.03, 64, 64), atmoMat));

document.getElementById('loading').style.display = 'none';

// ---------------------------------------------------------------
// Marqueurs (points, tiges, puce toujours visible, fiche au toucher)
// ---------------------------------------------------------------
const markerObjects = [];
const dotMeshes = [];

for (const m of MARKERS) {
  const c = CAT[m.cat];
  const surfacePos = latLonToVector3(m.lat, m.lon, RADIUS);
  const outerPos = latLonToVector3(m.lat, m.lon, RADIUS * 1.35);

  const dot = new THREE.Mesh(
    new THREE.SphereGeometry(0.015, 12, 12),
    new THREE.MeshBasicMaterial({ color: c.color })
  );
  dot.position.copy(surfacePos);
  dot.userData.marker = m;
  globeGroup.add(dot);
  dotMeshes.push(dot);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([surfacePos, outerPos]);
  globeGroup.add(new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: c.color, transparent: true, opacity: 0.75 })));

  const chip = makeChipSprite(m);
  chip.position.copy(outerPos.clone().multiplyScalar(1.1));
  globeGroup.add(chip);

  const card = makeCardSprite(m);
  card.position.copy(outerPos.clone().multiplyScalar(1.32));
  globeGroup.add(card);

  markerObjects.push({ data: m, dot, chip, card });
}

// titre flottant
{
  const canvas = document.createElement('canvas');
  canvas.width = 900; canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.fillStyle = '#eae5d6';
  ctx.font = '700 56px system-ui, sans-serif';
  ctx.fillText("L'ÉCHIQUIER MONDIAL", 450, 90);
  ctx.fillStyle = '#c0392b';
  ctx.font = '400 26px system-ui, sans-serif';
  ctx.fillText("Briefing géopolitique — vue globe", 450, 135);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
  sprite.scale.set(4.2, 0.84, 1);
  sprite.position.set(0, RADIUS + 1.15, 0);
  scene.add(sprite);
}

let selected = null;
function selectMarker(m) {
  if (selected) selected.card.visible = false;
  selected = m;
  if (m) m.card.visible = true;
  updateWmLink(m);
}

function updateWmLink(m) {
  const box = document.getElementById('wm-link-box');
  if (!box) return;
  const iso2 = m && m.data && m.data.iso2;
  if (iso2) {
    box.innerHTML = `<a href="https://worldmonitor.app/brief/${iso2}" target="_blank" rel="noopener">Voir la fiche complète sur World Monitor →</a>`;
    box.style.display = 'block';
  } else {
    box.style.display = 'none';
  }
}

// ---------------------------------------------------------------
// Couche live : séismes récents via l'API publique World Monitor
// (aucune clé requise — gratuit) — activable via le bouton en haut à droite
// ---------------------------------------------------------------
const liveGroup = new THREE.Group();
globeGroup.add(liveGroup);
let liveLoaded = false;
let liveRefreshTimer = null;

function pick(obj, keys, fallback = undefined) {
  for (const k of keys) {
    const parts = k.split('.');
    let v = obj;
    for (const p of parts) { v = v && v[p]; }
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

function makeQuakeDot(mag) {
  const c = '#e0663e';
  const size = 0.012 + Math.min(Math.max(mag, 0), 8) * 0.0035;
  return new THREE.Mesh(
    new THREE.SphereGeometry(size, 10, 10),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 })
  );
}

async function loadLiveEarthquakes() {
  const statusEl = document.getElementById('live-status');
  if (statusEl) statusEl.textContent = 'Chargement des séismes en direct…';
  try {
    // USGS : source officielle, gratuite, sans clé, CORS activé.
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const list = pick(json, ['features'], []);
    liveGroup.clear();
    let count = 0;
    for (const f of Array.isArray(list) ? list : []) {
      const props = f.properties || {};
      const coords = (f.geometry && f.geometry.coordinates) || [];
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      const mag = Number(props.mag) || 0;
      const place = props.place || 'Localisation inconnue';
      if (!isFinite(lat) || !isFinite(lon)) continue;

      const pos = latLonToVector3(lat, lon, RADIUS * 1.01);
      const dot = makeQuakeDot(mag);
      dot.position.copy(pos);
      liveGroup.add(dot);

      const card = makeCardSprite({
        cat: 'risk',
        title: `SÉISME M${mag.toFixed(1)}`,
        body: place
      });
      card.position.copy(latLonToVector3(lat, lon, RADIUS * 1.45));
      liveGroup.add(card);

      dotMeshes.push(dot);
      markerObjects.push({ data: { title: `SÉISME M${mag.toFixed(1)}`, body: place }, dot, chip: null, card });
      count++;
    }
    if (statusEl) statusEl.textContent = count > 0
      ? `${count} séismes M4.5+ des 7 derniers jours (USGS, temps réel)`
      : 'Aucun séisme M4.5+ cette semaine (rare mais possible)';
    liveLoaded = true;
  } catch (e) {
    if (statusEl) statusEl.textContent = "Échec du chargement (réseau indisponible ou service USGS temporairement hors ligne)";
    console.warn('Live earthquake fetch failed:', e);
  }
}

const liveToggle = document.getElementById('live-toggle');
if (liveToggle) {
  liveToggle.addEventListener('click', () => {
    if (!liveLoaded) {
      loadLiveEarthquakes();
      liveRefreshTimer = setInterval(loadLiveEarthquakes, 5 * 60 * 1000); // rafraîchi toutes les 5 min
      liveToggle.textContent = 'MASQUER LES SÉISMES';
      liveGroup.visible = true;
    } else {
      liveGroup.visible = !liveGroup.visible;
      liveToggle.textContent = liveGroup.visible ? 'MASQUER LES SÉISMES' : 'AFFICHER LES SÉISMES';
    }
  });
}

// ---------------------------------------------------------------
// Couche live : conflits actifs — directement via l'API ACLED
// (inscription gratuite requise sur acleddata.com, clé + email)
// ---------------------------------------------------------------
const ACLED_KEY_STORAGE = 'acled_api_key';
const ACLED_EMAIL_STORAGE = 'acled_email';
function getAcledCreds() {
  return {
    key: localStorage.getItem(ACLED_KEY_STORAGE) || '',
    email: localStorage.getItem(ACLED_EMAIL_STORAGE) || ''
  };
}
function setAcledCreds(key, email) {
  if (key) localStorage.setItem(ACLED_KEY_STORAGE, key); else localStorage.removeItem(ACLED_KEY_STORAGE);
  if (email) localStorage.setItem(ACLED_EMAIL_STORAGE, email); else localStorage.removeItem(ACLED_EMAIL_STORAGE);
}

// alias entre les noms de pays ACLED et les noms Natural Earth utilisés dans countries-data.js
const NAME_ALIASES = {
  'united states': 'United States of America',
  'democratic republic of congo': 'Dem. Rep. Congo',
  'republic of congo': 'Congo',
  'ivory coast': "Côte d'Ivoire",
  "cote d'ivoire": "Côte d'Ivoire",
  'myanmar': 'Myanmar',
  'north macedonia': 'North Macedonia',
  'eswatini': 'eSwatini',
  'south korea': 'South Korea',
  'north korea': 'North Korea',
  'russian federation': 'Russia',
  'syrian arab republic': 'Syria',
  'viet nam': 'Vietnam',
  'united kingdom': 'United Kingdom',
  'czech republic': 'Czechia',
  'palestine': 'Palestine',
};
function resolveCountryName(raw) {
  if (!raw) return null;
  const found = COUNTRIES.find(c => c.n === raw);
  if (found) return found.n;
  const alias = NAME_ALIASES[String(raw).toLowerCase()];
  if (alias) return alias;
  const lower = String(raw).toLowerCase();
  const fuzzy = COUNTRIES.find(c => c.n.toLowerCase() === lower);
  return fuzzy ? fuzzy.n : null;
}

const conflictGroup = new THREE.Group();
globeGroup.add(conflictGroup);
let conflictLoaded = false;
let lastConflictAggregates = null; // { countryName: { fatalities, count } }

function makeConflictDot() {
  return new THREE.Mesh(
    new THREE.SphereGeometry(0.016, 10, 10),
    new THREE.MeshBasicMaterial({ color: '#c0392b', transparent: true, opacity: 0.9 })
  );
}

async function loadLiveConflicts() {
  const statusEl = document.getElementById('conflict-status');
  const { key, email } = getAcledCreds();
  if (!key || !email) {
    if (statusEl) statusEl.textContent = "Renseigne ta clé + email ACLED ci-dessous d'abord (inscription gratuite sur acleddata.com)";
    return null;
  }
  if (statusEl) statusEl.textContent = 'Chargement des conflits en direct…';
  try {
    const end = new Date();
    const start = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const fmt = (d) => d.toISOString().slice(0, 10);
    const url = `https://acleddata.com/api/acled/read?key=${encodeURIComponent(key)}&email=${encodeURIComponent(email)}`
      + `&event_date=${fmt(start)}|${fmt(end)}&event_date_where=BETWEEN&limit=1000`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const list = pick(json, ['data', 'events', 'items'], []);
    conflictGroup.clear();
    let count = 0;
    const aggregates = {};
    for (const ev of Array.isArray(list) ? list : []) {
      const lat = Number(pick(ev, ['latitude', 'lat']));
      const lon = Number(pick(ev, ['longitude', 'lon', 'lng']));
      const evType = pick(ev, ['event_type', 'eventType'], 'Événement');
      const countryRaw = pick(ev, ['country'], '');
      const fatalities = Number(pick(ev, ['fatalities'], 0)) || 0;
      const notes = pick(ev, ['notes'], '');
      if (!isFinite(lat) || !isFinite(lon)) continue;

      const dot = makeConflictDot();
      dot.position.copy(latLonToVector3(lat, lon, RADIUS * 1.01));
      conflictGroup.add(dot);

      const card = makeCardSprite({
        cat: 'risk',
        title: String(evType).toUpperCase(),
        body: (countryRaw ? countryRaw + ' — ' : '') + (fatalities > 0 ? `${fatalities} victime(s)` : (notes ? notes.slice(0, 80) : ''))
      });
      card.position.copy(latLonToVector3(lat, lon, RADIUS * 1.45));
      conflictGroup.add(card);

      dotMeshes.push(dot);
      markerObjects.push({ data: { title: evType, body: countryRaw }, dot, chip: null, card });
      count++;

      const resolvedName = resolveCountryName(countryRaw);
      if (resolvedName) {
        if (!aggregates[resolvedName]) aggregates[resolvedName] = { fatalities: 0, count: 0 };
        aggregates[resolvedName].fatalities += fatalities;
        aggregates[resolvedName].count += 1;
      }
    }
    lastConflictAggregates = aggregates;
    if (statusEl) statusEl.textContent = count > 0
      ? `${count} événements (7 derniers jours, ACLED)`
      : "Aucun événement retourné (vérifie ta clé/email, ou aucun conflit récent)";
    conflictLoaded = true;
    return aggregates;
  } catch (e) {
    if (statusEl) statusEl.textContent = "Échec du chargement — vérifie ta clé/email, ou l'API bloque les requêtes navigateur (CORS). Dis-le moi si ça persiste.";
    console.warn('Live conflicts fetch failed:', e);
    return null;
  }
}

const conflictToggle = document.getElementById('conflict-toggle');
if (conflictToggle) {
  conflictToggle.addEventListener('click', async () => {
    if (!conflictLoaded) {
      await loadLiveConflicts();
      conflictToggle.textContent = 'MASQUER LES CONFLITS';
      conflictGroup.visible = true;
    } else {
      conflictGroup.visible = !conflictGroup.visible;
      conflictToggle.textContent = conflictGroup.visible ? 'MASQUER LES CONFLITS' : 'AFFICHER LES CONFLITS';
    }
  });
}

// ---------------------------------------------------------------
// Indice de tension "maison" — calculé à partir des conflits ACLED
// (pas le vrai CII propriétaire de World Monitor, mais gratuit et transparent)
// ---------------------------------------------------------------
function tensionToColor(score) {
  const t = Math.max(0, Math.min(100, score)) / 100;
  const from = { r: 0xea, g: 0xe5, b: 0xd6 };
  const to = { r: 0xc0, g: 0x39, b: 0x2b };
  const r = Math.round(from.r + (to.r - from.r) * t);
  const g = Math.round(from.g + (to.g - from.g) * t);
  const b = Math.round(from.b + (to.b - from.b) * t);
  return `rgb(${r},${g},${b})`;
}

function computeTensionScores(aggregates) {
  const scores = {};
  let max = 1;
  for (const name in aggregates) {
    const a = aggregates[name];
    const raw = a.fatalities * 3 + a.count; // pondération simple : morts comptent plus que le nombre d'événements
    scores[name] = raw;
    if (raw > max) max = raw;
  }
  for (const name in scores) {
    scores[name] = Math.round((scores[name] / max) * 100);
  }
  return scores;
}

async function colorGlobeByTension() {
  const statusEl = document.getElementById('cii-status');
  let aggregates = lastConflictAggregates;
  if (!aggregates) {
    if (statusEl) statusEl.textContent = 'Chargement des conflits nécessaire au calcul…';
    aggregates = await loadLiveConflicts();
    conflictToggle && (conflictToggle.textContent = 'MASQUER LES CONFLITS');
    if (conflictGroup) conflictGroup.visible = true;
  }
  if (!aggregates || Object.keys(aggregates).length === 0) {
    if (statusEl) statusEl.textContent = "Impossible — aucune donnée de conflit chargée (vérifie ta clé ACLED)";
    return;
  }
  const scores = computeTensionScores(aggregates);
  redrawEarthTextureWithScores(scores);
  if (statusEl) statusEl.textContent = `Tension calculée pour ${Object.keys(scores).length} pays (basé sur ${Object.values(aggregates).reduce((s, a) => s + a.count, 0)} événements)`;
}

function redrawEarthTextureWithScores(byName) {
  const W = 2048, H = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, H);
  oceanGrad.addColorStop(0, '#173247');
  oceanGrad.addColorStop(1, '#0d1c29');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, W, H);
  const sx = W / 2000, sy = H / 1000;
  ctx.save();
  ctx.scale(sx, sy);
  for (const c of COUNTRIES) {
    try {
      const p = new Path2D(c.d);
      const score = byName[c.n];
      ctx.fillStyle = score !== undefined ? tensionToColor(score) : (c.hl ? '#f2ead0' : '#eae5d6');
      ctx.strokeStyle = c.hl ? '#57492a' : '#3a3428';
      ctx.lineWidth = c.hl ? 1.4 : 0.9;
      ctx.fill(p);
      ctx.stroke(p);
    } catch (e) { /* ignore */ }
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const oldTex = stylizedTex;
  stylizedTex = tex;
  setView('stylized');
  oldTex.dispose();
}

const ciiToggle = document.getElementById('cii-toggle');
if (ciiToggle) ciiToggle.addEventListener('click', colorGlobeByTension);

// identifiants ACLED : pré-remplir + sauvegarder
const acledKeyInput = document.getElementById('acled-key-input');
const acledEmailInput = document.getElementById('acled-email-input');
if (acledKeyInput && acledEmailInput) {
  const creds = getAcledCreds();
  acledKeyInput.value = creds.key;
  acledEmailInput.value = creds.email;
  const saveAcled = () => setAcledCreds(acledKeyInput.value.trim(), acledEmailInput.value.trim());
  acledKeyInput.addEventListener('change', saveAcled);
  acledEmailInput.addEventListener('change', saveAcled);
}

// ---------------------------------------------------------------
// Interaction desktop (souris) : clic sur un point = sélection
// ---------------------------------------------------------------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
renderer.domElement.addEventListener('click', (ev) => {
  mouse.x = (ev.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(ev.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(dotMeshes);
  if (hits.length) {
    const m = markerObjects.find(o => o.dot === hits[0].object);
    selectMarker(m || null);
  } else {
    selectMarker(null);
  }
});

let autoRotate = true;
renderer.domElement.addEventListener('pointerdown', () => { autoRotate = false; });

// ---------------------------------------------------------------
// Interaction mains (WebXR Hand Input) : pincer pour tourner, toucher pour sélectionner
// ---------------------------------------------------------------
const hands = [renderer.xr.getHand(0), renderer.xr.getHand(1)];
hands.forEach(h => scene.add(h));

// petites sphères visuelles sur pouce/index de chaque main
const fingertipMarkers = hands.map(() => {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshBasicMaterial({ color: 0xc9a227 }));
  s.visible = false;
  scene.add(s);
  return s;
});

const handState = hands.map(() => ({ pinching: false, prevPos: new THREE.Vector3() }));
const tmpThumb = new THREE.Vector3();
const tmpIndex = new THREE.Vector3();
const tmpMarkerWorld = new THREE.Vector3();

function updateHands() {
  let anyTouch = false;
  hands.forEach((hand, i) => {
    const joints = hand.joints;
    if (!joints || !joints['index-finger-tip'] || !joints['thumb-tip']) {
      fingertipMarkers[i].visible = false;
      return;
    }
    joints['index-finger-tip'].getWorldPosition(tmpIndex);
    joints['thumb-tip'].getWorldPosition(tmpThumb);
    fingertipMarkers[i].visible = true;
    fingertipMarkers[i].position.copy(tmpIndex);

    const pinchDist = tmpIndex.distanceTo(tmpThumb);
    const st = handState[i];
    const isPinching = pinchDist < PINCH_THRESHOLD;

    if (isPinching) {
      fingertipMarkers[i].material.color.set(0xc0392b);
      if (st.pinching) {
        const delta = tmpIndex.clone().sub(st.prevPos);
        globeGroup.rotation.y += delta.x * ROTATE_SENSITIVITY;
        globeGroup.rotation.x = THREE.MathUtils.clamp(
          globeGroup.rotation.x - delta.y * ROTATE_SENSITIVITY, -1.2, 1.2
        );
        autoRotate = false;
      }
      st.prevPos.copy(tmpIndex);
      st.pinching = true;
    } else {
      fingertipMarkers[i].material.color.set(0xc9a227);
      st.pinching = false;
    }

    // toucher un pays avec l'index (sans forcément pincer)
    for (const m of markerObjects) {
      m.dot.getWorldPosition(tmpMarkerWorld);
      if (tmpIndex.distanceTo(tmpMarkerWorld) < TOUCH_THRESHOLD) {
        selectMarker(m);
        anyTouch = true;
        break;
      }
    }
  });
  if (!anyTouch && renderer.xr.isPresenting) {
    // laisse la fiche affichée un court instant après le retrait du doigt
    // (pas de désélection automatique agressive)
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

renderer.setAnimationLoop(() => {
  if (renderer.xr.isPresenting) {
    updateHands();
  } else if (autoRotate) {
    globeGroup.rotation.y += 0.0009;
  }
  controls.update();
  renderer.render(scene, camera);
});
