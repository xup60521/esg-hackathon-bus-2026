import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";
import { Chip, Field, KindBadge, Section } from "#/components/lab/shared";
import {
	LEVEL_LABEL,
	type SeatLevel,
	seatLevel,
} from "#/features/lab/seats/model";
import {
	BASE,
	CONTROL,
	DIRECTION_LABEL,
	hhmm,
	type MonthFile,
	Status,
	type Summary,
	useJson,
} from "./data";

const LEVEL_STYLE: Record<SeatLevel, { tone: string; icon: ReactNode }> = {
	available: { tone: "--st-ready", icon: <CircleCheck className="size-3" /> },
	few: { tone: "--sev-watch", icon: <TriangleAlert className="size-3" /> },
	full: { tone: "--sev-review", icon: <CircleX className="size-3" /> },
};

function LevelChip({ level }: { level: SeatLevel }) {
	const s = LEVEL_STYLE[level];
	return (
		<Chip tone={s.tone} icon={s.icon}>
			{LEVEL_LABEL[level]}
		</Chip>
	);
}

/** Stops where riders board a bus that is already carrying people (not route ends). */
const MID_STOPS = [
	"九族文化村",
	"崎下",
	"埔里站",
	"魚池",
	"暨南大學校內",
	"暨南大學",
	"桃米坑",
	"大雁",
	"牛耳石雕公園",
	"日月老茶廠",
];

function Settings({
	capacity,
	setCapacity,
	few,
	setFew,
}: {
	capacity: number;
	setCapacity: (n: number) => void;
	few: number;
	setFew: (n: number) => void;
}) {
	return (
		<>
			<Field label="假設座位數（每車）">
				<select
					className={CONTROL}
					value={capacity}
					onChange={(e) => setCapacity(Number(e.target.value))}
				>
					{[43, 42, 38, 37].map((n) => (
						<option key={n} value={n}>
							{n} 席
						</option>
					))}
				</select>
			</Field>
			<Field label="「座位不多」門檻">
				<select
					className={CONTROL}
					value={few}
					onChange={(e) => setFew(Number(e.target.value))}
				>
					{[3, 5, 8, 10].map((n) => (
						<option key={n} value={n}>
							剩 {n} 席以下
						</option>
					))}
				</select>
			</Field>
		</>
	);
}

