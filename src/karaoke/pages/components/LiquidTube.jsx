import React from 'react';

export const LiquidTube = ({ label, score, maxScoreDisplay }) => {
    // Calculate the displayed score based on the max possible for this column
    const displayValue = Math.floor((score / 100) * maxScoreDisplay);

    return (
        <div className="liquid-tube-container">
            {/* Top Label */}
            <div className="lt-label">
                {label}
            </div>

            {/* Tube Container */}
            <div className="lt-tube-wrapper">

                {/* Mechanical Top Cap */}
                <div style={{ position: 'absolute', top: 0, width: '100%', height: '4%', background: 'linear-gradient(to bottom, #cbd5e1, #f1f5f9, #94a3b8)', zIndex: 30, borderBottom: '1px solid #64748b' }}></div>
                <div style={{ position: 'absolute', top: '4%', width: '100%', height: '1%', backgroundColor: '#1e293b', zIndex: 20 }}></div>

                {/* Glass Reflection/Highlight */}
                <div style={{ position: 'absolute', top: 0, left: '20%', width: '15%', height: '100%', backgroundColor: 'rgba(255,255,255,0.1)', zIndex: 20, filter: 'blur(2px)', pointerEvents: 'none' }}></div>
                <div style={{ position: 'absolute', top: 0, right: '20%', width: '5%', height: '100%', backgroundColor: 'rgba(255,255,255,0.05)', zIndex: 20, filter: 'blur(1px)', pointerEvents: 'none' }}></div>

                {/* Liquid Background (Empty State) */}
                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(2, 6, 23, 0.8)' }}></div>

                {/* The Liquid */}
                <div
                    className="lt-liquid"
                    style={{ height: `${score}%` }}
                >
                    {/* Surface Tension/Top of Liquid */}
                    <div style={{ position: 'absolute', top: 0, width: '100%', backgroundColor: 'rgba(255,255,255,0.8)', filter: 'blur(2px)', transform: 'translateY(-50%) scaleX(1.25)', borderRadius: '100%', height: '3%', boxSizing: 'content-box', borderTop: '2px solid white' }}></div>

                    {/* Bubbles Animation */}
                    <div style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'hidden' }}>
                        {[...Array(8)].map((_, i) => (
                            <div
                                key={i}
                                className="animate-bubble"
                                style={{
                                    position: 'absolute',
                                    borderRadius: '9999px',
                                    border: '1px solid rgba(255,255,255,0.4)',
                                    backgroundColor: 'rgba(255,255,255,0.2)',
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
                <div style={{ position: 'absolute', bottom: 0, width: '100%', background: 'linear-gradient(to top, #1e293b, #475569, #94a3b8)', zIndex: 30, borderTop: '2px solid #64748b', height: '5%' }}></div>
            </div>

            {/* Score Box */}
            <div className="lt-score-box">
                <div className="font-digital" style={{ color: '#facc15', fontWeight: 'bold', lineHeight: 1, fontSize: '2.2em', filter: 'drop-shadow(0 0 5px rgba(234,179,8,0.8))' }}>
                    {displayValue}<span style={{ color: '#64748b', marginLeft: '2px', fontSize: '0.5em' }}>/</span>
                </div>
                <div style={{ color: '#94a3b8', fontWeight: 'bold', lineHeight: 1, marginTop: '2px', fontSize: '1em' }}>
                    {maxScoreDisplay}点
                </div>
            </div>
        </div>
    );
};
