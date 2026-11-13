import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Download, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HourProfile, RatioBars } from "#/components/MidstopCharts";
import {
	type Analysis,
	analyze,
	defaultRoles,
	type MidstopData,
	type Params,
	quality,
	type Role,
	RULES,
	type Slot,
	slotsToCsv,
} from "#/lib/midstop";
import { SUBROUTES, THEME_KEY, type Theme, themeVars } from "#/lib/palette";

export const Route = createFileRoute("/analysis")({
	component: AnalysisPage,
	head: () => ({ meta: [{ title: "6670 中站上車低窪分析" }] }),
});

const fmt = new Intl.NumberFormat("en-US");
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const EXPECTED_TOTAL = 1_800_910;
const ROLE_NEXT: Record<Role, Role> = {
	endpoint: "middle",
	middle: "off",
	off: "endpoint",
};
const ROLE_LABEL: Record<Role, string> = {
	endpoint: "端點",
	middle: "中站",
	off: "不計",
};
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const pct = (v: number | null) =>
	v === null ? "–" : `${Math.round(v * 100)}%`;
const one = (v: number | null) => (v === null ? "–" : v.toFixed(1));
const weekday = (d: string) => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()];

function AnalysisPage() {
	const [theme, setTheme] = useState<Theme>("light");
	useEffect(() => {
		const saved = localStorage.getItem(THEME_KEY);
		if (saved === "dark" || saved === "light") setTheme(saved);
	}, []);
	const toggleTheme = () =>
		setTheme((t) => {
			const next = t === "light" ? "dark" : "light";
			localStorage.setItem(THEME_KEY, next);
			return next;
		});

	const [data, setData] = useState<MidstopData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [params, setParams] = useState<Params | null>(null);
	useEffect(() => {
		fetch("/data/midstop.json")
			.then((r) => {
				if (!r.ok) throw new Error(`midstop.json: HTTP ${r.status}`);
				return r.json() as Promise<MidstopData>;
			})
			.then(
				(d) => {
					setData(d);
					const dates = d.rows.map((r) => r[0]);
					setParams({
						subroutes: SUBROUTES.filter((s) => s !== "6670H"),
						direction: "outbound",
						from: dates.reduce((a, b) => (a < b ? a : b)),
						to: dates.reduce((a, b) => (a > b ? a : b)),
						roles: defaultRoles(d.stops),
						reference: "board",
						lag: 1,
					});
				},
				(e: Error) => setError(e.message),
			);
	}, []);

	const q = useMemo(
		() => (data && params ? quality(data.rows, params.subroutes) : null),
		[data, params],
	);
	const result = useMemo(
		() => (data && params ? analyze(data.rows, params) : null),
		[data, params],
	);
	const set = (patch: Partial<Params>) =>
		setParams((p) => (p ? { ...p, ...patch } : p));

	return (
		<div
			data-theme={theme}
			style={themeVars(theme)}
			className="min-h-screen bg-[var(--bg)] text-[var(--fg)]"
		>
			<div className="mx-auto max-w-[1080px] px-4 py-6 sm:px-6">
				<div className="flex items-center justify-between">
					<Link to="/" className="btn">
						<ArrowLeft className="size-4" /> 回 3D 地圖 Back to 3D map
					</Link>
					<button
						type="button"
						onClick={toggleTheme}
						className="btn px-2"
						aria-label={theme === "light" ? "深色模式" : "淺色模式"}
					>
						{theme === "light" ? (
							<Moon className="size-4" />
						) : (
							<Sun className="size-4" />
						)}
					</button>
				</div>

				<header className="mt-6">
					<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
						6670 台灣好行日月潭線 · 統計線索
					</div>
					<h1 className="mt-1 text-2xl font-bold">中站上車低窪分析</h1>
					<p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-[var(--fg2)]">
						假說：頭尾站特別擁擠時，同方向的中站（如埔里、暨大）上車人數會異常偏低，
						可能代表車已坐滿、中站旅客搭不上。本頁以 2024–2025
						年刷卡紀錄檢查這個關聯是否出現。
						刷卡只記錄已上車的人，因此結果只能作為線索，無法證明拒載或客滿。
					</p>
				</header>

				{error && (
					<div className="panel mt-6 p-4 text-sm text-red-600">⚠ {error}</div>
				)}
				{!error && !result && (
					<div className="mt-10 text-sm text-[var(--fg2)]">
						載入分析資料中… Loading…
					</div>
				)}

				{data && params && result && q && (
					<>
						<Controls data={data} params={params} set={set} />
						<Verdict result={result} params={params} />

						<section className="panel mt-4 p-4">
							<h2 className="text-sm font-semibold">
								原始量：每日平均每小時人次
							</h2>
							<p className="mt-0.5 text-xs text-[var(--muted)]">
								範圍內 {fmt.format(result.activeDates)}{" "}
								個有紀錄日期的平均，依實際刷卡時間分桶（未套用時間差）。三條線分開呈現，不加總。
							</p>
							<div className="mt-3">
								<HourProfile profile={result.profile} />
							</div>
						</section>

						<section className="panel mt-4 p-4">
							<h2 className="text-sm font-semibold">
								端點越擁擠，中站上車是否越少？
							</h2>
							<p className="mt-0.5 text-xs text-[var(--muted)]">
								每個「日期×時段」依{" "}
								{params.reference === "board" ? "端點上車" : "端點下車"}
								相對基準的倍數分組；長條是同組中站上車總和 ÷
								中站基準總和（時間差 {params.lag >= 0 ? "+" : ""}
								{params.lag} 小時）。虛線為 100% = 與平常相同。
								若假說成立，右側長條應明顯低於左側。只計中站基準 ≥{" "}
								{RULES.minMidBase} 人的時段。
							</p>
							<div className="mt-3">
								<RatioBars bins={result.bins} />
							</div>
						</section>

						<Evidence result={result} params={params} />
						<Quality q={q} data={data} />
						<Limitations />
					</>
				)}
			</div>
		</div>
	);
}

