export interface ScoreData {
  pitch: number;    // 音程
  stability: number; // 安定感
  intonation: number; // 抑揚
  longTone: number;  // ロングトーン
  technique: number; // テクニック
  total: number;
}

export interface SongData {
  title: string;
  artist: string;
  avgScore: number;
  rank: number;
  calories: number;
}

export interface TechniqueCounts {
  kobushi: number;
  fall: number;
  shakuri: number;
  vibrato: number;
}