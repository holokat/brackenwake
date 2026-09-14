// The shared CSS shell for the full-width codex. It deliberately contains no
// frame artwork: every page gets the same scalable surface and labelled tabs.
export function codexCss(theme) {
  return `
#bw-windows, #bw-windows * { box-sizing: border-box; }
#bw-windows {
  position: fixed; inset: 0; z-index: 50; pointer-events: none;
  color: ${theme.parchment}; -webkit-font-smoothing: antialiased;
}
#bw-windows .bw-win { position: absolute; pointer-events: auto; }
#bw-windows .bw-win[hidden] { display: none; }
#bw-windows .bw-win-plain { min-width: 300px; max-width: min(820px, 94vw); }
#bw-windows .bw-win-plain .bw-frame {
  padding: 18px 14px 14px; border-radius: 14px;
  background: linear-gradient(160deg, rgba(30,36,33,.98), rgba(12,16,16,.98));
  border: 1px solid rgba(212,180,106,.42); border-image: none;
  box-shadow: 0 24px 80px rgba(0,0,0,.72), inset 0 1px 0 rgba(255,255,255,.05);
}
#bw-windows .bw-win-codex {
  width: min(1360px, 94vw); height: min(88vh, 920px); min-height: min(620px, 88vh);
}
#bw-windows .bw-win-title {
  display: flex; align-items: center; justify-content: space-between; gap: 14px;
  cursor: move; user-select: none; -webkit-user-select: none;
  padding: 10px 14px; margin: -18px -14px 14px; border-radius: 14px 14px 8px 8px;
  background: linear-gradient(180deg, ${theme.stoneUp}, ${theme.stone});
  border: 1px solid ${theme.goldDim}66;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), inset 0 -12px 18px rgba(0,0,0,.22);
}
#bw-windows .bw-win-name {
  font-family: ${theme.fonts.display}; font-size: 15px; font-weight: 600;
  letter-spacing: .12em; color: ${theme.gold};
}
#bw-windows .bw-win-key { font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .12em; color: ${theme.goldDim}; }
#bw-windows .bw-win-x {
  min-width: 40px; min-height: 40px; padding: 0 8px; cursor: pointer;
  color: ${theme.parchment}; background: rgba(255,255,255,.04);
  border: 1px solid rgba(212,180,106,.34); border-radius: 9px;
  font: 24px/1 ${theme.fonts.body}; transition: background-color .16s ease, color .16s ease, scale .16s ease;
}
#bw-windows .bw-win-x:hover { color: ${theme.goldBright}; background: rgba(212,180,106,.13); }
#bw-windows .bw-win-x:active { scale: .96; }
#bw-windows .bw-win-body {
  overflow: auto; max-height: min(74vh, 820px);
  background: linear-gradient(180deg, rgba(255,255,255,.025), rgba(0,0,0,.18)), ${theme.stoneDeep};
  border: 1px solid ${theme.goldDim}44; border-radius: 12px;
}
#bw-windows .bw-codex-frame {
  position: relative; display: grid; grid-template-columns: minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr);
  width: 100%; height: 100%; overflow: hidden; border-radius: 18px;
  background: linear-gradient(145deg, rgba(31,39,35,.98), rgba(10,14,14,.99));
  border: 1px solid rgba(212,180,106,.48);
  box-shadow: 0 28px 80px rgba(0,0,0,.66), inset 0 1px 0 rgba(255,255,255,.06);
}
#bw-windows .bw-codex-title {
  position: relative; inset: auto; z-index: 2; min-height: 0; margin: 0; padding: 12px 14px;
  display: flex; align-items: center; gap: 10px; cursor: move;
  background: linear-gradient(180deg, rgba(48,55,49,.94), rgba(19,25,24,.96));
  border: 0; border-bottom: 1px solid rgba(212,180,106,.32); border-radius: 18px 18px 0 0;
  box-shadow: none;
}
#bw-windows .bw-codex-tabs { display: flex; align-items: center; gap: 7px; min-width: 0; overflow-x: auto; }
#bw-windows .bw-codex-tabs .bw-tab {
  flex: 0 0 auto; min-width: 40px; min-height: 40px; display: inline-flex;
  align-items: center; justify-content: center; gap: 7px; padding: 8px 11px;
  color: ${theme.parchmentDim}; background: transparent; border: 1px solid transparent;
  border-radius: 9px; box-shadow: none; font: 600 14px/1.1 ${theme.fonts.body};
  cursor: pointer; transition: background-color .16s ease, border-color .16s ease, color .16s ease, scale .16s ease;
}
#bw-windows .bw-codex-tabs .bw-tab .bw-tab-word { display: inline; white-space: nowrap; }
#bw-windows .bw-codex-tabs .bw-tab .bw-tab-i { display: block; width: 17px; height: 17px; }
#bw-windows .bw-codex-tabs .bw-tab:hover { color: ${theme.parchment}; background: rgba(255,255,255,.05); border-color: rgba(212,180,106,.24); }
#bw-windows .bw-codex-tabs .bw-tab.on { color: ${theme.goldBright}; background: rgba(212,180,106,.14); border-color: rgba(212,180,106,.54); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
#bw-windows .bw-codex-tabs .bw-tab:active { scale: .96; }
#bw-windows .bw-codex-close { flex: 0 0 auto; margin-left: auto; }
#bw-windows .bw-codex-bodies { min-width: 0; min-height: 0; pointer-events: none; }
#bw-windows .bw-codex-body {
  width: 100%; min-width: 0; height: 100%; min-height: 0; max-height: none; overflow: auto; padding: clamp(16px, 2vw, 28px);
  background: transparent; border: 0; border-radius: 0; pointer-events: auto;
}
#bw-windows .bw-codex-body::before {
  content: attr(data-title); display: block; margin: 0 0 20px;
  color: ${theme.parchment}; font: 650 clamp(22px, 2.2vw, 32px)/1.1 ${theme.fonts.display};
  letter-spacing: .02em; text-wrap: balance;
}
#bw-windows .bw-codex-body[hidden] { display: none; }
#bw-windows :where(h3) {
  margin: 14px 0 8px; color: ${theme.gold}; font: 600 12px/1.2 ${theme.fonts.display};
  letter-spacing: .08em; font-variant-caps: normal;
}
#bw-windows :where(h3:first-child) { margin-top: 0; }
#bw-windows :where(button:not(.bw-tab):not(.bw-win-x):not(.bw-btn)) {
  min-height: 40px; padding: 7px 12px; cursor: pointer;
  color: ${theme.parchment}; background: rgba(255,255,255,.045); border: 1px solid ${theme.goldDim};
  border-radius: 8px; font: 14px ${theme.fonts.body};
  transition: background-color .16s ease, border-color .16s ease, color .16s ease, scale .16s ease;
}
#bw-windows :where(button:not(.bw-tab):not(.bw-win-x):not(.bw-btn)):hover:not(:disabled) { color: ${theme.goldBright}; background: rgba(212,180,106,.12); border-color: ${theme.gold}; }
#bw-windows :where(button:not(.bw-tab):not(.bw-win-x):not(.bw-btn)):active:not(:disabled) { scale: .96; }
#bw-windows button:disabled { opacity: .45; cursor: default; }
#bw-windows input, #bw-windows select, #bw-windows textarea { font-family: ${theme.fonts.body}; font-size: 14px; }
#bw-tip {
  position: fixed; z-index: 70; display: flex; align-items: flex-start; gap: 11px; max-width: min(660px, 92vw);
  padding: 10px 12px; color: ${theme.parchment};
  background: linear-gradient(160deg, rgba(30,36,33,.98), rgba(12,16,16,.99));
  border: 1px solid ${theme.goldDim}; border-radius: 10px;
  box-shadow: 0 14px 44px rgba(0,0,0,.7); font: 14px/1.4 ${theme.fonts.body};
}
#bw-tip[hidden] { display: none; }
#bw-tip .bw-tip-main { max-width: 320px; }
#bw-tip .bw-tip-name { margin-bottom: 4px; color: ${theme.parchment}; font: 600 14px ${theme.fonts.display}; }
#bw-tip .bw-tip-line { color: ${theme.parchmentDim}; }
#bw-tip .bw-tip-cmp { max-width: 300px; padding-left: 11px; align-self: stretch; border-left: 1px solid ${theme.goldDim}88; }
#bw-tip .bw-tip-cmp-head, #bw-tip .bw-tip-slot { color: ${theme.gold}; font: 600 11px ${theme.fonts.display}; letter-spacing: .08em; }
#bw-tip .bw-tip-cmp-head { margin-bottom: 6px; }
#bw-tip .bw-tip-slot { margin: 1px 0 3px; color: ${theme.goldDim}; }
#bw-tip .bw-tip-blk { margin-bottom: 8px; } #bw-tip .bw-tip-blk:last-child { margin-bottom: 0; }
#bw-tip .bw-tip-blk-top { display: flex; align-items: center; gap: 7px; }
#bw-tip .bw-tip-empty { color: ${theme.parchmentFaint}; font-style: italic; }
#bw-tip .bw-tip-warn { color: #ff9a87; margin-top: 5px; }
#bw-windows .bw-drop-hot { outline: 2px solid ${theme.goldBright}; outline-offset: -2px; }
@media (max-width: 860px) {
  #bw-windows .bw-win-codex { width: 100vw; height: 100vh; min-height: 0; }
  #bw-windows .bw-codex-frame { border-radius: 0; } #bw-windows .bw-codex-title { border-radius: 0; }
  #bw-windows .bw-codex-tabs .bw-tab { padding: 8px; } #bw-windows .bw-codex-tabs .bw-tab-word { font-size: 13px; }
}
@media (max-width: 580px) {
  #bw-windows .bw-codex-title { padding: 8px; gap: 5px; }
  #bw-windows .bw-codex-tabs .bw-tab { min-width: 40px; padding: 8px 7px; }
  #bw-windows .bw-codex-tabs .bw-tab-word { font-size: 12px; }
  #bw-windows .bw-codex-body { padding: 14px; }
}
@media (max-width: 360px) {
  #bw-windows .bw-codex-title { padding: 6px; }
  #bw-windows .bw-codex-tabs { gap: 3px; }
  #bw-windows .bw-codex-body { padding: 8px; }
}
`;
}
