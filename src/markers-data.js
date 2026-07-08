// Contenu éditable : ajoute / modifie les pays et fiches ici.
// cat: 'risk' | 'eco' | 'alli' | 'tech'
export const CAT = {
  risk: { color: '#c0392b', label: 'RISQUE' },
  eco:  { color: '#d4a017', label: 'ÉCONOMIE' },
  alli: { color: '#2f9e8f', label: 'ALLIANCE' },
  tech: { color: '#3d7ea6', label: 'TECHNOLOGIE' },
};

export const MARKERS = [
  { lat: 39, lon: -98, cat: 'eco', title: "RÉSERVE DU DOLLAR", body: "Monnaie de réserve mondiale. Dette publique US > 34 000 Md$." },
  { lat: 58, lon: -100, cat: 'alli', title: "USMCA", body: "Ressources critiques, aligné avec les USA." },
  { lat: -10, lon: -52, cat: 'eco', title: "BRICS+ BRÉSIL", body: "1er exportateur mondial de soja et bœuf." },
  { lat: 54, lon: -2.5, cat: 'alli', title: "POST-BREXIT UK", body: "City de Londres, accords bilatéraux." },
  { lat: 50, lon: 10, cat: 'eco', title: "MARCHÉ UNIQUE UE", body: "27 États, dépendance énergétique forte." },
  { lat: 61, lon: 70, cat: 'risk', title: "SANCTIONS RUSSIE", body: "Régime de sanctions le plus étendu de l'histoire récente." },
  { lat: 33, lon: 104, cat: 'eco', title: "ROUTES DE LA SOIE", body: "1er créancier bilatéral des pays en développement." },
  { lat: 22, lon: 79, cat: 'eco', title: "INDE NON-ALIGNÉE", body: "Population n°1 mondiale, relie USA-Russie-BRICS." },
  { lat: 37, lon: 138, cat: 'tech', title: "SEMI-CONDUCTEURS JP/KR", body: "Maillons critiques : équipements, mémoire." },
  { lat: 23.7, lon: 121, cat: 'risk', title: "TAIWAN & TSMC", body: "+60% des semi-conducteurs mondiaux." },
  { lat: -26, lon: 134, cat: 'alli', title: "AUKUS AUSTRALIE", body: "1er exportateur mondial de minerai de fer." },
  { lat: -41, lon: 172, cat: 'alli', title: "FIVE EYES NZ", body: "Renseignement partagé, diplomatie Pacifique." },
  { lat: 24, lon: 45, cat: 'eco', title: "OPEP+ ARABIE SAOUDITE", body: "Pilote les prix mondiaux du pétrole." },
  { lat: -19, lon: 20, cat: 'eco', title: "BRICS+ AFRIQUE", body: "Portes d'entrée économiques du continent." },
];
