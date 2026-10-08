import { buildDemoMenu } from './demo-menu.mjs';
import { installFullAssets } from './full-assets.mjs';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { gunzipSync, crc32 } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const sources = JSON.parse(await readFile(resolve(root,'vendor/sources.json'),'utf8'));
for (const item of sources.files) {
 const bytes = await readFile(resolve(root,item.file));
 if (createHash('sha256').update(bytes).digest('hex') !== item.sha256) throw Error(`Checksum mismatch: ${item.file}`);
}
await mkdir(resolve(root,'base/baseq3'),{recursive:true});
await mkdir(resolve(root,'public/licenses'),{recursive:true});
await mkdir(resolve(root,'runtime'),{recursive:true});
const manifest=[];
for (const [filename,offset,checksum] of [
 ['linuxq3ademo-1.11-6.x86.gz.sh',5468,857908472],
 ['linuxq3apoint-1.32b-3.x86.run',8251,296843703]
]) {
 const bytes=await readFile(resolve(root,`public/assets/${checksum}-${filename}`));
 if(crc32(bytes)!==checksum) throw Error(`Installer CRC mismatch: ${filename}`);
 manifest.push({name:filename,compressed:bytes.length,checksum});
 const tar=gunzipSync(bytes.subarray(offset));
 for(let pos=0;pos+512<=tar.length;) {
  const name=tar.subarray(pos,pos+100).toString().split('\0')[0].replace(/^\.\//,'');
  if(!name)break;
  const size=parseInt(tar.subarray(pos+124,pos+136).toString(),8);
  if(!Number.isSafeInteger(size)||size<0||pos+512+size>tar.length)throw Error('Invalid tar entry');
  const data=tar.subarray(pos+512,pos+512+size);
  if(/^(baseq3|demoq3)\/pak[0-8]\.pk3$/.test(name)) {
   const destination=name.replace('demoq3/','baseq3/');
   await writeFile(resolve(root,'base',destination),data);
   console.log(`${destination}: ${data.length} bytes, CRC ${crc32(data)}`);
  }
  if(name==='Help/Q3A_EULA.txt')await writeFile(resolve(root,'public/licenses/quake3-demo.txt'),data);
  if(name==='Q3A_EULA.txt')await writeFile(resolve(root,'public/licenses/quake3-patch.txt'),data);
  pos+=512+Math.ceil(size/512)*512;
 }
}
await writeFile(resolve(root,'public/assets/manifest.json'),JSON.stringify(manifest,null,2));
function replaceOnce(text,from,to) {
 if(text.split(from).length!==2)throw Error(`Expected one upstream match: ${from.slice(0,80)}`);
 return text.replace(from,to);
}
let dedicated=await readFile(resolve(root,'vendor/ioq3ded.original.cjs'),'utf8');
dedicated=replaceOnce(dedicated,'if (!flags.binary) {',"if (!(typeof flags === 'boolean' ? flags : flags.binary)) {");
dedicated=replaceOnce(dedicated,'http.get(url, function (res) {',"http.get(url, {headers: {'x-qf-engine': process.env.QF_ENGINE_KEY || ''}}, function (res) {");
dedicated=replaceOnce(dedicated, "http.get(url, {headers: {'x-qf-engine': process.env.QF_ENGINE_KEY || ''}}, function (res) {", "console.log('Game asset request: '+url); var assetRequest = http.get(url, {headers: {'x-qf-engine': process.env.QF_ENGINE_KEY || ''}}, function (res) {");
dedicated=replaceOnce(dedicated, "\t\t\t});\n  \t\t},LoadingDescription:function (desc) {", "\t\t\t}); assetRequest.on('error', function(err) { console.error('Game asset request failed: '+url+': '+err.message); if (opts.onload) opts.onload(err); });\n  \t\t},LoadingDescription:function (desc) {");
dedicated=replaceOnce(dedicated, "return callback(new Error('Failed to find \"' + installer.name + '\" in manifest'))", "continue");
// Each proxied browser must keep its unique transport port. Browser-advertised
// UDP ports are not meaningful behind our local WebSocket gateway.
dedicated=replaceOnce(dedicated,`var newport = ((data[8] << 8) | data[9]);`, `var newport = peer.port;`);
await writeFile(resolve(root,'vendor/ioq3ded.cjs'),dedicated);
let client=await readFile(resolve(root,'vendor/ioquake3.original.js'),'utf8');
client=replaceOnce(client,"var url = 'ws://' + addr + ':' + port;", "var url = ENVIRONMENT_IS_NODE ? 'ws://' + addr + ':' + port : (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/game';");
// The server's internal fs_cdn must never redirect remote browsers to localhost.
client=client.replaceAll("var fs_cdn = Pointer_stringify(_Cvar_VariableString(allocate(intArrayFromString('fs_cdn'), 'i8', ALLOC_STACK)));", "var fs_cdn = location.host;");
client=client.replace("'/assets/manifest.json'", "'/assets/manifest.json?v=full-content-1'");
client=replaceOnce(client, "return callback(new Error('Failed to find \"' + installer.name + '\" in manifest'))", "continue");
client=replaceOnce(client,"SYSC.Print('initial sync completed in '","if (typeof Module['qfConfig'] === 'string') {\n            try {\n              var qfConfigDir = PATH.join(fs_homepath, 'baseq3');\n              try { FS.mkdir(qfConfigDir); } catch (e) { if (e.errno !== ERRNO_CODES.EEXIST) throw e; }\n              FS.writeFile(PATH.join(qfConfigDir, 'q.cfg'), Module['qfConfig'], {encoding: 'utf8'});\n              if (typeof Module['qfSessionConfig'] === 'string') {\n                FS.writeFile(PATH.join(qfConfigDir, 'qf-session.cfg'), Module['qfSessionConfig'], {encoding: 'utf8'});\n              }\n            } catch (configError) {\n              SYSC.Error('fatal', 'Cannot install client configs: ' + configError.message);\n              return;\n            }\n          }\n          SYSC.Print('initial sync completed in '");
await writeFile(resolve(root,'public/engine.js'),client);
await buildDemoMenu(root);
await writeFile(resolve(root,'public/content.json'),JSON.stringify({edition:'demo',originalMaps:4,extraMaps:0,defaultMap:'q3dm17',mapTitle:'The Longest Yard',downloadMiB:80},null,2)+'\n');
try {
 const retail=await readFile(resolve(root,'vendor/retail-pak0.pk3'));
 await installFullAssets(root,retail);
} catch(error) { if(error.code!=='ENOENT')throw error; }
console.log('Game files and compatible menu prepared.');
