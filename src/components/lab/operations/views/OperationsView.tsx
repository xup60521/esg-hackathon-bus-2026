import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	type Alert,
	baselineFor,
	type Calendar,
	type Days,
	DIR_LABEL,
	DIRS,
	type Dir,
	decisionsAt,
	lastDeliveredHour,
	outlookAfter,
	type PackedDays,
	RULES,
	unpackDays,
	weekdayOf,
} from "#/features/lab/operations/replay";
import {
	Chip,
	Field,
	FreshnessBanner,
	KindBadge,
	LimitationList,
	Provenance,
	Section,
	Segmented,
	SeverityTag,
	type Source,
	SourceList,
	Stat,
} from "../../shared";
import {
	type BacktestFile,
	BacktestTable,
	SensitivityTable,
} from "./operations/Backtest";
import { DayChart } from "./operations/DayChart";

type Replay = {
	generatedAt: string;
	dataThrough: string;
	firstDate: string;
	missingDates: string[];
	unknownDirectionBoardings: number;
	source: {
		file: string;
		generatedAt: string;
		rows: number;
		boardings: number;
	};
	days: PackedDays;
};
type Loaded = { replay: Replay; days: Days; cal: Calendar; bt: BacktestFile };
type Verdict = "adopt" | "skip" | "check";
type Log = Record<string, { verdict: Verdict; at: string; alert: Alert }>;

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
const LOG_KEY = "bus6670-ops-review-log";
const fmt = new Intl.NumberFormat("en-US");
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
const addDays = (date: string, n: number) =>
	new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000)
		.toISOString()
		.slice(0, 10);
const VERDICT_LABEL: Record<Verdict, string> = {
	adopt: "採納",
	skip: "略過",
	check: "待查",
};

async function getJson<T>(url: string): Promise<T> {
	const r = await fetch(url);
	if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
	return (await r.json()) as T;
}

const SOURCES: Source[] = [
	{
		label: "TDX 公共運輸資料：公車動態資料（A1/A2）注意事項",
		url: "https://motc-ptx.gitbook.io/tdx-zi-liao-shi-yong-kui-hua-bao-dian/data_notice/public_transportation_data/bus_dynamic_data",
		accessed: "2026-11-04",
		evidence:
			"頁面寫明 TDX 平臺只保留每台車輛最近 2 小時內的最新一筆 A1／A2 資料，且部分車機訊號可能延遲數分鐘以上。這是平臺的保留範圍說明，不是「2 小時內的資料即可即時調度」的證據，本原型因此不以資料新鮮度判定即時；本案資料一律標為歷史。頁面未標示更新日期，也未說明 6670 是否在涵蓋範圍內，本案未驗證。",
	},
	{
		label: "中華民國政府行政機關辦公日曆表（新北市政府資料開放平台 API）",
		url: "https://data.ntpc.gov.tw/api/datasets/308dcd75-6434-45bc-a95f-584da4fed251/json",
		accessed: "2026-11-04",
		evidence:
			"取得 2018–2027 年共 1,199 筆（至 2026-11-03 抓取時回傳）；本原型只用 2024–2025 年的國定假日、補假與補班日來區分平日與假日基準。是機關辦公日曆，不一定等於 6670 的實際營運日。",
	},
	{
		label: "本案 public/data/midstop.json（站點×小時彙總）",
		accessed: "2026-11-03",
		evidence:
			"回放與回測的唯一票證來源，1,800,910 人次，725 個有紀錄日，無個人資料；見 docs/midstop-analysis.md。",
	},
	{
		label: "A-007 十方向可行性研究（方向 6）",
		accessed: "2026-11-03",
		evidence:
			"界定「歷史決策原型可做、即時決策取決於資料串流」，並要求資料時間與建議原因必須顯示。",
	},
];

