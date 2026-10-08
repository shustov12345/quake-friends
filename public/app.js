const $=id=>document.getElementById(id);
fetch('/content.json',{cache:'no-store'}).then(r=>r.json()).then(info=>{
 if(info.edition==='curated'){
  $('edition-label').textContent='QUAKE III ARENA · 6 КАРТ';
  $('license-link').textContent='Условия обновления';$('license-link').href='/licenses/quake3-patch.txt';
  $('download-note').textContent='6 выбранных карт. Первый вход — около '+info.downloadMiB+' МБ. Потом файлы сохранятся в браузере. Нужны компьютер, мышь и клавиатура.';
 }
 if(info.edition==='full'){
  $('edition-label').textContent='QUAKE III ARENA · FULL';
  $('license-link').textContent='Условия обновления';$('license-link').href='/licenses/quake3-patch.txt';
  $('download-note').textContent=`Все ${info.originalMaps} оригинальных карт и ${info.extraMaps} карт из обновления. Первый вход — около ${info.downloadMiB} МБ. Потом файлы сохранятся в браузере. Нужны компьютер, мышь и клавиатура.`;
 }
}).catch(()=>{});
fetch('/api/match',{cache:'no-store'}).then(r=>r.json()).then(info=>{
 $('map-label').textContent=info.map.toUpperCase()+' · '+info.modeTitle.toUpperCase();
 $('max-players-label').textContent=info.maxPlayers;
 $('score-limit-label').textContent=info.fragLimit;
 $('score-type-label').textContent=info.mode==='ctf'?'захватов':'фрагов';
 $('time-limit-label').textContent=info.timeLimit;
}).catch(()=>{});
let authenticated=false;
const storedName=localStorage.getItem('qf-name');if(storedName)$('nickname').value=storedName;
function message(text,error=false){$('form-message').textContent=text;$('form-message').classList.toggle('error',error);}
async function status(){const response=await fetch('/api/status',{cache:'no-store'});if(!response.ok)return null;return response.json();}
function signedIn(){authenticated=true;$('password-field').hidden=true;$('password').required=false;$('connection-label').textContent='Ты среди своих';}
status().then(data=>{if(data){signedIn();message(data.ready?'Свои на месте. Ракетницы тоже. Заходи.':'Сервер запускается. Подожди несколько секунд.');}}).catch(()=>{});
$('join-form').addEventListener('submit',async event=>{
 event.preventDefault();const nickname=$('nickname').value.trim();
 if(!/^[A-Za-z0-9 _.-]{1,20}$/.test(nickname)){message('Ник: 1–20 латинских букв, цифр, пробел, точка, дефис или _.',true);return;}
 $('join-button').disabled=true;
 try{
  if(!authenticated){const response=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('password').value})});const data=await response.json();if(!response.ok)throw Error(data.error);signedIn();$('password').value='';}
  const info=await status();if(!info){authenticated=false;$('password-field').hidden=false;$('password').required=true;throw Error('Время входа истекло. Введи пароль ещё раз.');}
  if(!info.ready)throw Error('Сервер ещё запускается. Попробуй через несколько секунд.');
  const playResponse=await fetch('/api/play',{method:'POST'});const play=await playResponse.json();if(!playResponse.ok)throw Error(play.error);
  localStorage.setItem('qf-name',nickname);startGame(nickname,play.qport);
 }catch(error){message(error.message||'Не удалось подключиться к комнате.',true);$('join-button').disabled=false;}
});
function fail(text){$('boot-message').hidden=true;$('game-error').hidden=false;$('game-error').querySelector('p').textContent=text;}
async function startGame(nickname,qport){
 $('lobby').hidden=true;$('game-shell').hidden=false;$('player-label').textContent=nickname;
 let configText='';
 try{
  const response=await fetch('/assets/baseq3/q.cfg',{cache:'no-store'});
  if(response.ok)configText=await response.text();
  else if(response.status!==404)throw Error('Config request failed: '+response.status);
 }catch(error){fail('Не удалось загрузить игровой конфиг. Обнови страницу.');return;}
 window.ioq3={noInitialRun:true,qfConfig:configText,qfSessionConfig:`set name ${JSON.stringify(nickname)}\nset s_volume "0.2"\n`,print:text=>console.log(text),printErr:text=>console.warn(text)};
 const script=document.createElement('script');script.src='/engine.js';script.onerror=()=>fail('Не удалось загрузить движок. Обнови страницу.');
 script.onload=()=>{
  try{
   ioq3.viewport=$('viewport-frame');ioq3.elementPointerLock=true;
   ioq3.callMain(['+set','net_qport',String(qport),'+set','fs_cdn',location.host,'+set','name',nickname,'+set','cl_allowDownload','0','+set','r_mode','-1','+set','r_customwidth','1280','+set','r_customheight','720','+set','s_volume','0.2','+set','cg_fov','120','+set','cl_maxpackets','30','+set','rate','25000','+exec','qf-session.cfg','+connect',location.hostname+':'+(location.port||(location.protocol==='https:'?'443':'80'))]);
   $('boot-message').hidden=true;
   window.addEventListener('resize',()=>{if(ioq3.canvas&&!document.fullscreenElement)ioq3.setCanvasSize(ioq3.viewport.clientWidth,ioq3.viewport.clientHeight);});
  }catch(error){if(error?.name!=='ExitStatus')fail('Ошибка запуска игры: '+(error.message||String(error)));}
 };
 document.body.appendChild(script);
}
$('fullscreen').onclick=async()=>{try{await $('viewport-frame').requestFullscreen();ioq3.canvas?.requestPointerLock();}catch{}};
$('leave').onclick=$('retry').onclick=()=>location.reload();
