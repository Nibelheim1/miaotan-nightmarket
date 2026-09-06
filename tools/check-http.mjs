/** Local preview smoke check independent of any browser navigation policy. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const port = 4176;
const child = spawn(process.execPath, ['tools/server.mjs', '--dist'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
const report={checks:[],server:'tools/server.mjs --dist',url:`http://127.0.0.1:${port}/`,generatedAt:new Date().toISOString()};
try {
  for(let i=0;i<50&&!output.includes('Root:');i++)await new Promise(r=>setTimeout(r,40));
  const result=await fetch(report.url); const body=await result.text();
  report.checks.push({name:'HTTP index 200 and HTML MIME',passed:result.status===200&&result.headers.get('content-type')?.includes('text/html')});
  const expected=fs.readFileSync('dist/index.html','utf8');
  report.checks.push({name:'HTTP body equals production artifact byte-for-byte',passed:body===expected,sha256:createHash('sha256').update(body).digest('hex')});
  const manifest=await fetch(report.url+'BUILD.json');report.checks.push({name:'Build metadata accessible',passed:manifest.status===200&&(await manifest.json()).bytes===Buffer.byteLength(body)});
  const absent=await fetch(report.url+'missing-file.js');report.checks.push({name:'Missing resource returns 404',passed:absent.status===404});
  report.logs=output;report.passed=report.checks.every(x=>x.passed);
  fs.writeFileSync('evidence/http-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(!report.passed)process.exitCode=1;
} finally { child.kill(); }
