import { REALMS } from '../../src/mmo/realms.js';

export const CONCEPT_NOTE = 'Concept art. A vision for the world in development, not a gameplay screenshot.';
export const ART_STYLE = 'Use case: stylized-concept. Create one landscape illustration for the Brackenwake fantasy world atlas. Painterly low-poly fantasy concept art: sculpted angular forms, rich atmospheric perspective, beautiful coherent architecture, cinematic environmental storytelling, soft brush texture, restrained luminous magic and tangible materials. A grand sense of scale with small figures only where appropriate. Sophisticated art-book quality, neither photorealism nor a screenshot. Wide 3:2 composition, edge-to-edge scene, clear focal point, layered foreground and distant silhouettes. No text, labels, borders, montage, watermarks or interface. Faithfully depict the supplied lore without inventing extra landmarks. This is concept art for a game still in development.';

export const artSpecs = [
  { id: 'atlas', title: 'The Caldera Sea', scene: 'An expansive view from a grassy western headland across a calm central caldera sea. Hedged fields and a tiny medieval village in the foreground, distant northwestern glaciers and granite peaks, and a smoking volcanic eastern rim far across the water. Early golden light and cloud shadows. One coherent geographical vista, not a map or collage.' },
  ...REALMS.map(realm => ({ id: realm.id, title: realm.name, scene: `${realm.name}. ${realm.geography} Principal landmark: ${realm.mega}` })),
  { id: 'last-dragon', title: 'The last dragon', scene: 'A small newly hatched dragon resting trustingly on a young farmhand’s forearm, beside its broken egg in the hedged green fields of the Greenwold. A medieval village in the soft distance. Intimate, gentle dawn light. The dragon has chosen an ordinary person. Painterly storybook atmosphere with angular stylized shapes; no established dragon color is required.' },
  { id: 'the-bond', title: 'The Bond', scene: 'An ordinary cloaked traveler kneels to feed their young dog-sized dragon on a quiet grassy roadside. Their faces and posture convey mutual trust. Warm firelight, a distant ring of mountains across a central sea, simple medieval travel equipment, soft evening blue. An intimate relationship within a wide landscape.' },
  { id: 'wyrmsoul', title: 'Wyrmsoul', scene: 'A Dragonsworn traveler and their dragon acting together in a stormy granite mountain pass. The traveler has golden eyes and great ethereal wings of fire and releases dragonfire from their hands. A few suspended arrows and a wolf hanging mid-leap suggest slowed time. The dragon stands beside them. Majestic magical luminosity within a coherent cinematic scene, no HUD, no words.' },
  ...REALMS.flatMap(realm => realm.places.map(place => ({ id: place.id, title: place.name, realmId: realm.id, scene: `One specific place in ${realm.name}: ${place.name}. Its defining geography: ${place.geography} Its inhabitants and discoveries: ${place.contains}. Regional setting for consistency: ${realm.geography}. Prioritize this particular place, not a generic regional vista. Depict environmental details and a small number of appropriate inhabitants; do not attempt to illustrate every named person.` }))),
];

// The owner closed the collection here. Remaining destinations intentionally
// share their realm cover, with a regional caption rather than a place claim.
export const sharedRealmArt = Object.fromEntries([
  ...['pearlreef', 'pearlbeds', 'airgardens', 'drownedbell', 'whaleroad'].map(id => [id, 'sunkenkingdom']),
  ...['cinderport', 'outerworks', 'ashengate', 'throneofash', 'glassslopes', 'cindercut', 'steamingshore', 'lavafalls', 'slagcamps', 'obsidianbridge', 'heartcages'].map(id => [id, 'ashenthrone']),
]);
export const publishedArt = artSpecs.filter(spec => !sharedRealmArt[spec.id]);
export const artId = id => sharedRealmArt[id] || id;
export const artTitle = id => artSpecs.find(spec => spec.id === artId(id))?.title || id;
export const artPath = id => `/lore/art/${artId(id)}.webp`;
export const artPrompt = spec => `${ART_STYLE}\nScene: ${spec.scene}`;
