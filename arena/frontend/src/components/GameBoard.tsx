import { useEffect, useMemo, useRef, useState } from 'react';
import { useGameStore } from '../store';
import { addAlpha, lightenHex, RESOURCE_PALETTE, TERRAIN } from '../lib/colors';
import { drawHexPath, hexToPixel } from '../lib/hex-math';

export function GameBoard() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const dirtyRef = useRef<boolean>(true);
  const drawRef = useRef<((now: number) => void) | null>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const hexGrid = useGameStore((state) => state.gameState.hexGrid);
  const productionNumber = useGameStore((state) => state.gameState.productionNumber);
  const selectedHex = useGameStore((state) => state.selectedHex);
  const setSelectedHex = useGameStore((state) => state.setSelectedHex);

  const sortedHexes = useMemo(() => [...hexGrid].sort((a, b) => a.r - b.r || a.q - b.q), [hexGrid]);
  const hexesRef = useRef(sortedHexes);
  hexesRef.current = sortedHexes;
  const prodRef = useRef(productionNumber);
  prodRef.current = productionNumber;
  const hoverRef = useRef(hoveredKey);
  hoverRef.current = hoveredKey;
  const selRef = useRef(selectedHex);
  selRef.current = selectedHex;

  const scheduleRedraw = () => {
    if (rafIdRef.current !== null) return;
    if (document.hidden) return;
    rafIdRef.current = requestAnimationFrame((now) => {
      rafIdRef.current = null;
      if (!dirtyRef.current) return;
      const draw = drawRef.current;
      if (draw) draw(now);
      dirtyRef.current = false;
    });
  };

  const invalidate = () => {
    dirtyRef.current = true;
    scheduleRedraw();
  };

  useEffect(() => {
    const shell = shellRef.current;
    const canvas = canvasRef.current;
    if (!shell || !canvas) return;

    const resize = () => {
      const rect = shell.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      invalidate();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(shell);
    resize();

    const draw = (now: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = shell.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);

      const currentHexes = hexesRef.current;
      const currentProd = prodRef.current;
      const currentHover = hoverRef.current;
      const currentSel = selRef.current;

      if (currentHexes.length === 0) {
        ctx.fillStyle = 'rgba(247,238,220,0.56)';
        ctx.font = '600 14px SFMono-Regular, Menlo, Monaco, Consolas, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Waiting for world data...', rect.width / 2, rect.height / 2);
        return;
      }

      const centerX = rect.width / 2;
      const centerY = rect.height / 2 + 6;
      const size = Math.min(rect.width, rect.height) / 7.9;
      const inner = size * 0.92;

      for (const hex of currentHexes) {
        const terrain = TERRAIN[hex.terrain as keyof typeof TERRAIN] ?? TERRAIN.wasteland;
        const position = hexToPixel(hex.q, hex.r, centerX, centerY, size);
        const key = `${hex.q},${hex.r}`;
        const producing = Number(hex.productionNumber || 0) === Number(currentProd || -1) && Number(hex.productionNumber || 0) > 0;
        const pulse = 0.55 + 0.45 * Math.sin(now / 420 + (hex.q + hex.r) * 0.3);
        const selected = currentSel?.q === hex.q && currentSel?.r === hex.r;
        const hovered = currentHover === key;

        ctx.save();
        drawHexPath(ctx, position.x, position.y + 5, inner);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fill();
        ctx.restore();

        drawHexPath(ctx, position.x, position.y, inner);
        const fill = ctx.createRadialGradient(position.x - inner * 0.18, position.y - inner * 0.35, inner * 0.05, position.x, position.y, inner * 1.15);
        fill.addColorStop(0, lightenHex(terrain.fill, 32));
        fill.addColorStop(0.38, terrain.fill);
        fill.addColorStop(1, terrain.dark);
        ctx.fillStyle = fill;
        ctx.fill();

        ctx.save();
        drawHexPath(ctx, position.x, position.y, inner);
        ctx.clip();
        ctx.strokeStyle = terrain.highlight;
        ctx.lineWidth = 1.2;
        const spacing = size * 0.18;
        for (let offset = -inner * 1.5; offset < inner * 1.5; offset += spacing) {
          ctx.beginPath();
          ctx.moveTo(position.x - inner + offset, position.y - inner);
          ctx.lineTo(position.x + inner + offset, position.y + inner);
          ctx.stroke();
        }
        ctx.restore();

        ctx.save();
        drawHexPath(ctx, position.x, position.y, inner);
        ctx.clip();
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 0.6;
        const vSpacing = size * 0.22;
        for (let offset = -inner * 1.5; offset < inner * 1.5; offset += vSpacing) {
          ctx.beginPath();
          ctx.moveTo(position.x - inner, position.y - inner + offset);
          ctx.lineTo(position.x + inner, position.y - inner + offset);
          ctx.stroke();
        }
        ctx.restore();

        drawHexPath(ctx, position.x, position.y, inner);
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const glowAlpha = producing ? 0.28 + 0.12 * pulse : hovered ? 0.18 : 0.06;
        drawHexPath(ctx, position.x, position.y, inner);
        ctx.fillStyle = terrain.glow;
        ctx.globalAlpha = glowAlpha;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.save();
        drawHexPath(ctx, position.x, position.y, inner + 3);
        ctx.strokeStyle = lightenHex(terrain.fill, 50);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        if (producing || hovered || selected) {
          ctx.save();
          drawHexPath(ctx, position.x, position.y, inner + 5);
          ctx.strokeStyle = selected ? addAlpha(terrain.fill, 0.92) : addAlpha(terrain.fill, 0.50 + pulse * 0.18);
          ctx.lineWidth = selected ? 5 : 4.5;
          ctx.shadowColor = terrain.fill;
          ctx.shadowBlur = selected ? 32 : 28 * pulse;
          ctx.stroke();
          ctx.restore();
        }

        drawHexPath(ctx, position.x, position.y, inner);
        ctx.strokeStyle = lightenHex(terrain.fill, 45);
        ctx.lineWidth = hovered ? 3 : 2.4;
        ctx.stroke();

        ctx.fillStyle = 'rgba(252, 244, 225, 0.75)';
        ctx.font = `700 ${size * 0.115}px SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(terrain.symbol, position.x, position.y - size * 0.17);

        ctx.save();
        ctx.fillStyle = 'rgba(247, 238, 220, 0.68)';
        ctx.shadowColor = 'rgba(0,0,0,0.75)';
        ctx.shadowBlur = 8;
        ctx.font = `600 ${size * 0.088}px SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
        ctx.fillText((hex.regionName || terrain.label).toUpperCase(), position.x, position.y + size * 0.21);
        ctx.restore();

        if (Number(hex.productionNumber || 0) > 0 && hex.terrain !== 'wasteland') {
          const badgeY = position.y - inner * 0.52;
          ctx.beginPath();
          ctx.arc(position.x, badgeY, size * 0.16, 0, Math.PI * 2);
          ctx.fillStyle = producing ? 'rgba(252, 244, 225, 0.95)' : 'rgba(12, 15, 12, 0.82)';
          ctx.fill();
          ctx.strokeStyle = producing ? addAlpha(terrain.fill, 0.72) : 'rgba(252, 244, 225, 0.16)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = producing ? '#1a1510' : 'rgba(247,238,220,0.78)';
          ctx.font = `800 ${size * 0.155}px SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
          ctx.fillText(String(hex.productionNumber), position.x, badgeY + 1);
        }
      }
    };

    drawRef.current = draw;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current);
          rafIdRef.current = null;
        }
      } else {
        invalidate();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleRedraw();

    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, []);

  useEffect(() => {
    invalidate();
  }, [hexGrid, productionNumber, selectedHex]);

  const updateHover = (clientX: number, clientY: number) => {
    const shell = shellRef.current;
    if (!shell || sortedHexes.length === 0) return;
    const rect = shell.getBoundingClientRect();
    const centerX = rect.width / 2;
    const centerY = rect.height / 2 + 6;
    const size = Math.min(rect.width, rect.height) / 7.9;
    const inner = size * 0.92;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let nextHover: string | null = null;

    for (const hex of sortedHexes) {
      const p = hexToPixel(hex.q, hex.r, centerX, centerY, size);
      const distance = Math.hypot(x - p.x, y - p.y);
      if (distance <= inner * 0.95) {
        nextHover = `${hex.q},${hex.r}`;
        break;
      }
    }

    if (nextHover !== hoverRef.current) {
      setHoveredKey(nextHover);
      invalidate();
    }
  };

  const onClick = () => {
    if (!hoveredKey) return;
    const [q, r] = hoveredKey.split(',').map(Number);
    if (Number.isFinite(q) && Number.isFinite(r)) {
      setSelectedHex({ q, r });
      invalidate();
    }
  };

  return (
    <div className="relative min-h-[560px] flex flex-col rounded-[18px] border border-[var(--color-line)] overflow-hidden bg-[radial-gradient(circle_at_50%_18%,rgba(221,180,105,0.12),transparent_22%),radial-gradient(circle_at_50%_50%,rgba(114,169,181,0.12),transparent_34%),linear-gradient(180deg,#08131f_0%,#0a1623_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_70px_rgba(0,0,0,0.28)]">
      <div
        ref={shellRef}
        className="flex-1 min-h-0"
        onMouseMove={(event) => updateHover(event.clientX, event.clientY)}
        onMouseLeave={() => {
          setHoveredKey(null);
          invalidate();
        }}
        onClick={onClick}
      >
        <canvas ref={canvasRef} className="w-full h-full block" />
      </div>

      <div className="shrink-0 flex flex-wrap gap-3 px-5 py-4 border-t border-[rgba(233,220,190,0.1)] bg-[rgba(8,16,24,0.6)]">
        {Object.values(TERRAIN).map((terrain) => (
          <span key={terrain.label} className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-[rgba(10,20,31,0.7)] border border-[rgba(233,220,190,0.16)] text-[11px] text-[var(--color-text-muted)]">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RESOURCE_PALETTE[terrain.label as keyof typeof RESOURCE_PALETTE] ?? terrain.fill }} />
            {terrain.label}
          </span>
        ))}
      </div>
    </div>
  );
}
