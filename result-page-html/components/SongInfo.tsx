import React from 'react';
import { SongData } from '../types';
import { Flame } from 'lucide-react';

export const SongInfo: React.FC<{ data: SongData }> = ({ data }) => {
  return (
    <div className="flex flex-col w-full justify-center gap-[4%] h-[80%] pl-[2%]">
      {/* Song Name - Cyan */}
      <InfoRow label="曲名" value={data.title} type="cyan" />
      
      {/* Artist - Cyan */}
      <InfoRow label="歌手名" value={`♪ ${data.artist}`} type="cyan" />
      
      {/* National Average - Magenta */}
      <InfoRow label="全国平均" value={`${data.avgScore.toFixed(3)} 点`} type="magenta" />
      
      {/* National Rank - Magenta */}
      <InfoRow label="全国順位" value={`${data.rank} 位`} type="magenta" />
      
      {/* Calories - Custom Magenta Row */}
      <div className="flex items-center w-full h-[16%] relative group">
         {/* Background Glow */}
         <div className="absolute inset-0 bg-pink-500/20 blur-md rounded-lg opacity-50 group-hover:opacity-100 transition-opacity"></div>
         
         {/* Label */}
         <div className="relative z-10 w-[25%] h-full flex items-center justify-center bg-slate-900 border-2 border-pink-500 rounded-l-md transform skew-x-[-20deg] ml-[2%] shadow-[inset_0_0_10px_rgba(236,72,153,0.3)]">
            <span className="text-pink-300 font-bold transform skew-x-[20deg] text-[120%] drop-shadow-md">消費</span>
         </div>
         
         {/* Value */}
         <div className="relative z-0 flex-1 h-full flex items-center justify-end bg-gradient-to-r from-pink-900/80 to-slate-900 border-y-2 border-r-2 border-pink-500 rounded-r-md transform skew-x-[-20deg] -ml-[2px] pr-[5%] shadow-[inset_0_0_20px_rgba(236,72,153,0.2)]">
            <span className="text-white font-digital font-bold transform skew-x-[20deg] flex items-center gap-[5%] text-[150%] drop-shadow-md">
               {data.calories}kcal 
               <Flame className="text-orange-500 fill-orange-500 animate-pulse h-[80%] aspect-square filter drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]" />
            </span>
         </div>
      </div>
    </div>
  );
};

interface InfoRowProps {
  label: string;
  value: string;
  type: 'cyan' | 'magenta';
}

const InfoRow: React.FC<InfoRowProps> = ({ label, value, type }) => {
  const isCyan = type === 'cyan';
  
  const borderColor = isCyan ? 'border-cyan-400' : 'border-pink-500';
  const labelTextColor = isCyan ? 'text-cyan-300' : 'text-pink-300';
  const glowColor = isCyan ? 'shadow-[0_0_10px_rgba(34,211,238,0.4)]' : 'shadow-[0_0_10px_rgba(236,72,153,0.4)]';
  const bgGradient = isCyan ? 'from-cyan-900/80' : 'from-pink-900/80';
  const insetShadow = isCyan ? 'shadow-[inset_0_0_10px_rgba(34,211,238,0.3)]' : 'shadow-[inset_0_0_10px_rgba(236,72,153,0.3)]';

  return (
    <div className="flex items-center w-full h-[16%] relative group">
       {/* Ambient Glow behind the row */}
       <div className={`absolute inset-0 ${isCyan ? 'bg-cyan-500/20' : 'bg-pink-500/20'} blur-md rounded-lg opacity-50 group-hover:opacity-100 transition-opacity`}></div>

       {/* Label Box (Skewed) */}
      <div className={`relative z-10 w-[25%] h-full flex items-center justify-center bg-slate-900 border-2 ${borderColor} rounded-l-md transform skew-x-[-20deg] ml-[2%] ${insetShadow}`}>
        <span className={`${labelTextColor} font-bold transform skew-x-[20deg] text-[120%] drop-shadow-md`}>{label}</span>
      </div>
      
      {/* Value Box (Skewed) */}
      <div className={`relative z-0 flex-1 h-full flex items-center justify-end bg-gradient-to-r ${bgGradient} to-slate-900 border-y-2 border-r-2 ${borderColor} rounded-r-md transform skew-x-[-20deg] -ml-[2px] pr-[5%] shadow-lg`}>
        <span className="text-white font-bold transform skew-x-[20deg] truncate tracking-wide text-[150%] drop-shadow-md">{value}</span>
      </div>
    </div>
  );
};