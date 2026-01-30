import React, { useState, useEffect, useRef } from 'react';
import { LiquidTube } from './components/LiquidTube';
import { CenterScore } from './components/CenterScore';
import { SongInfo } from './components/SongInfo';
import { BottomPanel } from './components/BottomPanel';
import { ScoreData, SongData, TechniqueCounts } from './types';
import { Play, Pause, Save, Mic2 } from 'lucide-react';

// Initial Data
const INITIAL_SONG_DATA: SongData = {
  title: 'Pretender',
  artist: 'Official髭男dism',
  avgScore: 74.123,
  rank: 0,
  calories: 0,
};

const INITIAL_COUNTS: TechniqueCounts = {
  kobushi: 0,
  fall: 0,
  shakuri: 0,
  vibrato: 0,
};

export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Real-time Values
  const [scores, setScores] = useState<ScoreData>({
    pitch: 0, stability: 0, intonation: 0, longTone: 0, technique: 0, total: 0
  });
  const [counts, setCounts] = useState<TechniqueCounts>(INITIAL_COUNTS);
  const [calories, setCalories] = useState(0);

  // References for animation loops
  const requestRef = useRef<number>(0);
  
  const startSimulation = () => {
    if (isPlaying) return;
    setIsPlaying(true);
    
    // Reset
    setScores({ pitch: 0, stability: 0, intonation: 0, longTone: 0, technique: 0, total: 0 });
    setCounts(INITIAL_COUNTS);
    setCalories(0);

    let startTime = Date.now();
    const duration = 5000; // 5 seconds simulation

    const animate = () => {
      const now = Date.now();
      const progress = Math.min((now - startTime) / duration, 1);
      
      // Easing function
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      const curProgress = easeOut(progress);

      // Random final target values
      const targetScores = {
        pitch: 92,
        stability: 85,
        intonation: 98,
        longTone: 70,
        technique: 88,
        total: 94.52
      };

      setScores({
        pitch: curProgress * targetScores.pitch,
        stability: curProgress * targetScores.stability,
        intonation: curProgress * targetScores.intonation,
        longTone: curProgress * targetScores.longTone,
        technique: curProgress * targetScores.technique,
        total: curProgress * targetScores.total
      });

      // Update counters occasionally
      if (progress < 1) {
         setCounts(prev => ({
           kobushi: Math.floor(curProgress * 15),
           fall: Math.floor(curProgress * 5),
           shakuri: Math.floor(curProgress * 22),
           vibrato: Math.floor(curProgress * 18),
         }));
         setCalories(Number((curProgress * 12.5).toFixed(1)));
         requestRef.current = requestAnimationFrame(animate);
      } else {
        setIsPlaying(false);
      }
    };
    
    requestRef.current = requestAnimationFrame(animate);
  };

  const stopSimulation = () => {
    setIsPlaying(false);
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
  };

  return (
    <div className="h-screen w-screen bg-black flex items-center justify-center overflow-hidden bg-circuit text-[1.5vmin] sm:text-[1vmin]">
      
      {/* 
        Main Interface Container 
        Strict 4:3 Aspect Ratio.
      */}
      <div className="aspect-[4/3] h-full max-w-full relative p-[2%] flex flex-col gap-[2%] rounded-xl backdrop-blur-sm shadow-2xl scanlines mx-auto box-border">
        
        {/* Header - Fixed Height 10% */}
        <header className="h-[10%] flex justify-between items-center w-full px-[1%] border-b border-cyan-500/20 shrink-0">
          <div className="flex items-center gap-[2%] h-full">
            <div className="aspect-square h-[60%] bg-cyan-600 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.6)]">
              <span className="font-bold italic text-white text-[150%]">D</span>
            </div>
            <h1 className="font-black italic tracking-tighter text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)] whitespace-nowrap leading-none text-[250%]">
              分析採点 <span className="text-cyan-400 not-italic font-digital ml-[1%] text-[80%]">MASTER</span>
            </h1>
          </div>
          <div className="text-right flex gap-[5%] items-end h-[60%]">
            <div className="text-cyan-200 font-mono-tech opacity-80 tracking-widest hidden sm:block text-[120%] self-center">2026/01/26 01:53</div>
            <div className="font-bold whitespace-nowrap text-white text-[150%] self-center">ゲスト <span className="text-slate-400 text-[70%]">さん</span></div>
          </div>
        </header>

        {/* Main Display Area (Flex Row) - Takes ~60% Height */}
        <div className="flex-1 flex flex-row items-stretch justify-between w-full min-h-0">
          
          {/* Left: Tubes (33% Width) */}
          <div className="w-[33%] flex justify-between gap-[2%] h-full items-end pb-[1%]">
            <LiquidTube label="音程" score={scores.pitch} maxScoreDisplay={40} />
            <LiquidTube label="安定感" score={scores.stability} maxScoreDisplay={30} />
            <LiquidTube label="抑揚" score={scores.intonation} maxScoreDisplay={15} />
            <LiquidTube label="ロング\nトーン" score={scores.longTone} maxScoreDisplay={10} />
            <LiquidTube label="テク\nニック" score={scores.technique} maxScoreDisplay={5} />
          </div>

          {/* Center: Score (34% Width) - Increased width for larger circle */}
          <div className="w-[34%] flex justify-center items-center h-full relative">
             <CenterScore score={scores.total} />
          </div>

          {/* Right: Info (33% Width) */}
          <div className="w-[33%] flex flex-col justify-center items-end h-full py-[2%]">
            <SongInfo data={{ ...INITIAL_SONG_DATA, calories: calories }} />
          </div>

        </div>

        {/* Bottom Panel (Fixed Height ~20%) */}
        <div className="h-[22%] w-full shrink-0">
          <BottomPanel counts={counts} />
        </div>

        {/* Footer Controls (Fixed Height ~8%) */}
        <div className="h-[8%] flex justify-between items-center w-full px-[0.5%] shrink-0">
          <button 
            onClick={stopSimulation}
            className="h-[85%] px-[4%] bg-gradient-to-b from-red-700 via-red-600 to-red-800 border-2 border-red-400 rounded-md shadow-[0_0_15px_rgba(220,38,38,0.5)] text-white font-bold hover:brightness-110 active:scale-95 transition-all flex items-center whitespace-nowrap gap-[5%] text-[130%]"
          >
            <Pause fill="white" className="h-[50%] aspect-square" /> <span className="hidden sm:inline">演奏停止</span><span className="sm:hidden">停止</span>
          </button>

          <div className="flex gap-[1%] h-full items-center">
             <button className="h-[85%] px-[3%] bg-gradient-to-b from-blue-600 via-blue-500 to-blue-700 border-2 border-blue-300 rounded-md shadow-lg text-white font-bold hover:brightness-110 transition-all flex items-center whitespace-nowrap gap-[5%] text-[110%]"
             >
                 <span className="hidden md:inline">音程強化モード</span><span className="md:hidden">強化</span>
             </button>
             <button className="h-[85%] px-[3%] bg-gradient-to-b from-blue-600 via-blue-500 to-blue-700 border-2 border-blue-300 rounded-md shadow-lg text-white font-bold hover:brightness-110 transition-all flex items-center whitespace-nowrap gap-[5%] text-[110%]"
             >
                 <span className="hidden md:inline">マイルームに保存</span><span className="md:hidden">保存</span>
             </button>
             <button 
               onClick={startSimulation}
               disabled={isPlaying}
               className={`h-[85%] px-[4%] bg-gradient-to-b from-cyan-600 via-cyan-500 to-cyan-700 border-2 border-cyan-300 rounded-md shadow-[0_0_15px_rgba(6,182,212,0.6)] text-white font-bold hover:brightness-110 active:scale-95 transition-all flex items-center whitespace-nowrap gap-[5%] text-[130%] ${isPlaying ? 'opacity-50 cursor-not-allowed' : ''}`}
             >
                <Play fill="white" className="h-[50%] aspect-square" /> プレビュー
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}