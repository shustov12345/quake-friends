import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { crc32 } from 'node:zlib';

// A deterministic stored ZIP: PK3 is a standard ZIP archive. No original game
// archives are changed, so the upstream installer checksums remain valid.
export function storedZip(entries) {
 const local=[],central=[];let offset=0;
 for(const [name,text] of entries){
  const filename=Buffer.from(name,'utf8'),data=Buffer.from(text,'utf8'),crc=crc32(data);
  const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);
  header.writeUInt16LE(0x800,6);header.writeUInt16LE(0x21,12);
  header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(data.length,22);header.writeUInt16LE(filename.length,26);
  local.push(header,filename,data);
  const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);
  dir.writeUInt16LE(0x800,8);dir.writeUInt16LE(0x21,14);
  dir.writeUInt32LE(crc,16);dir.writeUInt32LE(data.length,20);dir.writeUInt32LE(data.length,24);dir.writeUInt16LE(filename.length,28);dir.writeUInt32LE(offset,42);
  central.push(dir,filename);offset+=header.length+filename.length+data.length;
 }
 const centralSize=central.reduce((sum,data)=>sum+data.length,0);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,...central,end]);
}
export async function buildDemoMenu(root){
 const empty='// Full-game-only arenas are unavailable in the Quake Friends demo.\n';
 const data=storedZip([
  ['scripts/promaps.arena',empty],
  ['scripts/q3tourney6_ctf.arena',empty],
  ['quake-friends-demo-menu.txt','Quake Friends demo menu overlay. Original work, CC0-1.0.\nOnly the four arenas from scripts/arenas.txt in the demo are advertised.\n']
 ]);
 const name='pak999-friends-demo.pk3',checksum=crc32(data);
 await mkdir(resolve(root,'public/assets/baseq3'),{recursive:true});
 await writeFile(resolve(root,'base/baseq3',name),data);
 await writeFile(resolve(root,'public/assets/baseq3',checksum+'-'+name),data);
 const path=resolve(root,'public/assets/manifest.json');
 const manifest=JSON.parse(await readFile(path,'utf8')).filter(x=>x.name!=='baseq3/'+name);
 manifest.push({name:'baseq3/'+name,compressed:data.length,checksum});
 await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
 console.log('Demo menu overlay: four complete demo arenas; CRC '+checksum);
}


export async function buildFullMenu(root,proMaps,ctfMap){
 const data=storedZip([
  ['scripts/promaps.arena',proMaps],
  ['scripts/q3tourney6_ctf.arena',ctfMap],
  ['quake-friends-demo-menu.txt','Quake Friends menu overlay. Original work, CC0-1.0. Full-game arena descriptions are copied from the official point release.\n']
 ]);
 const name='pak999-friends-demo.pk3',checksum=crc32(data);
 await writeFile(resolve(root,'base/baseq3',name),data);
 await writeFile(resolve(root,'public/assets/baseq3',checksum+'-'+name),data);
 const path=resolve(root,'public/assets/manifest.json');
 const manifest=JSON.parse(await readFile(path,'utf8')).filter(x=>x.name!=='baseq3/'+name);
 manifest.push({name:'baseq3/'+name,compressed:data.length,checksum});
 await writeFile(path,JSON.stringify(manifest,null,2)+'\n');
 return checksum;
}
