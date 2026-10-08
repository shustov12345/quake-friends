// Merge ordinary PK3/ZIP archives without recompressing their members.
// Later archives override earlier files with the same path, as in Quake III.
function members(bytes){
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(bytes.readUInt32LE(i)===0x06054b50){end=i;break;}
 if(end<0)throw Error('Missing ZIP directory');
 const count=bytes.readUInt16LE(end+10),start=bytes.readUInt32LE(end+16);
 let pos=start;
 const entries=[];
 for(let i=0;i<count;i++){
  if(bytes.readUInt32LE(pos)!==0x02014b50)throw Error('Invalid ZIP directory');
  const size=46+bytes.readUInt16LE(pos+28)+bytes.readUInt16LE(pos+30)+bytes.readUInt16LE(pos+32);
  const name=bytes.subarray(pos+46,pos+46+bytes.readUInt16LE(pos+28)).toString('utf8').toLowerCase();
  const offset=bytes.readUInt32LE(pos+42);
  if(offset>=start||bytes.readUInt32LE(offset)!==0x04034b50)throw Error('Invalid ZIP member');
  entries.push({name,offset,central:bytes.subarray(pos,pos+size)});
  pos+=size;
 }
 if(pos!==end)throw Error('Invalid ZIP directory size');
 entries.sort((a,b)=>a.offset-b.offset);
 for(let i=0;i<entries.length;i++){
  const next=i+1<entries.length?entries[i+1].offset:start;
  entries[i].local=bytes.subarray(entries[i].offset,next);
 }
 return entries;
}
export function mergePk3(archives){
 const files=new Map();
 for(const archive of archives)for(const item of members(archive)){
  files.delete(item.name);files.set(item.name,item);
 }
 if(files.size>65535)throw Error('Too many ZIP members');
 const local=[],central=[];
 let offset=0,centralSize=0;
 for(const item of files.values()){
  const directory=Buffer.from(item.central);
  directory.writeUInt32LE(offset,42);
  local.push(item.local);central.push(directory);
  offset+=item.local.length;centralSize+=directory.length;
 }
 const footer=Buffer.alloc(22);
 footer.writeUInt32LE(0x06054b50,0);
 footer.writeUInt16LE(files.size,8);footer.writeUInt16LE(files.size,10);
 footer.writeUInt32LE(centralSize,12);footer.writeUInt32LE(offset,16);
 return Buffer.concat([...local,...central,footer]);
}
