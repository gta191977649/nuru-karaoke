import React, { useMemo } from 'react';

export const CenterScore = ({ score }) => {
    const clampedScore = useMemo(() => {
        const numericScore = Number(score) || 0;
        return Math.min(Math.max(numericScore, 0), 100);
    }, [score]);

    const fillRatio = clampedScore / 100;

    return (
        <div className="center-score-wrapper">
            {/* Outer Rings */}
            <div className="cs-outer-ring-glow"></div>
            <div className="cs-inner-ring"></div>

            {/* Main Container */}
            <div className="cs-main-container">
                <div className="cs-liquid" style={{ '--fill': fillRatio }}>
                    <div className="cs-liquid-level">

                    </div>
                </div>

                {/* Subtle Grid overlay */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none', zIndex: 10 }}></div>

                {/* Vignette */}
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, transparent, rgba(0,0,0,0.2), rgba(0,0,0,0.8))', pointerEvents: 'none', zIndex: 10 }}></div>
            </div>

            {/* Content Container */}
            <div className="cs-score-text-container">
                <div style={{ color: '#facc15', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 0 5px rgba(234,179,8,0.8)', fontSize: '1em', marginBottom: '1%' }}>
                    TOTAL
                </div>
                <div style={{ color: 'white', fontWeight: 'bold', letterSpacing: '0.05em', marginTop: '-2%', marginBottom: '2%', opacity: 0.9, fontSize: '1em', backgroundColor: 'rgba(124, 45, 18, 0.5)', padding: '0 10%', borderRadius: '9999px', border: '1px solid rgba(249, 115, 22, 0.5)' }}>
                    総合得点
                </div>

                <div className="cs-score-large">
                    {Number(score || 0).toFixed(2)}
                </div>

                <div style={{ color: '#eab308', fontWeight: 'bold', marginTop: '2%', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', fontSize: '2em' }}>
                    点
                </div>
            </div>
        </div>
    );
};
