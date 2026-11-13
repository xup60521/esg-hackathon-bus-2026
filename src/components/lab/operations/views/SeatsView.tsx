import {
	FreshnessBanner,
	LimitationList,
	Provenance,
	Section,
	type Source,
	SourceList,
} from "#/components/lab/shared";
import {
	BASE,
	type DemandFile,
	Status,
	type Summary,
	useJson,
} from "./seats/data";
import { ReservationSim } from "./seats/ReservationSim";
import { SignReplay } from "./seats/SignReplay";

const LIMITATIONS = [
	"車上人數只計有刷卡上下車的乘客；現金、紙本或預約票、孩童與漏刷都不在內，實際人數可能更多。",
	"每輛車的座位數沒有官方資料；預設 43 席是依刷卡重疊人數在 43→44 人驟降推測，可切換 37/38/42/43 席。",
	"只看得到有人刷卡上車的到站。滿車過站、沒人上車的到站，以及在站牌等不到車而離開的人，資料裡都沒有。",
	"vehicle 欄位是否等於單一實體車未經業者確認；同一輛車一天可能跑多條支線，跨班晚刷可能把前一班乘客算進下一班。",
	"方向依該次上車乘客的起訖站序推定，不是官方班次方向。",
	"專車模擬的需求只來自成功搭上車的人；「改用預約的比例」與「未被記錄的需求加成」是情境假設，不是調查結果。",
	"模擬沒有考慮車輛與司機是否調得出來、法規與補助、預約後未到（no-show）以及票價。",
	"這是 2024–2025 年歷史回放，不是即時資料。即時版需要刷卡機即時上傳或車上計數設備。",
];

const SOURCES: Source[] = [
	{
		label: "南投客運 6670 高鐵線說明",
		url: "https://www.ntbus.com.tw/hsr6.html",
		accessed: "2026-11-11",
		evidence:
			"業者說明尖峰埔里往高鐵常客滿、中間站難搭，沿途可能因座位額滿無法停靠（經搜尋索引讀取）。",
	},
	{
		label: "高速公路及快速公路交通管制規則 第 9 條",
		url: "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=K0040019",
		accessed: "2026-11-11",
		evidence: "大型客車在高速公路行駛時不得載運站立乘客，座位數即運能上限。",
	},
	{
		label: "韓國首都圈廣域巴士座位預約（國土交通部大都市圈廣域交通委員會）",
		url: "https://www.molit.go.kr/mta/USR/BORD0201/m_37212/BRD.jsp",
		accessed: "2026-11-11",
		evidence:
			"不得站立的廣域巴士以 App 預約座位，預約者優先上車、剩餘座位給現場乘客。",
	},
	{
		label: "GTFS Realtime OccupancyStatus",
		url: "https://gtfs.org/documentation/realtime/reference/#enum-occupancystatus",
		accessed: "2026-11-11",
		evidence:
			"國際即時公車資料格式以分級欄位表示擁擠程度，本頁三級顯示可對應。",
	},
];

export default function SeatsView() {
	const summary = useJson<Summary>(`${BASE}/summary.json`);
	const demand = useJson<DemandFile>(`${BASE}/demand.json`);

	return (
		<>
			<header className="mt-6">
				<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
					提案原型 · 透明度與可預期性
				</div>
				<h1 className="mt-1 text-2xl font-bold">即時剩餘座位與預約專車</h1>
				<p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--fg2)]">
					6670
					行駛國道不能站立，車一滿，中途站的人就上不了車，而且事前無從得知。
					這頁用 2024–2025
					年刷卡資料驗證兩個提案：站牌與手機顯示剩餘座位，以及只收預約、由電腦分配的加開專車。
				</p>
			</header>

			<div className="mt-4">
				<FreshnessBanner
					dataThrough="2025-12-31"
					what="票證資料"
					note="以下全部是歷史回放與情境模擬，不是現在的座位狀態。"
				/>
			</div>

			<div className="mt-4 grid gap-4">
				{summary.state === "ready" ? (
					<SignReplay summary={summary.data} />
				) : (
					<Status loaded={summary} />
				)}
				{demand.state === "ready" ? (
					<ReservationSim demand={demand.data} />
				) : (
					<Status loaded={demand} />
				)}

				<Section title="限制">
					<LimitationList items={LIMITATIONS} />
				</Section>
				<Section title="來源">
					<SourceList sources={SOURCES} />
				</Section>
				<Section title="資料出處">
					<Provenance
						source="trips 表（1,800,910 筆刷卡旅次），輸出只含計數，沒有卡號、車號或逐筆旅次"
						dataThrough={
							summary.state === "ready" ? summary.data.dataThrough : undefined
						}
						generatedAt={
							summary.state === "ready" ? summary.data.generatedAt : undefined
						}
						command="bun scripts/lab/seats/build.ts"
					/>
				</Section>
			</div>
		</>
	);
}
