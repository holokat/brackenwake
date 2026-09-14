// Icon trees share the CSS codex palette; no painted window or raster layout.
export const TALENT_STYLES = `
.bw-talents{--tree-accent:#cfad71;color:#e8e8db;font:14px/1.45 ui-sans-serif,system-ui,sans-serif;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;min-width:0;font-variant-caps:normal;text-transform:none;letter-spacing:normal}
.bw-talents button{font:inherit;color:inherit;cursor:pointer;border:1px solid #526057;background:#1c2923;border-radius:6px;padding:8px 12px;min-height:40px;transition:background-color .15s,border-color .15s,scale .15s}
.bw-talents button:active{scale:.96}.bw-talents button:hover,.bw-talents button:focus-visible{border-color:var(--tree-accent);background:#2b382e;outline:2px solid transparent;outline-offset:3px}.bw-talents button:focus-visible{outline-color:#efd49b}
.bw-talents button:disabled{cursor:default;color:#849185;background:#17221d;border-color:#39463e;scale:1}
.bw-talents .talent-summary{display:flex;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:16px}
.bw-talents .talent-summary strong{font:600 24px/1.2 Georgia,serif}.bw-talents .talent-points{margin-left:auto;color:#ecd09a;font-weight:600}
.bw-talents .talent-progress{width:130px;height:5px;border-radius:5px;background:#303b34;overflow:hidden}.bw-talents .talent-progress span{display:block;height:100%;background:#d1b177}
.bw-talents .talent-tabs{display:flex;gap:6px;flex-wrap:wrap}.bw-talents .talent-tabs button[aria-selected=true]{background:#d3b37b;color:#18241d;border-color:#ead3a7;font-weight:650}
.bw-talents .talent-tools{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:14px 0}.bw-talents .talent-help{flex:1;min-width:220px;color:#b0bcb1;margin:0;font-size:13px}
.bw-talents .talent-basics{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 0;border-top:1px solid #344039;border-bottom:1px solid #344039;margin-bottom:16px}.bw-talents .talent-basics-label{color:#a5b3a7;font-size:12px;margin-right:4px}
.bw-talents .talent-basic{width:42px;height:42px;padding:3px;min-height:42px}.bw-talents .talent-basic img,.bw-talents .talent-basic svg{width:100%;height:100%;object-fit:cover;display:block}
.bw-talents .talent-branches{display:grid;grid-template-columns:repeat(3,minmax(255px,1fr));gap:14px;overflow-x:auto;padding-bottom:8px;align-items:start}
.bw-talents .talent-branch{min-width:0;border:1px solid #3d4b40;border-radius:10px;overflow:hidden;background:radial-gradient(ellipse at 50% 12%,var(--tree-glow,#66512a28),transparent 70%),#121d17;box-shadow:0 10px 25px #0002}
.bw-talents .talent-branch header{padding:16px 16px 12px;border-bottom:1px solid #3d4b4080;min-height:112px;box-sizing:border-box}.bw-talents .talent-branch h3{display:flex;justify-content:space-between;align-items:center;font:600 20px/1.2 Georgia,serif;color:#e4d2ad;margin:0 0 8px}.bw-talents .talent-branch p{margin:0;color:#a7b5a9;font-size:12px;line-height:1.45}.bw-talents .talent-spent{font:12px ui-sans-serif,system-ui,sans-serif;color:#a4b69f}
.bw-talents .talent-map{position:relative;min-width:255px;margin:10px 0 2px}.bw-talents .talent-connections{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.bw-talents .talent-edge{fill:none;stroke:#465447;stroke-width:2}.bw-talents .talent-edge.earned{stroke:#d9ba67;filter:drop-shadow(0 0 3px #b69a4840)}.bw-talents .talent-edge.planned{stroke-dasharray:4 5;stroke:#586359}
.bw-talents .talent-node{position:absolute;width:33.333%;height:108px;display:flex;flex-direction:column;align-items:center;box-sizing:border-box;padding:4px 3px}
.bw-talents .talent-icon{width:52px;height:52px;min-height:52px;padding:2px;border:2px solid #4a554d;background:#0c1510;border-radius:7px;box-shadow:0 3px 12px #0008;z-index:1}
.bw-talents .talent-icon img,.bw-talents .talent-icon svg{width:100%;height:100%;object-fit:cover;display:block}.bw-talents .talent-node.locked .talent-icon{filter:grayscale(.9);opacity:.62}
.bw-talents .talent-node.learned .talent-icon{border-color:#d3ad5e}.bw-talents .talent-node.available .talent-icon{border-color:#78b884;box-shadow:0 0 14px #6aaf7433}.bw-talents .talent-node.selected .talent-icon{outline:2px solid #f1deb5;outline-offset:3px}
.bw-talents .talent-node.planned .talent-icon{border-style:dashed;background:#1c2620;color:#7b8c7d;box-shadow:none;font:24px Georgia,serif;opacity:.8}
.bw-talents .talent-name{font-size:12px;line-height:1.25;text-align:center;color:#cdd5ca;max-width:100%;margin-top:7px;min-height:28px;text-wrap:balance}.bw-talents .talent-node.planned .talent-name{color:#859586}
.bw-talents .talent-learn{position:absolute;top:40px;left:calc(50% + 4px);min-width:40px;min-height:26px;padding:2px 5px;font-size:11px;line-height:16px;background:#17281a;color:#e4d4a7;border-color:#918159;border-radius:4px;z-index:2;pointer-events:none}.bw-talents .talent-learn:disabled{color:#a4ae9e;background:#152019}
.bw-talents .talent-future-label{position:absolute;top:43px;background:#1a261e;border:1px dashed #687563;border-radius:3px;padding:1px 5px;color:#b4bea8;font-size:9px;z-index:2}
.bw-talents .talent-details{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px 20px;border:1px solid #4e5d49;border-radius:8px;background:#1b2820;padding:16px 18px;margin:0 0 16px;min-height:108px;box-sizing:border-box}
.bw-talents .talent-details h4{font:600 21px/1.2 Georgia,serif;margin:0 0 6px;color:#ead4a8}.bw-talents .talent-details p{margin:4px 0;color:#b8c4b7}.bw-talents .talent-details .talent-rule{font-size:12px;color:#dbc293}.bw-talents .talent-details .talent-actions{display:flex;gap:8px;flex-wrap:wrap}
.bw-talents .talent-status{color:#e4c78e;min-height:20px;margin:8px 0;font-size:13px}.bw-talents .talent-status:empty{display:none}
.bw-talents .talent-archive{margin:14px 0;color:#abb9ad;font-size:12px}.bw-talents .talent-archive summary{cursor:pointer;min-height:40px;display:flex;align-items:center}.bw-talents .talent-archive-items{display:flex;gap:7px;flex-wrap:wrap}
@media(max-width:720px){.bw-talents .talent-details{grid-template-columns:1fr}.bw-talents .talent-branches{gap:10px}.bw-talents .talent-tabs button{padding:7px 10px}.bw-talents .talent-summary strong{font-size:20px}}
@media(prefers-reduced-motion:reduce){.bw-talents button{transition:none}}
`;
