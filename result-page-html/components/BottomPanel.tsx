import React, { useEffect, useRef } from 'react';
import { TechniqueCounts } from '../types';

interface BottomPanelProps {
  counts: TechniqueCounts;
}

export const BottomPanel: React.FC<BottomPanelProps> = ({ counts }) => {
  return (
    // Silver Metallic Container
    <div className="w-full h-full bg-gradient-to-b from-slate-300 via-slate-200 to-slate-400 rounded-lg shadow-2xl border-[3px] border-slate-400 p-[0.8%] box-border relative overflow-hidden">
      
      {/* Screw heads decorations */}
      <div className="absolute top-[5%] left-[1%] w-[1.5%] aspect-square rounded-full bg-slate-400 border border-slate-500 shadow-inner flex items-center justify-center"><div className="w-[60%] h-[1px] bg-slate-600 rotate-45"></div></div>
      <div className="absolute top-[5%] right-[1%] w-[1.5%] aspect-square rounded-full bg-slate-400 border border-slate-500 shadow-inner flex items-center justify-center"><div className="w-[60%] h-[1px] bg-slate-600 rotate-45"></div></div>
      <div className="absolute bottom-[5%] left-[1%] w-[1.5%] aspect-square rounded-full bg-slate-400 border border-slate-500 shadow-inner flex items-center justify-center"><div className="w-[60%] h-[1px] bg-slate-600 rotate-45"></div></div>
      <div className="absolute bottom-[5%] right-[1%] w-[1.5%] aspect-square rounded-full bg-slate-400 border border-slate-500 shadow-inner flex items-center justify-center"><div className="w-[60%] h-[1px] bg-slate-600 rotate-45"></div></div>

      {/* Main Inner Container (Dark Dashboard) */}
      <div className="bg-slate-900 rounded-md flex flex-row items-stretch justify-between shadow-[inset_0_0_20px_rgba(0,0,0,1)] h-full p-[1%] gap-[1%] border border-slate-600 mx-[1.5%]">
        
        {/* Section 1: Technique & Counters (Left) */}
        <div className="flex flex-row shrink-0 items-stretch gap-[2%] w-[42%]">
          {/* Technique Button (Circle) */}
          <div className="flex flex-col items-center justify-center aspect-square h-full p-[1%]">
             <div className="h-full aspect-square rounded-full bg-gradient-to-br from-slate-700 to-black border-[3px] border-cyan-500/50 flex items-center justify-center shadow-lg relative cursor-pointer hover:scale-105 transition-transform group box-border">
               <div className="absolute inset-[8%] rounded-full border-2 border-cyan-400 group-hover:border-cyan-200 transition-colors shadow-[0_0_10px_rgba(34,211,238,0.5)]"></div>
               <div className="text-center z-10 leading-tight">
                 <div className="text-slate-300 text-[80%] font-bold">テクニック</div>
                 <div className="text-white font-black tracking-widest text-[150%] drop-shadow-md">詳細</div>
               </div>
            </div>
          </div>

          {/* Counters Grid (2x2) - Solid Blocks */}
          <div className="grid grid-cols-2 grid-rows-2 h-full flex-1 gap-[2%]">
            <CounterBox label="こぶし" count={counts.kobushi} icon="-" type="cyan" />
            <CounterBox label="フォール" count={counts.fall} icon="⤵" type="yellow" />
            <CounterBox label="しゃくり" count={counts.shakuri} icon="⤴" type="purple" />
            <CounterBox label="ビブラート" count={counts.vibrato} icon="〰" type="orange" />
          </div>
        </div>

        {/* Section 2: Waveform Visualization (Middle) */}
        <div className="flex-1 bg-black rounded border-2 border-slate-600 relative overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,1)] mx-[0.5%] group">
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-green-900/30 to-transparent h-[40%] pointer-events-none"></div>
            
            <div className="absolute top-[5%] left-[2%] text-slate-300 z-10 font-bold tracking-wider whitespace-nowrap text-[90%] drop-shadow-md">ビブラートタイプ</div>
            
            {/* Grid */}
            <div className="absolute inset-0 flex justify-evenly pointer-events-none opacity-20">
              <div className="h-full w-[1px] bg-green-500"></div>
              <div className="h-full w-[1px] bg-green-500"></div>
              <div className="h-full w-[1px] bg-green-500"></div>
              <div className="h-full w-[1px] bg-green-500"></div>
            </div>
            
            {/* Labels */}
            <div className="absolute left-[2%] top-[25%] text-slate-400 font-bold text-[80%]">早い</div>
            <div className="absolute left-[2%] top-1/2 -translate-y-1/2 text-slate-400 font-bold text-[80%]">標準</div>
            <div className="absolute left-[2%] bottom-[15%] text-slate-400 font-bold text-[80%]">遅い</div>

            <div className="absolute bottom-[2%] left-[15%] text-slate-400 font-bold text-[80%]">浅い</div>
            <div className="absolute bottom-[2%] left-[50%] -translate-x-1/2 text-slate-400 font-bold text-[80%]">標準</div>
            <div className="absolute bottom-[2%] right-[5%] text-slate-400 font-bold text-[80%]">深い</div>

            <WaveformCanvas />
        </div>

        {/* Section 3: Rhythm Analysis (Right) */}
        <div className="w-[20%] bg-black rounded border-2 border-slate-600 relative overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,1)] flex flex-col justify-between p-[0.5%]">
             <div className="flex justify-between items-center px-[2%] pt-[1%]">
                <span className="text-slate-300 font-bold tracking-wider text-[90%]">リズム</span>
             </div>
             
             {/* Spectrum Container */}
             <div className="flex-1 flex items-end justify-between gap-[1px] px-[3%] pb-[1%]">
               {Array.from({ length: 24 }).map((_, i) => (
                 <RhythmBar key={i} index={i} />
               ))}
             </div>
             
             {/* Bottom Labels */}
             <div className="flex justify-between bg-slate-900/80 border-t border-slate-700 px-[2%] py-[1%]">
               <span className="text-slate-300 font-bold text-[70%]">後ろノリ</span>
               <span className="text-slate-300 font-bold text-[70%]">前ノリ</span>
             </div>
        </div>

      </div>
    </div>
  );
};

