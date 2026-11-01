import { memo, useState } from "react";

type Props = {
	/** boardings per hour of day, length 24 */
	hours: number[];
	/** currently animated hour (highlighted), or null */
	activeHour: number | null;
};

const W = 300;
const H = 96;
const PAD = { top: 6, bottom: 16, left: 2, right: 2 };

function HourBars({ hours, activeHour }: Props) {
	const [hover, setHover] = useState<number | null>(null);
	const max = Math.max(...hours, 1);
	const slot = (W - PAD.left - PAD.right) / 24;
	const barW = slot - 2; // 2px surface gap between bars
	const innerH = H - PAD.top - PAD.bottom;
	return (
		<div className="relative">
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full"
				role="img"
				aria-label="Boardings by hour of day"
			>
				<line
					x1={0}
					x2={W}
					y1={PAD.top + innerH}
					y2={PAD.top + innerH}
					style={{ stroke: "var(--axis)" }}
				/>
				{hours.map((v, h) => {
					const bh = Math.max((v / max) * innerH, v > 0 ? 1.5 : 0);
					const x = PAD.left + h * slot + 1;
					const y = PAD.top + innerH - bh;
					const r = Math.min(4, barW / 2, bh);
					const active = activeHour === h;
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: hour of day is the identity
						<g key={h}>
							{/* rounded data-end at top, square at baseline */}
							<path
								d={`M${x},${PAD.top + innerH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${PAD.top + innerH} Z`}
								style={{ fill: active ? "var(--rider)" : "var(--boarding)" }}
								fillOpacity={hover === null || hover === h ? 1 : 0.55}
							/>
							<rect
								x={PAD.left + h * slot}
								y={0}
								width={slot}
								height={H}
								fill="transparent"
								onPointerEnter={() => setHover(h)}
								onPointerLeave={() => setHover(null)}
							/>
							{h % 3 === 0 && (
								<text
									x={x + barW / 2}
									y={H - 3}
									textAnchor="middle"
									className="fill-[var(--muted)] text-[9px]"
								>
									{h}
								</text>
							)}
						</g>
					);
				})}
			</svg>
			{hover !== null && (
				<div
					className="pointer-events-none absolute -top-8 rounded-md border border-[var(--line)] bg-[var(--tip-bg)] px-2 py-1 text-[11px] text-[var(--fg)]"
					style={{
						left: `${((hover + 0.5) / 24) * 100}%`,
						transform: "translateX(-50%)",
					}}
				>
					{String(hover).padStart(2, "0")}:00 ·{" "}
					<b>{hours[hover].toLocaleString()}</b> 上車
				</div>
			)}
		</div>
	);
}

export default memo(HourBars);
