import { inflateRawSync, crc32 } from 'node:zlib';

// Read only ZIP's directory and selected entries. We never unpack arbitrary
// paths from a user-supplied PK3 into the project.
export function pk3Entries(bytes) {
 let end=-1;
 for (let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) {
  if (bytes.readUInt32LE(i)===0x06054b50) { end=i; break; }
 }
 if (end<0) throw Error('Not a ZIP/PK3 archive');
 const count=bytes.readUInt16LE(end+10),size=bytes.readUInt32LE(end+12);
 let pos=bytes.readUInt32LE(end+16);
 if (pos+size>end || count===0) throw Error('Invalid PK3 directory');
 const entries=new Map();
 for(let i=0;i<count;i++) {
  if(pos+46>bytes.length || bytes.readUInt32LE(pos)!==0x02014b50) throw Error('Invalid PK3 entry');
  const method=bytes.readUInt16LE(pos+10),checksum=bytes.readUInt32LE(pos+16);
  const compressed=bytes.readUInt32LE(pos+20),uncompressed=bytes.readUInt32LE(pos+24);
  const nameLen=bytes.readUInt16LE(pos+28),extra=bytes.readUInt16LE(pos+30),comment=bytes.readUInt16LE(pos+32);
  const offset=bytes.readUInt32LE(pos+42);
  const name=bytes.subarray(pos+46,pos+46+nameLen).toString('utf8').toLowerCase();
  if(pos+46+nameLen+extra+comment>bytes.length || entries.has(name)) throw Error('Invalid PK3 names');
  entries.set(name,{method,checksum,compressed,uncompressed,offset});
  pos+=46+nameLen+extra+comment;
 }
 return entries;
}

export function pk3Read(bytes,entries,name) {
 const entry=entries.get(name.toLowerCase());
 if(!entry || entry.uncompressed>2*1024*1024) throw Error('Missing or oversized PK3 entry: '+name);
 const pos=entry.offset;
 if(pos+30>bytes.length || bytes.readUInt32LE(pos)!==0x04034b50) throw Error('Invalid PK3 file header: '+name);
 const start=pos+30+bytes.readUInt16LE(pos+26)+bytes.readUInt16LE(pos+28);
 if(start+entry.compressed>bytes.length) throw Error('Truncated PK3 entry: '+name);
 const payload=bytes.subarray(start,start+entry.compressed);
 const data=entry.method===0?payload:entry.method===8?inflateRawSync(payload):null;
 if(!data || data.length!==entry.uncompressed || crc32(data)!==entry.checksum) throw Error('Damaged PK3 entry: '+name);
 return data;
}
