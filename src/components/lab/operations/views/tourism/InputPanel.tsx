import { Play } from "lucide-react";
import type { Dispatch, ReactNode } from "react";
import { Chip, Segmented } from "#/components/lab/shared";
import type { Attraction, ScenarioExample } from "#/features/lab/tourism";
import { verifyTripReachability } from "#/features/lab/tourism";
import {
	type Action,
	DAYTYPE_LABEL,
	type Data,
	type DayTypeChoice,
	dayTypePreview,
	type FormErrors,
	type FormState,
	originOptions,
	PROFILE_LABEL,
	RISK_META,
	requestSummary,
	sameOutcome,
	stopNames,
} from "./model";

const CONTROL =
	"w-full rounded-lg border border-[var(--line)] bg-[var(--chip)] px-2.5 py-1.5 text-sm text-[var(--fg)]";

function Labeled({
	id,
	label,
	hint,
	error,
	children,
}: {
	id: string;
	label: string;
	hint?: ReactNode;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div>
			<label
				htmlFor={id}
				className="mb-1.5 block text-[11px] font-medium text-[var(--muted)]"
			>
				{label}
			</label>
			{children}
			{hint && (
				<p
					id={`${id}-hint`}
					className="mt-1 text-[11px] leading-snug text-[var(--muted)]"
				>
					{hint}
				</p>
			)}
			{error && (
				<p
					id={`${id}-error`}
					role="alert"
					className="mt-1 text-[11px] font-semibold leading-snug text-[var(--sev-review)]"
				>
					⚠ {error}
				</p>
			)}
		</div>
	);
}

const describedBy = (id: string, hint: boolean, error?: string) =>
	[hint ? `${id}-hint` : null, error ? `${id}-error` : null]
		.filter(Boolean)
		.join(" ") || undefined;

