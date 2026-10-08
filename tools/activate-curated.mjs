import { mkdir, rename, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(import.meta.dirname,'..');
const stage=resolve(root,'runtime/curated-final');
const backup=resolve(root,'runtime/full-backup');
try{await access(backup);throw Error('Backup already exists: '+backup);}
catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(backup);
const moves=[
 [resolve(root,'base/baseq3'),resolve(backup,'baseq3')],
 [resolve(root,'public/assets'),resolve(backup,'assets')],
 [resolve(root,'data/maps.json'),resolve(backup,'maps.json')],
 [resolve(root,'public/content.json'),resolve(backup,'content.json')],
 [resolve(root,'runtime/match.json'),resolve(backup,'match.json')],
 [resolve(stage,'base/baseq3'),resolve(root,'base/baseq3')],
 [resolve(stage,'public/assets'),resolve(root,'public/assets')],
 [resolve(stage,'data/maps.json'),resolve(root,'data/maps.json')],
 [resolve(stage,'public/content.json'),resolve(root,'public/content.json')],
 [resolve(stage,'runtime/match.json'),resolve(root,'runtime/match.json')],
];
const completed=[];
try{
 for(const [from,to] of moves){await rename(from,to);completed.push([from,to]);}
 console.log('Curated assets activated; full files saved in '+backup);
}catch(error){
 for(const [from,to] of completed.reverse())try{await rename(to,from);}catch(rollbackError){console.error('Rollback failed for '+from+': '+rollbackError.message);}
 throw error;
}
