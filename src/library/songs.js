const midiAssets = import.meta.glob('./*.{MID,mid}', { eager: true, query: '?url', import: 'default' })
const lrcAssets = import.meta.glob('./*.{LRC,lrc}', { eager: true, query: '?url', import: 'default' })

const normalizeKey = (name) => `./${name}`.toLowerCase()
const midiAssetMap = Object.fromEntries(Object.entries(midiAssets).map(([key, value]) => [key.toLowerCase(), value]))
const lrcAssetMap = Object.fromEntries(Object.entries(lrcAssets).map(([key, value]) => [key.toLowerCase(), value]))

function assetUrl(map, name) {
  return map[normalizeKey(name)]
}

const SONG_LIBRARY = [
  {
    id: 'bakamitai',
    title: 'ばかみたい',
    artist: '桐生一馬',
    url: assetUrl(midiAssetMap, 'BAKAMITAI.MID'),
    lrc: assetUrl(lrcAssetMap, 'BAKAMITAI.lrc'),
    lrc_offset: 2700,
  },
  {
    id: 'amagi-goe',
    title: '天城越え',
    artist: '石川さゆり',
    url: assetUrl(midiAssetMap, '天城越え.MID'),
    lrc: assetUrl(lrcAssetMap, '天城越え.lrc'),
    lrc_offset: 7000,
  },
  {
    id: 'fuyou-kesiki',
    title: '津軽海峡・冬景色',
    artist: '石川さゆり',
    url: assetUrl(midiAssetMap, '津軽海峡_冬景色.MID'),
    lrc: assetUrl(lrcAssetMap, '津軽海峡_冬景色.lrc'),
    lrc_offset: 6000,
  },
  {
    id: 'getuhana',
    title: '月光花',
    artist: 'Janne Da Arc',
    url: assetUrl(midiAssetMap, '月光花.MID'),
    lrc: assetUrl(lrcAssetMap, '月光花.lrc'),
    lrc_offset: 3000,
  },
  {
    id: 'sheiming',
    title: '谁明浪子心',
    artist: '王杰',
    url: assetUrl(midiAssetMap, '誰明浪子心.MID'),
    lrc: assetUrl(lrcAssetMap, '誰明浪子心.lrc'),
    lrc_offset: -1760,
  },
  {
    id: 'gudanbeibanqiu',
    title: '孤单北半球',
    artist: '林依晨',
    url: assetUrl(midiAssetMap, '孤单北半球.MID'),
    lrc: assetUrl(lrcAssetMap, '孤单北半球.lrc'),
    lrc_offset: 0,
  },
  {
    id: 'kimihamelody',
    title: '君はメロディー',
    artist: 'AKB48',
    url: assetUrl(midiAssetMap, 'kimihamelody.MID'),
    lrc: assetUrl(lrcAssetMap, 'kimihamelody.lrc'),
    lrc_offset: 2100,
  },
  {
    id: 'zenkutenshi',
    title: '残酷な天使のテーゼ',
    artist: '高橋洋子',
    url: assetUrl(midiAssetMap, 'zangoku.MID'),
    lrc: assetUrl(lrcAssetMap, 'zangoku.lrc'),
    lrc_offset: 0,
  },
  {
    id: 'braveheart',
    title: 'Brave Heart',
    artist: '宫崎步',
    url: assetUrl(midiAssetMap, 'brave heart.MID'),
    lrc: assetUrl(lrcAssetMap, 'brave heart.lrc'),
    lrc_offset: 1200,
  },
  {
    id: 'konayuki',
    title: '粉雪',
    artist: 'レミオロメン',
    url: assetUrl(midiAssetMap, 'konayuki.MID'),
    lrc: assetUrl(lrcAssetMap, 'konayuki.lrc'),
    lrc_offset: 5000,
  },
  {
    id: '7_orange',
    title: 'オレンジ',
    artist: '7!!(Seven Oops)',
    url: assetUrl(midiAssetMap, '7_orange.MID'),
    lrc: assetUrl(lrcAssetMap, '7_orange.lrc'),
    lrc_offset: 3500,
  },
  {
    id: 'ikimodekinai',
    title: '息もできない',
    artist: 'Zard',
    url: assetUrl(midiAssetMap, 'ikimodekinai.MID'),
    lrc: assetUrl(lrcAssetMap, 'ikimodekinai.lrc'),
    lrc_offset: 2500,
  },
  {
    id: 'kinmoryo',
    title: '銀の龍の背に乗って',
    artist: '中島みゆき',
    url: assetUrl(midiAssetMap, '銀の龍の背に乗って.MID'),
    lrc: assetUrl(lrcAssetMap, '銀の龍の背に乗って.lrc'),
    lrc_offset: 3000,
  },
  {
    id: 'earthsong',
    title: 'Earth Song',
    artist: 'Michael Jackson',
    url: assetUrl(midiAssetMap, 'earth_song.MID'),
    lrc: assetUrl(lrcAssetMap, 'earth_song.lrc'),
    lrc_offset: 0,
  },
  {
    id: 'presentendr',
    title: 'Pretender',
    artist: 'Offcial髭男dism',
    url: assetUrl(midiAssetMap, 'pretender.MID'),
    lrc: assetUrl(lrcAssetMap, 'pretender.lrc'),
    lrc_offset: 1100,
  },
  {
    id: 'kumoninote',
    title: '雲に乗って',
    artist: '三枝夕夏 IN db',
    url: assetUrl(midiAssetMap, 'kumoninote.MID'),
    lrc: assetUrl(lrcAssetMap, 'kumoninote.lrc'),
    lrc_offset: 1100,
  },
  {
    id: 'marigold',
    title: 'マリーゴールド',
    artist: 'あいみょん',
    url: assetUrl(midiAssetMap, 'marigold.MID'),
    lrc: assetUrl(lrcAssetMap, 'marigold.lrc'),
    lrc_offset: 1200,
  },
]

export { SONG_LIBRARY }
