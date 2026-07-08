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
const earthTex = buildEarthTexture();
const globeMesh = new THREE.Mesh(
  new THREE.SphereGeometry(RADIUS, 96, 96),
  new THREE.MeshPhongMaterial({ map: earthTex, shininess: 6, specular: 0x0a0a0a })
);
globeGroup.add(globeMesh);

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
    const res = await fetch('https://api.worldmonitor.app/api/seismology/v1/list-earthquakes');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    // La forme exacte de la réponse peut varier ; on essaie plusieurs clés plausibles.
    const list = pick(json, ['earthquakes', 'data.earthquakes', 'events', 'data', 'items'], []);
    liveGroup.clear();
    let count = 0;
    for (const q of Array.isArray(list) ? list : []) {
      const lat = Number(pick(q, ['latitude', 'lat', 'geometry.coordinates.1', 'coordinates.1']));
      const lon = Number(pick(q, ['longitude', 'lon', 'lng', 'geometry.coordinates.0', 'coordinates.0']));
      const mag = Number(pick(q, ['magnitude', 'mag'], 0));
      const place = pick(q, ['place', 'location', 'title'], 'Localisation inconnue');
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
      ? `${count} séismes récents (World Monitor, temps réel)`
      : 'Aucune donnée retournée — API peut-être temporairement indisponible';
    liveLoaded = true;
  } catch (e) {
    if (statusEl) statusEl.textContent = "Impossible de charger les séismes en direct (réseau ou API indisponible)";
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