function Segmented<T extends string | number>({
	options,
	value,
	onChange,
}: {
	options: [T, string][];
	value: T;
	onChange: (v: T) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1">
			{options.map(([v, label]) => (
				<button
					key={String(v)}
					type="button"
					className={`btn ${v === value ? "btn-active" : ""}`}
					aria-pressed={v === value}
					onClick={() => onChange(v)}
				>
					{label}
				</button>
			))}
		</div>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">
				{label}
			</div>
			{children}
		</div>
	);
}

function Controls({
	data,
	params,
	set,
}: {
	data: MidstopData;
	params: Params;
	set: (p: Partial<Params>) => void;
}) {
	const toggleSub = (s: string) => {
		const next = params.subroutes.includes(s)
			? params.subroutes.filter((x) => x !== s)
			: [...params.subroutes, s];
		if (next.length) set({ subroutes: next });
	};
	const stops = [...data.stops].sort((a, b) => a.order - b.order);
	return (
		<section className="panel mt-6 grid gap-4 p-4 sm:grid-cols-2">
			<Field label="方向 Direction">
				<Segmented
					options={[
						["outbound", "去程 臺中 → 日月潭"],
						["inbound", "回程 日月潭 → 臺中"],
					]}
					value={params.direction}
					onChange={(direction) => set({ direction })}
				/>
			</Field>
			<Field label="支線 Sub-routes（H 只到埔里，預設排除，請分開分析）">
				<div className="flex flex-wrap gap-1">
					{SUBROUTES.map((s) => (
						<button
							key={s}
							type="button"
							className={`btn ${params.subroutes.includes(s) ? "btn-active" : ""}`}
							aria-pressed={params.subroutes.includes(s)}
							onClick={() => toggleSub(s)}
						>
							<span
								className="inline-block size-2 rounded-sm"
								style={{ background: `var(--s-${s})` }}
							/>
							{s.replace("6670", "")}
						</button>
					))}
				</div>
			</Field>
			<Field label="比較對象 Reference">
				<Segmented
					options={[
						["board", "端點上車（起點擁擠）"],
						["alight", "端點下車（終點擁擠）"],
					]}
					value={params.reference}
					onChange={(reference) =>
						set({ reference, lag: reference === "board" ? 1 : -1 })
					}
				/>
			</Field>
			<Field label="時間差 Lag：中站時段 = 端點時段 + lag">
				<Segmented
					options={[-2, -1, 0, 1, 2].map((l) => [
						l,
						`${l > 0 ? "+" : ""}${l} h`,
					])}
					value={params.lag}
					onChange={(lag) => set({ lag })}
				/>
			</Field>
			<Field label="觀察日期 Date range（基準仍取全資料同月同星期）">
				<div className="flex items-center gap-2 text-xs">
					<input
						type="date"
						className="btn"
						value={params.from}
						onChange={(e) => e.target.value && set({ from: e.target.value })}
					/>
					–
					<input
						type="date"
						className="btn"
						value={params.to}
						onChange={(e) => e.target.value && set({ to: e.target.value })}
					/>
				</div>
			</Field>
			<Field label="站點角色 Stop roles（點擊切換：端點 → 中站 → 不計）">
				<div className="flex flex-wrap gap-1">
					{stops.map((s) => {
						const role = params.roles[s.name] ?? "off";
						return (
							<button
								key={s.name}
								type="button"
								className={`btn ${role === "off" ? "opacity-50" : ""}`}
								style={
									role === "off"
										? undefined
										: {
												borderColor:
													role === "endpoint"
														? "var(--boarding)"
														: "var(--middle)",
											}
								}
								title={ROLE_LABEL[role]}
								onClick={() =>
									set({
										roles: { ...params.roles, [s.name]: ROLE_NEXT[role] },
									})
								}
							>
								<span className="text-[10px] text-[var(--muted)]">
									{ROLE_LABEL[role]}
								</span>
								{s.name}
							</button>
						);
					})}
				</div>
			</Field>
		</section>
	);
}

