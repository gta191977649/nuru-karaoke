import React, { useEffect, useRef, useState } from 'react';

export const BottomPanel = ({ counts }) => {
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

                    {/* Spectrum Container */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '1px', padding: '0 3%', paddingBottom: '1%' }}>
                        {Array.from({ length: 24 }).map((_, i) => (
                            <RhythmBar key={i} index={i} />
                        ))}
                    </div>

                    {/* Bottom Labels */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: 'rgba(15, 23, 42, 0.8)', borderTop: '1px solid #334155', padding: '1% 2%' }}>
                        <span style={{ color: '#cbd5e1', fontWeight: 'bold', fontSize: '0.7em' }}>後ろノリ</span>
                        <span style={{ color: '#cbd5e1', fontWeight: 'bold', fontSize: '0.7em' }}>前ノリ</span>
                    </div>
                </div>

            </div>
        </div>
    );
};

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
    let pathD = `M 0 ${centerY}`;

    // Generate extra length for the loop
    for (let x = 0; x <= width + period; x += 1) {
        const y = centerY +
            Math.sin(x * 0.05) * amplitude +
            Math.sin(x * 0.2) * (amplitude * 0.2); // Harmonic must also align with period. 
        // 0.2 is 4 * 0.05, so harmonic period is 1/4 of main period. It aligns perfectly.

        pathD += ` L ${x} ${y}`;
    }

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                <filter id="glow">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                {/* Center Line */}
                <line x1="0" y1={centerY} x2={width} y2={centerY} stroke="rgba(255, 255, 255, 0.2)" strokeWidth="1" />

                {/* Wave Path */}
                <path
                    d={pathD}
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    filter="url(#glow)"
                >
                    {/* Animate transform from 0 to -period to create endless left scroll */}
                    <animateTransform
                        attributeName="transform"
                        type="translate"
                        from="0 0"
                        to={`${-period} 0`}
                        dur={animationDuration}
                        repeatCount="indefinite"
                    />
                </path>
            </svg>
        </div>
    );
};

const RhythmBar = ({ index }) => {
    // Generate random animation parameters once
    const style = React.useMemo(() => {
        const duration = 0.5 + Math.random() * 1.5; // Random duration between 0.5s and 2s
        const delay = Math.random() * -2; // Random negative delay to start at different points

        // Gradient Color Logic
        let hue = 0;
        if (index < 6) hue = 0 + (index * 5); // Red to Orange
        else if (index < 12) hue = 60 + ((index - 6) * 10); // Yellow to Green
        else if (index < 18) hue = 180 + ((index - 12) * 10); // Cyan to Blue
        else hue = 280 + ((index - 18) * 10); // Purple to Pink

        const color = `hsla(${hue}, 100%, 50%, 0.8)`;
        const shadow = `hsla(${hue}, 100%, 50%, 0.5)`;

        return {
            backgroundColor: color,
            boxShadow: `0 0 5px ${shadow}`,
            animationDuration: `${duration}s`,
            animationDelay: `${delay}s`,
            height: '10%' // start height
        };
    }, [index]);

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
            <div
                className="animate-rhythm"
                style={{
                    width: '100%',
                    borderTopLeftRadius: '0.125rem',
                    borderTopRightRadius: '0.125rem',
                    ...style
                }}
            />
        </div>
    );
};
