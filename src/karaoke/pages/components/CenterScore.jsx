import React, { useMemo } from 'react';

export const CenterScore = ({ score }) => {
    const clampedScore = useMemo(() => {
        const numericScore = Number(score) || 0;
        return Math.min(Math.max(numericScore, 0), 100);
    }, [score]);

    const fillRatio = clampedScore / 100;
    const stateClass = clampedScore > 80 ? 'danger' : clampedScore > 60 ? 'warning' : '';

    return (
        <div className={`center-score-wrapper ${stateClass}`}>
            {/* Outer Rings */}
            <div className="cs-outer-ring-glow"></div>
            <div className="cs-inner-ring"></div>

            {/* Main Container */}
            <div className="cs-main-container">
                <div className="cs-liquid" style={{ '--fill': fillRatio }}>
                    <div className="cs-liquid-level">
                        <div className="cs-wave"></div>
                        <div className="cs-wave-mask"></div>
                    </div>
                </div>



            </div>

            {/* Content Container */}
            <div className="cs-score-text-container">
                <div style={{ color: '#fed7aa', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 0 10px rgba(234,179,8,0.9), 0 0 20px rgba(234,179,8,0.6)', fontSize: '1em', marginBottom: '1%' }}>
                    TOTAL
                </div>
                <div style={{ color: 'white', fontWeight: 'bold', letterSpacing: '0.05em', marginTop: '-2%', marginBottom: '2%', opacity: 0.9, fontSize: '1em', backgroundColor: 'rgba(153, 27, 27, 0.6)', padding: '0 10%', borderRadius: '9999px', border: '1px solid rgba(239, 68, 68, 0.8)', boxShadow: '0 0 15px rgba(242, 0, 0, 0.5)', textShadow: '0 0 10px rgba(234, 88, 12, 0.8)' }}>
                    総合得点
                </div>

                <div className="cs-score-large" style={{ filter: 'drop-shadow(0 0 8px rgba(249, 115, 22, 0.9)) drop-shadow(0 0 15px rgba(234, 88, 12, 0.7))' }}>
                    {Number(score || 0).toFixed(2)}
                </div>

                <div style={{ color: '#fdba74', fontWeight: 'bold', marginTop: '2%', textShadow: '0 0 15px rgba(249, 115, 22, 0.8), 2px 2px 4px rgba(0,0,0,0.8)', fontSize: '2em' }}>
                    点
                </div>
            </div>


        </div>
    );
};