export function InputForm({
	data,
	form,
	errors,
	dispatch,
	attraction,
}: {
	data: Data;
	form: FormState;
	errors: FormErrors;
	dispatch: Dispatch<Action>;
	attraction: Attraction | undefined;
}) {
	const stops = originOptions(data.timetable);
	const preview = dayTypePreview(form.date);
	const patch = (p: Partial<FormState>) =>
		dispatch({ type: "patch", patch: p });
	const retrieved = data.timetable.metadata.retrievedDate;
	return (
		<form
			noValidate
			onSubmit={(e) => {
				e.preventDefault();
				dispatch({ type: "submit", data });
			}}
		>
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<Labeled id="tour-origin" label="出發站" error={errors.originStopId}>
					<select
						id="tour-origin"
						className={CONTROL}
						value={form.originStopId}
						aria-invalid={errors.originStopId ? true : undefined}
						aria-describedby={describedBy(
							"tour-origin",
							false,
							errors.originStopId,
						)}
						onChange={(e) => patch({ originStopId: e.target.value })}
					>
						{stops.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				</Labeled>
				<Labeled
					id="tour-attraction"
					label="景點（三選一）"
					error={errors.attractionId}
				>
					<select
						id="tour-attraction"
						className={CONTROL}
						value={form.attractionId}
						aria-invalid={errors.attractionId ? true : undefined}
						aria-describedby={describedBy(
							"tour-attraction",
							false,
							errors.attractionId,
						)}
						onChange={(e) => patch({ attractionId: e.target.value })}
					>
						{data.attractions.map((a) => (
							<option key={a.id} value={a.id}>
								{a.name}
							</option>
						))}
					</select>
				</Labeled>
				<Labeled
					id="tour-profile"
					label="步行速度假設"
					hint="只調整步行分鐘的倍率，不代表現地無障礙。"
				>
					<select
						id="tour-profile"
						className={CONTROL}
						value={form.profile}
						aria-describedby="tour-profile-hint"
						onChange={(e) =>
							patch({ profile: e.target.value as FormState["profile"] })
						}
					>
						{Object.entries(PROFILE_LABEL).map(([k, v]) => (
							<option key={k} value={k}>
								{v}
							</option>
						))}
					</select>
				</Labeled>
				<Labeled
					id="tour-date"
					label="出發日期"
					error={errors.date}
					hint={
						preview ? (
							<>
								{preview.weekday}；班表備註歸為「
								{DAYTYPE_LABEL[preview.dayType]}」。快照檢索日 {retrieved}
								，更早的日期會被拒絕。
							</>
						) : (
							`快照檢索日 ${retrieved}，更早的日期會被拒絕。`
						)
					}
				>
					<input
						id="tour-date"
						type="date"
						className={CONTROL}
						value={form.date}
						aria-invalid={errors.date ? true : undefined}
						aria-describedby={describedBy("tour-date", true, errors.date)}
						onChange={(e) => patch({ date: e.target.value })}
					/>
				</Labeled>
				<Labeled
					id="tour-time"
					label="最早出發時間（24 小時制）"
					error={errors.time}
					hint="系統取此時間之後、從出發站起的第一班符合班次。"
				>
					<input
						id="tour-time"
						type="time"
						className={CONTROL}
						value={form.time}
						aria-invalid={errors.time ? true : undefined}
						aria-describedby={describedBy("tour-time", true, errors.time)}
						onChange={(e) => patch({ time: e.target.value })}
					/>
				</Labeled>
				<Labeled
					id="tour-dwell"
					label="景點停留（分鐘）"
					error={errors.dwell}
					hint={
						attraction
							? `留空＝建議值 ${attraction.recommendedDwellMinutes} 分鐘（假設）。跨過閉館時系統會拒絕，不會替你縮短。`
							: "留空使用建議值。"
					}
				>
					<input
						id="tour-dwell"
						type="text"
						inputMode="numeric"
						className={CONTROL}
						value={form.dwell}
						placeholder={
							attraction ? String(attraction.recommendedDwellMinutes) : ""
						}
						aria-invalid={errors.dwell ? true : undefined}
						aria-describedby={describedBy("tour-dwell", true, errors.dwell)}
						onChange={(e) => patch({ dwell: e.target.value })}
					/>
				</Labeled>
			</div>
			<div className="mt-3">
				<div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">
					班表日型（選填覆寫）
				</div>
				<Segmented<DayTypeChoice>
					label="班表日型覆寫"
					value={form.dayType}
					onChange={(dayType) => patch({ dayType })}
					options={[
						["auto", "依日期（預設）"],
						["weekday", "改用平日班表"],
						["holiday", "改用假日班表"],
					]}
				/>
				<p className="mt-1 max-w-[80ch] text-[11px] leading-snug text-[var(--muted)]">
					覆寫只切換使用的班表；景點每週公休仍依實際日期的星期判斷。快照有效期未知，覆寫不會讓未來日期變得可靠。
				</p>
			</div>
			<div className="mt-4 flex flex-wrap items-center gap-3">
				<button type="submit" className="btn">
					<Play className="size-3.5" aria-hidden="true" />
					執行快照模擬
				</button>
				<span className="text-[11px] text-[var(--muted)]">
					在瀏覽器內以快照與假設計算，不查詢即時資料、不外傳輸入。
				</span>
			</div>
		</form>
	);
}

export function ScenarioShortcuts({
	data,
	scenarios,
	activeId,
	dispatch,
}: {
	data: Data;
	scenarios: ScenarioExample[];
	activeId: string | null;
	dispatch: Dispatch<Action>;
}) {
	const names = stopNames(data.timetable);
	const rows = scenarios.map((s) => {
		const fresh = verifyTripReachability(
			s.request,
			data.timetable,
			data.attractions,
		);
		return { s, same: sameOutcome(fresh, s.result) };
	});
	const matching = rows.filter((r) => r.same).length;
	return (
		<div>
			<p className="max-w-[80ch] text-[11px] leading-relaxed text-[var(--muted)]">
				預先存好的 {scenarios.length}{" "}
				組示範輸入。載入會把輸入填入上方表單並重新執行；下方「預存結果」是檔案內的紀錄，不是本次計算。
				{matching === scenarios.length
					? `瀏覽器以目前資料重算，${matching} 組都與預存結果一致（比對成立與否、拒絕原因、班次、風險等級與緩衝）。`
					: `瀏覽器以目前資料重算，只有 ${matching} / ${scenarios.length} 組與預存結果一致，預存檔可能過期。`}
			</p>
			<ul className="mt-2 grid gap-2 lg:grid-cols-2">
				{rows.map(({ s, same }) => {
					const risk = s.result.lastBusRisk?.riskLevel;
					return (
						<li
							key={s.scenarioId}
							className="rounded-lg border border-[var(--line)] p-3 text-xs"
							style={
								activeId === s.scenarioId
									? { background: "var(--active-bg)" }
									: undefined
							}
						>
							<div className="font-semibold">{s.title}</div>
							<div className="mt-0.5 text-[var(--fg2)]">
								{requestSummary(s.request, names, data.attractions)}
							</div>
							<div className="mt-1.5 flex flex-wrap items-center gap-1.5">
								<span className="text-[11px] text-[var(--muted)]">
									預存結果
								</span>
								<Chip tone={s.result.isValid ? "--sev-info" : "--sev-review"}>
									{s.result.isValid ? "快照下條件成立" : "快照下條件不成立"}
								</Chip>
								{risk && (
									<Chip tone={RISK_META[risk].tone}>
										{risk} · {RISK_META[risk].label}
									</Chip>
								)}
								{!same && <Chip tone="--sev-watch">與重算不一致</Chip>}
							</div>
							<button
								type="button"
								className="btn mt-2"
								onClick={() => dispatch({ type: "load", scenario: s, data })}
							>
								載入並執行
							</button>
						</li>
					);
				})}
			</ul>
		</div>
	);
}
