const $=id=>document.getElementById(id);
let catalog=[],currentMatch=null,applying=false;
function notice(id,text,error=false){const target=$(id);target.textContent=text;target.classList.toggle('error',error);}
async function request(path,options={}){
 const response=await fetch(path,{cache:'no-store',...options});
 let data;try{data=await response.json();}catch{data={error:'Нет ответа от сервера.'};}
 if(!response.ok)throw Object.assign(Error(data.error||'Ошибка запроса.'),{status:response.status});
 return data;
}
function fillModes(modes){$('mode').replaceChildren(...modes.map(item=>new Option(item.label,item.id)));}
function fillMaps(preferred){
 const mode=$('mode').value,available=catalog.filter(item=>item.modes.includes(mode));
 const select=$('map');select.replaceChildren();
 for(const [group,label] of [['original','Оригинальные карты'],['extra','Карты обновления']]){
  const members=available.filter(item=>item.group===group);
  if(!members.length)continue;
  const options=document.createElement('optgroup');options.label=label;
  for(const item of members)options.append(new Option(item.id.toUpperCase()+' — '+item.title,item.id));
  select.append(options);
 }
 if(available.some(item=>item.id===preferred))select.value=preferred;
 $('map-count').textContent=available.length+' карт доступны для этого режима';
 $('limit-label').textContent=mode==='ctf'?'Лимит захватов флага':'Лимит фрагов';
 $('max-players').min=mode==='ctf'?'4':'2';
 if(Number($('max-players').value)<Number($('max-players').min))$('max-players').value=$('max-players').min;
}
function render(data,fill=false){
 catalog=data.maps;
 currentMatch=data.match;
 $('current-match').textContent=data.match.map.toUpperCase()+' · '+(data.modes.find(item=>item.id===data.match.mode)?.label||data.match.mode);
 $('player-count').textContent='Игроки: '+data.players+' / '+data.match.maxPlayers;
 $('server-state').textContent='Состояние: '+(data.restarting?'перезапускается':data.ready?'готов':'запускается');
 if(fill){
  fillModes(data.modes);$('mode').value=data.match.mode;
  $('max-players').value=data.match.maxPlayers;
  $('time-limit').value=data.match.timeLimit;
  $('frag-limit').value=data.match.fragLimit;
  fillMaps(data.match.map);
 }
}
async function status(fill=false){
 try{
  const data=await request('/api/admin/status');
  $('login-form').hidden=true;$('settings-form').hidden=false;
  render(data,fill);
  if(applying){
   if(data.ready&&!data.restarting){
    applying=false;$('apply-button').disabled=false;
    render(data,true);notice('settings-message','Матч готов. Игроки могут зайти снова.');
   }else notice('settings-message','Перезапускаем матч…');
  }
 }catch(error){
  if(error.status===401){$('login-form').hidden=false;$('settings-form').hidden=true;applying=false;}
  else notice('login-message',error.message,true);
 }
}
$('login-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const button=event.submitter;button.disabled=true;
 try{
  await request('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:$('admin-password').value})});
  $('admin-password').value='';notice('login-message','');await status(true);
 }catch(error){notice('login-message',error.message,true);}
 finally{button.disabled=false;}
});
$('mode').addEventListener('change',()=>fillMaps($('map').value));
$('settings-form').addEventListener('submit',async event=>{
 event.preventDefault();
 const next={map:$('map').value,mode:$('mode').value,maxPlayers:Number($('max-players').value),timeLimit:Number($('time-limit').value),fragLimit:Number($('frag-limit').value)};
 $('apply-button').disabled=true;
 try{
  await request('/api/admin/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(next)});
  applying=true;notice('settings-message','Настройки сохранены. Перезапускаем матч…');
 }catch(error){$('apply-button').disabled=false;notice('settings-message',error.message,true);}
});
$('logout').addEventListener('click',async()=>{await request('/api/admin/logout',{method:'POST'});location.reload();});
status(true);
setInterval(()=>{if(!$('settings-form').hidden)status(false);},2500);
