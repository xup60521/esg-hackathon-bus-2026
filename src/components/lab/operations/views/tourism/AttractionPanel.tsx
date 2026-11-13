import {
	BookOpenCheck,
	CircleHelp,
	ExternalLink,
	SlidersHorizontal,
} from "lucide-react";
import type { ReactNode } from "react";
import { Chip, LimitationList } from "#/components/lab/shared";
import type { Attraction } from "#/features/lab/tourism";
import { BASIS_LABEL, type Basis, provenanceRows } from "./model";

const BASIS_TONE: Record<Basis, string> = {
	supported: "--k-official",
	assumed: "--k-scenario",
	unknown: "--k-unverified",
};
const BASIS_ICON: Record<Basis, ReactNode> = {
	supported: <BookOpenCheck className="size-3" />,
	assumed: <SlidersHorizontal className="size-3" />,
	unknown: <CircleHelp className="size-3" />,
};

/** Exceptions the engine does not model, written from the stored 正文摘要 and the hand-off report. */
const NOT_MODELLED: Record<string, string[]> = {
	xiangshan_visitor_center: [
		"天災、修繕可能休園（正文摘要有提到）：本模擬不建模，結果不代表當日開放。",
		"最後入園與收費條件未知；「closedDays 空白」只是沒有額外週休的假設，不是全年無休。",
	],
	paper_dome: [
		"週三、週四一般公休，但國定假日、寒暑假、預約團例外：本模擬只依一般公休拒絕，沒有自動判斷例外日，也不能因此當作該日營業。",
		"除夕休園、週六夜景限定依公告：未納入模擬。",
		"閉館 17:00 為統一假設；最後入園 16:30 與「收費入園」有正文摘要支持，金額未知。",
	],
	formosan_village: [
		"17:00 為統一保守假設：正文摘要為平日 09:30–17:00、假日 09:30–17:30，且景點的平假日定義尚未與 6670 班表的週一至四／週五至日對齊。",
		"最後入園未知，未知不代表沒有入園限制；收費條件與金額未核實。",
	],
};

export function AttractionPanel({ attraction: a }: { attraction: Attraction }) {
	const rows = provenanceRows(a);
	return (
		<div>
			<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<h3 className="text-base font-bold">{a.name}</h3>
				<span className="text-[11px] text-[var(--muted)]">
					模擬採用站牌：{a.stopName}
				</span>
			</div>
			<dl className="mt-2 grid gap-x-4 gap-y-1 text-xs leading-relaxed sm:grid-cols-[auto_1fr]">
				<dt className="text-[var(--muted)]">來源頁面</dt>
				<dd>
					<a
						href={a.provenance.exactSourceUrl}
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 underline decoration-[var(--axis)] underline-offset-2"
					>
						{a.provenance.exactSourceUrl}
						<ExternalLink className="size-3" aria-hidden="true" />
					</a>
					<span className="ml-2 text-[var(--muted)]">
						查閱 {a.provenance.retrievedDate}；網址本身不構成驗證
					</span>
				</dd>
				<dt className="text-[var(--muted)]">取證方式</dt>
				<dd>{a.provenance.evidenceBasis}</dd>
				<dt className="text-[var(--muted)]">正文摘要的營業說明</dt>
				<dd>{a.provenance.sourceScheduleNote}</dd>
			</dl>

			<div className="mt-3 overflow-x-auto">
				<table className="w-full text-left text-xs">
					<caption className="mb-1 text-left text-[11px] text-[var(--muted)]">
						逐欄來源：有正文摘要支持 {a.provenance.verifiedFields.length}{" "}
						欄、演算法假設 {a.provenance.assumedFields.length} 欄、未知{" "}
						{a.provenance.unknownFields.length} 欄
						。「有正文摘要支持」只指該欄有主代理轉錄的摘要，不表示整筆資料或當日狀態已驗證。
					</caption>
					<thead className="text-[var(--muted)]">
						<tr className="border-b border-[var(--line)]">
							<th scope="col" className="px-2 py-1.5 font-medium">
								欄位
							</th>
							<th scope="col" className="px-2 py-1.5 font-medium">
								依據
							</th>
							<th scope="col" className="px-2 py-1.5 font-medium">
								值
							</th>
						</tr>
					</thead>
					<tbody>
						{rows.map((r) => (
							<tr
								key={r.key}
								className="border-b border-[var(--line)] align-top last:border-0"
							>
								<td className="px-2 py-1.5 font-semibold">{r.label}</td>
								<td className="px-2 py-1.5">
									<Chip tone={BASIS_TONE[r.basis]} icon={BASIS_ICON[r.basis]}>
										{BASIS_LABEL[r.basis]}
									</Chip>
								</td>
								<td className="px-2 py-1.5">{r.value}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			{(NOT_MODELLED[a.id] ?? []).length > 0 && (
				<div className="mt-3">
					<h4 className="mb-1 text-xs font-semibold">
						本景點未建模的例外與未知
					</h4>
					<LimitationList items={NOT_MODELLED[a.id] ?? []} />
				</div>
			)}
		</div>
	);
}
