import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';

const base=process.env.QF_URL||'https://201.34.158.52';
const {password}=JSON.parse(await readFile(new URL('../runtime/settings.json',import.meta.url),'utf8'));
const home=await fetch(base+'/');
assert.equal(home.status,200);
assert.match(await home.text(),/ПАША/);
const content=await (await fetch(base+'/content.json')).json();
assert.equal(content.edition,'curated');
assert.equal(content.originalMaps,3);
assert.equal(content.extraMaps,3);
assert.ok(content.downloadMiB<=150);
const denied=await fetch(base+'/assets/manifest.json');
assert.equal(denied.status,401);
const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})});
assert.equal(login.status,200);
const setCookie=login.headers.get('set-cookie');
assert.match(setCookie,/Secure/);
assert.match(setCookie,/HttpOnly/);
const cookie=setCookie.split(';')[0];
const room=await (await fetch(base+'/api/status',{headers:{Cookie:cookie}})).json();
assert.equal(room.ready,true);
assert.ok(['pro-q3tourney4','pro-q3dm6','ztn3tourney1','q3dm17','q3dm13','q3dm19'].includes(room.map));
const manifest=await (await fetch(base+'/assets/manifest.json',{headers:{Cookie:cookie}})).json();
assert.equal(manifest.length,5);
for(const asset of manifest){
 const name=asset.name.replace(/(.+\/|)(.+?)$/,'$1'+asset.checksum+'-$2');
 const response=await fetch(base+'/assets/'+name,{method:'HEAD',headers:{Cookie:cookie}});
 assert.equal(response.status,200,name);
 assert.equal(Number(response.headers.get('content-length')),asset.compressed,name);
}
const play=await fetch(base+'/api/play',{method:'POST',headers:{Origin:base,Cookie:cookie}});
assert.equal(play.status,200);
await new Promise((resolve,reject)=>{
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/game',['binary'],{headers:{Origin:base,Cookie:cookie}});
 const timer=setTimeout(()=>{ws.terminate();reject(Error('WebSocket timeout'));},12000);
 ws.once('open',()=>{clearTimeout(timer);ws.close();resolve();});
 ws.once('error',e=>{clearTimeout(timer);reject(e);});
});
console.log(`PASS: HTTPS, private login, ${manifest.length} assets, WSS and map ${room.map}`);
