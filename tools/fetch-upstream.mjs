import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const clientCommit = '301663bb60e292ee011bb0520ac22b5d5eaeab55';
const serverCommit = '977b188e05b239b6c48d7ecda9d04e9ca03f1578';
const files = [
 ['vendor/ioquake3.original.js', `https://raw.githubusercontent.com/mcftira/quakejs/${clientCommit}/ioquake3.js`],
 ['vendor/ioq3ded.original.cjs', `https://raw.githubusercontent.com/inolen/quakejs/${serverCommit}/build/ioq3ded.js`],
 ['public/assets/857908472-linuxq3ademo-1.11-6.x86.gz.sh', `https://raw.githubusercontent.com/mcftira/quakejs/${clientCommit}/assets/857908472-linuxq3ademo-1.11-6.x86.gz.sh`],
 ['public/assets/296843703-linuxq3apoint-1.32b-3.x86.run', `https://raw.githubusercontent.com/mcftira/quakejs/${clientCommit}/assets/296843703-linuxq3apoint-1.32b-3.x86.run`],
];
const sources = await Promise.all(files.map(async ([file,url]) => {
 const target = resolve(root,file);
 await mkdir(resolve(target,'..'),{recursive:true});
 let data; try { data = await readFile(target); } catch {
  const response = await fetch(url); if (!response.ok) throw Error(`${response.status}: ${url}`);
  data = Buffer.from(await response.arrayBuffer()); await writeFile(target,data);
 }
 console.log(`${file}: ${data.length} bytes`);
 return {file,url,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')};
}));
await writeFile(resolve(root,'vendor/sources.json'),JSON.stringify({clientCommit,serverCommit,files:sources},null,2)+'\n');
