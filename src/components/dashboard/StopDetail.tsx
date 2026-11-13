import {
	approaching,
	arrivalOutlook,
	clock,
	loadAt,
	SPEED_M_PER_S,
	seatStatus,
} from "#/features/dashboard/replay";
import { etaText, type StopCtx } from "./StopList";
import { DIR_LABEL, STATUS, StatusDot } from "./status";

/** 選定站牌：正在接近的車、目前載客與到站時的座位預估 */
export default function StopDetail({
	ctx,
	stop,
}: {
	ctx: StopCtx;
	stop: number;
}) {
	const { day, t, seats, dir, sub, served } = ctx;
	const list = approaching(day, t, stop, dir, served, ctx.dist, sub).slice(
		0,
		5,
	);
	return (
		<div>
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="text-base font-bold">{ctx.stopName(stop)}</h2>
				<span className="text-xs text-[var(--muted)]">
					{DIR_LABEL[dir]}
					{sub ? `・${sub}` : ""}
				</span>
			</div>
			{list.length === 0 ? (
				<p className="mt-2 text-xs text-[var(--muted)]">
					目前沒有已知方向的車正駛向這一站。剛發車、方向未知的車不列入；班表尚未串接，所以不顯示未發車班次。
				</p>
			) : (
				<ol className="mt-2 space-y-2">
					{list.map((a) => {
						const load = loadAt(a.run, t);
						const now = seatStatus(load, seats);
						const o = arrivalOutlook(
							a.run,
							t,
							stop,
							seats,
							ctx.lookup,
							ctx.stopName,
						);
						return (
							<li
								key={a.run.i}
								className="rounded-lg border border-[var(--line)] p-2.5 text-xs"
							>
								<div className="flex items-center justify-between gap-2">
									<span className="flex items-center gap-1.5 font-semibold">
										<span
											className="inline-block h-3 w-1 rounded-full"
											style={{ background: `var(--s-${a.run.sub})` }}
										/>
										{a.run.sub}
										<span className="font-normal text-[var(--muted)]">
											車號 {a.run.vehicle}
										</span>
									</span>
									<span className="text-sm font-bold tabular-nums">
										{etaText(a, t)}
									</span>
								</div>
								<div className="mt-1 text-[var(--fg2)]">
									還有 {a.stopsAway} 站・預估 {clock(a.eta)} 到站（最後刷卡：
									{ctx.stopName(a.from)}）
								</div>
								<div className="mt-1.5 grid grid-cols-2 gap-1.5">
									<div className="rounded-md bg-[var(--chip)] px-2 py-1">
										<div className="text-[10px] text-[var(--muted)]">
											現在車上
										</div>
										<div className="flex items-center gap-1 font-semibold">
											<StatusDot s={now} />
											{load} 人・
											{STATUS[now].label.replace("（交人工核對）", "")}
										</div>
									</div>
									<div className="rounded-md bg-[var(--chip)] px-2 py-1">
										<div className="text-[10px] text-[var(--muted)]">
											到這站時
										</div>
										<div className="flex items-center gap-1 font-semibold">
											<StatusDot s={o.status} />
											{o.text}
										</div>
									</div>
								</div>
								<div className="mt-1 text-[10px] text-[var(--muted)]">
									依據：{o.basis}
								</div>
							</li>
						);
					})}
				</ol>
			)}
			<p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
				到站時間＝最後刷卡站起算的道路距離 ÷{" "}
				{Math.round(SPEED_M_PER_S * 0.06 * 10) / 10}{" "}
				km／分（無塞車資料）；座位預估查訓練期（≤2025-03）同子路線、同離站站與載客區間的歷史比率。
			</p>
		</div>
	);
}
