import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { crc32 } from 'node:zlib';
import { splitPk3 } from './split-pk3.mjs';
import { pk3Entries } from './pk3.mjs';
import { storedZip } from './demo-menu.mjs';
import { validateMatch } from '../match.mjs';

const root=resolve(import.meta.dirname,'..');
const stage=resolve(root,'runtime/curated-stage');
const selected=['pro-q3tourney4','pro-q3dm6','ztn3tourney1','q3dm17','q3dm13','q3dm19'];
const selectedSet=new Set(selected);
let sourceBase=resolve(root,'base/baseq3');
let manifest=JSON.parse(await readFile(resolve(root,'public/assets/manifest.json'),'utf8'));
let catalog=JSON.parse(await readFile(resolve(root,'data/maps.json'),'utf8'));
if(manifest.length<10){
 const backup=resolve(root,'runtime/full-backup');
 manifest=JSON.parse(await readFile(resolve(backup,'assets/manifest.json'),'utf8'));
 catalog=JSON.parse(await readFile(resolve(backup,'maps.json'),'utf8'));
 sourceBase=resolve(backup,'baseq3');
}
const additions={
 ztn3tourney1:{id:'ztn3tourney1',title:'Blood Run Tournament',modes:['ffa','duel'],group:'extra'},
};
const maps=selected.map(id=>catalog.find(item=>item.id===id)||additions[id]);
if(maps.some(item=>!item))throw Error('Selected map missing from catalog');
const paths=[
 resolve(stage,'base/baseq3'),resolve(stage,'public/assets/baseq3'),
 resolve(stage,'public'),resolve(stage,'data'),resolve(stage,'runtime'),
];
for(const path of paths)await mkdir(path,{recursive:true});
const keep=name=>{
 if(name.startsWith('music/')||name.startsWith('video/')||name.startsWith('demos/'))return false;
 if(name.startsWith('maps/')&&/\.(?:bsp|aas)$/.test(name)){
  const id=basename(name).replace(/\.(?:bsp|aas)$/,'');
  return selectedSet.has(id);
 }
 if(name.startsWith('levelshots/')){
  const id=basename(name).replace(/\.[^.]+$/,'');
  return selectedSet.has(id);
 }
 return true;
};
const result=[];
async function add(name,bytes){
 const checksum=crc32(bytes);
 await writeFile(resolve(stage,'base/baseq3',name),bytes);
 await writeFile(resolve(stage,'public/assets/baseq3',checksum+'-'+name),bytes);
 result.push({name:'baseq3/'+name,compressed:bytes.length,checksum});
}
const sources=[...manifest.filter(item=>/^baseq3\/pak0(?:-\d+)?\.pk3$/.test(item.name)),...Array.from({length:8},(_,index)=>({name:'baseq3/pak'+(index+1)+'.pk3'}))];
if(sources.length<10)throw Error('Full-game PK3 source files are missing');
for(const item of sources){
 const name=basename(item.name);
 const original=await readFile(resolve(sourceBase,name));
 const parts=splitPk3(original,64*1024*1024,keep);
 if(parts.length>1)throw Error('Unexpected large source archive: '+name);
 if(parts.length)await add(name,parts[0].data);
}
const ztn=await readFile(resolve(root,'vendor/ztn3tourney1.pk3'));
if(!pk3Entries(ztn).has('maps/ztn3tourney1.bsp'))throw Error('ztn3tourney1.pk3 is missing its map');
await add('ztn3tourney1.pk3',ztn);
function arena(item){
 const types=item.modes.map(mode=>({ffa:'ffa',duel:'tourney',tdm:'team',ctf:'ctf'})[mode]).join(' ');
 return '{\nmap "'+item.id+'"\nlongname "'+item.title+'"\ntype "'+types+'"\n}\n';
}
const overlay=storedZip([
 ['scripts/arenas.txt',maps.filter(item=>item.group==='original').map(arena).join('\n')],
 ['scripts/promaps.arena',maps.filter(item=>item.id.startsWith('pro-')).map(arena).join('\n')],
 ['quake-friends-curated.txt','Six selected Quake III maps for the private browser room.\n'],
]);
await add('pak999-friends-curated.pk3',overlay);
const available=new Set();
for(const item of result){
 const bytes=await readFile(resolve(stage,'base',item.name));
 for(const name of pk3Entries(bytes).keys())if(name.startsWith('maps/')&&name.endsWith('.bsp'))available.add(basename(name,'.bsp'));
}
if(available.size!==selected.length||selected.some(id=>!available.has(id)))throw Error('Curated archives contain the wrong maps: '+[...available]);
const downloadBytes=result.reduce((sum,item)=>sum+item.compressed,0);
const content={
 edition:'curated',originalMaps:3,extraMaps:3,defaultMap:selected[0],
 mapTitle:maps[0].title,downloadMiB:Math.ceil(downloadBytes/1024/1024),
};
const prior=JSON.parse(await readFile(resolve(root,'runtime/match.json'),'utf8'));
const next=validateMatch({...prior,map:selected[0],mode:'ffa'},maps);
await writeFile(resolve(stage,'public/assets/manifest.json'),JSON.stringify(result,null,2)+'\n');
await writeFile(resolve(stage,'public/content.json'),JSON.stringify(content,null,2)+'\n');
await writeFile(resolve(stage,'data/maps.json'),JSON.stringify(maps,null,2)+'\n');
await writeFile(resolve(stage,'runtime/match.json'),JSON.stringify(next,null,2)+'\n');
console.log(JSON.stringify({maps:selected,archives:result.length,downloadMiB:content.downloadMiB,bytes:downloadBytes,stage}));
