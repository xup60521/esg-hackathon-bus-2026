import {
	CircleCheck,
	CircleHelp,
	CircleX,
	ExternalLink,
	Search,
	Send,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
	Chip,
	FreshnessBanner,
	formatAge,
	KindBadge,
	LimitationList,
	Provenance,
	Section,
} from "#/components/lab/shared";
import { answer, EXAMPLES, taipeiDate } from "#/features/lab/assistant/engine";
import type {
	Answer,
	AnswerKind,
	Basis,
	Context,
	HistoryData,
	TimetableData,
} from "#/features/lab/assistant/types";

const DATA_BASE = "/data/lab/assistant";

type Turn = { id: number; q: string; a: Answer };
type Loaded = { timetable: TimetableData; history: HistoryData };

const KIND_UI: Record<
	AnswerKind,
	{ label: string; tone: string; icon: React.ReactNode }
> = {
	answer: {
		label: "有依據的回答",
		tone: "--st-ready",
		icon: <CircleCheck className="size-4" />,
	},
	clarify: {
		label: "需要補充",
		tone: "--st-partial",
		icon: <CircleHelp className="size-4" />,
	},
	refusal: {
		label: "拒答：沒有可靠依據",
		tone: "--sev-review",
		icon: <CircleX className="size-4" />,
	},
};

/** 資料依據標籤：沿用 /lab 共用的資料種類標籤，並明示「表定、非即時」。 */
function BasisBadge({ basis }: { basis: Basis }) {
	switch (basis) {
		case "official":
			return <KindBadge kind="official" />;
		case "history":
			return <KindBadge kind="history" />;
		case "official-image":
			return (
				<Chip
					tone="--k-unverified"
					title="官網票價是圖片，由研究者目視判讀，未逐格核對"
				>
					官網圖片・人工目視
				</Chip>
			);
		case "timetable":
			return (
				<Chip
					tone="--k-official"
					title="官網靜態時刻表的表定時間；不是即時位置，可能誤點或調整"
				>
					官網表定時刻・非即時
				</Chip>
			);
	}
}

function taipeiNow(): { weekday: number; hhmm: string } {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Taipei",
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(new Date());
	const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
	const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
		get("weekday"),
	);
	return { weekday, hhmm: `${get("hour")}:${get("minute")}` };
}

