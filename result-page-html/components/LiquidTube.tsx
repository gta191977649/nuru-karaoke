import React from 'react';

interface LiquidTubeProps {
  label: string;
  score: number;      // 0 to 100 (for fill height)
  maxScoreDisplay: number; // e.g., 40, 30, 15
  subLabel?: string;
}

export const LiquidTube: React.FC<LiquidTubeProps> = ({ label, score, maxScoreDisplay }) => {
  // Calculate the displayed score based on the max possible for this column
  const displayValue = Math.floor((score / 100) * maxScoreDisplay);

  return (
    <div className="flex flex-col items-center justify-end h-full flex-1 min-w-0 group pb-[2%]">
      {/* Top Label - Increased Size */}
      <div className="text-yellow-400 font-bold mb-[5%] text-center leading-tight flex items-end justify-center shadow-black drop-shadow-md whitespace-pre-wrap text-[140%] min-h-[15%]">
        {label}
      </div>

      {/* Tube Container - Flex Grow to take available space */}
      <div className="relative w-[80%] flex-1 bg-slate-900/60 rounded-full border-[3px] border-slate-400 shadow-[0_0_15px_rgba(0,0,0,0.8)_inset] overflow-hidden backdrop-blur-sm min-h-0">
        
        {/* Mechanical Top Cap */}
        <div className="absolute top-0 w-full bg-gradient-to-b from-slate-300 via-slate-100 to-slate-400 z-30 shadow-md h-[4%] border-b border-slate-500"></div>
        <div className="absolute top-[4%] w-full bg-slate-800 z-20 h-[1%]"></div>
        
        {/* Glass Reflection/Highlight */}
        <div className="absolute top-0 left-[20%] w-[15%] h-full bg-white/10 z-20 blur-[2px] pointer-events-none"></div>
        <div className="absolute top-0 right-[20%] w-[5%] h-full bg-white/5 z-20 blur-[1px] pointer-events-none"></div>

        {/* Liquid Background (Empty State) */}
        <div className="absolute inset-0 bg-slate-950/80"></div>

        {/* The Liquid - Changed to GOLD/YELLOW */}
        <div 
          className="absolute bottom-0 w-full bg-gradient-to-t from-yellow-700 via-yellow-400 to-yellow-200 transition-all duration-[2000ms] ease-out shadow-[0_0_30px_rgba(234,179,8,0.8)]"
          style={{ height: `${score}%` }}
        >
          {/* Surface Tension/Top of Liquid */}
          <div className="absolute top-0 w-full bg-white opacity-80 blur-[2px] transform -translate-y-1/2 scale-x-125 rounded-[100%] h-[3%] box-content border-t-2 border-white"></div>
          
          {/* Bubbles Animation */}
          <div className="absolute inset-0 w-full h-full overflow-hidden">
             {[...Array(8)].map((_, i) => (
               <div 
                  key={i}
                  className="absolute rounded-full border border-white/40 bg-white/20 animate-bubble"
                  style={{
                    width: `${Math.random() * 30 + 10}%`,
                    height: 'auto',
                    aspectRatio: '1/1',
                    left: `${Math.random() * 80 + 10}%`,
                    bottom: '-20%',
                    animationDuration: `${Math.random() * 3 + 2}s`,
                    animationDelay: `${Math.random() * 2}s`
                  }}
               />
             ))}
          </div>
        </div>
        
        {/* Mechanical Bottom Base */}
        <div className="absolute bottom-0 w-full bg-gradient-to-t from-slate-800 via-slate-600 to-slate-400 z-30 border-t-2 border-slate-500 h-[5%]"></div>
      </div>

      {/* Score Box - Darker background, larger Gold font */}
      <div className="w-full bg-gradient-to-b from-slate-800 to-black border-2 border-slate-500 rounded-sm text-center shadow-lg relative overflow-hidden mt-[8%] py-[2%]"
           style={{ maxWidth: '95%' }}>
        
        <div className="text-yellow-400 font-digital font-bold leading-none text-[220%] drop-shadow-[0_0_5px_rgba(234,179,8,0.8)]">
          {displayValue}<span className="text-slate-500 ml-0.5 text-[50%]">/</span>
        </div>
        <div className="text-slate-400 font-bold leading-none mt-0.5 text-[100%]">
          {maxScoreDisplay}点
        </div>
      </div>
      
      <style>{`
        @keyframes bubble {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          20% { opacity: 0.6; }
          100% { transform: translateY(-300%) scale(1.1); opacity: 0; }
        }
        .animate-bubble {
          animation-name: bubble;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
      `}</style>
    </div>
  );
};