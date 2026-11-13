import type { Backtest } from "#/features/lab/operations/replay";

const fmt = new Intl.NumberFormat("en-US");
const pct = (v: number | null) =>
	v === null ? "–" : `${(v * 100).toFixed(1)}%`;
const one = (v: number | null) => (v === null ? "–" : v.toFixed(1));

export type BacktestFile = {
	generatedAt: string;
	range: { first: string; last: string; dates: number; missingDates: string[] };
	calendar: { source: string; fetchedAt: string; entries: number };
	backtest: Backtest;
	alertSensitivity: {
		surgeRatio: number;
		replayedHours: number;
		surgeAlerts: number;
		sustainedAlerts: number;
	}[];
	alertCountsDefaultRules: Record<string, number>;
	highlights: {
		eligible: number;
		surge: {
			date: string;
			actual: number;
			baseline: number;
			ratio: number;
			tag: string | null;
		}[];
		drop: {
			date: string;
			actual: number;
			baseline: number;
			ratio: number;
			tag: string | null;
		}[];
	};
};

const METHOD_LABEL: Record<keyof Backtest["methods"], string> = {
	"mean4-calendar": "前 4 個同星期、同日型平均（本原型採用）",
	"mean4-weekday": "前 4 個同星期平均（不分假日）",
	"nearest-peer-calendar":
		"最近 1 個同星期、同日型可用日（單一個，非固定上週）",
};

export function BacktestTable({ bt }: { bt: BacktestFile }) {
	const m = bt.backtest.methods;
	const keys = Object.keys(m) as (keyof Backtest["methods"])[];
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[560px] border-collapse text-xs">
				<caption className="mb-2 text-left text-[var(--muted)]">
					滾動回測：每個日期只用「當天以前」的資料預測，三種方法在同一批{" "}
					{fmt.format(bt.backtest.evaluatedDirDays)} 個「日期×方向」、每個 05–23
					時共 {fmt.format(m[keys[0]].hourly.cells)} 個小時格上比較。
				</caption>
				<thead>
					<tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
						<th className="py-1.5 pr-3 font-medium">方法</th>
						<th className="px-2 text-right font-medium">小時 MAE（人）</th>
						<th className="px-2 text-right font-medium">小時 WAPE</th>
						<th className="px-2 text-right font-medium">單日 MAE（人）</th>
						<th className="px-2 text-right font-medium">單日 WAPE</th>
						<th className="pl-2 text-right font-medium">最小–最大涵蓋率</th>
					</tr>
				</thead>
				<tbody>
					{keys.map((k) => (
						<tr key={k} className="border-b border-[var(--line)] last:border-0">
							<th className="py-1.5 pr-3 text-left font-medium">
								{METHOD_LABEL[k]}
							</th>
							<td className="px-2 text-right tabular-nums">
								{one(m[k].hourly.mae)}
							</td>
							<td className="px-2 text-right tabular-nums">
								{pct(m[k].hourly.wape)}
							</td>
							<td className="px-2 text-right tabular-nums">
								{one(m[k].daily.mae)}
							</td>
							<td className="px-2 text-right tabular-nums">
								{pct(m[k].daily.wape)}
							</td>
							<td className="pl-2 text-right tabular-nums">
								{pct(m[k].rangeCoverage)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
				WAPE ＝ 絕對誤差總和 ÷ 實際人次總和，是誤差比例，不是「準確率」。單日
				WAPE 是把一個方向一天的 19 個小時加總後再比。
				「最小–最大涵蓋率」是實際值落在前 4
				個同型日最小到最大之間的比例；這不是機率預測區間，也沒有校準。 「最近 1
				個同星期、同日型可用日」多數是前一週同日，但上週缺資料或日型不同時會往前找（最多
				8 週），因此不是固定相隔 7 天的上週同日基準，也不等同方向 1 的
				seasonal7。
			</p>
		</div>
	);
}

export function SensitivityTable({ bt }: { bt: BacktestFile }) {
	return (
		<div className="overflow-x-auto">
			<table className="w-full min-w-[480px] border-collapse text-xs">
				<caption className="mb-2 text-left text-[var(--muted)]">
					把全部 {fmt.format(bt.range.dates)} 個有紀錄日、每日 19
					個回放整點（6:00–24:00，無資料延遲）全部重放一次，數「上車量高於平常」的建議出現幾次。
				</caption>
				<thead>
					<tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
						<th className="py-1.5 pr-3 font-medium">高於基準倍數門檻</th>
						<th className="px-2 text-right font-medium">「關注」次數</th>
						<th className="px-2 text-right font-medium">「需人工評估」次數</th>
						<th className="pl-2 text-right font-medium">平均每個回放日</th>
					</tr>
				</thead>
				<tbody>
					{bt.alertSensitivity.map((s) => (
						<tr
							key={s.surgeRatio}
							className="border-b border-[var(--line)] last:border-0"
						>
							<th className="py-1.5 pr-3 text-left font-medium">
								≥ {s.surgeRatio} 倍{s.surgeRatio === 1.5 ? "（預設）" : ""}
							</th>
							<td className="px-2 text-right tabular-nums">
								{fmt.format(s.surgeAlerts)}
							</td>
							<td className="px-2 text-right tabular-nums">
								{fmt.format(s.sustainedAlerts)}
							</td>
							<td className="pl-2 text-right tabular-nums">
								{((s.surgeAlerts + s.sustainedAlerts) / bt.range.dates).toFixed(
									2,
								)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
			<p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
				沒有「真的需要加班」的標註，無法計算誤報率或漏報率；門檻只影響提醒的多寡。連續高於基準的小時會每小時各算一次。
			</p>
		</div>
	);
}
