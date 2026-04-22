// Neural swarm — starts as scattered dendrite constellation, gradually organizes
// into flocking behavior. Organic ink aesthetic: soma, dendrites, axon pulses.

const { useRef: useNRef, useEffect: useNEffect } = React;

function useDprCanvas(canvasRef, draw, deps = []) {
	useNEffect(() => {
		const cvs = canvasRef.current;
		if (!cvs) return;
		const ctx = cvs.getContext("2d");
		let raf = 0,
			running = true;
		let w = 0,
			h = 0;
		const dpr = Math.min(window.devicePixelRatio || 1, 2);
		const resize = () => {
			const r = cvs.getBoundingClientRect();
			w = r.width;
			h = r.height;
			cvs.width = Math.max(1, Math.floor(w * dpr));
			cvs.height = Math.max(1, Math.floor(h * dpr));
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(cvs);
		let t0 = performance.now();
		const tick = (t) => {
			if (!running) return;
			draw(ctx, w, h, t - t0);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			running = false;
			cancelAnimationFrame(raf);
			ro.disconnect();
		};
	}, deps);
}

// Neural swarm: an organic cohort of "neurons" that start as a scattered,
// loosely connected constellation and — as `phase` progresses 0→1 — begin
// flocking. Connections (dendrites) constantly form and break based on
// proximity; pulses (axon signals) travel along active connections.
// `phase` can be driven by scroll or left at 0 for intro hero, 1 for active.
function NeuralSwarm({
	palette,
	density = 1,
	phase = "auto",
	className,
	style,
}) {
	const ref = useNRef(null);
	const neurons = useNRef([]);
	const pulses = useNRef([]);
	const initd = useNRef(false);
	const phaseRef = useNRef(0);
	const scrollPhase = useNRef(0);

	// Track scroll position to drive phase if phase === 'auto'
	useNEffect(() => {
		if (phase !== "auto") return;
		const onScroll = () => {
			const doc = document.documentElement;
			const container = ref.current?.closest("[data-scroll-container]");
			if (container) {
				const max = container.scrollHeight - container.clientHeight;
				scrollPhase.current =
					max > 0 ? Math.min(1, container.scrollTop / (max * 0.3)) : 1;
			} else {
				const max = doc.scrollHeight - doc.clientHeight;
				scrollPhase.current =
					max > 0 ? Math.min(1, window.scrollY / (max * 0.3)) : 0;
			}
		};
		const container = ref.current?.closest("[data-scroll-container]");
		if (container)
			container.addEventListener("scroll", onScroll, { passive: true });
		else window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();
		return () => {
			if (container) container.removeEventListener("scroll", onScroll);
			else window.removeEventListener("scroll", onScroll);
		};
	}, [phase]);

	useDprCanvas(
		ref,
		(ctx, w, h, t) => {
			// Drive phase: intrinsic time-based drift from 0 → 1 over first 18s,
			// blended with scroll-driven phase if in auto mode
			const timePhase = Math.min(1, t / 18000);
			const target =
				phase === "auto"
					? Math.max(timePhase, scrollPhase.current)
					: phase === "intro"
						? timePhase
						: phase === "flock"
							? 1
							: phase === "constellation"
								? 0
								: typeof phase === "number"
									? phase
									: timePhase;
			phaseRef.current += (target - phaseRef.current) * 0.02;
			const p = phaseRef.current;

			if (!initd.current) {
				const count = Math.floor(64 * density);
				neurons.current = new Array(count).fill(0).map(() => ({
					// start positions: loose lattice with jitter (constellation-like)
					x: Math.random() * w,
					y: Math.random() * h,
					vx: (Math.random() - 0.5) * 0.08,
					vy: (Math.random() - 0.5) * 0.08,
					size: 1.8 + Math.random() * 2.2,
					phase: Math.random() * Math.PI * 2,
					freq: 0.6 + Math.random() * 0.8,
					// dendrite angles and lengths — fixed per neuron for visual variety
					dendrites: new Array(3 + Math.floor(Math.random() * 3))
						.fill(0)
						.map(() => ({
							angle: Math.random() * Math.PI * 2,
							length: 6 + Math.random() * 14,
							curve: (Math.random() - 0.5) * 0.8,
						})),
				}));
				initd.current = true;
			}

			// Background wash — subtle ink paper tone (no hard clear — slight trail)
			ctx.fillStyle = palette.bg + "ee";
			ctx.fillRect(0, 0, w, h);

			const N = neurons.current;
			const PERC = 110; // perception distance
			const SEP = 26;
			const MAX_SPD = 0.35 + 0.65 * p; // calmer at start, livelier when flocking
			const COH = 0.00018 + 0.0012 * p; // cohesion strength ramps in
			const ALIGN = 0.008 + 0.028 * p;
			const SEP_F = 0.002 + 0.004 * p;

			// Update motion
			for (let i = 0; i < N.length; i++) {
				const a = N[i];
				let cx = 0,
					cy = 0,
					avx = 0,
					avy = 0,
					sx = 0,
					sy = 0,
					n = 0;
				for (let j = 0; j < N.length; j++) {
					if (i === j) continue;
					const b = N[j];
					const dx = b.x - a.x,
						dy = b.y - a.y;
					const d2 = dx * dx + dy * dy;
					if (d2 < PERC * PERC) {
						cx += b.x;
						cy += b.y;
						avx += b.vx;
						avy += b.vy;
						n++;
						if (d2 < SEP * SEP) {
							sx -= dx;
							sy -= dy;
						}
					}
				}
				if (n > 0) {
					cx = cx / n - a.x;
					cy = cy / n - a.y;
					avx = avx / n - a.vx;
					avy = avy / n - a.vy;
					a.vx += cx * COH + avx * ALIGN + sx * SEP_F;
					a.vy += cy * COH + avy * ALIGN + sy * SEP_F;
				}
				// Center bias + brownian noise (always present, dominant at low p)
				const noiseScale = 0.04 * (1 - p * 0.7);
				a.vx += (w / 2 - a.x) * 0.00001 + (Math.random() - 0.5) * noiseScale;
				a.vy += (h / 2 - a.y) * 0.00001 + (Math.random() - 0.5) * noiseScale;
				const spd = Math.hypot(a.vx, a.vy);
				if (spd > MAX_SPD) {
					a.vx = (a.vx / spd) * MAX_SPD;
					a.vy = (a.vy / spd) * MAX_SPD;
				}
				a.x += a.vx;
				a.y += a.vy;
				// wrap
				if (a.x < -20) a.x = w + 20;
				if (a.x > w + 20) a.x = -20;
				if (a.y < -20) a.y = h + 20;
				if (a.y > h + 20) a.y = -20;
			}

			// Draw connections (synapses) — thin ink strokes. Length threshold and
			// density both evolve: more connections, stronger lines as phase ramps.
			const CR = 95 + 30 * p;
			ctx.lineCap = "round";
			for (let i = 0; i < N.length; i++) {
				const a = N[i];
				for (let j = i + 1; j < N.length; j++) {
					const b = N[j];
					const dx = b.x - a.x,
						dy = b.y - a.y;
					const d = Math.sqrt(dx * dx + dy * dy);
					if (d < CR) {
						const strength = 1 - d / CR;
						const pulseFactor =
							0.6 + 0.4 * Math.sin(t * 0.0008 + (i + j) * 0.4);
						const alpha = strength * (0.16 + 0.27 * p) * pulseFactor;
						ctx.strokeStyle =
							palette.ink +
							Math.floor(alpha * 255)
								.toString(16)
								.padStart(2, "0");
						ctx.lineWidth = 0.4 + strength * 0.5;
						// slight organic curve via quadratic midpoint
						const mx = (a.x + b.x) / 2 + Math.sin(t * 0.0005 + i) * 4;
						const my = (a.y + b.y) / 2 + Math.cos(t * 0.0005 + j) * 4;
						ctx.beginPath();
						ctx.moveTo(a.x, a.y);
						ctx.quadraticCurveTo(mx, my, b.x, b.y);
						ctx.stroke();

						// Occasionally fire a pulse along the connection (more at high phase)
						if (Math.random() < 0.0004 + 0.002 * p && strength > 0.5) {
							pulses.current.push({
								ax: a.x,
								ay: a.y,
								bx: b.x,
								by: b.y,
								mx,
								my,
								t: 0,
								dur: 50 + Math.random() * 60,
							});
						}
					}
				}
			}

			// Draw dendrites + soma for each neuron
			for (let i = 0; i < N.length; i++) {
				const a = N[i];
				const pulseGlow = 0.7 + 0.3 * Math.sin(t * 0.001 * a.freq + a.phase);

				// Dendrites — small ink hairs
				ctx.strokeStyle = palette.ink + "46";
				ctx.lineWidth = 0.6;
				for (const d of a.dendrites) {
					const ex = a.x + Math.cos(d.angle) * d.length;
					const ey = a.y + Math.sin(d.angle) * d.length;
					const mx = a.x + Math.cos(d.angle + d.curve) * d.length * 0.6;
					const my = a.y + Math.sin(d.angle + d.curve) * d.length * 0.6;
					ctx.beginPath();
					ctx.moveTo(a.x, a.y);
					ctx.quadraticCurveTo(mx, my, ex, ey);
					ctx.stroke();
				}

				// Soma — organic ink blob with accent glow
				const r = a.size;
				// outer halo (accent)
				const grd = ctx.createRadialGradient(a.x, a.y, 0, a.x, a.y, r * 6);
				grd.addColorStop(
					0,
					palette.accent +
						Math.floor(0.26 * pulseGlow * 255)
							.toString(16)
							.padStart(2, "0"),
				);
				grd.addColorStop(1, palette.accent + "00");
				ctx.fillStyle = grd;
				ctx.beginPath();
				ctx.arc(a.x, a.y, r * 6, 0, Math.PI * 2);
				ctx.fill();
				// ink body
				ctx.fillStyle = palette.ink;
				ctx.beginPath();
				ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
				ctx.fill();
				// highlight dot
				ctx.fillStyle = palette.accent;
				ctx.beginPath();
				ctx.arc(a.x, a.y, r * 0.5 * pulseGlow, 0, Math.PI * 2);
				ctx.fill();
			}

			// Advance and draw pulses
			const PLS = pulses.current;
			for (let i = PLS.length - 1; i >= 0; i--) {
				const pl = PLS[i];
				pl.t += 1;
				if (pl.t >= pl.dur) {
					PLS.splice(i, 1);
					continue;
				}
				const u = pl.t / pl.dur;
				// quadratic bezier point
				const x =
					(1 - u) * (1 - u) * pl.ax + 2 * (1 - u) * u * pl.mx + u * u * pl.bx;
				const y =
					(1 - u) * (1 - u) * pl.ay + 2 * (1 - u) * u * pl.my + u * u * pl.by;
				const fade = Math.sin(u * Math.PI);
				ctx.fillStyle = palette.pulse;
				ctx.beginPath();
				ctx.arc(x, y, 2.2 * fade, 0, Math.PI * 2);
				ctx.fill();
				// trail glow
				ctx.fillStyle = palette.pulse + "30";
				ctx.beginPath();
				ctx.arc(x, y, 6 * fade, 0, Math.PI * 2);
				ctx.fill();
			}

			// Cap pulses to avoid runaway
			if (PLS.length > 80) PLS.splice(0, PLS.length - 80);
		},
		[palette.ink, palette.accent, palette.pulse, density, phase],
	);

	return (
		<canvas
			ref={ref}
			className={className}
			style={{ display: "block", width: "100%", height: "100%", ...style }}
		/>
	);
}

Object.assign(window, { NeuralSwarm });
