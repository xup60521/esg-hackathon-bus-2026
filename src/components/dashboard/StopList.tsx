import { Bus } from "lucide-react";
import {
	type Approach,
	approaching,
	arrivalOutlook,
	clock,
	type Day,
	dirAt,
	isActive,
	type Lookup,
	lastStopAt,
	loadAt,
	type Seats,
	seatStatus,
} from "#/features/dashboard/replay";
import { STATUS, StatusDot } from "./status";

export type StopCtx = {
	day: Day;
	t: number;
	seats: Seats;
	dir: number;
	sub: string | null;
	served: Record<string, number[]>;
	lookup: Lookup;
	dist: (a: number, b: number) => number;
	stopName: (o: number) => string;
};

export const etaText = (a: Approach, t: number) => {
	const m = Math.ceil((a.eta - t) / 60);
	return m <= 1 ? "進站中" : `${m} 分`;
};

/** 類似等公車 App 的站牌清單：每站顯示下一班車的預估到站時間與到站時的座位狀態，車輛插在站與站之間。 */
export default function StopList({
	ctx,
	stops,
	selected,
	onSelect,
}: {
	ctx: StopCtx;
	stops: [number, string][];
	selected: number | null;
	onSelect: (order: number) => void;
}) {
	const { day, t, seats, dir, sub, served } = ctx;
	const list = stops
		.map(([o]) => o)
		.filter((o) => !sub || served[`${sub}|${dir}`]?.includes(o))
		.sort((a, b) => (a - b) * dir);

	// buses placed after the last listed stop they have reached
	const busesAfter = new Map<
		number,
		{ sub: string; load: number; id: number }[]
	>();
	for (const run of day.runs) {
		if ((sub && run.sub !== sub) || !isActive(run, t) || dirAt(run, t) !== dir)
			continue;
		const last = lastStopAt(run, t);
		if (!last) continue;
		const at = [...list].reverse().find((o) => (last.stop - o) * dir >= 0);
		if (at === undefined) continue;
		const arr = busesAfter.get(at) ?? [];
		arr.push({ sub: run.sub, load: loadAt(run, t), id: run.i });
		busesAfter.set(at, arr);
	}

	return (
		<ol className="relative">
			{list.map((o, i) => {
				const next = approaching(day, t, o, dir, served, ctx.dist, sub)[0];
				const outlook =
					next &&
					arrivalOutlook(next.run, t, o, seats, ctx.lookup, ctx.stopName);
				const sel = o === selected;
				const buses = busesAfter.get(o) ?? [];
				return (
					<li key={o}>
						<button
							type="button"
							onClick={() => onSelect(o)}
							className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] hover:bg-[var(--chip-hover)] ${sel ? "bg-[var(--active-bg)] ring-1 ring-[var(--active-border)]" : ""}`}
						>
							<span
								className={`w-[52px] shrink-0 rounded-md px-1 py-0.5 text-center text-[12px] font-bold tabular-nums ${
									next && etaText(next, t) === "進站中"
										? "bg-[var(--accent)] text-[var(--bg)]"
										: next
											? "bg-[var(--chip)] text-[var(--fg)]"
											: "text-[var(--muted)]"
								}`}
								title={
									next
										? `預估 ${clock(next.eta)} 到站`
										: "目前沒有車接近（未串接班表）"
								}
							>
								{next ? etaText(next, t) : "—"}
							</span>
							<span className="relative flex w-3 shrink-0 justify-center self-stretch">
								<span
									className={`absolute w-0.5 bg-[var(--axis)] ${i === 0 ? "top-1/2" : "top-0"} ${i === list.length - 1 ? "bottom-1/2" : "bottom-0"}`}
								/>
								<span className="relative mt-auto mb-auto size-2.5 rounded-full border-2 border-[var(--axis)] bg-[var(--panel)]" />
							</span>
							<span className="min-w-0 flex-1 truncate font-medium">
								{ctx.stopName(o)}
							</span>
							{outlook && (
								<span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--fg2)]">
									<StatusDot s={outlook.status} />
									{outlook.short}
								</span>
							)}
						</button>
						{buses.map((b) => (
							<div
								key={b.id}
								className="ml-[60px] flex items-center gap-1.5 py-0.5 pl-1 text-[11px] text-[var(--fg2)]"
							>
								<Bus
									className="size-3.5"
									style={{ color: `var(--s-${b.sub})` }}
								/>
								<span className="font-semibold">{b.sub}</span>
								<StatusDot s={seatStatus(b.load, seats)} />
								{STATUS[seatStatus(b.load, seats)].label.replace(
									"（交人工核對）",
									"",
								)}
								・{b.load} 人
							</div>
						))}
					</li>
				);
			})}
		</ol>
	);
}
