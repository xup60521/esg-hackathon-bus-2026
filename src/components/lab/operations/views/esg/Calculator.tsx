import { useId, useMemo, useState } from "react";
import { Chip, KindBadge, Section, Stat } from "#/components/lab/shared";
import { EmissionBars } from "./Charts";
import {
	calculate,
	DEFAULT_FACTORS,
	defaultRaw,
	type EsgData,
	FACTOR_FIELDS,
	type FieldSpec,
	type InputKey,
	nf0,
	nf3,
	nf4,
	orNone,
	type Raw,
	readField,
	SPLIT_FIELDS,
	signed0,
	splitTotal,
	VEHICLE_FIELDS,
} from "./model";

function NumberField({
	spec,
	value,
	error,
	onChange,
}: {
	spec: FieldSpec;
	value: string;
	error?: string;
	onChange: (v: string) => void;
}) {
	const id = useId();
	const msg = `${id}-msg`;
	return (
		<div>
			<label
				htmlFor={id}
				className="mb-1 block text-[11px] font-medium text-[var(--muted)]"
			>
				{spec.label}
				<span className="ml-1 font-normal">（{spec.unit}）</span>
			</label>
			<input
				id={id}
				type="text"
				inputMode="decimal"
				autoComplete="off"
				spellCheck={false}
				value={value}
				aria-invalid={error ? true : undefined}
				aria-describedby={error || spec.hint ? msg : undefined}
				onChange={(e) => onChange(e.target.value)}
				className="w-full rounded-lg border bg-[var(--chip)] px-2.5 py-1.5 text-sm tabular-nums text-[var(--fg)]"
				style={{ borderColor: error ? "var(--sev-review)" : "var(--line)" }}
			/>
			<div
				id={msg}
				className="mt-0.5 min-h-4 text-[11px] leading-snug"
				style={{ color: error ? "var(--sev-review)" : "var(--muted)" }}
			>
				{error ? `✕ ${error}` : spec.hint}
			</div>
		</div>
	);
}

export function Calculator({ data }: { data: EsgData }) {
	const { od, inputVehicleKm } = data;
	const initial = useMemo(
		() => defaultRaw(inputVehicleKm, DEFAULT_FACTORS),
		[inputVehicleKm],
	);
	const [raw, setRaw] = useState<Raw>(initial);
	const set = (k: InputKey) => (v: string) => setRaw((r) => ({ ...r, [k]: v }));
	const outcome = useMemo(() => calculate(raw, od, DEFAULT_FACTORS), [raw, od]);
	const fieldErrors = outcome.ok ? {} : outcome.fieldErrors;
	const total = splitTotal(raw);
	const dirty = (Object.keys(initial) as InputKey[]).some(
		(k) => raw[k] !== initial[k],
	);
	const rate = readField(VEHICLE_FIELDS[1], raw.electrification);

	return (
		<Section
			className="mt-4"
			title="情境計算工具"
			subtitle="改變下列輸入即可重算。每個欄位嚴格檢查：空白、含逗號或單位、負值、超出範圍都會被拒絕，不會補成 0，也不自動夾限或正規化。計算由 src/features/lab/esg 的純函式完成，在瀏覽器內執行，不上傳任何輸入。"
			badges={
				<>
					<KindBadge kind="scenario" />
					<Chip tone="--sev-review">獨立假設展示</Chip>
				</>
			}
		>
			<div className="flex flex-wrap items-center gap-1.5">
				<span className="text-[11px] font-medium text-[var(--muted)]">
					快速設定電動化率
				</span>
				{[0, 50, 100].map((p) => (
					<button
						key={p}
						type="button"
						className={`btn ${rate && "value" in rate && rate.value === p ? "btn-active" : ""}`}
						aria-pressed={rate && "value" in rate && rate.value === p}
						onClick={() => set("electrification")(String(p))}
					>
						{p}%
					</button>
				))}
				<button
					type="button"
					className="btn ml-auto"
					disabled={!dirty}
					onClick={() => setRaw(initial)}
				>
					重設為預設值
				</button>
			</div>

			<div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
				{VEHICLE_FIELDS.map((f) => (
					<NumberField
						key={f.key}
						spec={f}
						value={raw[f.key]}
						error={fieldErrors[f.key]}
						onChange={set(f.key)}
					/>
				))}
			</div>

			<fieldset className="mt-3 rounded-lg border border-[var(--line)] p-3">
				<legend className="px-1 text-[11px] font-medium text-[var(--muted)]">
					情境運具分流（四項合計須為 100%；48/24/16/12
					無問卷證據，不代表旅客實際反應）
				</legend>
				<div className="grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
					{SPLIT_FIELDS.map((f) => (
						<NumberField
							key={f.key}
							spec={f}
							value={raw[f.key]}
							error={fieldErrors[f.key]}
							onChange={set(f.key)}
						/>
					))}
				</div>
				<div
					className="mt-1 text-[11px]"
					style={{
						color:
							total !== null && Math.abs(total - 100) <= 1e-7
								? "var(--fg2)"
								: "var(--sev-review)",
					}}
				>
					目前合計：
					{total === null ? "無（有欄位無法讀取）" : `${nf3.format(total)}%`}
				</div>
			</fieldset>

			<details className="mt-3 text-xs">
				<summary className="cursor-pointer text-[var(--fg2)]">
					進階：排放係數（預設：電力為官方 2024
					年值，其餘為假設；改動即視為使用者輸入）
				</summary>
				<div className="mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
					{FACTOR_FIELDS.map((f) => (
						<NumberField
							key={f.key}
							spec={f}
							value={raw[f.key]}
							error={fieldErrors[f.key]}
							onChange={set(f.key)}
						/>
					))}
				</div>
			</details>

			{!outcome.ok ? (
				<div
					className="mt-4 rounded-lg border p-3 text-xs"
					role="alert"
					style={{ borderColor: "var(--sev-review)" }}
				>
					<div className="font-semibold" style={{ color: "var(--sev-review)" }}>
						輸入有誤，未顯示結果
					</div>
					<ul className="mt-1 list-disc space-y-0.5 pl-5 text-[var(--fg2)]">
						{Object.entries(fieldErrors).map(([k, m]) => (
							<li key={k}>
								{
									[...VEHICLE_FIELDS, ...SPLIT_FIELDS, ...FACTOR_FIELDS].find(
										(f) => f.key === k,
									)?.label
								}
								：{m}
							</li>
						))}
						{outcome.errors.map((m) => (
							<li key={m}>{m}</li>
						))}
					</ul>
					<p className="mt-1 text-[var(--muted)]">
						不會以 0 或上一次的結果代替。請修正後重算。
					</p>
				</div>
			) : (
				<Result data={data} outcome={outcome} />
			)}
		</Section>
	);
}

