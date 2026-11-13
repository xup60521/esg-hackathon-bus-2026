import { useId } from "react";
import { pct2 } from "./format";

export type MonthBar = { month: string; wape: number | null; n: number };

const W = 720;
const H = 250;
const PAD = { top: 22, right: 12, bottom: 40, left: 44 };

/** Months with fewer common days than this are drawn hatched and labelled, never as a full-month result. */
export const LOW_DAYS = 15;

export function MonthlyWapeChart({
	bars,
	label,
}: {
	bars: MonthBar[];
	label: string;
}) {
	const hatch = `hatch-${useId().replace(/:/g, "")}`;
	const iw = W - PAD.left - PAD.right;
	const ih = H - PAD.top - PAD.bottom;
	const top = Math.max(0.05, ...bars.map((b) => b.wape ?? 0));
	const max = Math.ceil((top * 1.1) / 0.05) * 0.05;
	const y = (v: number) => PAD.top + ih - (v / max) * ih;
	const slot = iw / Math.max(1, bars.length);
	const bw = Math.min(40, slot * 0.62);
	const ticks = [0, max / 2, max];
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label={label}
		>
			<defs>
				<pattern
					id={hatch}
					width="6"
					height="6"
					patternUnits="userSpaceOnUse"
					patternTransform="rotate(45)"
				>
					<rect width="6" height="6" style={{ fill: "var(--chip)" }} />
					<line
						x1="0"
						y1="0"
						x2="0"
						y2="6"
						strokeWidth="2.5"
						style={{ stroke: "var(--boarding)" }}
					/>
				</pattern>
			</defs>
			{ticks.map((t) => (
				<g key={t}>
					<line
						x1={PAD.left}
						x2={W - PAD.right}
						y1={y(t)}
						y2={y(t)}
						style={{ stroke: t === 0 ? "var(--axis)" : "var(--grid)" }}
					/>
					<text
						x={PAD.left - 6}
						y={y(t) + 3}
						textAnchor="end"
						className="fill-[var(--muted)] text-[10px]"
					>
						{`${Math.round(t * 100)}%`}
					</text>
				</g>
			))}
			{bars.map((b, i) => {
				const cx = PAD.left + slot * (i + 0.5);
				const low = b.n < LOW_DAYS;
				return (
					<g key={b.month}>
						{b.wape !== null && (
							<rect
								x={cx - bw / 2}
								y={y(b.wape)}
								width={bw}
								height={y(0) - y(b.wape)}
								rx={2}
								style={
									low
										? {
												fill: `url(#${hatch})`,
												stroke: "var(--boarding)",
												strokeDasharray: "3 2",
											}
										: { fill: "var(--boarding)" }
								}
							/>
						)}
						<text
							x={cx}
							y={(b.wape === null ? y(0) : y(b.wape)) - 5}
							textAnchor="middle"
							className="fill-[var(--fg)] text-[10px] font-semibold"
						>
							{pct2(b.wape)}
						</text>
						<text
							x={cx}
							y={H - 22}
							textAnchor="middle"
							className="fill-[var(--fg2)] text-[10px]"
						>
							{b.month.slice(2)}
						</text>
						<text
							x={cx}
							y={H - 9}
							textAnchor="middle"
							className={`text-[10px] ${low ? "fill-[var(--fg)] font-bold" : "fill-[var(--muted)]"}`}
						>
							{low ? `僅 ${b.n} 日` : `${b.n} 日`}
						</text>
					</g>
				);
			})}
		</svg>
	);
}