// Sub-components

const CounterBox: React.FC<{ label: string; count: number; icon: string; type: 'cyan' | 'yellow' | 'purple' | 'orange' }> = ({ label, count, icon, type }) => {
  const styles = {
    cyan: { bg: 'bg-teal-900', border: 'border-teal-500', text: 'text-white' },
    yellow: { bg: 'bg-yellow-900', border: 'border-yellow-500', text: 'text-white' },
    purple: { bg: 'bg-purple-900', border: 'border-purple-500', text: 'text-white' },
    orange: { bg: 'bg-red-900', border: 'border-red-500', text: 'text-white' },
  }[type];

  return (
    <div className={`flex items-center justify-between ${styles.bg} border-l-[4px] ${styles.border} rounded-sm h-full px-[5%] w-full relative overflow-hidden`}>
      {/* Gloss Effect */}
      <div className="absolute top-0 left-0 w-full h-[50%] bg-white/5 pointer-events-none"></div>

      <div className="flex items-center gap-[5%] z-10">
        <div className={`flex items-center justify-center rounded-full border border-white/30 bg-black/30 w-[1.4em] h-[1.4em]`}>
          <span className={`font-bold text-white text-[90%]`}>{icon}</span>
        </div>
        <span className="text-white font-bold tracking-tight whitespace-nowrap text-[100%] drop-shadow-md">{label}</span>
      </div>
      <div className="flex items-baseline z-10">
        <span className="text-white font-digital leading-none tracking-tighter text-[160%] drop-shadow-md">{count}</span>
        <span className="text-slate-300 ml-[2px] text-[80%]">回</span>
      </div>
    </div>
  );
};

const WaveformCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const dpr = window.devicePixelRatio || 1;
    const updateSize = () => {
       const rect = canvas.getBoundingClientRect();
       if (rect.width === 0) return;
       canvas.width = rect.width * dpr;
       canvas.height = rect.height * dpr;
       ctx.scale(dpr, dpr);
    };
    updateSize();
    window.addEventListener('resize', updateSize);

    let animationFrameId: number;
    let offset = 0;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      offset -= 3;
      ctx.clearRect(0, 0, rect.width, rect.height);
      
      // Draw center line
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.moveTo(0, rect.height / 2);
      ctx.lineTo(rect.width, rect.height / 2);
      ctx.stroke();

      // Draw Wave
      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#22c55e'; // Bright Green
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#4ade80';

      for (let x = 0; x < rect.width; x++) {
        // More complex wave to match "shaking" oscilloscope look
        const amp = rect.height / 4;
        const y = rect.height / 2 + 
                  Math.sin((x + offset) * 0.1) * amp * Math.sin((x - offset) * 0.05) +
                  Math.sin((x + offset * 2) * 0.2) * (amp * 0.3);
        
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', updateSize);
    };
  }, []);

  return <canvas ref={canvasRef} className="w-full h-full" />;
};

const RhythmBar: React.FC<{ index: number }> = ({ index }) => {
  const [height, setHeight] = React.useState(30 + Math.random() * 70);

  useEffect(() => {
    const interval = setInterval(() => {
      setHeight(10 + Math.random() * 90);
    }, 100 + Math.random() * 100);
    return () => clearInterval(interval);
  }, []);

  // Gradient Color Logic
  // 0-6: Red/Orange, 7-12: Yellow/Green, 13-18: Cyan/Blue, 19-23: Purple/Pink
  let hue = 0;
  if (index < 6) hue = 0 + (index * 5); // Red to Orange
  else if (index < 12) hue = 60 + ((index - 6) * 10); // Yellow to Green
  else if (index < 18) hue = 180 + ((index - 12) * 10); // Cyan to Blue
  else hue = 280 + ((index - 18) * 10); // Purple to Pink

  const color = `hsla(${hue}, 100%, 50%, 0.8)`;
  const shadow = `hsla(${hue}, 100%, 50%, 0.5)`;

  return (
    <div className="w-full flex flex-col justify-end h-full">
        <div 
          className="w-full rounded-t-sm transition-all duration-200 ease-out"
          style={{ 
            height: `${height}%`,
            backgroundColor: color,
            boxShadow: `0 0 5px ${shadow}`
          }}
        />
    </div>
  );
};