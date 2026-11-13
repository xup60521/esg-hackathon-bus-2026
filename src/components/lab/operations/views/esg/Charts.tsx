import { type Month, nf0, orNone } from "./model";

/** Series colours come from existing CSS variables; hatching/labels carry meaning without colour. */
const C_BOTH = "var(--k-history)";
const C_OUT = "var(--muted)";
const C_FUEL = "var(--accent)";
const C_ELEC = "var(--k-forecast)";

export type MonthMetric = "trips" | "pkm";

const W = 720;
const H = 230;
const L = 56;
const B = 24;
const T = 16;

/**
 * 24 months, stacked by the fixed specified-endpoint grouping. Every month's numbers are also in
 * the table below and in the aria-label, so nothing depends on hover.
 */
export function MonthlyChart({
	months,
	metric,
}: {
	months: Month[];
	metric: MonthMetric;
}) {
	const val = (m: Month) =>
		metric === "trips"
			? [
					m.groups.bothSpecifiedEndpoints,
					m.groups.outsideSpecifiedEndpointSet,
					m.groups.unknownStop,
				]
			: [
					m.knownDistancePkmByGroup.bothSpecifiedEndpoints,
					m.knownDistancePkmByGroup.outsideSpecifiedEndpointSet,
					m.knownDistancePkmByGroup.unknownStop,
				];
	const totals = months.map((m) => val(m).reduce((a, b) => a + b, 0));
	const max = Math.max(1, ...totals);
	const bw = (W - L) / Math.max(1, months.length);
	const unit = metric === "trips" ? "旅次" : "路網近似人公里（已知部分）";
	const label = `每月${unit}，依固定指定端點集合分組堆疊：${months
		.map((m, i) => `${m.month} ${nf0.format(totals[i])}`)
		.join("、")}`;
	return (
		<svg
			viewBox={`0 0 ${W} ${H}`}
			className="w-full"
			role="img"
			aria-label={label}
		>
			<line
				x1={L}
				x2={W}
				y1={H - B}
				y2={H - B}
				style={{ stroke: "var(--axis)" }}
			/>
			<line x1={L} x2={W} y1={T} y2={T} style={{ stroke: "var(--grid)" }} />
			<text
				x={L - 6}
				y={T + 4}
				textAnchor="end"
				className="fill-[var(--muted)] text-[10px]"
			>
				{nf0.format(max)}
			</text>
			<text
				x={L - 6}
				y={H - B + 4}
				textAnchor="end"
				className="fill-[var(--muted)] text-[10px]"
			>
				0
			</text>
			{months.map((m, i) => {
				const [a, b, c] = val(m);
				const x = L + i * bw + 2;
				const w = Math.max(2, bw - 4);
				let top = H - B;
				const seg = (v: number, fill: string, k: string) => {
					const h = (v / max) * (H - B - T);
					top -= h;
					return h > 0 ? (
						<rect key={k} x={x} y={top} width={w} height={h} style={{ fill }} />
					) : null;
				};
				return (
					<g key={m.month}>
						{seg(a, C_BOTH, "a")}
						{seg(b, C_OUT, "b")}
						{seg(c, "var(--sev-review)", "c")}
						{i % 3 === 0 && (
							<text
								x={x + w / 2}
								y={H - 8}
								textAnchor="middle"
								className="fill-[var(--muted)] text-[9px]"
							>
								{m.month.slice(2)}
							</text>
						)}
					</g>
				);
			})}
		</svg>
	);
}

export function GroupLegend({ unknown }: { unknown: boolean }) {
	const item = (c: string, t: string) => (
		<span className="inline-flex items-center gap-1.5">
			<span
				className="inline-block size-2.5 rounded-sm"
				style={{ background: c }}
			/>
			{t}
		</span>
	);
	return (
		<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg2)]">
			{item(C_BOTH, "雙端均在指定端點集合")}
			{item(C_OUT, "至少一端在集合外")}
			{unknown && item("var(--sev-review)", "未知站")}
		</div>
	);
}

export type EmissionRow = {
	label: string;
	fuel: number;
	electricity: number;
	total: number;
};

