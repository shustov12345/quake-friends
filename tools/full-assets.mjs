import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildFullMenu } from './demo-menu.mjs';
import { pk3Entries, pk3Read } from './pk3.mjs';
import { splitPk3 } from './split-pk3.mjs';

export async function installFullAssets(root,bytes){
 const entries=pk3Entries(bytes);
 const required=[...Array.from({length:20},(_,n)=>`maps/q3dm${n}.bsp`),
  ...Array.from({length:6},(_,n)=>`maps/q3tourney${n+1}.bsp`),
  ...Array.from({length:4},(_,n)=>`maps/q3ctf${n+1}.bsp`)];
 for(const name of required)if(!entries.has(name))throw Error('This pak0 is missing '+name);
 const arenas=pk3Read(bytes,entries,'scripts/arenas.txt').toString('utf8');
 if(!arenas.includes('"q3tourney4"'))throw Error('Full arena list is missing q3tourney4');
 const patch6=await readFile(resolve(root,'base/baseq3/pak6.pk3'));
 const patch2=await readFile(resolve(root,'base/baseq3/pak2.pk3'));
 const proMaps=pk3Read(patch6,pk3Entries(patch6),'scripts/promaps.arena').toString('utf8');
 const ctfMap=pk3Read(patch2,pk3Entries(patch2),'scripts/q3tourney6_ctf.arena').toString('utf8');
 const parts=splitPk3(bytes);
 await mkdir(resolve(root,'public/assets/baseq3'),{recursive:true});
 const manifestPath=resolve(root,'public/assets/manifest.json');
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'))
  .filter(item=>item.name!=='linuxq3ademo-1.11-6.x86.gz.sh' && !/^baseq3\/pak0(?:-friends-\d+)?\.pk3$/.test(item.name));
 for(const part of parts){
  const name='baseq3/'+part.name;
  await writeFile(resolve(root,'base',name),part.data);
  await writeFile(resolve(root,'public/assets/baseq3',part.checksum+'-'+part.name),part.data);
  manifest.push({name,compressed:part.data.length,checksum:part.checksum});
 }
 await writeFile(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 await buildFullMenu(root,proMaps,ctfMap);
 const completeManifest=JSON.parse(await readFile(manifestPath,'utf8'));
 const content={edition:'full',originalMaps:required.length,extraMaps:5,
  defaultMap:'q3tourney4',mapTitle:'Vertical Vengeance',downloadMiB:Math.ceil(completeManifest.reduce((sum,item)=>sum+item.compressed,0)/1024/1024)};
 await writeFile(resolve(root,'public/content.json'),JSON.stringify(content,null,2)+'\n');
 console.log(`Full Quake III: ${required.length} original maps plus 5 update maps; pak0 split into ${parts.length} archives`);
 return content;
}
