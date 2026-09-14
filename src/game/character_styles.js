// Character page layout for the CSS codex. The live paper doll, inventory,
// drag targets and comparison tooltips stay owned by win_character.js.
export function characterCss(theme) {
  return `
.bw-sheet {
  display: grid; grid-template-columns: minmax(220px, .82fr) minmax(456px, 1.08fr) minmax(300px, 1fr);
  gap: clamp(12px, 1.5vw, 20px); min-height: 100%; color: ${theme.parchment};
}
.bw-sheet > .bw-panel { min-width: 0; min-height: 0; }
.bw-sheet .bw-panel {
  display: flex; flex-direction: column; padding: clamp(14px, 1.6vw, 22px);
  border-radius: 14px; background: rgba(7,12,12,.46);
  border: 1px solid rgba(212,180,106,.22); box-shadow: inset 0 1px 0 rgba(255,255,255,.035);
}
.bw-sheet .bw-left-panel { overflow: auto; }
.bw-sheet .bw-pack-panel { overflow: hidden; }
.bw-sheet .bw-who { margin-bottom: 16px; }
.bw-sheet .bw-title { color: ${theme.parchment}; font: 650 clamp(24px, 2.4vw, 34px)/1.05 ${theme.fonts.display}; text-wrap: balance; }
.bw-sheet .bw-class-word { margin-top: 5px; color: ${theme.gold}; font: 600 14px ${theme.fonts.body}; }
.bw-sheet .bw-quote { margin-top: 12px; padding-left: 11px; border-left: 2px solid ${theme.goldDim}88; color: ${theme.parchmentDim}; font-style: italic; line-height: 1.45; text-wrap: pretty; }
.bw-sheet .bw-hdr {
  margin: 18px 0 8px; color: ${theme.gold}; font: 600 12px/1.2 ${theme.fonts.display};
  letter-spacing: .04em; font-variant-caps: normal; background: none; padding-bottom: 0;
}
.bw-sheet .bw-row { grid-template-columns: 22px minmax(0,1fr) auto; padding: 5px 0; font-size: 14px; }
.bw-sheet .bw-row .bw-i svg { width: 17px; height: 17px; }
.bw-sheet .bw-row .bw-v, .bw-sheet .bw-inv-count { font-variant-numeric: tabular-nums; }
.bw-row .bw-v .bw-vnum { font-family: ${theme.fonts.display}; font-variant-numeric: tabular-nums; }
.bw-vd { font-size: 12px; }
.bw-note {
  margin-top: 14px; padding: 11px 12px; color: ${theme.parchmentDim};
  background: rgba(0,0,0,.18); border-left: 2px solid ${theme.goldDim}; font-size: 13px; line-height: 1.45;
}
.bw-inv-head {
  display: flex; align-items: baseline; justify-content: space-between; gap: 10px;
  margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid rgba(212,180,106,.25);
}
.bw-inv-head .bw-hdr { margin: 0; }
.bw-inv-count { color: ${theme.gold}; font: 600 13px ${theme.fonts.display}; white-space: nowrap; }
.bw-doll-stage {
  display: grid; grid-template-columns: minmax(94px, .7fr) minmax(210px, 1.25fr) minmax(94px, .7fr);
  grid-template-rows: minmax(330px, 1fr) auto; align-items: stretch; gap: clamp(8px, 1.2vw, 16px);
  min-height: 0; isolation: isolate;
}
.bw-arch { grid-column: 2; grid-row: 1; position: relative; min-height: 330px; border-radius: 18px; overflow: hidden;
  background: radial-gradient(circle at 50% 28%, rgba(106,151,124,.22), transparent 43%), rgba(5,9,9,.5);
  border: 1px solid rgba(212,180,106,.3); box-shadow: inset 0 1px 0 rgba(255,255,255,.07), 0 16px 34px rgba(0,0,0,.25); }
.bw-arch-inner { position: absolute; inset: 10px; overflow: hidden; pointer-events: auto; }
.bw-arch-inner .bw-doll-canvas { width: 100%; height: 100%; display: block; }
.bw-arch-none { position: absolute; inset: 46% 12px auto; color: ${theme.goldDim}; font: 12px ${theme.fonts.body}; text-align: center; }
.bw-doll-rail { grid-row: 1; display: flex; flex-direction: column; gap: 8px; justify-content: center; min-height: 0; }
.bw-doll-rail-left { grid-column: 1; } .bw-doll-rail-right { grid-column: 3; }
.bw-doll-motto { grid-column: 2; grid-row: 2; margin: 0; color: ${theme.parchmentDim}; text-align: center; font-size: 13px; text-wrap: balance; }
.bw-sheet .bw-doll-slot {
  min-height: 52px; display: grid; grid-template-columns: 30px minmax(0,1fr); align-items: center; gap: 7px;
  padding: 7px; border: 1px solid rgba(212,180,106,.35); border-radius: 10px; background: rgba(9,14,14,.76);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.055); cursor: pointer;
  transition: background-color .16s ease, border-color .16s ease, scale .16s ease;
}
.bw-sheet .bw-doll-slot:hover { border-color: ${theme.goldBright}; background: rgba(48,42,27,.6); }
.bw-sheet .bw-doll-slot:active { scale: .96; }
.bw-sheet .bw-doll-slot.bw-empty { color: ${theme.goldDim}; }
.bw-sheet .bw-doll-empty-glyph, .bw-sheet .bw-doll-slot:not(.bw-empty) > span:not(.bw-doll-label):not(.bw-q) { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; line-height: 0; }
.bw-sheet .bw-doll-empty-glyph svg, .bw-sheet .bw-doll-slot:not(.bw-empty) > span:not(.bw-doll-label):not(.bw-q) svg, .bw-sheet .bw-doll-slot:not(.bw-empty) > span:not(.bw-doll-label):not(.bw-q) img { width: 28px; height: 28px; object-fit: contain; }
.bw-sheet .bw-doll-label { min-width: 0; color: ${theme.parchmentDim}; font-size: 12px; line-height: 1.2; white-space: normal; overflow-wrap: anywhere; }
.bw-sheet .bw-doll-slot:not(.bw-empty) .bw-doll-label { color: ${theme.parchment}; }
.bw-sheet .bw-doll-slot .bw-q { color: ${theme.gold}; font: 600 22px/1 ${theme.fonts.display}; text-align: center; }
.bw-sheet .bw-bag-grid .bw-slot > span:not(.bw-q) { display: flex; width: 86%; height: 86%; align-items: center; justify-content: center; }
.bw-sheet .bw-bag-grid .bw-slot > span:not(.bw-q) > svg, .bw-sheet .bw-bag-grid .bw-slot > span:not(.bw-q) > img { width: 100%; height: 100%; object-fit: contain; }
@media (max-width: 1150px) {
  .bw-sheet { grid-template-columns: minmax(220px, .8fr) minmax(456px, 1.2fr); }
  .bw-sheet .bw-pack-panel { grid-column: 1 / -1; min-height: 360px; }
}
@media (max-width: 760px) {
  .bw-sheet { display: flex; flex-direction: column; gap: 14px; }
  .bw-sheet .bw-left-panel { max-height: none; } .bw-sheet .bw-pack-panel { min-height: 320px; }
  .bw-doll-stage { min-height: 520px; } .bw-arch { min-height: 390px; }
}
@media (max-width: 480px) {
  .bw-sheet .bw-panel { padding: 8px; }
  .bw-doll-stage {
    grid-template-columns: 72px minmax(0,1fr) 72px; grid-template-rows: minmax(420px,1fr) auto;
    gap: 8px; min-height: 450px;
  }
  .bw-arch { min-height: 420px; border-radius: 12px; }
  .bw-arch-inner { inset: 6px; }
  .bw-doll-rail { gap: 5px; }
  .bw-sheet .bw-doll-slot {
    min-width: 0; min-height: 62px; grid-template-columns: 1fr; grid-template-rows: 24px auto;
    justify-items: center; gap: 2px; padding: 4px; border-radius: 8px;
  }
  .bw-sheet .bw-doll-empty-glyph, .bw-sheet .bw-doll-slot:not(.bw-empty) > span:not(.bw-doll-label):not(.bw-q) { width: 24px; height: 24px; }
  .bw-sheet .bw-doll-empty-glyph svg, .bw-sheet .bw-doll-slot:not(.bw-empty) > span:not(.bw-doll-label):not(.bw-q) svg, .bw-sheet .bw-doll-slot:not(.bw-empty) > span:not(.bw-doll-label):not(.bw-q) img { width: 24px; height: 24px; }
  .bw-sheet .bw-doll-label { overflow: visible; color: ${theme.parchmentDim}; font-size: 10px; line-height: 1.1; text-align: center; text-overflow: clip; white-space: normal; overflow-wrap: anywhere; }
}
`;
}
