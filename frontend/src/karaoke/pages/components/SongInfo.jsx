import React from 'react';
import ArtistLink from '../../../components/ArtistLink.jsx';
// import { Flame } from 'lucide-react'; // Removing lucide-react as it might not be in main project, using emoji or SVG

const FlameIcon = () => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-pulse-flame"
        style={{ height: '80%', aspectRatio: '1/1', color: '#f97316', fill: '#f97316', filter: 'drop-shadow(0 0 5px rgba(249,115,22,0.8))' }}
    >
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-2.246-3.646-3.729-4.821a.249.249 0 0 1 .15-.434C9.596 3.996 11.233 4.5 12.5 5.5c-1.072 2.143-2.246 3.646-3.729 4.821a.249.249 0 0 0 .15.434c2.825-.256 4.462.248 5.729 1.245-1.072 2.143-2.246 3.646-3.729 4.821a.249.249 0 0 1 .15.434C14.596 17.996 16.233 18.5 17.5 19.5c0 1.27-1.12 2.5-2.5 2.5a2.5 2.5 0 0 1-2.5-2.5c0-1.27.5-2 1-3" />
        <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5 .5 1.5.5 3.5-1 5" />
    </svg>
)

export const SongInfo = ({ data }) => {
    return (
        <div className="song-info-container">
            {/* Song Name - Cyan */}
            <InfoRow label="曲名" value={data.title} type="cyan" />

            {/* Artist - Cyan */}
            <InfoRow
                label="歌手名"
                value={<ArtistLink artist={data.artist}>♪ {data.artist}</ArtistLink>}
                type="cyan"
            />

            {/* National Average - Magenta */}
            <InfoRow label="全国平均" value={`${(data.avgScore || 0).toFixed(3)} 点`} type="magenta" />

            {/* National Rank - Magenta */}
            <InfoRow label="全国順位" value={`${data.rank} 位`} type="magenta" />

            {/* Calories - Custom Row */}
            <div className="si-row">
                {/* Background Glow */}
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(236, 72, 153, 0.2)', filter: 'blur(12px)', borderRadius: '0.5rem', opacity: 0.5, transition: 'opacity 0.2s' }}></div>

                {/* Label */}
                <div className="si-label-box" style={{ borderColor: '#ec4899', boxShadow: 'inset 0 0 10px rgba(236,72,153,0.3)' }}>
                    <span className="si-content-unskew" style={{ color: '#f9a8d4', fontWeight: 'bold', fontSize: '1.2em', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>消費</span>
                </div>

                {/* Value */}
                <div className="si-value-box" style={{ borderColor: '#ec4899', background: 'linear-gradient(to right, rgba(131, 24, 67, 0.8), #0f172a)', boxShadow: 'inset 0 0 20px rgba(236,72,153,0.2)' }}>
                    <span className="si-content-unskew" style={{ color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '5%', fontSize: '1.5em', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>
                        {data.calories}kcal
                        <FlameIcon />
                    </span>
                </div>
            </div>
        </div>
    );
};

const InfoRow = ({ label, value, type }) => {
    const isCyan = type === 'cyan';

    const borderColor = isCyan ? '#22d3ee' : '#ec4899'; // cyan-400 : pink-500
    const labelColor = isCyan ? '#67e8f9' : '#f9a8d4'; // cyan-300 : pink-300
    const glowColor = isCyan ? 'rgba(34,211,238,0.2)' : 'rgba(236,72,153,0.2)';
    const boxGlow = isCyan ? 'rgba(34,211,238,0.3)' : 'rgba(236,72,153,0.3)';
    const bgGradientStart = isCyan ? 'rgba(22, 78, 99, 0.8)' : 'rgba(131, 24, 67, 0.8)'; // cyan-900 : pink-900

    return (
        <div className="si-row">
            {/* Ambient Glow */}
            <div style={{ position: 'absolute', inset: 0, backgroundColor: glowColor, filter: 'blur(12px)', borderRadius: '0.5rem', opacity: 0.5 }}></div>

            {/* Label Box */}
            <div className="si-label-box" style={{ borderColor: borderColor, boxShadow: `inset 0 0 10px ${boxGlow}` }}>
                <span className="si-content-unskew" style={{ color: labelColor, fontWeight: 'bold', fontSize: '1em', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>{label}</span>
            </div>

            {/* Value Box */}
            <div className="si-value-box" style={{ borderColor: borderColor, background: `linear-gradient(to right, ${bgGradientStart}, #0f172a)` }}>
                <span className="si-content-unskew" style={{ color: 'white', fontWeight: 'bold', fontSize: '1.3em', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</span>
            </div>
        </div>
    );
};
