import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { installFullAssets } from './full-assets.mjs';

const source=process.argv[2];
if(!source)throw Error('Usage: node tools/import-full.mjs <path-to-full-baseq3/pak0.pk3>');
const root=resolve(import.meta.dirname,'..');
const bytes=await readFile(source);
if(bytes.length<100_000_000)throw Error('This is not a full Quake III pak0.pk3');
await installFullAssets(root,bytes);
await mkdir(resolve(root,'vendor'),{recursive:true});
await writeFile(resolve(root,'vendor/retail-pak0.pk3'),bytes);
console.log('Full game data imported. Restart the server and reload the browser page.');
