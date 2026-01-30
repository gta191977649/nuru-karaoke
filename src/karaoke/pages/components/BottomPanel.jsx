import React, { useEffect, useRef, useState, useMemo } from 'react';

export const BottomPanel = React.memo(({ counts }) => {
    return (
        // Silver Metallic Container
        <div className="bp-container">

            {/* Screw heads decorations */}
            {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(pos => (
                <div key={pos}
                    style={{
                        position: 'absolute',
                        width: '1.5%',
                        aspectRatio: '1/1',
                        borderRadius: '9999px',
                        backgroundColor: '#94a3b8',
                        border: '1px solid #64748b',
                        boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...getScrewStyle(pos)
                    }}>
                    <div style={{ width: '60%', height: '1px', backgroundColor: '#475569', transform: 'rotate(45deg)' }}></div>
                </div>
            ))}

            {/* Main Inner Container (Dark Dashboard) */}
            <div className="bp-dashboard">

                {/* Section 1: Technique & Counters (Left) */}
                <div style={{ display: 'flex', flexDirection: 'row', flexShrink: 0, alignItems: 'stretch', width: '50%' }}>
                    {/* Technique Button (Circle) */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', aspectRatio: '1/1', height: '100%', padding: '1%' }}>
                        <div style={{ height: '100%', aspectRatio: '1/1', borderRadius: '9999px', background: 'linear-gradient(to bottom right, #334155, black)', border: '3px solid rgba(6, 182, 212, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', position: 'relative', cursor: 'pointer', boxSizing: 'border-box' }}>
                            <div style={{ position: 'absolute', inset: '8%', borderRadius: '9999px', border: '2px solid #22d3ee', boxShadow: '0 0 10px rgba(34,211,238,0.5)' }}></div>
                            <div style={{ textAlign: 'center', zIndex: 10, lineHeight: 1.25 }}>
                                <div style={{ color: '#cbd5e1', fontSize: '0.8em', fontWeight: 'bold' }}>テクニック</div>
                                <div style={{ color: 'white', fontWeight: '900', letterSpacing: '0.1em', fontSize: '1.5em', textShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>詳細</div>
                            </div>
                        </div>
                    </div>

                    {/* Counters Grid (2x2) */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', height: '100%', flex: 1, gap: '2%' }}>
                        <CounterBox label="こぶし" count={counts.kobushi} icon="-" type="cyan" />
                        <CounterBox label="フォール" count={counts.fall} icon="⤵" type="yellow" />
                        <CounterBox label="しゃくり" count={counts.shakuri} icon="⤴" type="purple" />
                        <CounterBox label="ビブラート" count={counts.vibrato} icon="〰" type="orange" />
                    </div>
                </div>

                {/* Section 2: Waveform Visualization (Middle) */}
                <div style={{ flex: 1, backgroundColor: 'black', borderRadius: '0.25rem', border: '2px solid #475569', position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 0 20px rgba(0,0,0,1)', margin: '0 0.5%' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'linear-gradient(to bottom, rgba(20, 83, 45, 0.3), transparent)', height: '40%', pointerEvents: 'none' }}></div>

                    <div style={{ position: 'absolute', top: '5%', left: '2%', color: '#cbd5e1', zIndex: 10, fontWeight: 'bold', letterSpacing: '0.05em', whiteSpace: 'nowrap', fontSize: '0.9em', textShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>ビブラートタイプ</div>

                    {/* Grid */}
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', justifyContent: 'space-evenly', pointerEvents: 'none', opacity: 0.2 }}>
                        {[1, 2, 3, 4].map(i => <div key={i} style={{ height: '100%', width: '1px', backgroundColor: '#22c55e' }}></div>)}
                    </div>

                    {/* Labels */}
                    <div style={{ position: 'absolute', left: '2%', top: '25%', color: '#94a3b8', fontWeight: 'bold', fontSize: '0.8em' }}>早い</div>
                    <div style={{ position: 'absolute', left: '2%', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontWeight: 'bold', fontSize: '0.8em' }}>標準</div>
                    <div style={{ position: 'absolute', left: '2%', bottom: '15%', color: '#94a3b8', fontWeight: 'bold', fontSize: '0.8em' }}>遅い</div>

                    <div style={{ position: 'absolute', bottom: '2%', left: '15%', color: '#94a3b8', fontWeight: 'bold', fontSize: '0.8em' }}>浅い</div>
                    <div style={{ position: 'absolute', bottom: '2%', left: '50%', transform: 'translateX(-50%)', color: '#94a3b8', fontWeight: 'bold', fontSize: '0.8em' }}>標準</div>
                    <div style={{ position: 'absolute', bottom: '2%', right: '5%', color: '#94a3b8', fontWeight: 'bold', fontSize: '0.8em' }}>深い</div>

                    <WaveformSVG />
                </div>

                {/* Section 3: Rhythm Analysis (Right) */}
                <div style={{ width: '20%', backgroundColor: 'black', borderRadius: '0.25rem', border: '2px solid #475569', position: 'relative', overflow: 'hidden', boxShadow: 'inset 0 0 20px rgba(0,0,0,1)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '0.5%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 2%', paddingTop: '1%' }}>
                        <span style={{ color: '#cbd5e1', fontWeight: 'bold', letterSpacing: '0.05em', fontSize: '0.9em' }}>リズム</span>
                    </div>

                    {/* Spectrum Container - Histogram */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-evenly', padding: '0 5%', paddingBottom: '1%' }}>
                        {[40, 65, 80, 100, 80, 65, 40].map((h, i) => {
                            // Mock result: Highlight 2nd bar (index 1) for demonstration as per user image
                            // In real app, this would be computed from counts/timing data
                            const isSelected = i === 1;

                            return (
                                <div key={i} style={{
                                    height: '80%',
                                    width: '10%',
                                    display: 'flex',
                                    alignItems: 'center', // Center vertically relative to container? No, bottoms aligned or center? Image looks center aligned vertically but bars have different heights? No, they look like a distribution.
                                    // Actually looking at the image, they are aligned to the vertical center of the area.
                                    justifyContent: 'center'
                                }}>
                                    <div style={{
                                        width: '100%',
                                        height: `${h}%`,
                                        backgroundColor: '#14b8a6', // Teal-500
                                        borderRadius: '0.2em',
                                        position: 'relative',
                                        opacity: isSelected ? 1 : 0.6,
                                        boxShadow: isSelected ? '0 0 10px rgba(45, 212, 191, 0.5)' : 'none'
                                    }}>
                                        {isSelected && (
                                            <div style={{
                                                position: 'absolute',
                                                top: '-10%', bottom: '-10%', left: '-20%', right: '-20%',
                                                border: '2px solid #ccfbf1', // Teal-100
                                                borderRadius: '0.3em',
                                                boxShadow: '0 0 8px rgba(20, 184, 166, 0.8)',
                                                zIndex: 10
                                            }} />
                                        )}
                                        {/* Inner gloss */}
                                        <div style={{ width: '100%', height: '100%', background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)' }}></div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Bottom Labels */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1% 2%' }}>
                        <span style={{ color: '#cbd5e1', fontWeight: 'bold', fontSize: '0.8em' }}>後ろノリ</span>
                        <span style={{ color: '#cbd5e1', fontWeight: 'bold', fontSize: '0.8em' }}>前ノリ</span>
                    </div>
                </div>
            </div>
        </div>
    );
});

const getScrewStyle = (pos) => {
    switch (pos) {
        case 'top-left': return { top: '5%', left: '1%' };
        case 'top-right': return { top: '5%', right: '1%' };
        case 'bottom-left': return { bottom: '5%', left: '1%' };
        case 'bottom-right': return { bottom: '5%', right: '1%' };
        default: return {};
    }
}

const CounterBox = ({ label, count, icon, type }) => {
    const styles = {
        cyan: { bg: '#134e4a', border: '#14b8a6', text: 'white' }, // teal-900, teal-500
        yellow: { bg: '#713f12', border: '#eab308', text: 'white' }, // yellow-900, yellow-500
        purple: { bg: '#581c87', border: '#a855f7', text: 'white' }, // purple-900, purple-500
        orange: { bg: '#7f1d1d', border: '#ef4444', text: 'white' }, // red-900, red-500
    }[type];

    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', backgroundColor: styles.bg, borderLeft: `4px solid ${styles.border}`, borderRadius: '0.125rem', height: '100%', padding: '0 5%', width: '100%', position: 'relative', overflow: 'hidden', boxSizing: 'border-box' }}>
            {/* Gloss Effect */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '50%', backgroundColor: 'rgba(255,255,255,0.05)', pointerEvents: 'none' }}></div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5%', zIndex: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '9999px', border: '1px solid rgba(255,255,255,0.5)', backgroundColor: 'rgba(0,0,0,0.8)', width: '1.4em', height: '1.4em' }}>
                    <span style={{ fontWeight: 'bold', color: 'white', fontSize: '0.9em' }}>{icon}</span>
                </div>
                <span style={{ color: 'white', fontWeight: 'bold', letterSpacing: '-0.025em', whiteSpace: 'nowrap', fontSize: '1em', textShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>{label}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', zIndex: 10 }}>
                <span className="font-digital" style={{ color: 'white', lineHeight: 1, letterSpacing: '-0.05em', fontSize: '1.3em', textShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>{count}</span>
                <span style={{ color: '#cbd5e1', marginLeft: '2px', fontSize: '0.8em' }}>回</span>
            </div>
        </div>
    );
};

const WaveformSVG = () => {
    // Animation Speed Configuration
    const animationDuration = '2s'; // Adjust speed here (e.g., '10s' for slower, '3s' for faster)

    // Generate a path definition for seamless looping
    const width = 400; // viewbox width
    const height = 100; // viewbox height
    const centerY = height / 2;
    const amplitude = height / 4;

    // Wave parameters
    // Main wave: sin(x * 0.05) -> Period = 2*PI / 0.05 = 40 * PI
    const period = 40 * Math.PI;

    // We need to generate enough points to cover width + one period
    // so that when we translate by -period, the end matches the original start visual.
    const pathD = useMemo(() => {
        let path = `M 0 ${centerY}`;

        // Generate extra length for the loop
        for (let x = 0; x <= width + period; x += 1) {
            const y = centerY +
                Math.sin(x * 0.05) * amplitude +
                Math.sin(x * 0.2) * (amplitude * 0.2); // Harmonic must also align with period.
            // 0.2 is 4 * 0.05, so harmonic period is 1/4 of main period. It aligns perfectly.

            path += ` L ${x} ${y}`;
        }
        return path;
    }, [width, period, centerY, amplitude]);

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" shapeRendering="optimizeSpeed" style={{ width: '100%', height: '100%', display: 'block' }}>
                {/* Center Line */}
                <line x1="0" y1={centerY} x2={width} y2={centerY} stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1" />

                <g>
                    {/* Animate transform from 0 to -period to create endless left scroll */}
                    <animateTransform
                        attributeName="transform"
                        type="translate"
                        from="0 0"
                        to={`${-period} 0`}
                        dur={animationDuration}
                        repeatCount="indefinite"
                    />

                    {/* Glow Path (Thicker, Transparent) */}
                    <path
                        d={pathD}
                        fill="none"
                        stroke="rgba(34, 197, 94, 0.4)"
                        strokeWidth="6"
                    />

                    {/* Core Path (Sharper, Bright) */}
                    <path
                        d={pathD}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="1.5"
                    />
                </g>
            </svg>
        </div>
    );
};