function Result({
	data,
	outcome,
}: {
	data: EsgData;
	outcome: Extract<ReturnType<typeof calculate>, { ok: true }>;
}) {
	const { evaluation: ev, sweep, factors, changedOfficial } = outcome;
	const op = ev.operational;
	const cmp = ev.comparison;
	const rows = sweep.map((s) => ({
		label: `電動化 ${nf0.format(s.rate * 100)}%`,
		fuel: s.fuel,
		electricity: s.electricity,
		total: s.total,
	}));
	// the current rate is shown as its own row only when it is not one of the three fixed points
	if (!sweep.some((s) => s.rate === ev.scenario.electrificationRate))
		rows.push({
			label: `目前輸入 ${nf3.format(ev.scenario.electrificationRate * 100)}%`,
			fuel: op.fuelCombustionKgCo2e,
			electricity: op.purchasedElectricityKgCo2e,
			total: op.totalOperationalKgCo2e,
		});
	return (
		<div className="mt-4" aria-live="polite">
			<h3 className="text-sm font-semibold">
				展示營運排放（kg CO2e）
				<span className="ml-2 text-[11px] font-normal text-[var(--muted)]">
					燃油 CO2e 係數與效率未校準，不是實際能源或排放
				</span>
			</h3>
			<div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
				<Stat
					label="調整後車公里"
					value={nf0.format(op.adjustedVehicleKm)}
					sub={`輸入 ${nf0.format(op.inputVehicleKm)} × 空駛倍率`}
				/>
				<Stat
					label="柴油量"
					value={`${nf0.format(op.dieselLiters)} L`}
					sub="調整車公里 × 柴油比例 ÷ 油耗"
				/>
				<Stat
					label="用電量"
					value={`${nf0.format(op.electricityKwh)} kWh`}
					sub="調整車公里 × 電動比例 × 電耗"
				/>
				<Stat
					label="展示營運排放合計"
					value={nf0.format(op.totalOperationalKgCo2e)}
					sub={`約 ${nf3.format(op.totalOperationalKgCo2e / 1000)} 公噸 CO2e`}
				/>
				<Stat
					label="柴油燃燒"
					value={nf0.format(op.fuelCombustionKgCo2e)}
					sub="柴油量 × 柴油係數（假設）"
				/>
				<Stat
					label="購電間接排放"
					value={nf0.format(op.purchasedElectricityKgCo2e)}
					sub="用電量 × 購電係數；全電巴也有此項，不是零排放"
				/>
				<Stat
					label="每車公里"
					value={
						op.intensityKgCo2ePerVkm === null
							? "無"
							: `${nf4.format(op.intensityKgCo2ePerVkm)} kg`
					}
					sub="對調整後車公里；零車公里時為無"
				/>
				<Stat
					label="每人公里"
					value={
						op.intensityKgCo2ePerPkm === null
							? "無"
							: `${nf3.format(op.intensityKgCo2ePerPkm * 1000)} g`
					}
					sub="對路網近似人公里；零分母為無"
				/>
			</div>
			{changedOfficial && (
				<p className="mt-2 text-[11px] text-[var(--sev-watch)]">
					購電係數已改動，不再是官方 2024 年{" "}
					{factors.electricityKgCo2ePerKwh.value} 值，屬使用者輸入。
				</p>
			)}

			<h3 className="mt-5 text-sm font-semibold">其他輸入不變，只改電動化率</h3>
			<div className="mt-2">
				<EmissionBars rows={rows} what="展示營運排放比較" />
			</div>

			<h3 className="mt-5 text-sm font-semibold">
				情境基線比較（kg CO2e）
				<span className="ml-2 text-[11px] font-normal text-[var(--muted)]">
					獨立於 Scope 1/2/3，不抵扣盤查，不是已證實減量
				</span>
			</h3>
			{cmp === null ? (
				<p className="mt-2 text-xs text-[var(--fg2)]">
					無：有旅次缺距離，無法對全期人公里做比較，因此不產生基線與差額（不補
					0）。
				</p>
			) : (
				<>
					<div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
						<Stat
							label="情境基線排放"
							value={nf0.format(cmp.counterfactualBaselineKgCo2e)}
							sub={`人公里 ${nf0.format(cmp.totalPassengerKm)} × 假設分流 × 假設強度`}
						/>
						<Stat
							label="情境差額（基線 − 展示營運）"
							value={signed0(cmp.scenarioDifferenceKgCo2e)}
							sub="只是兩組假設相減，可為負；不是減量"
						/>
						<Stat
							label="基線 ÷ 展示營運"
							value={orNone(
								cmp.baselineToOperationalRatio,
								(n) => `${nf3.format(n)} 倍`,
							)}
							sub="展示營運為 0 時為無"
						/>
						<Stat
							label="基線組成"
							value={
								<span className="text-sm">
									車 {nf0.format(cmp.breakdown.carBaselineKgCo2e)} / 機車{" "}
									{nf0.format(cmp.breakdown.motorcycleBaselineKgCo2e)} /
									其他公運{" "}
									{nf0.format(cmp.breakdown.otherTransitBaselineKgCo2e)}
								</span>
							}
							sub="新增需求比例不計入基線（視為 0）"
						/>
					</div>
					<p className="mt-2 max-w-[80ch] text-[11px] leading-relaxed text-[var(--muted)]">
						人公里是 {data.summary.dataset.recordedDates}{" "}
						個有紀錄日、成功刷卡旅次的路網近似加總；車公里是獨立輸入，兩者沒有對應關係，因此差額不是營運實績，也不能解讀為「少排多少」。
					</p>
				</>
			)}

			<details className="mt-3 text-xs">
				<summary className="cursor-pointer text-[var(--fg2)]">
					算式與單位
				</summary>
				<ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed text-[var(--fg2)]">
					<li>調整車公里 = 輸入車公里 × 空駛倍率（≥ 1）。</li>
					<li>
						柴油 L = 調整車公里 × (1 − 電動化率) ÷ 油耗 km/L；用電 kWh =
						調整車公里 × 電動化率 × kWh/km。
					</li>
					<li>
						展示營運排放 = 柴油 L × 柴油係數 + 用電 kWh × 購電係數（皆 kg
						CO2e）。
					</li>
					<li>
						情境基線 = 人公里 × Σ（各運具分流 × 各運具強度）；差額 = 基線 −
						展示營運排放，只減一次。
					</li>
					<li>
						公噸 = kg ÷ 1000；g/pkm = kg/pkm × 1000；比例以 0..1 計算，頁面以 %
						輸入。
					</li>
				</ul>
				<p className="mt-2 text-[var(--muted)]">
					本輪使用的係數：柴油 {factors.dieselKgCo2ePerLiter.value}、購電{" "}
					{factors.electricityKgCo2ePerKwh.value}、小客車{" "}
					{factors.privateCarKgCo2ePerPkm.value}、機車{" "}
					{factors.motorcycleKgCo2ePerPkm.value}、其他公運{" "}
					{factors.publicTransitKgCo2ePerPkm.value}。
				</p>
			</details>
		</div>
	);
}