/** Horizontal stacked bars: diesel combustion (solid) + purchased electricity (hatched) + labelled values. */
export function EmissionBars({
	rows,
	what,
}: {
	rows: EmissionRow[];
	what: string;
}) {
	const RW = 720;
	const LW = 150;
	const RH = 34;
	const max = Math.max(...rows.map((r) => r.total), 0);
	const scale = max > 0 ? (RW - LW - 150) / max : 0;
	const height = rows.length * RH + 8;
	const label = `${what}：${rows
		.map(
			(r) =>
				`${r.label} 合計 ${nf0.format(r.total)} kg CO2e，燃油燃燒 ${nf0.format(r.fuel)}，購電 ${nf0.format(r.electricity)}`,
		)
		.join("；")}`;
	return (
		<div>
			<svg
				viewBox={`0 0 ${RW} ${height}`}
				className="w-full"
				role="img"
				aria-label={label}
			>
				<defs>
					<pattern
						id="esg-hatch"
						width="6"
						height="6"
						patternUnits="userSpaceOnUse"
						patternTransform="rotate(45)"
					>
						<rect width="6" height="6" style={{ fill: C_ELEC }} />
						<line
							x1="0"
							y1="0"
							x2="0"
							y2="6"
							strokeWidth="2.5"
							style={{ stroke: "var(--panel)" }}
						/>
					</pattern>
				</defs>
				{rows.map((r, i) => {
					const yy = 4 + i * RH;
					const fw = r.fuel * scale;
					const ew = r.electricity * scale;
					return (
						<g key={r.label}>
							<text
								x={LW - 8}
								y={yy + 19}
								textAnchor="end"
								className="fill-[var(--fg)] text-[11px] font-semibold"
							>
								{r.label}
							</text>
							{fw > 0 && (
								<rect
									x={LW}
									y={yy + 6}
									width={fw}
									height={20}
									rx={2}
									style={{ fill: C_FUEL }}
								/>
							)}
							{ew > 0 && (
								<rect
									x={LW + fw}
									y={yy + 6}
									width={ew}
									height={20}
									rx={2}
									style={{ fill: "url(#esg-hatch)", stroke: C_ELEC }}
								/>
							)}
							<text
								x={LW + fw + ew + 8}
								y={yy + 20}
								className="fill-[var(--fg)] text-[11px] tabular-nums"
							>
								{nf0.format(r.total)} kg
							</text>
						</g>
					);
				})}
			</svg>
			<div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg2)]">
				<span className="inline-flex items-center gap-1.5">
					<span
						className="inline-block size-2.5 rounded-sm"
						style={{ background: C_FUEL }}
					/>
					柴油燃燒（實心）
				</span>
				<span className="inline-flex items-center gap-1.5">
					<span
						className="inline-block size-2.5 rounded-sm border"
						style={{
							borderColor: C_ELEC,
							background: `repeating-linear-gradient(45deg, ${C_ELEC} 0 2px, transparent 2px 4px)`,
						}}
					/>
					購電間接排放（斜線）
				</span>
				<span>單位 kg CO2e；合計 = 兩者相加</span>
			</div>
		</div>
	);
}

/** One horizontal share bar with the text values inline, for the specified-endpoint grouping. */
export function ShareBar({
	parts,
}: {
	parts: { label: string; value: number; color: string }[];
}) {
	const total = parts.reduce((a, p) => a + p.value, 0);
	return (
		<div>
			<div
				className="flex h-5 w-full overflow-hidden rounded-md border border-[var(--line)]"
				role="img"
				aria-label={parts
					.map(
						(p) =>
							`${p.label} ${orNone(total > 0 ? p.value / total : null, (n) => `${(n * 100).toFixed(1)}%`)}`,
					)
					.join("、")}
			>
				{parts.map(
					(p) =>
						p.value > 0 && (
							<div
								key={p.label}
								style={{
									width: `${(p.value / total) * 100}%`,
									background: p.color,
								}}
							/>
						),
				)}
			</div>
		</div>
	);
}

export const SHARE_COLORS = {
	both: C_BOTH,
	out: C_OUT,
	unknown: "var(--sev-review)",
};
