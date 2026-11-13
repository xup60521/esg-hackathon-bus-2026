import { CalendarClock, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { assessFreshness, type Freshness } from "./freshness";

function title(f: Freshness | null): string {
	if (f?.level === "invalid") return "資料時間無法判讀";
	if (f?.level === "future") return "資料時間晚於現在";
	if (f?.usableForRealtime) return "宣告為即時來源，且在容許延遲內";
	return "歷史資料，非即時";
}

function ageClause(f: Freshness): string {
	if (f.level === "invalid" || f.level === "future" || f.level === "unknown")
		return f.ageText;
	return f.precision === "date" ? `距今${f.ageText}` : `距今 ${f.ageText}`;
}

/**
 * Always shows how old the newest record is, but age alone never makes data "live": data is
 * labelled historical unless the caller declares a real-time source (`realtimeMaxAgeMs`) and the
 * timestamp is precise, timezone-explicit and not in the future. Unparseable or future times are
 * called out instead of being guessed. `now` is read after mount so server and client render
 * the same HTML.
 */
export function FreshnessBanner({
	dataThrough,
	what = "最新一筆資料",
	note,
	realtimeMaxAgeMs,
}: {
	/** YYYY-MM-DD (a Taipei calendar day, no time of day) or an ISO timestamp with timezone */
	dataThrough: string;
	what?: string;
	note?: string;
	/** Only for a genuine real-time feed: the largest age its consumer accepts. Omit for history. */
	realtimeMaxAgeMs?: number;
}) {
	const [now, setNow] = useState<Date | null>(null);
	useEffect(() => setNow(new Date()), []);
	const f = now
		? assessFreshness(
				dataThrough,
				now,
				realtimeMaxAgeMs === undefined
					? undefined
					: { realtime: { maxAgeMs: realtimeMaxAgeMs } },
			)
		: null;
	const warn = !f || !f.usableForRealtime;
	const Icon = warn ? TriangleAlert : CalendarClock;
	return (
		<div
			role={warn ? "alert" : "status"}
			className="flex items-start gap-3 rounded-xl border p-3 text-sm"
			style={{
				color: "var(--fg)",
				borderColor: warn
					? "color-mix(in srgb, var(--k-unverified) 55%, transparent)"
					: "var(--line)",
				background: warn
					? "color-mix(in srgb, var(--k-unverified) 10%, transparent)"
					: "var(--chip)",
			}}
		>
			<Icon
				className="mt-0.5 size-4 shrink-0"
				style={{ color: "var(--k-unverified)" }}
			/>
			<div className="leading-relaxed">
				<div className="font-semibold">
					{title(f)}
					<span className="ml-2 font-normal text-[var(--fg2)]">
						{what}截至{" "}
						<b className="font-semibold text-[var(--fg)]">{dataThrough}</b>
						{f ? `，${ageClause(f)}` : ""}
					</span>
				</div>
				<div className="text-xs text-[var(--fg2)]">
					{note ??
						"本資料沒有即時來源；即使時間很近也不能當作即時營運判斷。畫面中的所有「現在」都是歷史回放的模擬時間。"}
				</div>
			</div>
		</div>
	);
}