const LIMITS = [
	"刷卡只記錄已上車者；沒有候車、未上車、拒載、容量、班表與車輛位置。所有「建議」只是請人工查證的提醒，不是拒載或客滿的證據。",
	"基準是前 4 個同星期、同日型（平日／假日）的平均，不是訓練過的模型；沒有天氣、活動或春節等移動節日特徵。無法分辨的需求變化會被當成異常。",
	"方向由站序推定（見 /analysis）；方向不明的 6,281 人次未計入各方向，只出現在總量核對。",
	"兩個個別日期與 6 天缺資料日（2024-07-24、07-25、10-02、10-03、10-31、2025-07-07）原因未驗證，不能當成零需求或停駛；回放遇到時只顯示「無紀錄」。",
	"回測只證明「這個簡單基準在 2024–2025 年歷史上誤差多大」，不是營運效益；沒有標註資料，建議的誤報率與漏報率未知。",
	"人工覆核紀錄只存在這台瀏覽器的 localStorage，沒有帳號、稽核或同步，不是正式的決策紀錄系統。",
	"辦公日曆是政府機關放假日，不保證等於 6670 的實際班表。",
];

const NEEDS: {
	need: string;
	state: "未取得" | "未驗證" | "本原型為示意";
	note: string;
}[] = [
	{
		need: "近期票證資料串流",
		state: "未取得",
		note: "本案資料止於 2025-12-31；即時決策至少需要延遲在分鐘級的刷卡彙總。",
	},
	{
		need: "車輛位置（GPS／A1、A2）",
		state: "未驗證",
		note: "TDX 有公車動態資料，但 6670 是否涵蓋、欄位與延遲未驗證，也需要 API 金鑰。GPS 只給位置，不給載客量。",
	},
	{
		need: "逐班班表與車型容量",
		state: "未取得",
		note: "沒有它，就無法判斷「上車量偏高」是否已超過座位。",
	},
	{
		need: "資料延遲與缺漏監控",
		state: "本原型為示意",
		note: "本頁以「資料送達延遲」滑桿模擬，並在無紀錄時提示；真實系統須自動監控並在逾時時停止給建議。",
	},
	{
		need: "人工覆核與稽核流程",
		state: "本原型為示意",
		note: "目前只有本機紀錄；正式使用需要身分、時間戳、留存與回饋，才能計算誤報漏報。",
	},
];

export default function OperationsView() {
	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		Promise.all([
			getJson<Replay>("/data/lab/operations/replay.json"),
			getJson<{ days: Calendar }>("/data/lab/operations/calendar.json"),
			getJson<BacktestFile>("/data/lab/operations/backtest.json"),
		]).then(
			([replay, cal, bt]) =>
				setData({ replay, days: unpackDays(replay.days), cal: cal.days, bt }),
			(e: Error) => setError(e.message),
		);
	}, []);

	return (
		<>
			<header>
				<div className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
					6670 研究實驗室 · 方向 6
				</div>
				<h1 className="mt-1 text-2xl font-bold">
					營運決策儀表板：歷史回放原型
				</h1>
				<p className="mt-2 max-w-[72ch] text-sm leading-relaxed text-[var(--fg2)]">
					把 2024–2025
					年的歷史刷卡依時間一小時一小時「重播」，只讓畫面看到當時已經送達的資料，
					並顯示與簡單基準相比的異常、建議動作與原因。這是決策畫面的原型，
					<b className="font-semibold text-[var(--fg)]">不是即時系統</b>
					：沒有任何資料來自今天。
				</p>
				<div className="mt-3 flex flex-wrap gap-1.5">
					<KindBadge kind="history" />
					<KindBadge kind="forecast" />
					<KindBadge kind="live-unavailable" />
					<Chip tone="--k-unverified">基準預測，非機器學習</Chip>
					<Chip tone="--k-official">建議需人工覆核</Chip>
				</div>
			</header>
			<div className="mt-4">
				<FreshnessBanner
					dataThrough={data?.replay.dataThrough ?? "2025-12-31"}
					what="可回放的最新票證"
					note="這是歷史資料，沒有即時來源，不能當作即時判斷。下方的回放時間是模擬時鐘，不是現在。"
				/>
			</div>
			{error && (
				<div className="panel mt-4 p-4 text-sm text-red-600">⚠ {error}</div>
			)}
			{!error && !data && (
				<div className="mt-8 text-sm text-[var(--fg2)]">載入回放資料中…</div>
			)}
			{data && <Dashboard data={data} />}
		</>
	);
}

