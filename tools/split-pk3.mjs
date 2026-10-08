import { crc32 } from 'node:zlib';

// Preserve each compressed ZIP member byte-for-byte while writing smaller
// PK3s. The old QuakeJS IndexedDB layer cannot persist one ~480 MB object.
export function splitPk3(bytes,limit=32*1024*1024,include=name=>!name.startsWith('video/')){
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)
  if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Missing PK3 directory');
 const count=bytes.readUInt16LE(end+10),centralStart=bytes.readUInt32LE(end+16);
 let pos=centralStart;const entries=[];
 for(let i=0;i<count;i++){
  if(pos+46>bytes.length||bytes.readUInt32LE(pos)!==0x02014b50)throw Error('Damaged PK3 directory');
  const length=46+bytes.readUInt16LE(pos+28)+bytes.readUInt16LE(pos+30)+bytes.readUInt16LE(pos+32);
  const offset=bytes.readUInt32LE(pos+42);
  const name=bytes.subarray(pos+46,pos+46+bytes.readUInt16LE(pos+28)).toString('utf8').toLowerCase();
  if(pos+length>end || offset>=centralStart || bytes.readUInt32LE(offset)!==0x04034b50)throw Error('Damaged PK3 entry');
  entries.push({offset,name,central:bytes.subarray(pos,pos+length)});pos+=length;
 }
 if(pos!==end)throw Error('Damaged PK3 directory length');
 entries.sort((a,b)=>a.offset-b.offset);
 for(let i=0;i<entries.length;i++){
  entries[i].end=i+1<entries.length?entries[i+1].offset:centralStart;
  if(entries[i].end<=entries[i].offset)throw Error('Overlapping PK3 entries');
 }
 // Cinematic videos are not used by the shared multiplayer room.
 const selected=entries.filter(entry=>include(entry.name));
 const groups=[];let group=[],groupSize=0;
 for(const entry of selected){
  const size=entry.end-entry.offset+entry.central.length;
  if(group.length && groupSize+size>limit){groups.push(group);group=[];groupSize=0;}
  group.push(entry);groupSize+=size;
 }
 if(group.length)groups.push(group);
 return groups.map((members,index)=>{
  const locals=[],dirs=[];let localOffset=0;
  for(const entry of members){
   const member=bytes.subarray(entry.offset,entry.end);
   const central=Buffer.from(entry.central);central.writeUInt32LE(localOffset,42);
   locals.push(member);dirs.push(central);localOffset+=member.length;
  }
  const directorySize=dirs.reduce((sum,part)=>sum+part.length,0);
  const footer=Buffer.alloc(22);footer.writeUInt32LE(0x06054b50,0);
  footer.writeUInt16LE(members.length,8);footer.writeUInt16LE(members.length,10);
  footer.writeUInt32LE(directorySize,12);footer.writeUInt32LE(localOffset,16);
  const data=Buffer.concat([...locals,...dirs,footer]);
  const name=index===0?'pak0.pk3':`pak0-${String(index).padStart(2,'0')}.pk3`;
  return {name,data,checksum:crc32(data)};
 });
}
