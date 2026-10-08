import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { mergePk3 } from './merge-pk3.mjs';
import { splitPk3 } from './split-pk3.mjs';
import { pk3Entries } from './pk3.mjs';

const root=resolve(import.meta.dirname,'..');
const stage=resolve(root,'runtime/curated-stage');
const final=resolve(root,'runtime/curated-final');
const manifest=JSON.parse(await readFile(resolve(stage,'public/assets/manifest.json'),'utf8'));
const archives=[];
for(const item of manifest)archives.push(await readFile(resolve(stage,'base',item.name)));
const combined=mergePk3(archives);
const parts=splitPk3(combined,30*1024*1024,()=>true);
for(const path of [
 resolve(final,'base/baseq3'),resolve(final,'public/assets/baseq3'),
 resolve(final,'public'),resolve(final,'data'),resolve(final,'runtime'),
])await mkdir(path,{recursive:true});
const output=[];
const mapIds=new Set();
for(const part of parts){
 const entries=pk3Entries(part.data);
 for(const name of entries.keys())if(name.startsWith('maps/')&&name.endsWith('.bsp'))mapIds.add(basename(name,'.bsp'));
 await writeFile(resolve(final,'base/baseq3',part.name),part.data);
 await writeFile(resolve(final,'public/assets/baseq3',part.checksum+'-'+part.name),part.data);
 output.push({name:'baseq3/'+part.name,compressed:part.data.length,checksum:part.checksum});
}
const catalog=JSON.parse(await readFile(resolve(stage,'data/maps.json'),'utf8'));
if(mapIds.size!==6||catalog.some(map=>!mapIds.has(map.id)))throw Error('Unexpected map set: '+[...mapIds]);
const content=JSON.parse(await readFile(resolve(stage,'public/content.json'),'utf8'));
content.downloadMiB=Math.ceil(output.reduce((sum,item)=>sum+item.compressed,0)/1048576);
await writeFile(resolve(final,'public/assets/manifest.json'),JSON.stringify(output,null,2)+'\n');
await writeFile(resolve(final,'public/content.json'),JSON.stringify(content,null,2)+'\n');
await copyFile(resolve(stage,'data/maps.json'),resolve(final,'data/maps.json'));
await copyFile(resolve(stage,'runtime/match.json'),resolve(final,'runtime/match.json'));
console.log(JSON.stringify({archives:output.length,downloadMiB:content.downloadMiB,maps:[...mapIds],final}));
