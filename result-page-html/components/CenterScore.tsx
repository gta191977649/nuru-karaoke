import React, { useEffect, useRef } from 'react';

interface CenterScoreProps {
  score: number;
}

export const CenterScore: React.FC<CenterScoreProps> = ({ score }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
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
      // Added a small offset so it doesn't start completely empty or full for better visuals
      const level = height - (fillRatio * height);

      // Background Deep Fill (optional, keeps it from being too transparent at bottom)
      const bgGrad = ctx.createLinearGradient(0, level, 0, height);
      bgGrad.addColorStop(0, 'rgba(10, 20, 60, 0.5)');
      bgGrad.addColorStop(1, 'rgba(0, 10, 40, 0.8)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, level, width, height - level);

      // Wave configurations for PSP-like silky effect
      // Using 'screen' blending to make overlapping waves glow
      ctx.globalCompositeOperation = 'screen';

      const waves = [
        {
          // Deep Blue/Purple (Back)
          gradient: (ctx: CanvasRenderingContext2D, y: number, h: number) => {
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
          gradient: (ctx: CanvasRenderingContext2D, y: number, h: number) => {
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
          gradient: (ctx: CanvasRenderingContext2D, y: number, h: number) => {
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
    // Scaled relative to parent
    <div className="relative flex items-center justify-center w-[90%] aspect-square max-h-full">
      {/* Outer Rings */}
      <div className="absolute inset-0 rounded-full border-[4px] border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.8)]"></div>
      <div className="absolute inset-[2%] rounded-full border-[2px] border-blue-600"></div>
      
      {/* Main Container */}
      <div className="absolute inset-[3%] rounded-full bg-black shadow-inner overflow-hidden z-0">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          
          {/* Subtle Grid overlay for Tech feel */}
          <div className="absolute inset-0 bg-[linear-gradient(rgba(0,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none z-10"></div>
          
          {/* Vignette */}
          <div className="absolute inset-0 bg-radial-gradient from-transparent via-black/20 to-black/80 pointer-events-none z-10"></div>
      </div>

      {/* Content Container */}
      <div className="relative z-20 text-center flex flex-col items-center justify-center">
        <div className="text-yellow-400 font-bold tracking-widest uppercase drop-shadow-[0_0_5px_rgba(234,179,8,0.8)] text-[180%] mb-[1%]">
          TOTAL
        </div>
        <div className="text-white font-bold tracking-wide -mt-[2%] mb-[2%] opacity-90 text-[100%] bg-orange-900/50 px-[10%] rounded-full border border-orange-500/50">
          総合得点
        </div>
        
        <div className="font-digital font-bold text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 via-yellow-400 to-orange-500 drop-shadow-[0_0_20px_rgba(234,179,8,1)] tracking-tighter leading-none text-[900%]">
          {score.toFixed(2)}
        </div>
        
        <div className="text-yellow-500 font-bold mt-[2%] drop-shadow-md text-[300%]">
          点
        </div>
      </div>
    </div>
  );
};