const VERDICT: Record<Analysis["verdict"], { title: string; tone: string }> = {
	signal: { title: "出現支持假說的線索", tone: "var(--accent)" },
	weak: { title: "線索很弱", tone: "var(--fg2)" },
	"not-supported": { title: "此設定下資料不支持假說", tone: "var(--fg2)" },
	insufficient: { title: "樣本不足，無法判斷", tone: "var(--muted)" },
};

function Verdict({ result, params }: { result: Analysis; params: Params }) {
	const v = VERDICT[result.verdict];
	const { high, other, correlation } = result;
	const ref = params.reference === "board" ? "端點上車" : "端點下車";
	return (
		<section className="panel mt-4 p-4">
			<div className="text-[11px] font-medium text-[var(--muted)]">
				結論 Verdict
			</div>
			<div className="mt-0.5 text-lg font-bold" style={{ color: v.tone }}>
				{v.title}
			</div>
			<div className="mt-3 grid gap-2 sm:grid-cols-4">
				<Stat
					label={`${ref}高峰時段的中站上車`}
					value={pct(high.ratio)}
					sub={`為基準的比例 · ${fmt.format(high.slots)} 時段`}
				/>
				<Stat
					label="其他時段的中站上車"
					value={pct(other.ratio)}
					sub={`為基準的比例 · ${fmt.format(other.slots)} 時段`}
				/>
				<Stat
					label="偏差相關係數 r"
					value={correlation.r === null ? "–" : correlation.r.toFixed(2)}
					sub={`${fmt.format(correlation.n)} 組配對；負值才符合假說`}
				/>
				<Stat
					label="候選低窪時段"
					value={fmt.format(result.candidates.length)}
					sub="端點高峰且中站 ≤ 基準一半"
				/>
			</div>
			<p className="mt-3 max-w-[80ch] text-xs leading-relaxed text-[var(--fg2)]">
				判斷方式：「高峰」= {ref} ≥ 基準 {RULES.highRatio} 倍且多出 ≥{" "}
				{RULES.highMinExcess}{" "}
				人。比較高峰與其他時段的中站上車÷基準（合併計算）： 高峰時段低 10
				個百分點以上記為「出現線索」，低 0–10 為「很弱」，
				不低則「不支持」；高峰時段少於 10 個為樣本不足。
				基準為同支線組合、同方向、同時段、同月份同星期其他有紀錄日期的平均（排除觀察日，至少{" "}
				{RULES.minBaselineDays} 天）。即使出現線索，也只是相關，
				可能來自天候、停駛、改道或需求改變，不代表證實拒載。
			</p>
		</section>
	);
}

function Stat({
	label,
	value,
	sub,
}: {
	label: string;
	value: string;
	sub: string;
}) {
	return (
		<div className="rounded-lg bg-[var(--chip)] px-3 py-2">
			<div className="text-[11px] text-[var(--muted)]">{label}</div>
			<div className="text-xl font-bold tabular-nums">{value}</div>
			<div className="text-[10px] text-[var(--fg2)]">{sub}</div>
		</div>
	);
}

const TABLE_LIMIT = 50;

