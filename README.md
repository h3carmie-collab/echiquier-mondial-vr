# L'Échiquier Mondial — Globe VR

Globe géopolitique interactif en WebXR (Three.js), compatible Meta Quest 2 (navigateur), avec
interaction par suivi des mains (pincer pour faire tourner le globe, toucher un pays pour voir sa fiche).

## Structure

```
index.html          -> point d'entrée, charge les styles + le script principal
src/main.js          -> logique 3D (globe, textures, interactions main/souris, VR)
src/markers-data.js   -> contenu éditable : pays, catégories, titres, descriptions
src/countries-data.js -> tracés des frontières (généré depuis des données géo réelles, à ne pas éditer à la main)
src/style.css         -> interface (panneaux, légende, bouton VR)
```

## Modifier le contenu

Ouvre `src/markers-data.js` : chaque entrée du tableau `MARKERS` est un pays/point avec :
- `lat`, `lon` : coordonnées géographiques
- `cat` : catégorie (`risk`, `eco`, `alli`, `tech` — couleurs définies dans `CAT`)
- `title`, `body` : texte affiché sur la fiche

Ajoute, supprime ou modifie des entrées librement, aucune autre modification n'est nécessaire.

## Lancer en local

Comme le projet utilise des modules ES (`import`), il faut un serveur local (pas de `file://` direct) :

```bash
# Python
python3 -m http.server 8080

# ou Node
npx serve .
```

Puis ouvre `http://localhost:8080`.

## Déployer en ligne (HTTPS obligatoire pour la VR)

N'importe quel hébergeur statique HTTPS fonctionne : GitHub Pages, Netlify, Vercel, Cloudflare Pages...
Il suffit de déposer tout le dossier tel quel (`index.html` + `src/`).

## Réglages rapides (en haut de `src/main.js`)

- `RADIUS` : taille du globe
- `CAMERA_DISTANCE` : distance de départ de la caméra
- `PINCH_THRESHOLD` : sensibilité de détection du pincement (mètres)
- `TOUCH_THRESHOLD` : distance pour "toucher" un pays avec l'index (mètres)
- `ROTATE_SENSITIVITY` : vitesse de rotation par pincement-glissement

## Portage vers une autre plateforme

Le cœur 3D est du Three.js standard (scène, sphère texturée, sprites, WebXR Hand Input API) —
directement réutilisable dans A-Frame, PlayCanvas ou une app React (react-three-fiber) si tu veux
changer d'écosystème : la logique de `main.js` (texture équirectangulaire, conversion lat/lon → 3D,
détection de pincement) se transpose telle quelle.
