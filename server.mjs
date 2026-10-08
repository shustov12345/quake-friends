import http from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve, extname, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { validateMatch, serverConfig, gameModes } from './match.mjs';

const root=import.meta.dirname;
const publicRoot=resolve(root,'public');
const gameContent=JSON.parse(await readFile(resolve(publicRoot,'content.json'),'utf8'));
const maps=JSON.parse(await readFile(resolve(root,'data/maps.json'),'utf8'));
const defaultMatch=validateMatch({map:gameContent.defaultMap,mode:'ffa',maxPlayers:12,timeLimit:15,fragLimit:20},maps);
const port=Number(process.env.PORT || 8088);
const gamePort=Number(process.env.GAME_PORT || 27960);
const host=process.env.HOST || '127.0.0.1';
const sessions=new Map(), attempts=new Map(), adminSessions=new Map(), adminAttempts=new Map();
const sessionMs=12*60*60*1000;
await mkdir(resolve(root,'runtime'),{recursive:true});
const settingsFile=resolve(root,'runtime/settings.json');
let settings;
try {settings=JSON.parse(await readFile(settingsFile,'utf8'));}
catch(e){if(e.code!=='ENOENT')throw e; settings={password:randomBytes(9).toString('base64url')};await writeFile(settingsFile,JSON.stringify(settings,null,2)+'\n',{mode:0o600});}
const roomPassword=process.env.ROOM_PASSWORD || settings.password;
if(typeof roomPassword!=='string'||roomPassword.length<8)throw Error('ROOM_PASSWORD must have at least 8 characters');
const salt=randomBytes(32), passwordHash=scryptSync(roomPassword,salt,32);
if(typeof settings.adminPassword!=='string'||settings.adminPassword.length<10){
 settings.adminPassword=randomBytes(18).toString('base64url');
 await writeFile(settingsFile,JSON.stringify(settings,null,2)+'\n',{mode:0o600});
}
const adminPassword=process.env.ADMIN_PASSWORD||settings.adminPassword;
if(typeof adminPassword!=='string'||adminPassword.length<10)throw Error('ADMIN_PASSWORD must have at least 10 characters');
const adminSalt=randomBytes(32), adminHash=scryptSync(adminPassword,adminSalt,32);
const matchFile=resolve(root,'runtime/match.json');
let match;
try{match=validateMatch(JSON.parse(await readFile(matchFile,'utf8')),maps);}
catch(error){if(error.code!=='ENOENT')throw error;match=defaultMatch;await writeFile(matchFile,JSON.stringify(match,null,2)+'\n',{mode:0o600});}
const gateway=new WebSocketServer({noServer:true,maxPayload:128*1024,perMessageDeflate:false});
const engineKey=randomBytes(32).toString('hex');
let nextQport=10000;
let gameReady=false, gameProcess, stopping=false, restarting=false;
let gameLog='';