export default function AssistantPage() {
	const [data, setData] = useState<Loaded | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [input, setInput] = useState("");
	const [turns, setTurns] = useState<Turn[]>([]);
	const nextId = useRef(1);

	useEffect(() => {
		const get = <T,>(name: string) =>
			fetch(`${DATA_BASE}/${name}`).then((r) => {
				if (!r.ok)
					throw new Error(
						`${name}: HTTP ${r.status}（請先執行 bun scripts/lab/assistant/fetch-timetable.ts 與 build-history.ts）`,
					);
				return r.json() as Promise<T>;
			});
		Promise.all([
			get<TimetableData>("timetable.json"),
			get<HistoryData>("history.json"),
		]).then(
			([timetable, history]) => setData({ timetable, history }),
			(e: Error) => setError(e.message),
		);
	}, []);

	const ask = (q: string) => {
		const text = q.trim();
		if (!text || !data) return;
		const ctx: Context = { ...data, now: taipeiNow() };
		const a = answer(text, ctx);
		setTurns((t) => [{ id: nextId.current++, q: text, a }, ...t].slice(0, 30));
		setInput("");
	};

	return (
		<div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4">
			<header>
				<div className="flex flex-wrap items-center gap-2">
					<KindBadge kind="official" />
					<KindBadge kind="history" />
					<KindBadge kind="live-unavailable" />
					<span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
						可信旅遊問答（檢索式）
					</span>
				</div>
				<h1 className="mt-1 text-2xl font-bold">6670 旅遊資訊問答</h1>
				<p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--fg2)]">
					只回答有來源的內容：官網的路線、票價與規定、官網表定時刻，以及
					2024–2025
					年的歷史搭乘統計。找不到依據就拒答，不會猜班表、票價、即時位置或座位。
					<b className="font-semibold text-[var(--fg)]">
						目前沒有接任何生成模型，也不需要 API key；
					</b>
					回答是從人工整理的資料庫與規則檢索而來，原文逐字可核對。
				</p>
			</header>

			{error && <div className="panel p-4 text-sm text-red-600">⚠ {error}</div>}
			{!error && !data && (
				<div className="text-sm text-[var(--fg2)]">載入資料中… Loading…</div>
			)}

			{data && (
				<div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
					<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
						<form
							className="panel p-4"
							onSubmit={(e) => {
								e.preventDefault();
								ask(input);
							}}
						>
							<label
								htmlFor="assistant-q"
								className="text-xs font-medium text-[var(--muted)]"
							>
								問一個關於 6670 的問題
							</label>
							<div className="mt-1.5 flex gap-2">
								<input
									id="assistant-q"
									value={input}
									onChange={(e) => setInput(e.target.value)}
									placeholder="例如：高鐵臺中站 9 點後到日月潭有哪些班次？"
									autoComplete="off"
									className="min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-sm text-[var(--fg)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--active-border)]"
								/>
								<button
									type="submit"
									className="btn btn-active px-3"
									disabled={!input.trim()}
								>
									<Send className="size-4" /> 送出
								</button>
							</div>
							<div className="mt-3 flex flex-wrap gap-1.5">
								{EXAMPLES.map((ex) => (
									<button
										key={ex}
										type="button"
										className="btn font-normal"
										onClick={() => ask(ex)}
									>
										{ex}
									</button>
								))}
							</div>
						</form>

						{turns.length === 0 && (
							<div className="panel flex items-start gap-3 p-4 text-sm text-[var(--fg2)]">
								<Search className="mt-0.5 size-4 shrink-0 text-[var(--muted)]" />
								<div className="leading-relaxed">
									點上面的範例或輸入問題。回答會標示資料依據（官方文件、表定時刻、歷史刷卡）、來源與擷取日期；
									「現在有沒有位子」「下一班幾分鐘到」這類即時問題會被明確拒答。
								</div>
							</div>
						)}

						<div className="grid gap-4" aria-live="polite">
							{turns.map((t) => (
								<TurnCard key={t.id} turn={t} onAsk={ask} />
							))}
						</div>
					</div>

					<aside className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:sticky lg:top-4">
						<DataStatus data={data} />
						<Section title="能問與不能問">
							<div className="grid gap-3 text-xs leading-relaxed">
								<div>
									<div className="mb-1 font-semibold">可以問</div>
									<LimitationList
										items={[
											"票價、半票免費資格、購票與預約方式",
											"子路線、停靠站、沿線景點對應的下車站",
											"表定時刻：首末班、某時間後的班次（官網資料）",
											"某站歷史上車刷卡的時段與星期分布",
											"攜帶腳踏車／寵物、無障礙、洽詢電話",
										]}
									/>
								</div>
								<div>
									<div className="mb-1 font-semibold">會拒答</div>
									<LimitationList
										items={[
											"即時位置、誤點、剩餘座位、是否客滿或會被拒載",
											"未來人潮或客滿預測",
											"未轉錄的起訖站票價（不用距離估算）",
											"國定假日班次、停駛、退改票、景點營業與住宿",
											"其他路線",
										]}
									/>
								</div>
							</div>
						</Section>
					</aside>
				</div>
			)}

			{data && <Footer data={data} />}
		</div>
	);
}

