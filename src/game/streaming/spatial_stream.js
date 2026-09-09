/** Spatial policy is separate from downloads and scene ownership, so it can be replayed. */
export function distanceToBounds(point, b) {
  return Math.hypot(Math.max(0, Math.abs(point.x-b.x)-b.rx), Math.max(0, Math.abs(point.z-b.z)-b.rz));
}
export function createSpatialStream({prefetch = () => {}, cancelPrefetch = () => {}, canSpeculate = () => true,
  near = 45, lookahead = 7, warmRadius = 100, keepRadius = 150, graceSeconds = 8, maxResidents = 4} = {}) {
  const rooms = new Map();
  let previous = null, elapsed = 0, sincePlan = 0, disposed = false, current = [], lastWarm = '';
  function register(record) {
    const room = {...record, status: 'idle', lastNear: 0, promise: Promise.resolve(false), generation: 0};
    rooms.set(record.id, room);
    return room;
  }
  function unload(room) {
    room.generation++; room.controller?.abort(); room.unload?.(); room.status = 'idle';
  }
  function start(room) {
    if (room.status === 'failed' && elapsed >= room.retryAt) room.status = 'idle';
    if (room.status !== 'idle') return;
    room.status = 'loading'; const generation = ++room.generation;
    room.controller = new AbortController();
    room.promise = Promise.resolve().then(() => room.load(room.controller.signal)).then(ok => {
      if (generation === room.generation) {room.status = ok ? 'ready' : 'failed'; room.retryAt = elapsed + 10;}
      return !!ok;
    }).catch(() => {if (generation === room.generation) {room.status = 'failed'; room.retryAt = elapsed + 10;} return false;});
  }
  function update(dt, point) {
    if (disposed || !point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return;
    elapsed += Math.max(0, dt || 0); sincePlan += Math.max(0, dt || 0);
    if (previous && sincePlan < .2 && Math.hypot(point.x-previous.x,point.z-previous.z) < 12) return;
    let vx = previous && sincePlan > 0 ? (point.x-previous.x)/sincePlan : 0, vz = previous && sincePlan > 0 ? (point.z-previous.z)/sincePlan : 0;
    sincePlan = 0;
    const speed = Math.hypot(vx,vz);
    if (speed > 12) {vx = 0; vz = 0;} // Teleports never predict an entire corridor.
    const ahead = {x: point.x + vx*lookahead, z: point.z + vz*lookahead};
    previous = {x:point.x,z:point.z};
    const ranked = [...rooms.values()].map(room => ({room, d: distanceToBounds(point, room.bounds), future: distanceToBounds(ahead, room.bounds)})).sort((a,b)=>a.d-b.d);
    current = ranked.filter(r=>r.d<=near).map(r=>r.room);
    // A fallback is always available, including a corridor between large room bounds.
    if (!current.length && ranked[0]?.d < warmRadius) current = [ranked[0].room];
    const wanted = new Set(current);
    const next = canSpeculate() ? ranked.filter(r=>!wanted.has(r.room)&&Math.min(r.d,r.future)<warmRadius).sort((a,b)=>a.future-b.future).slice(0,2) : [];
    const urls = [...new Set(next.map(r=>r.room.url).filter(Boolean))];
    const key = urls.slice().sort().join('|');
    if (key !== lastWarm) {cancelPrefetch(urls); for (const url of urls) prefetch(url); lastWarm = key;}
    // Decode the next room only when the predicted walk actually reaches its near band.
    for (const row of next) if (row.future <= near && wanted.size < maxResidents) wanted.add(row.room);
    for (const room of wanted) {room.lastNear = elapsed; start(room);}
    const residents = ranked.filter(r=>r.room.status==='ready'||r.room.status==='loading');
    let retained = residents.length;
    for (const row of residents.slice().reverse()) {
      if (wanted.has(row.room)) continue;
      if (row.d > keepRadius && elapsed-row.room.lastNear > graceSeconds || retained > maxResidents) {unload(row.room); retained--;}
    }
  }
  return {register, update,
    ready() {return Promise.all(current.map(r=>r.promise)).then(results=>results.every(Boolean));},
    retry() {for(const room of rooms.values()) if(room.status==='failed') room.status='idle';},
    get stats() {return {registered: rooms.size, nearby: current.map(r=>r.id), rooms:[...rooms.values()].map(r=>({id:r.id,status:r.status})), residents:[...rooms.values()].filter(r=>r.status==='ready'||r.status==='loading').length};},
    dispose() {if(disposed)return;disposed=true;for(const room of rooms.values())unload(room);cancelPrefetch([]);},
  };
}
