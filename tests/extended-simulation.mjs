import fs from 'node:fs';
import { simulate } from './balance.mjs';
const modes=['daily','endless'],rows=[];
for(const mode of modes)for(let seed=1;seed<=75;seed++)rows.push(simulate(seed,'priority','balanced',mode));
const groups=Object.fromEntries(modes.map(mode=>{const a=rows.filter(x=>x.mode===mode);return [mode,{runs:a.length,ended:a.filter(x=>x.ended).length,wins:a.filter(x=>x.victory).length,minWave:Math.min(...a.map(x=>x.wave)),maxWave:Math.max(...a.map(x=>x.wave)),meanWave:+(a.reduce((s,x)=>s+x.wave,0)/a.length).toFixed(2),meanFlightSeconds:+(a.reduce((s,x)=>s+x.flightSeconds,0)/a.length).toFixed(2),maxBalls:Math.max(...a.map(x=>x.maxBalls)),maxEnemies:Math.max(...a.map(x=>x.maxEnemies))}]}));
const report={generatedAt:new Date().toISOString(),runs:rows.length,groups,disclaimer:'Scripted agents. Daily tested across 75 explicit seeds (not real calendar-day cohorts). Endless cap is 120 shots; ended=false would denote right-censoring, not a win.',rows};
fs.writeFileSync('evidence/extended-simulation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(groups,null,2));
