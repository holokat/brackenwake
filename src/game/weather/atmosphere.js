// One weather tint for the dome, water reflections, fog and scene lights.
export function weatherPalette(p, w) {
  if(!w)return p;
  const cover=Math.max(0,(w.cloud-.35)/.65), storm=Math.max(w.rain,w.snow), d=p.day;
  const shade=.10+d*.45;
  for(const key of ['zenith','horizon','fog']) {
    const c=p[key], k=cover*(key==='zenith'?.78:.48);
    c.r+=(shade*.91-c.r)*k; c.g+=(shade*.98-c.g)*k; c.b+=(shade*1.07-c.b)*k;
  }
  p.cloud=w.cloud;
  p.glare*=1-cover*.88;
  p.star*=1-cover; p.moon*=1-cover*.82;
  p.sunVeil=1-cover*.90;
  p.fogNear*=Math.max(.28,1-w.mist*.70-storm*.30);
  p.fogFar*=Math.max(.40,1-w.mist*.50-storm*.27-w.dust*.20);
  return p;
}

export function weatherLighting(tint,w) {
  if(!w)return tint;
  const cover=Math.max(0,(w.cloud-.35)/.65);
  tint.sunI*=1-cover*.70;
  tint.hemiI*=1-cover*.12;
  return tint;
}