function TurnCard({ turn, onAsk }: { turn: Turn; onAsk: (q: string) => void }) {
	const { q, a } = turn;
	const ui = KIND_UI[a.kind];
	return (
		<article className="grid grid-cols-[minmax(0,1fr)] gap-2">
			<div className="flex justify-end">
				<div className="max-w-[85%] rounded-xl rounded-br-sm border border-[var(--active-border)] bg-[var(--active-bg)] px-3 py-2 text-sm">
					{q}
				</div>
			</div>
			<div
				className="panel p-4"
				style={{
					borderLeft: `4px solid var(${ui.tone})`,
				}}
			>
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
					<span
						className="inline-flex items-center gap-1 text-xs font-semibold"
						style={{ color: `var(${ui.tone})` }}
					>
						{ui.icon}
						{ui.label}
					</span>
					{a.basis.map((b) => (
						<BasisBadge key={b} basis={b} />
					))}
				</div>
				<h2 className="mt-2 text-base font-semibold">{a.headline}</h2>
				<div className="mt-2 grid max-w-[75ch] grid-cols-[minmax(0,1fr)] gap-2 text-sm leading-relaxed text-[var(--fg)]">
					{a.lines.map((l) => (
						<p key={l}>{l}</p>
					))}
				</div>

				{a.table && a.table.rows.length > 0 && (
					<div className="mt-3 overflow-x-auto rounded-lg border border-[var(--line)]">
						<table className="w-full min-w-[420px] border-collapse text-xs tabular-nums">
							<thead>
								<tr className="bg-[var(--chip)] text-left text-[var(--muted)]">
									{a.table.head.map((h) => (
										<th key={h} scope="col" className="px-3 py-2 font-medium">
											{h}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{a.table.rows.map((r) => (
									<tr
										key={r.join("|")}
										className="border-t border-[var(--line)]"
									>
										{r.map((c, i) => (
											<td
												// biome-ignore lint/suspicious/noArrayIndexKey: 表格欄位固定順序
												key={i}
												className="px-3 py-1.5"
											>
												{c}
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}

				{a.caution && (
					<div
						className="mt-3 rounded-lg border px-3 py-2 text-xs leading-relaxed text-[var(--fg2)]"
						style={{
							borderColor:
								"color-mix(in srgb, var(--k-unverified) 45%, transparent)",
							background:
								"color-mix(in srgb, var(--k-unverified) 8%, transparent)",
						}}
					>
						<b className="font-semibold text-[var(--fg)]">限制：</b>
						{a.caution}
					</div>
				)}

				{a.sources.length > 0 && (
					<div className="mt-3">
						<div className="text-[11px] font-medium text-[var(--muted)]">
							來源（擷取日 Asia/Taipei）
						</div>
						<ul className="mt-1 grid gap-1 text-xs">
							{a.sources.map((s) => (
								<li key={s.id} className="leading-relaxed">
									{s.url.startsWith("http") ? (
										<a
											href={s.url}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 font-medium underline decoration-[var(--axis)] underline-offset-2"
										>
											{s.title}
											<ExternalLink className="size-3" />
										</a>
									) : (
										<span className="font-medium">{s.title}</span>
									)}
									<span className="text-[var(--muted)]">
										{" "}
										· 擷取 {s.retrievedAt} ·{" "}
										{s.pageDate
											? `資料日期 ${s.pageDate}`
											: "頁面未標示更新日期"}
									</span>
									{s.note && (
										<div className="text-[var(--muted)] [overflow-wrap:anywhere]">
											{s.note}
										</div>
									)}
								</li>
							))}
						</ul>
					</div>
				)}

				{a.followUps && a.followUps.length > 0 && (
					<div className="mt-3 flex flex-wrap gap-1.5">
						{a.followUps.map((f) => (
							<button
								key={f}
								type="button"
								className="btn font-normal"
								onClick={() => onAsk(f)}
							>
								{f}
							</button>
						))}
					</div>
				)}

				<details className="mt-3 text-[11px] text-[var(--muted)]">
					<summary className="cursor-pointer select-none">
						判斷依據（稽核用）
					</summary>
					<code className="mt-1 block break-all">{a.trace}</code>
				</details>
			</div>
		</article>
	);
}

function DataStatus({ data }: { data: Loaded }) {
	const { timetable: tt, history: h } = data;
	const [age, setAge] = useState<string | null>(null);
	useEffect(
		() => setAge(formatAge(Date.now() - Date.parse(tt.retrievedAt))),
		[tt.retrievedAt],
	);
	return (
		<Section
			title="資料狀態"
			subtitle="三類資料來源與新舊，答案會標明各自來自哪一類。"
		>
			<dl className="grid gap-3 text-xs leading-relaxed">
				<div>
					<dt className="flex items-center gap-2 font-semibold">
						<KindBadge kind="official" /> 官網文字
					</dt>
					<dd className="mt-1 text-[var(--fg2)]">
						台灣好行官網路線頁，2026-11-04 擷取。頁面沒有標示更新日期（頁尾版權
						2023），規定與票價可能已變。
					</dd>
				</div>
				<div>
					<dt className="flex items-center gap-2 font-semibold">
						<Chip tone="--k-official">官網表定時刻・非即時</Chip>
					</dt>
					<dd className="mt-1 text-[var(--fg2)]">
						時刻表頁 {taipeiDate(tt.retrievedAt)} 擷取
						{age ? `，距今 ${age}` : ""}。共{" "}
						{tt.tables.reduce((s, t) => s + t.trips.length, 0)}{" "}
						列班次；平日＝周一~周四，假日＝周五~周日。
					</dd>
				</div>
				<div>
					<dt className="flex items-center gap-2 font-semibold">
						<KindBadge kind="history" /> 刷卡統計
					</dt>
					<dd className="mt-1 text-[var(--fg2)]">
						{h.range[0]} ~ {h.range[1]}，{h.observedDays}/{h.calendarDays}{" "}
						天有紀錄，
						{new Intl.NumberFormat("en-US").format(h.totalBoardings)}{" "}
						筆上車刷卡。
					</dd>
				</div>
			</dl>
		</Section>
	);
}

function Footer({ data }: { data: Loaded }) {
	return (
		<div className="grid gap-4">
			<FreshnessBanner
				dataThrough={data.history.range[1]}
				what="歷史刷卡統計最後一天"
				note="歷史統計只描述過去；班表是官網靜態表定時刻；兩者都不是即時資料，這裡不提供座位、位置或誤點。"
			/>
			<Section
				title="已知限制"
				subtitle="詳見 docs/lab/assistant/report.zh-TW.md"
			>
				<LimitationList
					items={[
						"未接生成模型：只能回答人工整理與資料查詢涵蓋的問題；措辭稍有不同可能誤判為「沒有依據」，不會誤編內容，但會漏答。",
						"官網路線頁與票價圖片沒有更新日期；官網票價表是圖片，只轉錄少數起訖站，其餘拒答。高鐵臺中站→日月潭票價為人工目視判讀，未逐格核對。",
						"官網各頁可能不同步（例如機場線 115/11/1 調整只出現在時刻表頁）；衝突時顯示來源並請洽南投客運。",
						"班次序號與子路線（A–F）沒有對應；國定假日、連假的班表官網沒有說明，一律拒答。",
						"歷史統計是成功刷卡人次，不是候車、座位使用或客滿；同站各子路線合併。",
						"問答驗證集由實作者自撰，不是獨立評測；詳見報告。",
					]}
				/>
			</Section>
			<Section title="重現">
				<Provenance
					source="台灣好行官網（時刻表與路線頁）、本專案 public/data/midstop.json 彙總"
					generatedAt={`${taipeiDate(data.timetable.retrievedAt)}（時刻表擷取日，Asia/Taipei）`}
					dataThrough={data.history.range[1]}
					command="bun scripts/lab/assistant/fetch-timetable.ts && bun scripts/lab/assistant/build-history.ts && bun scripts/lab/assistant/evaluate.ts"
				/>
			</Section>
		</div>
	);
}
