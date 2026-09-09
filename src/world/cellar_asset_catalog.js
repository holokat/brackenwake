// Explicit URLs keep Vite's emitted asset names and browser cache keys identical.
export const CELLAR_ASSETS = {
 entry:new URL('../../assets/models/cellars/entry/cellar-entry.glb',import.meta.url).href,
 'room-1':new URL('../../assets/models/cellars/rooms/cellar-room-01.glb',import.meta.url).href,
 'room-2':new URL('../../assets/models/cellars/rooms/cellar-room-02.glb',import.meta.url).href,
 'room-3':new URL('../../assets/models/cellars/rooms/cellar-room-03.glb',import.meta.url).href,
 'room-4':new URL('../../assets/models/cellars/rooms/cellar-room-04.glb',import.meta.url).href,
 'room-5':new URL('../../assets/models/cellars/rooms/cellar-room-05.glb',import.meta.url).href,
 'room-6':new URL('../../assets/models/cellars/rooms/cellar-room-06.glb',import.meta.url).href,
 'room-7':new URL('../../assets/models/cellars/rooms/cellar-room-07.glb',import.meta.url).href,
 'room-8':new URL('../../assets/models/cellars/rooms/cellar-room-08.glb',import.meta.url).href,
 'boss-01':new URL('../../assets/models/cellars/descent/boss-01.glb',import.meta.url).href,
 'boss-02':new URL('../../assets/models/cellars/descent/boss-02.glb',import.meta.url).href,
 'boss-03':new URL('../../assets/models/cellars/descent/boss-03.glb',import.meta.url).href,
 'boss-04':new URL('../../assets/models/cellars/descent/boss-04.glb',import.meta.url).href,
 'boss-05':new URL('../../assets/models/cellars/descent/boss-05.glb',import.meta.url).href,
 'boss-06':new URL('../../assets/models/cellars/descent/boss-06.glb',import.meta.url).href,
 'boss-07':new URL('../../assets/models/cellars/descent/boss-07.glb',import.meta.url).href,
 'regular-crypt':new URL('../../assets/models/cellars/descent/regular-crypt.glb',import.meta.url).href,
 'regular-store':new URL('../../assets/models/cellars/descent/regular-store.glb',import.meta.url).href,
 'regular-chapel':new URL('../../assets/models/cellars/descent/regular-chapel.glb',import.meta.url).href,
};
// Only an arrival asset, never the following floor's boss or every room variant.
export function cellarArrivalAsset(level, direction = 'down') {
 if (level < 1 || level > 8) return null;
 if (direction === 'up') return level === 8 ? CELLAR_ASSETS['room-8'] : CELLAR_ASSETS[`boss-${String(level).padStart(2,'0')}`];
 return level === 1 ? CELLAR_ASSETS.entry : level === 8 ? CELLAR_ASSETS['room-8'] : CELLAR_ASSETS['regular-crypt'];
}
