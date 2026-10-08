import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';

const base='http://localhost:8088';
const {password,adminPassword}=JSON.parse(await readFile(new URL('../runtime/settings.json',import.meta.url),'utf8'));
let cookie;

test('private room protects API, engine, game data, and files',async()=>{
 for(const path of ['/api/status','/api/admin/status','/engine.js','/assets/manifest.json','/runtime/settings.json','/server.mjs']){
  const response=await fetch(base+path);assert.equal(response.status,401,path);
 }
 const response=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password:'wrong-password'})});
 assert.equal(response.status,401);
});

test('cross-origin login is denied',async()=>{
 const response=await fetch(base+'/api/login',{method:'POST',headers:{Origin:'https://example.com','Content-Type':'application/json'},body:JSON.stringify({password})});
 assert.equal(response.status,403);
});

test('valid room login can access only the five compact game archives',async()=>{
 const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})});
 assert.equal(login.status,200);
 const setCookie=login.headers.get('set-cookie');
 assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
 cookie=setCookie.split(';')[0];
 const status=await fetch(base+'/api/status',{headers:{Cookie:cookie}});
 assert.equal(status.status,200);
 const room=await status.json();
 assert.equal(room.ready,true);
 assert.ok(['pro-q3tourney4','pro-q3dm6','ztn3tourney1','q3dm17','q3dm13','q3dm19'].includes(room.map));
 const response=await fetch(base+'/assets/manifest.json',{headers:{Cookie:cookie}});
 assert.equal(response.status,200);
 const manifest=await response.json();
 assert.equal(manifest.length,5);
 assert.ok(manifest.every(item=>/^baseq3\/pak0(?:-\d+)?\.pk3$/.test(item.name)));
 assert.ok(manifest.every(item=>item.compressed<32*1024*1024));
 const bytes=manifest.reduce((sum,item)=>sum+item.compressed,0);
 assert.ok(bytes>130*1024*1024&&bytes<150*1024*1024);
 const first=manifest[0];
 const head=await fetch(base+'/assets/baseq3/'+first.checksum+'-pak0.pk3',{method:'HEAD',headers:{Cookie:cookie}});
 assert.equal(head.status,200);
 assert.equal(Number(head.headers.get('content-length')),first.compressed);
 assert.equal((await fetch(base+'/api/admin/status',{headers:{Cookie:cookie}})).status,401);
});

test('admin password and cookie are separate from the room',async()=>{
 const bad=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password})});
 assert.equal(bad.status,401);
 const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({password:adminPassword})});
 assert.equal(login.status,200);
 const setCookie=login.headers.get('set-cookie');
 assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);
 const status=await fetch(base+'/api/admin/status',{headers:{Cookie:setCookie.split(';')[0]}});
 assert.equal(status.status,200);
 const admin=await status.json();
 assert.equal(admin.maps.length,6);
 assert.deepEqual(admin.modes.map(mode=>mode.id),['ffa','duel','tdm']);
});

function wsResult(headers){return new Promise((resolve,reject)=>{
 const ws=new WebSocket(base.replace('http:','ws:')+'/game',['binary'],{headers});
 const timeout=setTimeout(()=>{ws.terminate();reject(Error('WS timeout'));},3000);
 ws.once('unexpected-response',(_,response)=>{clearTimeout(timeout);resolve(response.statusCode);});
 ws.once('open',()=>{clearTimeout(timeout);ws.close();resolve(101);});
 ws.once('error',()=>{});
});}
test('WebSocket requires authentication and same origin',async()=>{
 assert.equal(await wsResult({Origin:base}),403);
 assert.equal(await wsResult({Origin:'https://example.com',Cookie:cookie}),403);
 assert.equal(await wsResult({Origin:base,Cookie:cookie}),101);
});

test('private files never become available after login',async()=>{
 for(const path of ['/runtime/settings.json','/server.mjs','/.env','/assets/..%2Fruntime%2Fsettings.json']){
  const response=await fetch(base+path,{headers:{Cookie:cookie}});assert.equal(response.status,404,path);
 }
});
