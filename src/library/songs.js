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
    title: 'BAKAMITAI',
    artist: 'Yakuza',
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
    lrc_offset: 0,
  },
  {
    id: 'fuyou-kesiki',
    title: '津軽海峡・冬景色',
    artist: '石川さゆり',
    url: assetUrl(midiAssetMap, '津軽海峡_冬景色.MID'),
    lrc: assetUrl(lrcAssetMap, '津軽海峡_冬景色.lrc'),
    lrc_offset: 200,
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
    artist: '欧得洋',
    url: assetUrl(midiAssetMap, '孤单北半球.MID'),
    lrc: assetUrl(lrcAssetMap, '孤单北半球.lrc'),
    lrc_offset: -1760,
  },
]

export { SONG_LIBRARY }
