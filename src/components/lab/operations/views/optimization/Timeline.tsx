import type {
	Scenario,
	Solution,
	Trip,
} from "#/features/lab/optimization/solver";
import { hhmm, KIND_COLOR, KIND_LABEL } from "./model";

const W = 720;
const PAD = { top: 30, right: 12, bottom: 24, left: 64 };
const ROW = 48;

/** Gantt-style view of one scenario: resource availability, assigned trips, reservation ticks. */
export function Timeline({
	scenario,
	solution,
}: {
	scenario: Scenario;
	solution: Solution;
}) {
	const trips = new Map<string, Trip>(
		[...scenario.baseline, ...scenario.candidates].map((t) => [t.id, t]),
	);
	const assigned = solution.assignments.flatMap((a) => {
		const trip = trips.get(a.tripId);
		return trip ? [{ trip, resourceId: a.resourceId }] : [];
	});
	const target = scenario.targets[0];
	const points = [
		...scenario.resources.flatMap((r) => [r.availableFrom, r.availableUntil]),
		...assigned.flatMap((a) => [a.trip.startMinute, a.trip.endMinute]),
		...(target ? [target.readyMinute, target.deadlineMinute + 1] : []),
	];
	const lo = Math.floor(Math.min(...points) / 60) * 60;
	const hi = Math.ceil(Math.max(...points) / 60) * 60;
	const iw = W - PAD.left - PAD.right;
	const H = PAD.top + scenario.resources.length * ROW + PAD.bottom;
	const x = (m: number) => PAD.left + ((m - lo) / (hi - lo)) * iw;
	const hours: number[] = [];
	for (let m = lo; m <= hi; m += 60) hours.push(m);
	const bottom = H - PAD.bottom;

	const ariaLabel =
		solution.status === "optimal"
			? `資源占用時間軸：${scenario.resources.length} 組車輛司機配對，${assigned.length} 班被指派，` +
				`時間 ${hhmm(lo)} 至 ${hhmm(hi)}。完整數值見下方班次明細表。`
			: `資源可用時段圖：${scenario.resources.length} 組車輛司機配對，此情境無可行解，沒有班次被指派。`;

	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label={ariaLabel}
		>
			{hours.map((m) => (
				<g key={m}>
					<line
						x1={x(m)}
						x2={x(m)}
						y1={PAD.top}
						y2={bottom}
						style={{ stroke: "var(--grid)" }}
					/>
					<text
						x={x(m)}
						y={H - 8}
						textAnchor="middle"
						className="fill-[var(--muted)] text-[10px]"
					>
						{hhmm(m)}
					</text>
				</g>
			))}
			{target && (
				<g>
					<rect
						x={x(target.readyMinute)}
						y={PAD.top}
						width={x(target.deadlineMinute + 1) - x(target.readyMinute)}
						height={bottom - PAD.top}
						style={{
							fill: "color-mix(in srgb, var(--accent) 14%, transparent)",
							stroke: "var(--accent)",
						}}
						strokeDasharray="3 3"
					/>
					<text
						x={x(target.readyMinute)}
						y={PAD.top - 8}
						className="fill-[var(--accent)] text-[10px] font-semibold"
					>
						{`目標時窗 ${hhmm(target.readyMinute)}–${hhmm(target.deadlineMinute)}`}
					</text>
				</g>
			)}
			{scenario.resources.map((r, i) => {
				const ry = PAD.top + i * ROW;
				const mine = assigned.filter((a) => a.resourceId === r.id);
				return (
					<g key={r.id}>
						<text
							x={PAD.left - 6}
							y={ry + 20}
							textAnchor="end"
							className="fill-[var(--fg2)] text-[10px]"
						>
							{r.id}
						</text>
						<rect
							x={x(r.availableFrom)}
							y={ry + 2}
							width={x(r.availableUntil) - x(r.availableFrom)}
							height={28}
							rx={3}
							style={{ fill: "var(--chip)", stroke: "var(--line)" }}
						>
							<title>{`${r.id} 可用 ${hhmm(r.availableFrom)}–${hhmm(r.availableUntil)}，占用上限 ${r.maxWorkMinutes} 分鐘`}</title>
						</rect>
						{mine.map(({ trip }) => {
							const color = KIND_COLOR[trip.kind];
							return (
								<g key={trip.id}>
									<rect
										x={x(trip.startMinute)}
										y={ry + 5}
										width={x(trip.endMinute) - x(trip.startMinute)}
										height={22}
										rx={3}
										strokeDasharray={
											trip.kind === "baseline" ? "4 2" : undefined
										}
										strokeWidth={1.5}
										style={{
											fill: `color-mix(in srgb, ${color} 22%, transparent)`,
											stroke: color,
										}}
									>
										<title>{`${trip.id}（${KIND_LABEL[trip.kind]}）占用 ${hhmm(trip.startMinute)}–${hhmm(trip.endMinute)}`}</title>
									</rect>
									<text
										x={x(trip.endMinute) - 5}
										y={ry + 20}
										textAnchor="end"
										className="fill-[var(--fg)] text-[10px] font-semibold"
									>
										{`${trip.id} · ${KIND_LABEL[trip.kind]}`}
									</text>
									{trip.reservations.map((res) => (
										<g key={res.targetId}>
											<line
												x1={x(res.serviceMinute)}
												x2={x(res.serviceMinute)}
												y1={ry + 1}
												y2={ry + 31}
												strokeWidth={2.5}
												style={{ stroke: "var(--fg)" }}
											/>
											<text
												x={x(res.serviceMinute)}
												y={ry + 42}
												textAnchor="middle"
												className="fill-[var(--fg2)] text-[9px] tabular-nums"
											>
												{`${res.seats} 席 ${hhmm(res.serviceMinute)}`}
											</text>
										</g>
									))}
								</g>
							);
						})}
					</g>
				);
			})}
			<line
				x1={PAD.left}
				x2={W - PAD.right}
				y1={bottom}
				y2={bottom}
				style={{ stroke: "var(--axis)" }}
			/>
		</svg>
	);
}

export function TimelineLegend() {
	const items = [
		{ kind: "baseline", label: KIND_LABEL.baseline, dashed: true },
		{ kind: "full-extra", label: KIND_LABEL["full-extra"], dashed: false },
		{
			kind: "midstop-extra",
			label: KIND_LABEL["midstop-extra"],
			dashed: false,
		},
	] as const;
	return (
		<div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg2)]">
			{items.map((i) => (
				<span key={i.kind} className="inline-flex items-center gap-1.5">
					<span
						className="inline-block h-3 w-5 rounded-sm"
						style={{
							background: `color-mix(in srgb, ${KIND_COLOR[i.kind]} 22%, transparent)`,
							border: `1.5px ${i.dashed ? "dashed" : "solid"} ${KIND_COLOR[i.kind]}`,
						}}
					/>
					{i.label}（完整占用區間）
				</span>
			))}
			<span className="inline-flex items-center gap-1.5">
				<span
					className="inline-block h-3 w-0.5 bg-[var(--fg)]"
					style={{ borderRadius: 1 }}
				/>
				保留席位的服務時刻
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span
					className="inline-block h-3 w-5 rounded-sm border border-dashed"
					style={{
						borderColor: "var(--accent)",
						background: "color-mix(in srgb, var(--accent) 14%, transparent)",
					}}
				/>
				目標時窗
			</span>
			<span className="inline-flex items-center gap-1.5">
				<span className="inline-block h-3 w-5 rounded-sm border border-[var(--line)] bg-[var(--chip)]" />
				資源可用時段
			</span>
		</div>
	);
}
