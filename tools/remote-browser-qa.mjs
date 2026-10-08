import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const root=resolve(import.meta.dirname,'..');
const base='https://201.34.158.52/';
const {password}=JSON.parse(await readFile(resolve(root,'runtime/settings.json'),'utf8'));
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required']});
const context=await browser.newContext({viewport:{width:1280,height:800}});
const page=await context.newPage();
const logs=[],errors=[];
page.on('console',m=>logs.push(m.text()));
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base);
 await page.waitForFunction(()=>document.getElementById('edition-label').textContent.includes('6 КАРТ'),{timeout:10000});
 await page.locator('#nickname').fill('RemoteTest');
 await page.locator('#password').fill(password);
 await page.locator('#join-button').click();
 try{await page.locator('#agree').waitFor({state:'visible',timeout:3000});await page.locator('#agree').click();}catch{}

 const started=Date.now();let lastReport=started;
 while(!logs.some(line=>line.startsWith('CL_InitCGame:'))){
  if(errors.length)throw Error('Page error: '+errors.join('; '));
  if(Date.now()-started>180000)throw Error('Game did not load: '+logs.slice(-20).join('; '));
  if(Date.now()-lastReport>20000){console.log('Waiting for game assets: '+Math.round((Date.now()-started)/1000)+'s');lastReport=Date.now();}
  await page.waitForTimeout(500);
 }
 await page.locator('#viewport').screenshot({path:resolve(root,'test-output/remote-pro-q3tourney4.jpg'),type:'jpeg',quality:85});
 console.log('PASS: real browser loaded PRO-Q3TOURNEY4 via public HTTPS/WSS; no page errors.');
}finally{await browser.close();}
