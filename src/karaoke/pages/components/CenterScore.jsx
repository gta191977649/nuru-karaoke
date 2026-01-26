import React, { useEffect, useRef } from 'react';

export const CenterScore = ({ score }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId;
        let time = 0;

        const render = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;

            if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            ctx.scale(dpr, dpr);

            const width = rect.width;
            const height = rect.height;

            // Calculate fill level based on score (0-100)
            const fillRatio = Math.min(Math.max(score / 100, 0), 1);

            // The surface level moves from bottom (height) to top (0)
            const level = height - (fillRatio * height);

            // Background Deep Fill
            const bgGrad = ctx.createLinearGradient(0, level, 0, height);
            bgGrad.addColorStop(0, 'rgba(10, 20, 60, 0.5)');
            bgGrad.addColorStop(1, 'rgba(0, 10, 40, 0.8)');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, level, width, height - level);

            // Wave configurations
            ctx.globalCompositeOperation = 'screen';

            const waves = [
                {
                    // Deep Blue/Purple (Back)
                    gradient: (ctx, y, h) => {
                        const g = ctx.createLinearGradient(0, y - 50, 0, h);
                        g.addColorStop(0, 'rgba(80, 0, 255, 0.4)');
                        g.addColorStop(1, 'rgba(0, 0, 100, 0.1)');
                        return g;
                    },
                    period: 0.008,
                    speed: 0.015,
                    amplitude: height * 0.08,
                    offset: 0
                },
                {
                    // Cyan/Blue (Middle)
                    gradient: (ctx, y, h) => {
                        const g = ctx.createLinearGradient(0, y - 50, 0, h);
                        g.addColorStop(0, 'rgba(0, 150, 255, 0.4)');
                        g.addColorStop(1, 'rgba(0, 50, 150, 0.1)');
                        return g;
                    },
                    period: 0.012,
                    speed: 0.025,
                    amplitude: height * 0.06,
                    offset: 2
                },
                {
                    // Bright Cyan/White (Front/Surface)
                    gradient: (ctx, y, h) => {
                        const g = ctx.createLinearGradient(0, y - 30, 0, h);
                        g.addColorStop(0, 'rgba(150, 255, 255, 0.5)');
                        g.addColorStop(1, 'rgba(0, 200, 255, 0)');
                        return g;
                    },
                    period: 0.015,
                    speed: 0.035,
                    amplitude: height * 0.04,
                    offset: 4
                }
            ];

            waves.forEach((wave) => {
                ctx.beginPath();

                // Draw the wave curve
                for (let x = 0; x <= width; x += 5) {
                    const y = level + Math.sin(x * wave.period + time * wave.speed + wave.offset) * wave.amplitude;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }

                // Close shape at bottom
                ctx.lineTo(width, height);
                ctx.lineTo(0, height);
                ctx.closePath();

                // Fill with gradient
                ctx.fillStyle = wave.gradient(ctx, level, height);
                ctx.fill();
            });

            ctx.restore();

            time += 1;
            animationFrameId = requestAnimationFrame(render);
        };

        render();

        return () => cancelAnimationFrame(animationFrameId);
    }, [score]);

    return (
        <div className="center-score-wrapper">
            {/* Outer Rings */}
            <div className="cs-outer-ring-glow"></div>
            <div className="cs-inner-ring"></div>

            {/* Main Container */}
            <div className="cs-main-container">
                <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

                {/* Subtle Grid overlay */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,255,0.05) 1px, transparent 1px)', backgroundSize: '20px 20px', pointerEvents: 'none', zIndex: 10 }}></div>

                {/* Vignette */}
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, transparent, rgba(0,0,0,0.2), rgba(0,0,0,0.8))', pointerEvents: 'none', zIndex: 10 }}></div>
            </div>

            {/* Content Container */}
            <div className="cs-score-text-container">
                <div style={{ color: '#facc15', fontWeight: 'bold', letterSpacing: '0.1em', textTransform: 'uppercase', textShadow: '0 0 5px rgba(234,179,8,0.8)', fontSize: '1rem', marginBottom: '1%' }}>
                    TOTAL
                </div>
                <div style={{ color: 'white', fontWeight: 'bold', letterSpacing: '0.05em', marginTop: '-2%', marginBottom: '2%', opacity: 0.9, fontSize: '1rem', backgroundColor: 'rgba(124, 45, 18, 0.5)', padding: '0 10%', borderRadius: '9999px', border: '1px solid rgba(249, 115, 22, 0.5)' }}>
                    総合得点
                </div>

                <div className="cs-score-large">
                    {Number(score || 0).toFixed(2)}
                </div>

                <div style={{ color: '#eab308', fontWeight: 'bold', marginTop: '2%', textShadow: '2px 2px 4px rgba(0,0,0,0.5)', fontSize: '2rem' }}>
                    点
                </div>
            </div>
        </div>
    );
};