function session(req){const cookie=/(?:^|;\s*)qf_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '');const s=cookie && sessions.get(cookie[1]);return s&&s.expires>Date.now()?s:null;}
function adminSession(req){const cookie=/(?:^|;\s*)qf_admin=([A-Za-z0-9_-]+)/.exec(req.headers.cookie||'');const record=cookie&&adminSessions.get(cookie[1]);return record&&record.expires>Date.now()?record:null;}
function clientIp(req){return req.socket.remoteAddress==='127.0.0.1'&&typeof req.headers['x-forwarded-for']==='string'?req.headers['x-forwarded-for'].split(',')[0].trim():req.socket.remoteAddress;}
function sameOrigin(req){const origin=req.headers.origin;if(!origin)return false;try{return new URL(origin).host===req.headers.host;}catch{return false;}}
function json(res,status,body,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(body));}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>4096)throw Error('Request too large');}return JSON.parse(data);}
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.txt':'text/plain; charset=utf-8'};
async function serve(req,res,file){
 const absolute=resolve(publicRoot,file);
 if(!absolute.startsWith(publicRoot+sep))return json(res,404,{error:'Not found'});
 try {
  const info=await stat(absolute);if(!info.isFile())throw Error('Not a file');
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Content-Length':info.size,'Cache-Control':file==='assets/manifest.json'?'no-store':file.startsWith('assets/')?'private, max-age=86400':'no-cache'});
  if(req.method==='HEAD')return res.end();
  createReadStream(absolute).on('error',()=>res.destroy()).pipe(res);
 }catch{return json(res,404,{error:'Not found'});}
}
const app=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Permissions-Policy','microphone=(), camera=()');
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/login'&&req.method==='POST'){
   if(!sameOrigin(req))return json(res,403,{error:'Недопустимый источник запроса.'});
   // A small room: bounded global/per-address budget also works behind a TLS proxy.
   const ip=req.socket.remoteAddress==='127.0.0.1'&&typeof req.headers['x-forwarded-for']==='string'?req.headers['x-forwarded-for'].split(',')[0].trim():req.socket.remoteAddress;const now=Date.now();
   const record=attempts.get(ip)||{count:0,until:now+60000};if(record.until<now){record.count=0;record.until=now+60000;}
   if(++record.count>30){attempts.set(ip,record);return json(res,429,{error:'Слишком много попыток. Подождите минуту.'});}attempts.set(ip,record);
   const data=await body(req);
   if(typeof data.password!=='string'||data.password.length>128||!timingSafeEqual(passwordHash,scryptSync(data.password,salt,32)))return json(res,401,{error:'Неверный пароль комнаты.'});
   if(sessions.size>=500)return json(res,503,{error:'Комната перегружена. Попробуйте позже.'});
   const id=randomBytes(32).toString('base64url');sessions.set(id,{expires:now+sessionMs});
   const secure=req.headers['x-forwarded-proto']==='https';
   return json(res,200,{ok:true},{'Set-Cookie':`qf_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure?'; Secure':''}`});
  }
  if(url.pathname==='/api/admin/login'&&req.method==='POST'){
   if(!sameOrigin(req))return json(res,403,{error:'Недопустимый источник запроса.'});
   const ip=clientIp(req),now=Date.now();
   const record=adminAttempts.get(ip)||{count:0,until:now+60000};if(record.until<now){record.count=0;record.until=now+60000;}
   if(++record.count>10){adminAttempts.set(ip,record);return json(res,429,{error:'Слишком много попыток. Подождите минуту.'});}adminAttempts.set(ip,record);
   const data=await body(req);
   if(typeof data.password!=='string'||data.password.length>128||!timingSafeEqual(adminHash,scryptSync(data.password,adminSalt,32)))return json(res,401,{error:'Неверный пароль администратора.'});
   if(adminSessions.size>=50)return json(res,503,{error:'Слишком много админских сессий.'});
   const id=randomBytes(32).toString('base64url');adminSessions.set(id,{expires:now+sessionMs});
   const secure=req.headers['x-forwarded-proto']==='https';
   return json(res,200,{ok:true},{'Set-Cookie':'qf_admin='+id+'; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=43200'+(secure?'; Secure':'')});
  }
  if(url.pathname==='/api/admin/status'&&req.method==='GET'){
   if(!adminSession(req))return json(res,401,{authenticated:false});
   return json(res,200,{ready:gameReady,restarting,players:gateway.clients.size,match,maps,modes:Object.entries(gameModes).filter(([id])=>maps.some(map=>map.modes.includes(id))).map(([id,value])=>({id,label:value.label}))});
  }
  if(url.pathname==='/api/admin/apply'&&req.method==='POST'){
   if(!sameOrigin(req)||!adminSession(req))return json(res,403,{error:'Доступ запрещён.'});
   if(restarting)return json(res,409,{error:'Матч уже перезапускается.'});
   let next;
   try{next=validateMatch(await body(req),maps);}catch(error){return json(res,400,{error:error.message});}
   restarting=true;
   try{
    const temp=matchFile+'.next';
    await writeFile(temp,JSON.stringify(next,null,2)+'\n',{mode:0o600});
    await rename(temp,matchFile);
    match=next;
   }catch(error){restarting=false;throw error;}
   json(res,202,{ok:true,message:'Настройки сохранены. Игровой сервер перезапускается.'});
   void restartGame().catch(error=>{console.error('Game restart failed:',error);shutdown();});
   return;
  }
  if(url.pathname==='/api/admin/logout'&&req.method==='POST'){
   if(!sameOrigin(req))return json(res,403,{error:'Недопустимый источник запроса.'});
   const cookie=/(?:^|;\s*)qf_admin=([A-Za-z0-9_-]+)/.exec(req.headers.cookie||'');if(cookie)adminSessions.delete(cookie[1]);
   return json(res,200,{ok:true},{'Set-Cookie':'qf_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0'});
  }
  if(url.pathname==='/api/match'&&req.method==='GET')
   return json(res,200,{ready:gameReady,restarting,players:gateway.clients.size,maxPlayers:match.maxPlayers,map:match.map,mapTitle:maps.find(item=>item.id===match.map).title,mode:match.mode,modeTitle:gameModes[match.mode].label,fragLimit:match.fragLimit,timeLimit:match.timeLimit});
  if(url.pathname==='/api/status'){
   if(!session(req))return json(res,401,{authenticated:false});
   return json(res,200,{ready:gameReady,restarting,players:gateway.clients.size,maxPlayers:match.maxPlayers,map:match.map,mapTitle:maps.find(item=>item.id===match.map).title,mode:match.mode,fragLimit:match.fragLimit,timeLimit:match.timeLimit});
  }
  if(url.pathname==='/api/logout'&&req.method==='POST'){
   if(!sameOrigin(req))return json(res,403,{error:'Forbidden'});
   const match=/(?:^|;\s*)qf_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie||'');if(match)sessions.delete(match[1]);
   return json(res,200,{ok:true},{'Set-Cookie':'qf_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});
  }
  if(url.pathname==='/api/play'&&req.method==='POST'){
   if(!session(req)||!sameOrigin(req))return json(res,403,{error:'Forbidden'});
   if(!gameReady)return json(res,503,{error:'Сервер ещё запускается.'});
   if(nextQport>65535)return json(res,503,{error:'Перезапустите сервер комнаты.'});
   return json(res,200,{qport:nextQport++});
  }
  if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed'});
  if(url.pathname==='/'||url.pathname==='/index.html')return serve(req,res,'index.html');
  if(url.pathname==='/admin'||url.pathname==='/admin/')return serve(req,res,'admin.html');
  if(['/admin.js','/admin.css'].includes(url.pathname))return serve(req,res,url.pathname.slice(1));
  if(['/style.css','/app.js','/favicon.svg','/arena.jpg','/content.json','/licenses/quake3-demo.txt','/licenses/quake3-patch.txt'].includes(url.pathname))return serve(req,res,url.pathname.slice(1));
  const engineRequest=url.pathname.startsWith('/assets/')&&req.headers['x-qf-engine']===engineKey;
  if(!session(req)&&!engineRequest)return json(res,401,{error:'Войдите в комнату.'});
  if(url.pathname==='/healthz')return json(res,gameReady?200:503,{ready:gameReady});
  if(url.pathname==='/engine.js'||/^\/assets\/(?:baseq3\/)?[A-Za-z0-9._-]+$/.test(url.pathname))return serve(req,res,url.pathname.slice(1));
  return json(res,404,{error:'Not found'});
 }catch(error){console.error('HTTP request failed:',error.message);if(!res.headersSent)json(res,400,{error:'Не удалось обработать запрос.'});else res.end();}
});
app.requestTimeout=30000;app.headersTimeout=10000;
app.on('upgrade',(req,socket,head)=>{
 if(req.url!=='/game'||!sameOrigin(req)||!session(req)||!gameReady||gateway.clients.size>=match.maxPlayers){socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;}
 gateway.handleUpgrade(req,socket,head,client=>{
  const upstream=new WebSocket(`ws://127.0.0.1:${gamePort}`,['binary'],{maxPayload:128*1024,perMessageDeflate:false});
  const queue=[];let queued=0;
  client.on('message',(data,isBinary)=>{if(!isBinary)return client.close(1003);if(upstream.readyState===WebSocket.OPEN){if(upstream.bufferedAmount>1024*1024)return client.close(1013);upstream.send(data,{binary:true});}else{queued+=data.length;if(queued>128*1024)return client.close(1009);queue.push(data);}});
  upstream.on('open',()=>{for(const data of queue)upstream.send(data,{binary:true});queue.length=0;});
  upstream.on('message',data=>{if(client.readyState===WebSocket.OPEN){if(client.bufferedAmount>1024*1024)return client.close(1013);client.send(data,{binary:true});}});
  client.on('error',()=>upstream.close());upstream.on('error',()=>client.close(1011));
  client.on('close',()=>upstream.close());upstream.on('close',()=>client.close());
 });
});
await new Promise((resolve,reject)=>{app.once('error',reject);app.listen(port,host,resolve);});
async function startGame(){
 gameReady=false;gameLog='';
 await writeFile(resolve(root,'base/baseq3/server.cfg'),serverConfig(match));
 const child=spawn(process.execPath,[resolve(root,'vendor/ioq3ded.cjs'),'+set','fs_game','baseq3','+set','dedicated','1','+set','net_ip','127.0.0.1','+set','net_port',String(gamePort),'+set','fs_cdn',(host==='0.0.0.0'?'127.0.0.1':host)+':'+port,'+exec','server.cfg'],{cwd:root,windowsHide:true,env:{...process.env,QF_ENGINE_KEY:engineKey},stdio:['pipe','pipe','pipe']});
 gameProcess=child;
 await writeFile(resolve(root,'runtime/game.pid'),String(child.pid));
 const logStream=(await import('node:fs')).createWriteStream(resolve(root,'runtime/game.log'),{flags:'w'});
 return new Promise((resolveReady,rejectReady)=>{
  let settled=false;
  const timeout=setTimeout(()=>finish(Error('Game engine did not become ready in 30 seconds')),30000);
  function finish(error){if(settled)return;settled=true;clearTimeout(timeout);if(error)rejectReady(error);else resolveReady();}
  for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{
   logStream.write(chunk);gameLog=(gameLog+chunk).slice(-16000);
   if(gameLog.includes('==== ShutdownGame ===='))gameReady=false;
   if(gameLog.includes('InitGame:')&&/------ Server Initialization Complete ------|-----------------------------------/.test(gameLog)){gameReady=true;finish();}
  });
  child.on('error',error=>{finish(error);if(gameProcess===child)shutdown();});
  child.on('exit',code=>{
   logStream.end();console.log('Game engine stopped ('+code+'). See runtime/game.log');
   if(gameProcess===child){gameReady=false;finish(Error('Game engine stopped: '+code));if(!stopping)shutdown();}
  });
 });
}
async function restartGame(){
 gameReady=false;
 for(const client of gateway.clients)client.close(1012,'Match changed');
 const previous=gameProcess;
 if(previous){
  gameProcess=undefined;
  await new Promise(resolveStopped=>{
   if(previous.exitCode!==null)return resolveStopped();
   const timeout=setTimeout(()=>{previous.kill('SIGKILL');resolveStopped();},5000);
   previous.once('exit',()=>{clearTimeout(timeout);resolveStopped();});
   previous.kill();
  });
 }
 await startGame();
 restarting=false;
}
await startGame();
setInterval(()=>{const now=Date.now();for(const [id,s]of sessions)if(s.expires<now)sessions.delete(id);for(const [id,s]of adminSessions)if(s.expires<now)adminSessions.delete(id);for(const [ip,a]of attempts)if(a.until<now)attempts.delete(ip);for(const [ip,a]of adminAttempts)if(a.until<now)adminAttempts.delete(ip);},60000).unref();
console.log(`Quake Friends: http://localhost:${port}`);
console.log('Room password is in runtime/settings.json. Server is private and unlisted.');
await writeFile(resolve(root,'runtime/server.pid'),String(process.pid));

function shutdown(){if(stopping)return;stopping=true;gameReady=false;for(const client of gateway.clients)client.terminate();gateway.close();gameProcess?.kill();app.close();setTimeout(()=>process.exit(0),1000).unref();}
process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