function Dashboard({ data }: { data: Loaded }) {
	const { days, cal, bt, replay } = data;
	const dates = useMemo(() => [...days.keys()].sort(), [days]);
	const [date, setDate] = useState(
		() => bt.highlights.surge[0]?.date ?? dates[dates.length - 1],
	);
	const [clock, setClock] = useState(14);
	const [lag, setLag] = useState(1);
	const [hindsight, setHindsight] = useState(false);
	const [playing, setPlaying] = useState(false);
	const [log, setLog] = useState<Log>({});

	useEffect(() => {
		try {
			setLog(JSON.parse(localStorage.getItem(LOG_KEY) ?? "{}") as Log);
		} catch {
			setLog({});
		}
	}, []);
	useEffect(() => {
		if (!playing) return;
		const t = setInterval(() => {
			setClock((c) => {
				if (c >= RULES.lastHour + 1) {
					setPlaying(false);
					return c;
				}
				return c + 1;
			});
		}, 900);
		return () => clearInterval(t);
	}, [playing]);

	const day = days.get(date);
	const last = lastDeliveredHour(clock, lag);
	const alerts = useMemo(
		() => decisionsAt(days, cal, date, clock, lag),
		[days, cal, date, clock, lag],
	);
	const outlook = useMemo(
		() => outlookAfter(days, cal, date, clock, lag),
		[days, cal, date, clock, lag],
	);
	const calInfo = cal[date];
	const wd = WEEKDAY[weekdayOf(date)];

	const go = (delta: number) => {
		let d = date;
		for (let i = 0; i < 40; i++) {
			d = addDays(d, delta);
			if (days.has(d)) return setDate(d);
		}
	};
	const jump = (d: string) => {
		setDate(d);
		setPlaying(false);
	};
	const review = (a: Alert, verdict: Verdict) => {
		const next = {
			...log,
			[a.id]: { verdict, at: new Date().toISOString(), alert: a },
		};
		setLog(next);
		localStorage.setItem(LOG_KEY, JSON.stringify(next));
	};
	const exportLog = () => {
		const blob = new Blob([JSON.stringify(Object.values(log), null, 1)], {
			type: "application/json",
		});
		const a = document.createElement("a");
		a.href = URL.createObjectURL(blob);
		a.download = "6670-ops-review-log.json";
		a.click();
		URL.revokeObjectURL(a.href);
	};

	return (
		<>
			<Section
				className="mt-4"
				title="回放控制"
				badges={<KindBadge kind="history" />}
				subtitle="選一天，再拖動回放時間。畫面只使用「回放時間減去資料延遲」之前已完整結束的小時。"
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<Field label="回放日期 Date">
						<div className="flex items-center gap-1.5">
							<button
								type="button"
								className="btn px-2"
								aria-label="前一個有紀錄日"
								onClick={() => go(-1)}
							>
								<ChevronLeft className="size-4" />
							</button>
							<input
								type="date"
								className="btn"
								min={replay.firstDate}
								max={replay.dataThrough}
								value={date}
								onChange={(e) => e.target.value && jump(e.target.value)}
							/>
							<button
								type="button"
								className="btn px-2"
								aria-label="後一個有紀錄日"
								onClick={() => go(1)}
							>
								<ChevronRight className="size-4" />
							</button>
							<span className="text-xs text-[var(--fg2)]">
								星期{wd}
								{calInfo
									? `・${calInfo.name ?? (calInfo.holiday ? "放假日" : "補班日")}`
									: ""}
							</span>
						</div>
					</Field>
					<Field
						label={`回放時間 Replay clock：${hh(clock)}（${clock >= RULES.lastHour + 1 ? "全天結束" : "模擬時鐘"}）`}
					>
						<div className="flex items-center gap-2">
							<button
								type="button"
								className="btn px-2"
								aria-label={playing ? "暫停" : "播放"}
								onClick={() => {
									if (!playing && clock >= RULES.lastHour + 1)
										setClock(RULES.firstHour + 1);
									setPlaying((p) => !p);
								}}
							>
								{playing ? (
									<Pause className="size-4" />
								) : (
									<Play className="size-4" />
								)}
							</button>
							<input
								type="range"
								className="w-full accent-[var(--accent)]"
								min={RULES.firstHour + 1}
								max={RULES.lastHour + 1}
								step={1}
								value={clock}
								aria-label="回放時間"
								onChange={(e) => {
									setPlaying(false);
									setClock(Number(e.target.value));
								}}
							/>
						</div>
					</Field>
					<Field label="資料送達延遲 Feed delay（模擬）">
						<Segmented
							label="資料送達延遲"
							options={[
								[0, "0 小時"],
								[1, "1 小時"],
								[2, "2 小時"],
							]}
							value={lag}
							onChange={setLag}
						/>
					</Field>
					<Field label="事後實際 Hindsight">
						<Segmented
							label="事後實際"
							options={[
								["off", "隱藏（回放當下）"],
								["on", "顯示（檢討用）"],
							]}
							value={hindsight ? "on" : "off"}
							onChange={(v) => setHindsight(v === "on")}
						/>
					</Field>
				</div>
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					<Highlights
						title="高於平常的日子（回測中前 10）"
						items={bt.highlights.surge}
						onPick={jump}
						current={date}
					/>
					<Highlights
						title="低於平常的日子（回測中前 10）"
						items={bt.highlights.drop}
						onPick={jump}
						current={date}
					/>
				</div>
				<p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
					清單是與基準偏離最大的日子（整天、兩方向合計；基準需 ≥ 100
					人次）。「前／後」標示是辦公日曆上相鄰一天放假；
					沒有標示的日子，日曆沒有提供解釋，原因（天候、活動、停駛、資料問題）未查證。
				</p>
			</Section>

			{!day ? (
				<div className="panel mt-4 p-4 text-sm leading-relaxed">
					<b>此日期沒有票證紀錄。</b>
					{replay.missingDates.includes(date)
						? "這是資料中 6 個缺資料日之一，原因未驗證，不能當成零需求或停駛。"
						: "此日期在資料範圍（2024-01-01 至 2025-12-31）之外。"}
				</div>
			) : (
				<>
					<Section
						className="mt-4"
						title={`此刻的建議：${date}（${wd}）${hh(clock)}`}
						badges={
							<>
								<KindBadge kind="forecast" />
								<Chip tone="--k-official">需人工覆核</Chip>
							</>
						}
						subtitle={
							<>
								已送達資料到{" "}
								{last >= RULES.firstHour ? hh(last + 1) : "（尚無）"}{" "}
								之前；證據是最近一個完整小時（
								{last >= RULES.firstHour ? `${hh(last)}–${hh(last + 1)}` : "—"}
								）與基準的比較。
								每則建議都列出原因、證據與「若要真正決策還缺什麼」。
							</>
						}
					>
						{last < RULES.firstHour ? (
							<p className="text-sm text-[var(--fg2)]">
								營運時段尚未開始，沒有已送達的資料。把回放時間往後拖。
							</p>
						) : (
							<div className="grid gap-4 lg:grid-cols-2">
								{DIRS.map((dir) => (
									<AlertColumn
										key={dir}
										dir={dir}
										alerts={alerts.filter((a) => a.dir === dir)}
										log={log}
										onReview={review}
									/>
								))}
							</div>
						)}
						<div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-[var(--muted)]">
							<span>
								人工覆核紀錄 {Object.keys(log).length} 則（只存在此瀏覽器）
							</span>
							<button
								type="button"
								className="btn"
								disabled={Object.keys(log).length === 0}
								onClick={exportLog}
							>
								匯出 JSON
							</button>
							{Object.keys(log).length > 0 && (
								<button
									type="button"
									className="btn"
									onClick={() => {
										setLog({});
										localStorage.removeItem(LOG_KEY);
									}}
								>
									清除
								</button>
							)}
						</div>
					</Section>

					<Section
						className="mt-4"
						title="運量與基準"
						badges={
							<>
								<KindBadge kind="history" />
								<KindBadge kind="forecast" />
							</>
						}
						subtitle="實心長條是回放當下已送達的上車人次（各支線合計）；虛線是前 4 個同型日的平均，灰帶是它們的最小到最大。基準在當天開始前就已知，不使用當天或之後的資料。"
					>
						<div className="grid gap-6 lg:grid-cols-2">
							{DIRS.map((dir) => (
								<div key={dir}>
									<h3 className="mb-1 text-xs font-semibold">
										{DIR_LABEL[dir]}
									</h3>
									<DayChart
										dir={dir}
										observed={day[dir].b}
										baseline={baselineFor(days, cal, date, dir, "b")}
										lastDelivered={last}
										showHindsight={hindsight}
										alertHours={alerts
											.filter(
												(a) => a.dir === dir && a.kind !== "baseline-missing",
											)
											.map((a) => a.hour)}
									/>
								</div>
							))}
						</div>
						<Outlook
							outlook={outlook}
							days={days}
							cal={cal}
							date={date}
							hindsight={hindsight}
						/>
					</Section>
				</>
			)}

			<Section
				className="mt-4"
				title="回測：這個基準在歷史上準不準"
				badges={<KindBadge kind="forecast" />}
				subtitle={`涵蓋 ${bt.range.first} 至 ${bt.range.last}，每天只用當天以前的資料。結果是歷史誤差，不是營運成效。`}
			>
				<div className="mb-3 grid gap-2 sm:grid-cols-3">
					<Stat
						label="採用基準的單日 WAPE"
						value={`${((bt.backtest.methods["mean4-calendar"].daily.wape ?? 0) * 100).toFixed(1)}%`}
						sub={`${fmt.format(bt.backtest.evaluatedDirDays)} 個日期×方向`}
					/>
					<Stat
						label="採用基準的小時 WAPE"
						value={`${((bt.backtest.methods["mean4-calendar"].hourly.wape ?? 0) * 100).toFixed(1)}%`}
						sub="小時量小，比例誤差較大"
					/>
					<Stat
						label="分日型 vs 不分日型"
						value={`${(((bt.backtest.methods["mean4-weekday"].hourly.wape ?? 0) - (bt.backtest.methods["mean4-calendar"].hourly.wape ?? 0)) * 100).toFixed(2)} 個百分點`}
						sub="小時 WAPE 的差距；改善很小"
					/>
				</div>
				<BacktestTable bt={bt} />
				<h3 className="mb-1 mt-5 text-xs font-semibold">提醒會有多頻繁</h3>
				<SensitivityTable bt={bt} />
			</Section>

			<Section
				className="mt-4"
				title="規則與門檻"
				subtitle="固定且全部公開；改門檻會改變提醒數量（見上表），但沒有標註資料可判斷哪一組比較好。"
			>
				<ul className="grid gap-1 text-xs leading-relaxed text-[var(--fg2)] sm:grid-cols-2">
					<li>
						基準：最近 {RULES.maxPeers}{" "}
						個同星期、同日型（平日／假日）的日期，回看 {RULES.lookbackDays / 7}{" "}
						週內，至少 {RULES.minPeers} 個，否則「基準不足」，不給建議。
					</li>
					<li>
						高於平常：最近完整小時 ≥ 基準 {RULES.surgeRatio} 倍，且多 ≥{" "}
						{RULES.surgeMinExcess} 人。連續 {RULES.sustainedHours}{" "}
						小時以上升為「需人工評估」。
					</li>
					<li>
						低於平常：≤ 基準 {RULES.dropRatio} 倍，且基準 ≥ {RULES.dropMinBase}{" "}
						人。只列為提示，建議「不減班」。
					</li>
					<li>
						完全無紀錄：該小時 0 人且基準 ≥ {RULES.silenceMinBase}{" "}
						人。可能停駛、資料延遲或缺漏，先查資料。
					</li>
					<li>
						待驗證線索：端點上車先偏高、隨後一小時中站上車 ≤ 基準一半（與
						/analysis 同型）。不是拒載證據。
					</li>
					<li>
						假日與補班日只與同日型比較；國定假日落在平日時通常「基準不足」，此時不給建議。
					</li>
				</ul>
			</Section>

			<Section
				className="mt-4"
				title="要變成真的即時決策，還缺什麼"
				badges={<KindBadge kind="live-unavailable" />}
			>
				<div className="overflow-x-auto">
					<table className="w-full min-w-[520px] border-collapse text-xs">
						<tbody>
							{NEEDS.map((n) => (
								<tr
									key={n.need}
									className="border-b border-[var(--line)] last:border-0"
								>
									<th className="py-2 pr-3 text-left font-medium align-top">
										{n.need}
									</th>
									<td className="px-2 align-top">
										<Chip
											tone={
												n.state === "本原型為示意"
													? "--k-scenario"
													: n.state === "未驗證"
														? "--k-unverified"
														: "--k-live-unavailable"
											}
										>
											{n.state}
										</Chip>
									</td>
									<td className="pl-2 align-top leading-relaxed text-[var(--fg2)]">
										{n.note}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Section>

			<Section className="mt-4" title="來源">
				<SourceList sources={SOURCES} />
			</Section>
			<Section className="mt-4" title="限制">
				<LimitationList items={LIMITS} />
			</Section>
			<Section className="mt-4" title="資料出處與重現">
				<Provenance
					source={`${replay.source.file}（${fmt.format(replay.source.rows)} 列，${fmt.format(replay.source.boardings)} 人次；方向不明 ${fmt.format(replay.unknownDirectionBoardings)} 人次未計入各方向）`}
					dataThrough={replay.dataThrough}
					generatedAt={replay.generatedAt}
					command="bun scripts/lab/operations/build-replay.ts && bun test src/features/lab/operations"
				/>
			</Section>
		</>
	);
}

function Highlights({
	title,
	items,
	onPick,
	current,
}: {
	title: string;
	items: BacktestFile["highlights"]["surge"];
	onPick: (d: string) => void;
	current: string;
}) {
	return (
		<div>
			<div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">
				{title}：{items.filter((h) => h.tag).length}／{items.length}{" "}
				個在放假日前後
			</div>
			<div className="flex flex-wrap gap-1">
				{items.map((h) => (
					<button
						key={h.date}
						type="button"
						className={`btn ${h.date === current ? "btn-active" : ""}`}
						aria-pressed={h.date === current}
						title={`${h.actual} 人 vs 基準 ${h.baseline.toFixed(0)}${h.tag ? `・${h.tag}` : ""}`}
						onClick={() => onPick(h.date)}
					>
						{h.date.slice(2)}{" "}
						<span className="text-[var(--muted)]">{h.ratio.toFixed(2)}×</span>
						{h.tag && (
							<span className="text-[var(--accent)]">
								{h.tag.startsWith("放假日前")
									? "前"
									: h.tag.startsWith("放假日後")
										? "後"
										: "假"}
							</span>
						)}
					</button>
				))}
			</div>
		</div>
	);
}

function AlertColumn({
	dir,
	alerts,
	log,
	onReview,
}: {
	dir: Dir;
	alerts: Alert[];
	log: Log;
	onReview: (a: Alert, v: Verdict) => void;
}) {
	return (
		<div>
			<h3 className="mb-2 text-xs font-semibold">{DIR_LABEL[dir]}</h3>
			{alerts.length === 0 ? (
				<p className="rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-xs leading-relaxed text-[var(--fg2)]">
					最近一個完整小時沒有超過門檻，目前沒有建議動作。這只表示與基準相比沒有明顯偏離，不表示沒有人等車。
				</p>
			) : (
				<ul className="grid gap-2">
					{alerts.map((a) => (
						<li
							key={a.id}
							className="rounded-lg border border-[var(--line)] p-3"
						>
							<div className="flex flex-wrap items-center gap-2">
								<SeverityTag severity={a.severity} />
								<span className="text-sm font-semibold">{a.title}</span>
							</div>
							<p className="mt-1.5 text-xs leading-relaxed text-[var(--fg2)]">
								<span className="font-medium text-[var(--fg)]">為什麼：</span>
								{a.reason}
							</p>
							<p className="mt-1 text-xs leading-relaxed text-[var(--fg2)]">
								<span className="font-medium text-[var(--fg)]">建議：</span>
								{a.action}
							</p>
							{a.missing.length > 0 && (
								<p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
									真正決策還缺：{a.missing.join("、")}（本案未取得）
								</p>
							)}
							{a.kind !== "baseline-missing" && (
								<div className="mt-2 flex flex-wrap items-center gap-1.5">
									<span className="text-[11px] text-[var(--muted)]">
										人工覆核
									</span>
									{(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => (
										<button
											key={v}
											type="button"
											className={`btn ${log[a.id]?.verdict === v ? "btn-active" : ""}`}
											aria-pressed={log[a.id]?.verdict === v}
											onClick={() => onReview(a, v)}
										>
											{VERDICT_LABEL[v]}
										</button>
									))}
								</div>
							)}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function Outlook({
	outlook,
	days,
	cal,
	date,
	hindsight,
}: {
	outlook: ReturnType<typeof outlookAfter>;
	days: Days;
	cal: Calendar;
	date: string;
	hindsight: boolean;
}) {
	const day = days.get(date);
	return (
		<div className="mt-4 grid gap-3 sm:grid-cols-2">
			{DIRS.map((dir) => {
				const base = baselineFor(days, cal, date, dir, "b");
				const items = outlook.filter((o) => o.dir === dir);
				const total = base ? base.mean.reduce((a, b) => a + b, 0) : null;
				const actual = day ? day[dir].b.reduce((a, b) => a + b, 0) : null;
				return (
					<div
						key={dir}
						className="rounded-lg border border-[var(--line)] bg-[var(--chip)] p-3 text-xs leading-relaxed"
					>
						<div className="font-semibold">
							{DIR_LABEL[dir]}：接下來預期較忙的時段（基準）
						</div>
						{base ? (
							<>
								<div className="mt-1 text-[var(--fg2)]">
									{items.length
										? items
												.map(
													(o) => `${hh(o.hour)} 約 ${o.baseline.toFixed(0)} 人`,
												)
												.join("、")
										: "已無剩餘時段"}
								</div>
								<div className="mt-1 text-[var(--muted)]">
									全天基準約 {total?.toFixed(0)} 人次（前 {base.n}{" "}
									個同型日平均）
									{hindsight && actual !== null
										? `；事後實際 ${fmt.format(actual)} 人`
										: ""}
								</div>
							</>
						) : (
							<div className="mt-1 text-[var(--muted)]">
								基準不足（同型日少於 {RULES.minPeers} 天），不提供預期。
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
