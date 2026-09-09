import {distribution, round, summariseFrames} from './stats.js';

/** Timing wrappers are installed only by the profiling entry. */
export function createProbe() {
  const phases = [], errors = [], tasks = [], longFrames = [], resources = [], gpu = [], events = [];
  let active = null, frame = null, previous = null, count = 0, renderer, gl, ext, pending = [], query = null;
  const observers = [];
  let transitionAt = 0;
  globalThis.__bwTransitionMark = name => {const at=performance.now();if(name!=='begin')mark('transition-stage',{stage:name,ms:at-transitionAt});transitionAt=at;};
  const warn = console.warn.bind(console);
  console.warn = (...args) => {if (String(args[0]).startsWith('Room artwork')) errors.push({t:performance.now(),message:args.map(String).join(' ')});warn(...args);};
  function observe(type, receive) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
    const observer = new PerformanceObserver(list => list.getEntries().forEach(receive));
    observer.observe({type, buffered: true}); observers.push(observer);
  }
  performance.setResourceTimingBufferSize(12000);
  observe('longtask', e => tasks.push({t: e.startTime, ms: e.duration}));
  observe('long-animation-frame', e => longFrames.push({t: e.startTime, ms: e.duration, blocking: e.blockingDuration,
    scripts: [...e.scripts].map(s => ({ms: s.duration, function: s.sourceFunctionName, url: s.sourceURL, invoker: s.invoker, forcedLayout: s.forcedStyleAndLayoutDuration}))}));
  observe('resource', e => {if (/\.(glb|webp|png|jpg|ktx2|json)(?:[?#]|$)/.test(e.name)) resources.push({t: e.startTime, url: e.name, ms: e.duration, bytes: e.encodedBodySize, transfer: e.transferSize});});
  addEventListener('error', e => errors.push({t: performance.now(), message: e.message}));
  addEventListener('unhandledrejection', e => errors.push({t: performance.now(), message: String(e.reason)}));
  addEventListener('visibilitychange', () => {events.push({t: performance.now(), visibility: document.visibilityState}); previous = null;});
  function sampleState(b) {
    return {position: {...b.player.pos}, floor: b.runtime.dungeonLevel, heapBytes: performance.memory?.usedJSHeapSize ?? null,
      rendererMemory: {...b.sc.renderer.info.memory}, programs: b.sc.renderer.info.programs?.length,
      postprocessing: {spellFrames:b.sc.spellFrames,plainFrames:b.sc.plainFrames,composedFrames:b.sc.spellPass?.composedFrames??0},
      assets: b.assetLoading, streaming: b.runtime.dungeonScene?.streaming?.stats ?? null,
      monsters: b.monsters.all().length, pendingSpawns:b.monsters.pendingSpawns??0, pixelRatio: b.sc.renderer.getPixelRatio(), resolution: b.sc.resolution ? {ratio:b.sc.resolution.ratio,ceiling:b.sc.resolution.ceiling,enabled:b.sc.resolution.enabled}:null,
      canvas: {width: b.sc.renderer.domElement.width, height: b.sc.renderer.domElement.height}};
  }
  function pollGpu() {
    if (!ext || !pending.length) return;
    const invalid = gl.getParameter(ext.GPU_DISJOINT_EXT);
    pending = pending.filter(p => {
      if (!invalid && !gl.getQueryParameter(p.query, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!invalid) gpu.push({t: p.t, phase: p.phase, ms: gl.getQueryParameter(p.query, gl.QUERY_RESULT) / 1e6});
      gl.deleteQuery(p.query); return false;
    });
  }
  function begin() {
    const now = performance.now(); pollGpu(); count++;
    frame = active && document.visibilityState === 'visible' ? {t: now, dt: previous === null ? 0 : now - previous, cpu: 0, systems: {}, calls: 0, triangles: 0} : null;
    previous = active && document.visibilityState === 'visible' ? now : null;
    if (frame && ext && count % 10 === 0 && pending.length < 8) {
      query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
    }
  }
  function end() {
    if (query) {gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push({query, t: frame?.t, phase: active?.name}); query = null;}
    if (frame) {frame.cpu = performance.now() - frame.t; active.frames.push(frame); frame = null;}
  }
  function span(name, fn) {
    if (!frame) return fn();
    const at = performance.now();
    try {return fn();} finally {frame.systems[name] = (frame.systems[name] || 0) + performance.now() - at;}
  }
  function installSystems(systems) {
    for (const s of systems) for (const phase of ['hotkeys', 'click', 'move', 'update', 'late', 'render']) {
      const original = s[phase]; if (!original) continue;
      s[phase] = (...args) => span(s.name + '.' + phase, () => original(...args));
    }
    systems.unshift({name: 'performance_begin', create: () => ({}), hotkeys: begin});
    systems.push({name: 'performance_end', create: () => ({}), render: end});
  }
  function installRenderer(b) {
    renderer = b.sc.renderer; gl = renderer.getContext(); ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    const original = renderer.render.bind(renderer);
    renderer.render = (...args) => {
      const calls = renderer.info.render.calls, triangles = renderer.info.render.triangles, reset = renderer.info.autoReset;
      const result = original(...args);
      if (frame) {frame.calls += renderer.info.render.calls - (reset ? 0 : calls); frame.triangles += renderer.info.render.triangles - (reset ? 0 : triangles);}
      return result;
    };
  }
  function mark(name, detail = {}) {events.push({t: performance.now(), name, ...detail});}
  function operation(name, fn) {
    const at=performance.now();try{return fn();}finally{mark('operation',{operation:name,ms:performance.now()-at});}
  }
  async function phase(name, b, run) {
    active = {name, start: performance.now(), before: sampleState(b), frames: []}; previous = active.start;
    const p = active; mark('start', {phase: name});
    try {await run();} catch (e) {p.failure = String(e); errors.push({t: performance.now(), message: String(e)});}
    p.end = performance.now(); p.after = sampleState(b); active = null; previous = null;
    p.webglError = gl.getError(); phases.push(p); mark('end', {phase: name}); return p;
  }
  function report(b, label) {
    pollGpu(); const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return {label, instrumentationVersion:2, createdAt: new Date().toISOString(), environment: {userAgent: navigator.userAgent, threads: navigator.hardwareConcurrency,
      deviceMemoryGiB: navigator.deviceMemory ?? null, viewport: {width: innerWidth, height: innerHeight},
      renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      gpuTimerAvailable: !!ext, longAnimationFramesAvailable: PerformanceObserver.supportedEntryTypes.includes('long-animation-frame'),
      network: navigator.connection ? {type: navigator.connection.effectiveType, downlink: navigator.connection.downlink} : null},
      phases: phases.map(p => ({name: p.name, start: round(p.start), durationMs: round(p.end - p.start), failure: p.failure,
        visibilityInterrupted:events.some(e=>e.visibility&&e.t>=p.start&&e.t<p.end),
        before: p.before, after: p.after, webglError: p.webglError, ...summariseFrames(p.frames),
        gpuMs: distribution(gpu.filter(g => g.phase === p.name).map(g => g.ms)),
        longTasks: tasks.filter(e => e.t >= p.start && e.t < p.end),
        longFrames: longFrames.filter(e => e.t >= p.start && e.t < p.end).sort((a, b) => b.ms - a.ms).slice(0, 12),
        resources: resources.filter(e => e.t >= p.start && e.t < p.end),
        timeline: p.frames.map(f => [round(f.t), round(f.dt), round(f.cpu), f.calls, f.triangles]),
      })), errors, events, state: sampleState(b)};
  }
  return {installSystems, installRenderer, phase, report, mark, span, operation};
}
