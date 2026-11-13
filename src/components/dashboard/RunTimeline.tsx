import { useMemo } from "react";
import {
	type Alert,
	alertState,
	type Day,
	loadSegments,
	type Seats,
	seatStatus,
} from "#/features/dashboard/replay";
import { ALERT, DIR_LABEL, STATUS } from "./status";

export const DAY_START = 5 * 3600;
export const DAY_END = 24 * 3600;
const W = 1000;
const LABEL = 130;
const ROW = 17;
const TOP = 22;

export default function RunTimeline({
	day,
	t,
	seats,
	onlyBusy,
	onSeek,
}: {
	day: Day;
	t: number;
	seats: Seats;
	onlyBusy: boolean;
	onSeek: (t: number) => void;
}) {
	const all = useMemo(
		() =>
			day.runs
				.filter((r) => r.boards.length > 0)
				.sort((a, b) => a.start - b.start)
				.map((r) => ({
					run: r,
					segs: loadSegments(r),
					alerts: day.alerts.filter((a) => a.run === r),
				})),
		[day],
	);
	// only what the system has seen by time t
	const rows = all
		.filter(({ run }) => run.start <= t)
		.map((r) => ({ ...r, segs: r.segs.filter((s) => s.t0 <= t) }))
		.filter(({ segs }) => !onlyBusy || segs.some((s) => s.load >= seats - 5));
	const sx = (s: number) =>
		LABEL + ((s - DAY_START) / (DAY_END - DAY_START)) * (W - LABEL - 8);
	const H = TOP + rows.length * ROW + 6;
	const hours = Array.from({ length: 10 }, (_, i) => 6 + i * 2);

	const seek = (e: React.MouseEvent<SVGSVGElement>) => {
		const box = e.currentTarget.getBoundingClientRect();
		const x = ((e.clientX - box.left) / box.width) * W;
		if (x < LABEL) return;
		const s =
			DAY_START + ((x - LABEL) / (W - LABEL - 8)) * (DAY_END - DAY_START);
		onSeek(Math.max(DAY_START, Math.min(DAY_END, s)));
	};

	if (rows.length === 0)
		return (
			<p className="py-6 text-center text-xs text-[var(--muted)]">
				到目前為止沒有班次的推估載客達「座位不多」門檻（{seats} 席情境）。
			</p>
		);

	return (
		<div className="max-h-[440px] overflow-y-auto">
			{/* biome-ignore lint/a11y/useKeyWithClickEvents: the time slider is the keyboard path */}
			<svg
				viewBox={`0 0 ${W} ${H}`}
				className="w-full cursor-crosshair"
				role="img"
				aria-label="各班次推估載客時間軸"
				onClick={seek}
			>
				{hours.map((h) => (
					<g key={h}>
						<line
							x1={sx(h * 3600)}
							x2={sx(h * 3600)}
							y1={TOP - 4}
							y2={H}
							stroke="var(--grid)"
						/>
						<text
							x={sx(h * 3600)}
							y={12}
							fontSize={12}
							textAnchor="middle"
							fill="var(--muted)"
						>
							{String(h).padStart(2, "0")}:00
						</text>
					</g>
				))}
				{rows.map(({ run, segs, alerts }, i) => {
					const y = TOP + i * ROW;
					const dir = t >= run.dirAt ? run.dir : 0;
					return (
						<g key={run.i}>
							<text x={0} y={y + 10} fontSize={12} fill="var(--fg2)">
								{run.sub} {DIR_LABEL[dir]}
							</text>
							<line
								x1={sx(run.start)}
								x2={sx(Math.min(run.end, t))}
								y1={y + 5}
								y2={y + 5}
								stroke="var(--line)"
								strokeWidth={1}
							/>
							{segs.map((s) => {
								const st = seatStatus(s.load, seats);
								return (
									<rect
										key={s.t0}
										x={sx(s.t0)}
										y={st === "ok" ? y + 3 : y + 1}
										width={Math.max(0.6, sx(Math.min(s.t1, t)) - sx(s.t0))}
										height={st === "ok" ? 4 : 8}
										fill={STATUS[st].color}
										opacity={st === "ok" ? 0.45 : 1}
									/>
								);
							})}
							{alerts.map((a) => (
								<AlertMark key={a.t} a={a} x={sx(a.t)} y={y} t={t} />
							))}
						</g>
					);
				})}
				<line
					x1={sx(t)}
					x2={sx(t)}
					y1={TOP - 6}
					y2={H}
					stroke="var(--accent)"
					strokeWidth={2}
				/>
			</svg>
		</div>
	);
}

function AlertMark({
	a,
	x,
	y,
	t,
}: {
	a: Alert;
	x: number;
	y: number;
	t: number;
}) {
	if (t < a.t) return null;
	const st = alertState(a, t);
	return (
		<path
			d={`M${x - 5} ${y - 3} L${x + 5} ${y - 3} L${x} ${y + 5} Z`}
			fill={st === "pending" ? "var(--chart-surface)" : ALERT[st].color}
			stroke={st === "pending" ? "var(--fg)" : "var(--chart-surface)"}
			strokeWidth={1.5}
		>
			<title>{ALERT[st].label}</title>
		</path>
	);
}
