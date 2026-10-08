export const gameModes = Object.freeze({
  ffa: {label:'Каждый за себя', quakeType:0},
  duel: {label:'Дуэль', quakeType:1},
  tdm: {label:'Командный бой', quakeType:3},
  ctf: {label:'Захват флага', quakeType:4},
});

export function validateMatch(input, maps) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Некорректные настройки матча.');
  const {map, mode, maxPlayers, timeLimit, fragLimit} = input;
  const selected = maps.find(item => item.id === map);
  if (!selected) throw Error('Выберите карту из списка.');
  if (!Object.hasOwn(gameModes, mode) || !selected.modes.includes(mode)) throw Error('Эта карта не подходит для выбранного режима.');
  for (const [value, min, max, label] of [
    [maxPlayers, 2, 12, 'Количество игроков'],
    [timeLimit, 1, 120, 'Время матча'],
    [fragLimit, 1, 100, 'Лимит фрагов или захватов'],
  ]) {
    if (!Number.isInteger(value) || value < min || value > max) throw Error(label + ': допустимо от ' + min + ' до ' + max + '.');
  }
  if (mode === 'ctf' && maxPlayers < 4) throw Error('Для захвата флага нужно минимум 4 места.');
  return {map, mode, maxPlayers, timeLimit, fragLimit};
}

export function serverConfig(match) {
  return [
    'seta sv_hostname "Quake Friends"',
    'seta sv_maxclients ' + match.maxPlayers,
    'seta sv_pure 1',
    'seta g_gametype ' + gameModes[match.mode].quakeType,
    'seta fraglimit ' + match.fragLimit,
    'seta capturelimit ' + match.fragLimit,
    'seta timelimit ' + match.timeLimit,
    'seta g_inactivity 300',
    'seta g_motd "Private arena for friends"',
    'seta bot_enable 0',
    'seta bot_minplayers 0',
    'seta g_allowVote 0',
    'seta sv_master1 ""',
    'seta sv_master2 ""',
    'seta sv_master3 ""',
    'seta sv_master4 ""',
    'seta sv_master5 ""',
    'seta sv_maxRate 25000',
    'seta nextmap "map_restart 0"',
    'map ' + match.map,
    '',
  ].join('\n');
}
