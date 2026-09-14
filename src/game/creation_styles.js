// Creation keeps the authored background image and ambient video while its
// controls use a responsive, readable CSS surface instead of roster artwork.
export function creationCss(theme) {
  return `
#bw-creation, #bw-creation * { box-sizing: border-box; }
#bw-creation { position: fixed; inset: 0; z-index: 90; isolation: isolate; overflow: auto;
  color: ${theme.parchment}; background-size: cover; background-position: center; background-repeat: no-repeat;
  font: 15px/1.4 ${theme.fonts.body}; -webkit-font-smoothing: antialiased; }
#bw-creation[hidden] { display: none; }
#bw-creation > .bw-ro-video { position: absolute; inset: 0; z-index: -1; width: 100%; height: 100%; object-fit: cover; pointer-events: none; }
#bw-creation::before { content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: radial-gradient(circle at 50% 38%, rgba(9,15,13,.14), rgba(5,8,8,.67) 92%); }
#bw-creation .bw-cr-panel {
  width: min(1320px, calc(100vw - 32px)); height: min(88vh, 900px); min-height: min(620px, calc(100vh - 32px));
  margin: max(16px, 6vh) auto; display: grid; grid-template-columns: minmax(310px, .9fr) minmax(390px, 1.1fr);
  overflow: hidden; border: 1px solid rgba(212,180,106,.42); border-radius: 18px;
  background: rgba(11,17,16,.82); box-shadow: 0 28px 90px rgba(0,0,0,.62), inset 0 1px 0 rgba(255,255,255,.06);
  backdrop-filter: blur(16px);
}
#bw-creation .bw-cr-left, #bw-creation .bw-cr-right { min-width: 0; min-height: 0; overflow: auto; }
#bw-creation .bw-cr-left { padding: 20px; border-right: 1px solid rgba(212,180,106,.25); background: rgba(6,11,11,.34); }
#bw-creation .bw-cr-right { padding: 0; background: rgba(255,255,255,.018); }
#bw-creation .bw-cr-scroll { min-height: 100%; padding: clamp(20px, 3vw, 38px); }
#bw-creation .bw-cr-plaque, #bw-creation .bw-cr-foot { display: none; }
#bw-creation .bw-cr-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
#bw-creation .bw-cr-card { position: relative; min-height: 120px; padding: 10px; display: grid; grid-template-columns: 66px minmax(0,1fr); gap: 10px; align-items: center; cursor: pointer;
  border: 1px solid rgba(212,180,106,.23); border-radius: 12px; background: rgba(255,255,255,.035);
  transition: background-color .16s ease, border-color .16s ease, box-shadow .16s ease, scale .16s ease; }
#bw-creation .bw-cr-card:hover { border-color: rgba(212,180,106,.58); background: rgba(212,180,106,.08); }
#bw-creation .bw-cr-card:active { scale: .96; }
#bw-creation .bw-cr-card.on { border-color: ${theme.gold}; background: rgba(212,180,106,.16); box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 8px 20px rgba(0,0,0,.23); }
#bw-creation .bw-cr-card-img { grid-row: 1 / span 2; width: 66px; height: 94px; object-fit: contain; object-position: bottom center; filter: drop-shadow(0 8px 8px rgba(0,0,0,.38)); }
#bw-creation .bw-cr-card .bw-cr-band, #bw-creation .bw-cr-emblem { display: none; }
#bw-creation .bw-cr-name { align-self: end; color: ${theme.parchment}; font: 600 16px/1.1 ${theme.fonts.display}; text-wrap: balance; }
#bw-creation .bw-cr-card.on .bw-cr-name { color: ${theme.goldBright}; }
#bw-creation .bw-cr-blurb { align-self: start; color: ${theme.parchmentDim}; font-size: 12px; line-height: 1.32; }
#bw-creation .bw-cr-cancel { width: 100%; min-height: 40px; margin-top: 14px; cursor: pointer; color: ${theme.parchmentDim}; background: transparent; border: 1px solid rgba(212,180,106,.28); border-radius: 8px; }
#bw-creation .bw-cr-cancel:hover { color: ${theme.parchment}; border-color: ${theme.gold}; }
#bw-creation .bw-cr-cancel:active { scale: .96; }
#bw-creation .bw-cr-art { height: clamp(170px, 24vh, 250px); display: flex; justify-content: center; align-items: end; overflow: hidden; border-radius: 14px; background: radial-gradient(circle at 50% 24%, rgba(112,151,126,.2), transparent 55%), rgba(4,9,9,.55); border: 1px solid rgba(212,180,106,.28); }
#bw-creation .bw-cr-art::after { display: none; }
#bw-creation .bw-cr-art-img { display: block; max-width: 100%; height: 100%; object-fit: contain; object-position: bottom; filter: drop-shadow(0 14px 16px rgba(0,0,0,.48)); }
#bw-creation .bw-cr-cname { margin-top: 18px; color: ${theme.parchment}; font: 650 clamp(26px, 3vw, 38px)/1 ${theme.fonts.display}; text-wrap: balance; }
#bw-creation .bw-cr-words { margin-top: 7px; color: ${theme.gold}; font: 600 13px ${theme.fonts.body}; }
#bw-creation .bw-cr-specs { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
#bw-creation .bw-cr-spec { padding: 4px 8px; color: ${theme.parchmentDim}; background: rgba(255,255,255,.045); border: 1px solid rgba(212,180,106,.22); border-radius: 999px; font-size: 12px; }
#bw-creation .bw-cr-quote { margin-top: 14px; padding-left: 12px; color: ${theme.parchmentDim}; border-left: 2px solid ${theme.goldDim}; font-style: italic; text-wrap: pretty; }
#bw-creation .bw-cr-about { margin-top: 9px; color: ${theme.parchmentDim}; }
#bw-creation .bw-hdr { margin: 20px 0 8px; color: ${theme.gold}; font: 600 12px ${theme.fonts.display}; letter-spacing: .04em; font-variant-caps: normal; background: none; padding-bottom: 0; }
#bw-creation .bw-cr-budget { margin-bottom: 8px; color: ${theme.gold}; font-variant-numeric: tabular-nums; font-size: 13px; }
#bw-creation .bw-cr-budget.spent { color: ${theme.parchmentFaint}; }
#bw-creation .bw-cr-bars { display: grid; gap: 7px; }
#bw-creation .bw-cr-bar { display: grid; grid-template-columns: 34px minmax(0,1fr) 34px 40px 40px; gap: 8px; align-items: center; }
#bw-creation .bw-cr-step, #bw-creation .bw-step button { min-width: 40px; min-height: 40px; padding: 0; cursor: pointer; color: ${theme.gold}; background: rgba(255,255,255,.05); border: 1px solid rgba(212,180,106,.35); border-radius: 7px; }
#bw-creation .bw-cr-step:active, #bw-creation .bw-step button:active { scale: .96; }
#bw-creation .bw-cr-bk, #bw-creation .bw-cr-dk { color: ${theme.parchmentDim}; font-size: 12px; }
#bw-creation .bw-cr-bt { position: relative; display: block; height: 40px; border-radius: 999px; overflow: hidden; background: transparent; }
#bw-creation .bw-cr-bf { position: absolute; inset: 15px auto 15px 0; display: block; border-radius: inherit; background: linear-gradient(90deg, ${theme.goldDim}, ${theme.goldBright}); }
#bw-creation .bw-cr-bv, #bw-creation .bw-row .bw-v, #bw-creation .bw-cr-dv { color: ${theme.parchment}; font-variant-numeric: tabular-nums; text-align: right; }
#bw-creation input[type=range] { position: absolute; inset: 0 -2px; width: calc(100% + 4px); height: 40px; margin: 0; appearance: none; background: transparent; cursor: pointer; }
#bw-creation input[type=range]::-webkit-slider-runnable-track { background: transparent; } #bw-creation input[type=range]::-webkit-slider-thumb { width: 12px; height: 16px; appearance: none; border: 1px solid #1b201c; border-radius: 4px; background: ${theme.parchment}; }
#bw-creation input[type=range]::-moz-range-thumb { width: 12px; height: 16px; border: 1px solid #1b201c; border-radius: 4px; background: ${theme.parchment}; }
#bw-creation .bw-cr-disc { width: 100%; min-height: 40px; margin-top: 14px; padding: 8px 10px; text-align: left; cursor: pointer; color: ${theme.gold}; background: rgba(255,255,255,.04); border: 1px solid rgba(212,180,106,.32); border-radius: 8px; }
#bw-creation .bw-cr-disc::after { content: '+'; float: right; } #bw-creation .bw-cr-disc.open::after { content: '−'; }
#bw-creation .bw-cr-skills { max-height: 250px; overflow: auto; margin-top: 10px; padding: 8px; border-radius: 10px; background: rgba(0,0,0,.22); border: 1px solid rgba(212,180,106,.18); }
#bw-creation .bw-cr-skills .bw-cr-grp { margin: 10px 0 4px; color: ${theme.goldDim}; font-size: 12px; } #bw-creation .bw-row { display: grid; grid-template-columns: minmax(0,1fr) auto 38px; gap: 8px; align-items: center; padding: 4px 0; } #bw-creation .bw-k { min-width: 0; overflow-wrap: anywhere; }
#bw-creation .bw-step { display: flex; gap: 3px; } #bw-creation .bw-step button { min-width: 40px; }
#bw-creation .bw-cr-derived { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 3px 16px; }
#bw-creation .bw-cr-drow { display: grid; grid-template-columns: 18px minmax(0,1fr) auto; gap: 7px; align-items: center; padding: 4px 0; border-bottom: 1px solid rgba(212,180,106,.12); }
#bw-creation .bw-cr-kitrow { display: flex; flex-wrap: wrap; gap: 8px; } #bw-creation .bw-cr-kit-i, #bw-creation .bw-cr-kit-gone { width: 54px; height: 54px; display: grid; place-items: center; border-radius: 9px; background: rgba(0,0,0,.2); border: 1px solid rgba(212,180,106,.27); }
#bw-creation .bw-cr-kit-gone { opacity: .45; border-style: dashed; } #bw-creation .bw-cr-kit-more { align-self: center; color: ${theme.parchmentFaint}; }
#bw-creation .bw-cr-act { margin-top: 20px; } #bw-creation input[type=text] { width: 100%; min-height: 42px; padding: 8px 10px; color: ${theme.parchment}; background: rgba(0,0,0,.25); border: 1px solid rgba(212,180,106,.34); border-radius: 8px; font: 16px ${theme.fonts.body}; }
#bw-creation input[type=text]:focus { outline: 2px solid rgba(239,205,121,.45); outline-offset: 2px; }
#bw-creation .bw-cr-go { width: 100%; min-height: 46px; margin-top: 12px; cursor: pointer; color: #1c190f; background: linear-gradient(180deg, ${theme.goldBright}, ${theme.gold}); border: 0; border-radius: 9px; font: 650 16px ${theme.fonts.body}; transition: filter .16s ease, scale .16s ease; }
#bw-creation .bw-cr-go:active:not(:disabled) { scale: .96; } #bw-creation .bw-cr-go:disabled { opacity: .45; cursor: default; }
#bw-creation .bw-cr-err { min-height: 18px; margin-top: 8px; color: ${theme.down}; } #bw-creation .bw-cr-short { color: ${theme.parchmentFaint}; font-size: 13px; }
#bw-creation ::-webkit-scrollbar { width: 9px; } #bw-creation ::-webkit-scrollbar-thumb { background: ${theme.goldDim}; border-radius: 999px; }
@media (max-width: 900px) {
  #bw-creation .bw-cr-panel { height: auto; min-height: 0; grid-template-columns: minmax(0,1fr); margin: 16px auto; overflow: visible; }
  #bw-creation .bw-cr-left { border-right: 0; border-bottom: 1px solid rgba(212,180,106,.25); } #bw-creation .bw-cr-right { overflow: visible; }
}
@media (max-width: 560px) { #bw-creation .bw-cr-panel { width: calc(100vw - 16px); } #bw-creation .bw-cr-left, #bw-creation .bw-cr-scroll { padding: 16px; } #bw-creation .bw-cr-cards { grid-template-columns: 1fr; } #bw-creation .bw-cr-derived { grid-template-columns: 1fr; } }
`;
}
