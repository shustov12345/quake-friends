import { createRequire } from 'node:module';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');
const root=resolve(import.meta.dirname,'..');await mkdir(resolve(root,'test-output'),{recursive:true});
const {password}=JSON.parse(await readFile(resolve(root,'runtime/settings.json'),'utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const allLogs={},errors=[];
async function join(name){
 const ctx=await browser.newContext({viewport:{width:1280,height:800}});
 const page=await ctx.newPage();const logs=[];allLogs[name]=logs;
 page.on('console',m=>logs.push(m.text()));page.on('pageerror',e=>errors.push(name+': '+e.message));
 await page.goto('http://localhost:8088/');await page.locator('#nickname').fill(name);await page.locator('#password').fill(password);await page.locator('#join-button').click();
 await page.locator('#agree').waitFor({state:'visible',timeout:30000});await page.locator('#agree').click();
 const start=Date.now();while(!logs.some(l=>l.startsWith('CL_InitCGame:'))){if(Date.now()-start>60000)throw Error(name+' never reached active game: '+logs.slice(-10));await new Promise(r=>setTimeout(r,250));}
 console.log(name+' loaded the map and entered the game');return page;
}
function queryStatus(){return new Promise((resolve,reject)=>{
 const ws=new WebSocket('ws://127.0.0.1:27960',['binary']);const timer=setTimeout(()=>{ws.terminate();reject(Error('getstatus timeout'));},3000);
 ws.on('open',()=>ws.send(Buffer.concat([Buffer.from([255,255,255,255]),Buffer.from('getstatus\n')])));ws.on('message',data=>{const s=data.toString();if(s.includes('statusResponse')){clearTimeout(timer);ws.close();resolve(s);}});ws.on('error',reject);
});}
try{
 const [one,two]=await Promise.all([join('TestOne'),join('TestTwo')]);await one.waitForTimeout(1500);
 const state=await queryStatus();console.log('Server status:\n'+state);
 assert.match(state,/"TestOne"/);assert.match(state,/"TestTwo"/);assert.equal(errors.length,0,errors.join('\n'));
 await one.locator('#viewport').screenshot({path:resolve(root,'test-output/game-canvas.jpg'),type:'jpeg',quality:90});
 await one.keyboard.down('Tab');await one.waitForTimeout(250);await one.screenshot({path:resolve(root,'test-output/multiplayer.png')});await one.keyboard.up('Tab');
 // Public lobby responsiveness in an independent, unauthenticated context.
 const lobby=await browser.newPage({viewport:{width:1440,height:980}});
 await lobby.goto('http://localhost:8088/');await lobby.screenshot({path:resolve(root,'test-output/lobby.png'),fullPage:true});
 await lobby.setViewportSize({width:390,height:844});await lobby.screenshot({path:resolve(root,'test-output/mobile.png'),fullPage:true});
 assert.equal(await lobby.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true,'mobile horizontal overflow');
 await writeFile(resolve(root,'test-output/qa-results.json'),JSON.stringify({passed:true,players:['TestOne','TestTwo'],pageErrors:errors,status:state},null,2));
 console.log('PASS: two browser players share the match; no page errors; mobile layout fits.');
}finally{await writeFile(resolve(root,'test-output/multiplayer-console.json'),JSON.stringify(allLogs,null,2));await browser.close();}
