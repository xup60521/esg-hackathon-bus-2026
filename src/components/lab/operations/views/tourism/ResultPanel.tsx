import {
	ArrowRight,
	CircleAlert,
	ShieldAlert,
	TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { Chip, LimitationList, Stat } from "#/components/lab/shared";
import type { ReachabilityResult, TimetableData } from "#/features/lab/tourism";
import {
	bufferText,
	buildSegments,
	DAYTYPE_LABEL,
	DAYTYPE_SOURCE_LABEL,
	lastBusText,
	RISK_META,
	type Run,
	SEGMENT_COLOR,
	stopNames,
	TIMETABLE_STATUS_LABEL,
	uniqueWarnings,
} from "./model";

function SubrouteText({ code }: { code: string }) {
	return (
		<>
			<b>{code}</b>
			<span className="text-[var(--muted)]">
				（依停靠模式推論，非官方車次代碼）
			</span>
		</>
	);
}

function Step({
	time,
	title,
	children,
}: {
	time: string;
	title: string;
	children?: ReactNode;
}) {
	return (
		<li className="grid grid-cols-[3.5rem_1fr] gap-x-3 border-b border-[var(--line)] py-2 text-xs leading-relaxed last:border-0">
			<span className="font-semibold tabular-nums text-[var(--fg)]">
				{time}
			</span>
			<div>
				<div className="font-semibold">{title}</div>
				{children && <div className="text-[var(--fg2)]">{children}</div>}
			</div>
		</li>
	);
}

function Itinerary({
	result,
	request,
	names,
	attractionName,
}: {
	result: ReachabilityResult;
	request: Run["request"];
	names: Map<string, string>;
	attractionName: string;
}) {
	const { outbound, dwell, inbound } = result;
	const origin = names.get(result.originStopId) ?? result.originStopId;
	const stop = names.get(result.destinationStopId) ?? result.destinationStopId;
	const walkNote = "步行分鐘為演算法假設";
	return (
		<ol aria-label="行程時間表">
			<Step time={request.departureTime} title="最早出發時間（使用者輸入）">
				{origin}
			</Step>
			{outbound ? (
				<>
					<Step time={outbound.departureTime} title={`去程：從${origin}上車`}>
						快照班次序號 {outbound.tripNumber}，
						<SubrouteText code={outbound.inferredSubroute} />
					</Step>
					<Step time={outbound.arrivalTime} title={`抵達站牌：${stop}`}>
						{walkNote}：步行 {outbound.walkToAttractionMinutes} 分鐘到
						{attractionName}
					</Step>
					<Step time={outbound.attractionArrivalTime} title="抵達景點" />
				</>
			) : (
				<Step time="—" title="快照中沒有可搭的去程班次" />
			)}
			{dwell && (
				<>
					{dwell.waitingForOpenMinutes > 0 && (
						<Step
							time={dwell.attractionArrivalTime}
							title={`早於開放時間，等待約 ${dwell.waitingForOpenMinutes} 分鐘`}
						>
							開放 {dwell.attractionOpenTime}
						</Step>
					)}
					<Step
						time={dwell.attractionDepartureTime}
						title={`離開景點（停留 ${dwell.actualDwellMinutes} 分鐘）`}
					>
						{request.customDwellMinutes === undefined
							? "停留採景點建議值（假設）"
							: "停留為使用者輸入"}
						；模擬採用的開放時間 {dwell.attractionOpenTime}–
						{dwell.attractionCloseTime}
						（各欄位是正文摘要支持或假設，見下方景點資料逐項標示）
					</Step>
					<Step time={dwell.busStopArrivalTime} title="走回站牌">
						步行 {dwell.walkToStopMinutes} 分鐘（假設）
					</Step>
				</>
			)}
			{inbound && (
				<>
					<Step
						time={inbound.departureTime}
						title={`回程：從${stop}上車（候車 ${inbound.waitAtStopMinutes} 分鐘）`}
					>
						快照班次序號 {inbound.tripNumber}，
						<SubrouteText code={inbound.inferredSubroute} />
					</Step>
					<Step time={inbound.destinationArrivalTime} title={`回到${origin}`} />
				</>
			)}
		</ol>
	);
}

function TimeBar({ result }: { result: ReachabilityResult }) {
	const segs = buildSegments(result);
	if (segs.length === 0) return null;
	const total = segs[segs.length - 1].end - segs[0].start;
	const label = (m: number) =>
		`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
	return (
		<div className="mt-3">
			<div
				className="flex h-4 w-full overflow-hidden rounded-md border border-[var(--line)]"
				aria-hidden="true"
			>
				{segs.map((s) => (
					<div
						key={s.key}
						style={{
							flexGrow: s.end - s.start,
							flexBasis: 0,
							minWidth: 2,
							background: SEGMENT_COLOR[s.key],
						}}
					/>
				))}
			</div>
			<div className="mt-1 flex justify-between text-[11px] tabular-nums text-[var(--muted)]">
				<span>{label(segs[0].start)}</span>
				<span>{label(segs[segs.length - 1].end)}</span>
			</div>
			<ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--fg2)]">
				{segs.map((s) => (
					<li key={s.key} className="inline-flex items-center gap-1.5">
						<span
							aria-hidden="true"
							className="inline-block size-2.5 rounded-sm"
							style={{ background: SEGMENT_COLOR[s.key] }}
						/>
						{s.label}{" "}
						<span className="tabular-nums">
							{label(s.start)}–{label(s.end)}（{s.end - s.start} 分）
						</span>
					</li>
				))}
			</ul>
			<p className="mt-1 text-[11px] text-[var(--muted)]">
				總長 {total} 分鐘（從去程上車到回程下車，不含出發前等待）。
			</p>
		</div>
	);
}

function LastBus({
	risk,
}: {
	risk: NonNullable<ReachabilityResult["lastBusRisk"]>;
}) {
	const meta = RISK_META[risk.riskLevel];
	return (
		<div>
			<div className="flex flex-wrap items-center gap-2">
				<Chip tone={meta.tone} icon={<ShieldAlert className="size-3" />}>
					{risk.riskLevel} · {meta.label}
				</Chip>
				<span className="text-xs text-[var(--fg2)]">{meta.note}</span>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
				<Stat label="預計回程班次" value={risk.returnBusDepartureTime} />
				<Stat
					label="快照內末班"
					value={
						risk.riskLevel === "INVALID" ? "無" : risk.lastBusDepartureTime
					}
					sub={
						risk.riskLevel === "INVALID"
							? lastBusText(risk)
							: "僅限 6670 快照；其他公車未查證"
					}
				/>
				<Stat
					label="倒數第二班"
					value={risk.penultimateBusDepartureTime ?? "無"}
				/>
				<Stat
					label="與末班的緩衝"
					value={bufferText(risk)}
					sub={`此後快照內可回出發站的班次：${risk.remainingTripsCount} 班`}
				/>
			</div>
			<dl className="mt-3 grid gap-x-4 gap-y-1 text-xs leading-relaxed sm:grid-cols-[auto_1fr]">
				<dt className="text-[var(--muted)]">引擎說明</dt>
				<dd>{risk.riskExplanation}</dd>
				<dt className="text-[var(--muted)]">快照內提示</dt>
				<dd>{risk.backupPlan}</dd>
				<dt className="text-[var(--muted)]">風險等級免責</dt>
				<dd>{risk.disclaimer}</dd>
			</dl>
		</div>
	);
}

export function ResultPanel({
	run,
	timetable,
	attractionName,
	stale,
}: {
	run: Run;
	timetable: TimetableData;
	attractionName: string;
	stale: boolean;
}) {
	const { result, request } = run;
	const names = stopNames(timetable);
	const warnings = uniqueWarnings(result.warnings);
	return (
		<div>
			<div className="flex flex-wrap items-center gap-2">
				<Chip
					tone="--k-scenario"
					title="引擎對每筆輸入（含被拒絕者）都回傳此狀態"
				>
					<code>{result.status}</code>
				</Chip>
				{result.isValid ? (
					<Chip tone="--sev-info" icon={<ArrowRight className="size-3" />}>
						快照與假設下，此往返條件成立
					</Chip>
				) : (
					<Chip tone="--sev-review" icon={<CircleAlert className="size-3" />}>
						快照與假設下，此往返條件不成立
					</Chip>
				)}
				{stale && (
					<Chip tone="--sev-watch" icon={<TriangleAlert className="size-3" />}>
						表單已修改，以下為上一次執行的結果
					</Chip>
				)}
			</div>
			<p className="mt-2 max-w-[80ch] text-xs leading-relaxed text-[var(--fg2)]">
				<b className="text-[var(--fg)]">這不是旅行有效或當日運行的保證。</b>
				「條件成立」只表示在本頁載入的班表快照、景點摘要與步行／停留假設下算得出往返；班次是否現行、景點是否營業、是否有座位都沒有查證。
			</p>
			{!result.isValid && (
				<div
					role="alert"
					className="mt-3 rounded-lg border p-3 text-xs leading-relaxed"
					style={{
						borderColor:
							"color-mix(in srgb, var(--sev-review) 45%, transparent)",
						background: "color-mix(in srgb, var(--sev-review) 8%, transparent)",
					}}
				>
					<div className="font-semibold">拒絕原因</div>
					<div className="mt-0.5">
						{result.invalidReason ?? "引擎未提供原因"}
					</div>
				</div>
			)}

			<dl className="mt-3 grid gap-x-4 gap-y-1 text-xs leading-relaxed sm:grid-cols-[auto_1fr]">
				<dt className="text-[var(--muted)]">起訖</dt>
				<dd>
					{names.get(result.originStopId) ?? result.originStopId} ⇄{" "}
					{attractionName}（站牌：
					{names.get(result.destinationStopId) ?? result.destinationStopId}）
				</dd>
				<dt className="text-[var(--muted)]">使用班表</dt>
				<dd>
					{DAYTYPE_LABEL[result.dayType]}；
					{DAYTYPE_SOURCE_LABEL[result.dayTypeSource]}
				</dd>
				<dt className="text-[var(--muted)]">班表狀態</dt>
				<dd>
					<code>{result.timetableStatus}</code>：
					{TIMETABLE_STATUS_LABEL[result.timetableStatus]}
				</dd>
			</dl>

			{result.outbound && (
				<div className="mt-4">
					<h3 className="text-xs font-semibold">行程時間表</h3>
					<TimeBar result={result} />
					<div className="mt-2">
						<Itinerary
							result={result}
							request={request}
							names={names}
							attractionName={attractionName}
						/>
					</div>
				</div>
			)}

			{result.lastBusRisk ? (
				<div className="mt-4">
					<h3 className="mb-2 text-xs font-semibold">
						末班車風險（僅 6670 快照）
					</h3>
					<LastBus risk={result.lastBusRisk} />
				</div>
			) : (
				<p className="mt-4 text-xs text-[var(--muted)]">
					這次沒有算到回程，因此沒有末班車風險可顯示。
				</p>
			)}

			<div className="mt-4">
				<h3 className="mb-2 text-xs font-semibold">
					引擎警示（{warnings.length} 則，完整列出）
				</h3>
				<LimitationList items={warnings} />
			</div>
			<div className="mt-4">
				<h3 className="mb-1 text-xs font-semibold">免責聲明</h3>
				<p className="max-w-[80ch] text-xs leading-relaxed text-[var(--fg2)]">
					{result.disclaimer}
				</p>
				<p className="mt-1 max-w-[80ch] text-xs leading-relaxed text-[var(--fg2)]">
					{timetable.metadata.lastBusDisclaimer}
				</p>
			</div>
		</div>
	);
}
