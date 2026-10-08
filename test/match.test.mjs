import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateMatch, serverConfig } from '../match.mjs';

const maps=JSON.parse(await readFile(new URL('../data/maps.json',import.meta.url),'utf8'));
const standard={map:'pro-q3tourney4',mode:'ffa',maxPlayers:12,timeLimit:15,fragLimit:20};

test('catalog contains exactly the six selected maps',()=>{
 assert.deepEqual(maps.map(map=>map.id),[
  'pro-q3tourney4','pro-q3dm6','ztn3tourney1','q3dm17','q3dm13','q3dm19'
 ]);
 assert.equal(maps.filter(map=>map.group==='original').length,3);
 assert.equal(maps.filter(map=>map.group==='extra').length,3);
});

test('match accepts compatible modes and generates correct Quake settings',()=>{
 assert.deepEqual(validateMatch(standard,maps),standard);
 const team=validateMatch({...standard,map:'pro-q3dm6',mode:'tdm',maxPlayers:8,timeLimit:10,fragLimit:15},maps);
 const config=serverConfig(team);
 assert.match(config,/seta g_gametype 3/);
 assert.match(config,/seta sv_maxclients 8/);
 assert.match(config,/seta fraglimit 15/);
 assert.match(config,/seta bot_enable 0/);
 assert.match(config,/seta bot_minplayers 0/);
 assert.match(config,/map pro-q3dm6/);
});

test('match rejects removed maps, incompatible modes, invalid limits and injection',()=>{
 for(const bad of [
  {...standard,map:'q3tourney4'},
  {...standard,map:'pro-q3tourney4\nquit'},
  {...standard,maxPlayers:13},
  {...standard,timeLimit:0},
  {...standard,fragLimit:'20'},
  {...standard,mode:'ctf'},
  {...standard,map:'q3dm17',mode:'duel'},
 ])assert.throws(()=>validateMatch(bad,maps));
});
