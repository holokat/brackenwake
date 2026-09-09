export const ACHIEVEMENT_CSS = `
#bw-windows .bw-codex-body.bw-achievements:not([data-tab="character"])::before { display:none; }
.bw-achievements { color:#e5dec9; font:15px/1.5 Georgia,serif; -webkit-font-smoothing:antialiased; }
.bw-achievement-summary { margin-bottom:24px; }
.bw-achievement-summary h2 { margin:0 0 4px; font-size:28px; font-weight:500; text-wrap:balance; }
.bw-achievement-summary p { margin:4px 0; }
.bw-achievement-count,.bw-achievement-progress { font-variant-numeric:tabular-nums; }
.bw-achievement-title { display:flex; align-items:center; gap:12px; margin:20px 0 10px; }
.bw-achievement-title select { min-height:40px; max-width:100%; color:#eee3c7; background:#1b211d; border:1px solid #6b6148; border-radius:5px; padding:6px 10px; font:inherit; }
.bw-achievement-note { color:#b3b1a2; font-size:14px; max-width:65ch; text-wrap:pretty; }
.bw-achievement-perks { color:#d9bc7e; }
.bw-achievement-filters { display:flex; flex-wrap:wrap; gap:6px; margin:0 0 24px; }
#bw-windows .bw-achievements button:not(.bw-tab):not(.bw-win-x):not(.bw-btn) { min-height:40px; border:1px solid #655e48; border-radius:5px; padding:6px 12px; color:#c9c1ab; background:rgba(18,23,20,.7); font:inherit; cursor:pointer; transition:background-color .15s,color .15s,transform .15s; }
#bw-windows .bw-achievements button:not(.bw-tab):not(.bw-win-x):not(.bw-btn):hover,#bw-windows .bw-achievements button:not(.bw-tab):not(.bw-win-x):not(.bw-btn)[aria-pressed=true] { color:#f1db9a; background:#30382e; }
#bw-windows .bw-achievements button:not(.bw-tab):not(.bw-win-x):not(.bw-btn):active { transform:scale(.96); }
#bw-windows .bw-achievements button:not(.bw-tab):not(.bw-win-x):not(.bw-btn):focus-visible,.bw-achievements select:focus-visible,.bw-achievement-checklist summary:focus-visible { outline:2px solid #e3be74; outline-offset:3px; }
#bw-windows .bw-achievements button:not(.bw-tab):not(.bw-win-x):not(.bw-btn):disabled { cursor:default; color:#adb99d; }
.bw-achievement-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(100%,310px),1fr)); gap:24px 28px; }
.bw-achievement { display:flex; align-items:flex-start; gap:14px; padding:0 0 22px; box-shadow:0 1px 0 rgba(229,215,168,.12); }
.bw-achievement-icon { display:block; flex:0 0 72px; width:72px; height:72px; background-size:500% 400%; border-radius:8px; outline:1px solid rgba(255,255,255,.1); outline-offset:-1px; filter:saturate(.5); }
.bw-achievement.earned .bw-achievement-icon { filter:none; }
.bw-achievement-body { min-width:0; flex:1; }
#bw-windows .bw-achievement h3 { font-family:inherit; font-variant-caps:normal; letter-spacing:normal; margin:0 0 5px; font-size:18px; line-height:1.25; font-weight:500; text-wrap:balance; color:#e9dfc5; }
.bw-achievement p { margin:4px 0; text-wrap:pretty; }
.bw-achievement progress { appearance:none; width:100%; height:5px; display:block; border:0; border-radius:3px; overflow:hidden; margin:14px 0 5px; background:#323a32; }
.bw-achievement progress::-webkit-progress-bar { background:#323a32; }
.bw-achievement progress::-webkit-progress-value { background:#b7a168; }
.bw-achievement progress::-moz-progress-bar { background:#b7a168; }
.bw-achievement-progress { color:#a5b5a0; font-size:13px; }
.bw-achievement-reward { color:#c5b183; font-size:13px; }
.bw-achievement-equip { margin-top:10px; }
.bw-achievement-checklist { margin-top:12px; font-size:13px; }
.bw-achievement-checklist summary { cursor:pointer; padding:10px 0; }
@media(max-width:600px) { .bw-achievement-title { align-items:flex-start; flex-direction:column; gap:5px; } .bw-achievement-icon { width:56px; height:56px; flex-basis:56px; } }
@media(prefers-reduced-motion:reduce) { #bw-windows .bw-achievements button:not(.bw-tab):not(.bw-win-x):not(.bw-btn) { transition:none; } }
`;