function Evidence({ result, params }: { result: Analysis; params: Params }) {
	const download = () => {
		const blob = new Blob([slotsToCsv(result.slots, params)], {
			type: "text/csv;charset=utf-8",
		});
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = `midstop-${params.direction}-${params.from}-${params.to}.csv`;
		a.click();
		URL.revokeObjectURL(a.href);
	};
	const rows: Slot[] = result.candidates.slice(0, TABLE_LIMIT);
	return (
		<section className="panel mt-4 p-4">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h2 className="text-sm font-semibold">候選低窪時段（證據表）</h2>
					<p className="mt-0.5 text-xs text-[var(--muted)]">
						端點高峰且中站上車 ≤ 基準 {RULES.lowRatio * 100}%（中站基準 ≥{" "}
						{RULES.minMidBase} 人），依中站相對基準由低到高排序，顯示前{" "}
						{TABLE_LIMIT} 筆。
					</p>
				</div>
				<button type="button" className="btn" onClick={download}>
					<Download className="size-4" /> 下載篩選後 CSV（
					{fmt.format(result.slots.length)} 列）
				</button>
			</div>
			{rows.length === 0 ? (
				<div className="mt-4 text-sm text-[var(--fg2)]">
					此設定下沒有符合條件的時段。沒有低窪不代表沒有拒載。
				</div>
			) : (
				<div className="mt-3 overflow-x-auto">
					<table className="w-full text-xs tabular-nums">
						<thead className="text-left text-[var(--muted)]">
							<tr className="border-b border-[var(--line)]">
								<th className="py-1.5 pr-3 font-medium">日期</th>
								<th className="pr-3 font-medium">端點時段</th>
								<th className="pr-3 text-right font-medium">端點上車</th>
								<th className="pr-3 text-right font-medium">端點下車</th>
								<th className="pr-3 text-right font-medium">參考基準</th>
								<th className="pr-3 font-medium">中站時段</th>
								<th className="pr-3 text-right font-medium">中站上車</th>
								<th className="pr-3 text-right font-medium">中站基準</th>
								<th className="text-right font-medium">基準日數</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((s) => (
								<tr
									key={`${s.date}-${s.hour}`}
									className="border-b border-[var(--line)] last:border-0"
								>
									<td className="py-1.5 pr-3">
										{s.date}（{weekday(s.date)}）
									</td>
									<td className="pr-3">{hh(s.hour)}</td>
									<td className="pr-3 text-right">{s.endBoard}</td>
									<td className="pr-3 text-right">{s.endAlight}</td>
									<td className="pr-3 text-right">{one(s.refBase)}</td>
									<td className="pr-3">
										{s.midDate !== s.date ? `${s.midDate} ` : ""}
										{hh(s.midHour)}
									</td>
									<td className="pr-3 text-right font-semibold">{s.mid}</td>
									<td className="pr-3 text-right">{one(s.midBase)}</td>
									<td className="text-right">{s.baseDays}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}

function Quality({
	q,
	data,
}: {
	q: ReturnType<typeof quality>;
	data: MidstopData;
}) {
	const balanced = q.boardings === q.alightings;
	return (
		<section className="panel mt-4 p-4 text-xs">
			<h2 className="text-sm font-semibold">資料品質 Data quality</h2>
			<ul className="mt-2 space-y-1 text-[var(--fg2)]">
				<li>
					匯出 {fmt.format(q.rows)} 列（日期×支線×方向×站×小時），{q.first} 至{" "}
					{q.last}，{fmt.format(q.dates)} 個有紀錄日期；格式不合列數{" "}
					{fmt.format(q.invalid)}。
				</li>
				<li>
					全檔上車 {fmt.format(q.boardings)}、下車 {fmt.format(q.alightings)}
					{balanced && q.boardings === EXPECTED_TOTAL
						? `，與資料庫總旅次 ${fmt.format(EXPECTED_TOTAL)} 相符。`
						: `，預期 ${fmt.format(EXPECTED_TOTAL)}，請檢查匯出。`}
				</li>
				<li>
					所選支線上車 {fmt.format(q.selectedTotal)} 人次中，
					{fmt.format(q.unknown)}（
					{q.selectedTotal
						? ((q.unknown / q.selectedTotal) * 100).toFixed(1)
						: "0"}
					%）因同站或未知起訖站無法判斷方向，已排除於方向分析。
				</li>
				<li>匯出時間 {new Date(data.generatedAt).toLocaleString("zh-TW")}。</li>
			</ul>
		</section>
	);
}

function Limitations() {
	return (
		<section className="mt-4 mb-10 px-1 text-xs leading-relaxed text-[var(--muted)]">
			<h2 className="text-sm font-semibold text-[var(--fg2)]">限制</h2>
			<ul className="mt-1 list-disc space-y-1 pl-5">
				<li>
					刷卡紀錄只看得到已上車的人；沒有候車、未上車、車輛容量、預約或實際班次資料，無法得知車上是否客滿。
				</li>
				<li>
					方向依站點地理順序由起訖站推定，不是正式停靠表；資料沒有班次
					ID，無法確認端點與中站的乘客搭同一班車。
				</li>
				<li>
					中站上車偏低也可能是天候、停駛、改道、活動或需求變化；沒有低窪也不能排除拒載。
				</li>
				<li>
					無紀錄的整日不補零、不列入基準；零值只代表該日該時段沒有刷卡，不代表當時有班次。
				</li>
				<li>2024–2025 年歷史資料，非即時。</li>
			</ul>
		</section>
	);
}