export function SignReplay({ summary }: { summary: Summary }) {
	const [date, setDate] = useState("2025-02-28");
	const [stop, setStop] = useState("九族文化村");
	const [direction, setDirection] = useState(-1);
	const [capacity, setCapacity] = useState(43);
	const [few, setFew] = useState(5);

	const month = useJson<MonthFile>(`${BASE}/arrivals-${date.slice(0, 7)}.json`);
	const stopIndex = summary.stops.indexOf(stop);
	const hasDate = summary.dates.includes(date);

	const rows = useMemo(() => {
		if (month.state !== "ready" || month.data.month !== date.slice(0, 7))
			return [];
		const day = Number(date.slice(8));
		return month.data.rows.filter(
			(r) =>
				r[0] === day &&
				r[1] === stopIndex &&
				(direction < 0 || r[4] === direction),
		);
	}, [month, date, stopIndex, direction]);

	const tally = { available: 0, few: 0, full: 0 };
	for (const r of rows) tally[seatLevel(r[5], capacity, few)]++;

	return (
		<Section
			title="1. 電子站牌回放：如果當時站牌會顯示剩餘座位"
			subtitle="選日期與站點，重播 2024–2025 年每一班車到站時，站牌會顯示的座位狀態。車上人數 = 同一輛車已刷上車、尚未刷下車的卡數。只有當站至少一人刷卡上車的到站才看得到；沒人上車（包括滿車過站）的到站不在資料裡。"
			badges={
				<>
					<KindBadge kind="history" />
					<KindBadge kind="scenario" />
				</>
			}
		>
			<div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
				<Field label="日期">
					<input
						type="date"
						className={CONTROL}
						min={summary.dates[0]}
						max={summary.dataThrough}
						value={date}
						onChange={(e) => e.target.value && setDate(e.target.value)}
					/>
				</Field>
				<Field label="站點">
					<select
						className={CONTROL}
						value={stop}
						onChange={(e) => setStop(e.target.value)}
					>
						{MID_STOPS.map((s) => (
							<option key={s}>{s}</option>
						))}
					</select>
				</Field>
				<Field label="方向（依刷卡起訖推定）">
					<select
						className={CONTROL}
						value={direction}
						onChange={(e) => setDirection(Number(e.target.value))}
					>
						<option value={-1}>全部</option>
						<option value={0}>{DIRECTION_LABEL[0]}</option>
						<option value={1}>{DIRECTION_LABEL[1]}</option>
					</select>
				</Field>
				<Settings
					capacity={capacity}
					setCapacity={setCapacity}
					few={few}
					setFew={setFew}
				/>
			</div>

			<div className="mt-4">
				<Status loaded={month} />
				{!hasDate && (
					<p className="text-xs text-[var(--muted)]">
						這天整天沒有刷卡紀錄（原因未知，不代表停駛）。
					</p>
				)}
				{hasDate && month.state === "ready" && rows.length === 0 && (
					<p className="text-xs text-[var(--muted)]">
						這天在 {stop} 沒有任何刷卡上車的到站紀錄。
					</p>
				)}
				{rows.length > 0 && (
					<>
						<p className="mb-2 text-xs text-[var(--fg2)]">
							{date} {stop}：共 {rows.length} 次有人上車的到站，
							{LEVEL_LABEL.available} {tally.available}、{LEVEL_LABEL.few}{" "}
							{tally.few}、{LEVEL_LABEL.full} {tally.full}。
						</p>
						<div className="overflow-x-auto rounded-lg border border-[var(--line)]">
							<table className="w-full min-w-[560px] border-collapse text-xs tabular-nums">
								<thead>
									<tr className="border-b border-[var(--line)] bg-[var(--chip)] text-left text-[var(--muted)]">
										<th className="px-3 py-1.5 font-medium">到站</th>
										<th className="px-3 py-1.5 font-medium">支線</th>
										<th className="px-3 py-1.5 font-medium">方向</th>
										<th className="px-3 py-1.5 text-right font-medium">
											到站時車上
										</th>
										<th className="px-3 py-1.5 text-right font-medium">
											剩餘座位
										</th>
										<th className="px-3 py-1.5 font-medium">站牌顯示</th>
										<th className="px-3 py-1.5 text-right font-medium">
											本站上車
										</th>
									</tr>
								</thead>
								<tbody>
									{rows.map((r, i) => (
										<tr
											// rows are a static filtered slice with no id; order never changes
											// biome-ignore lint/suspicious/noArrayIndexKey: see above
											key={`${r[2]}-${r[3]}-${r[5]}-${r[6]}-${i}`}
											className="border-b border-[var(--line)] last:border-0"
										>
											<td className="px-3 py-1.5">{hhmm(r[2])}</td>
											<td className="px-3 py-1.5">{summary.subroutes[r[3]]}</td>
											<td className="px-3 py-1.5">{DIRECTION_LABEL[r[4]]}</td>
											<td className="px-3 py-1.5 text-right">{r[5]}</td>
											<td className="px-3 py-1.5 text-right">
												{Math.max(0, capacity - r[5])}
											</td>
											<td className="px-3 py-1.5">
												<LevelChip level={seatLevel(r[5], capacity, few)} />
											</td>
											<td className="px-3 py-1.5 text-right">{r[6]}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</>
				)}
			</div>

			<StopTable summary={summary} capacity={capacity} few={few} />
		</Section>
	);
}

function StopTable({
	summary,
	capacity,
	few,
}: {
	summary: Summary;
	capacity: number;
	few: number;
}) {
	const pct = (hist: number[]) => {
		const total = hist.reduce((s, x) => s + x, 0);
		let warn = 0;
		let full = 0;
		hist.forEach((n, load) => {
			const level = seatLevel(load, capacity, few);
			if (level === "few") warn += n;
			if (level === "full") full += n;
		});
		const f = (x: number) =>
			total ? `${((100 * x) / total).toFixed(1)}%` : "—";
		return { total, warn: f(warn), full: f(full) };
	};
	return (
		<div className="mt-5">
			<h3 className="text-xs font-semibold">
				全期各站：到站時已不多或已滿的比例
			</h3>
			<p className="mt-1 text-xs text-[var(--muted)]">
				2024–2025
				全部有人上車的到站，依上方座位假設計算。分母只含有人刷卡上車的到站。
			</p>
			<div className="mt-2 overflow-x-auto rounded-lg border border-[var(--line)]">
				<table className="w-full min-w-[560px] border-collapse text-xs tabular-nums">
					<thead>
						<tr className="border-b border-[var(--line)] bg-[var(--chip)] text-left text-[var(--muted)]">
							<th className="px-3 py-1.5 font-medium">站點</th>
							<th className="px-3 py-1.5 text-right font-medium">上班日到站</th>
							<th className="px-3 py-1.5 text-right font-medium">座位不多</th>
							<th className="px-3 py-1.5 text-right font-medium">已滿</th>
							<th className="px-3 py-1.5 text-right font-medium">休息日到站</th>
							<th className="px-3 py-1.5 text-right font-medium">座位不多</th>
							<th className="px-3 py-1.5 text-right font-medium">已滿</th>
						</tr>
					</thead>
					<tbody>
						{MID_STOPS.map((s) => {
							const h = summary.loadHistogram[s];
							const w = pct(h.work);
							const r = pct(h.rest);
							return (
								<tr
									key={s}
									className="border-b border-[var(--line)] last:border-0"
								>
									<td className="px-3 py-1.5">{s}</td>
									<td className="px-3 py-1.5 text-right">
										{w.total.toLocaleString()}
									</td>
									<td className="px-3 py-1.5 text-right">{w.warn}</td>
									<td className="px-3 py-1.5 text-right">{w.full}</td>
									<td className="px-3 py-1.5 text-right">
										{r.total.toLocaleString()}
									</td>
									<td className="px-3 py-1.5 text-right">{r.warn}</td>
									<td className="px-3 py-1.5 text-right">{r.full}</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}
