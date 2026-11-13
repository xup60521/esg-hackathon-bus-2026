import { type Alert, alertState, clock } from "#/features/dashboard/replay";
import { AlertBadge, DIR_LABEL } from "./status";

export default function AlertFeed({
	alerts,
	t,
	stopName,
	onSeek,
}: {
	alerts: Alert[];
	t: number;
	stopName: (order: number) => string;
	onSeek: (t: number) => void;
}) {
	const shown = alerts.filter((a) => a.t <= t).reverse();
	if (shown.length === 0)
		return (
			<p className="py-4 text-xs text-[var(--muted)]">
				目前還沒有提示。今日共 {alerts.length}{" "}
				則，會在離站當下（最後一筆上車刷卡後 60 秒無新刷卡）出現。
			</p>
		);
	return (
		<ol className="space-y-2">
			{shown.map((a) => {
				const st = alertState(a, t);
				const to = a.down.map(([s]) => stopName(s));
				const resolved = st === "hit" || st === "miss" || t >= a.resolveAt;
				return (
					<li
						key={`${a.run.i}-${a.t}`}
						className="rounded-lg border border-[var(--line)] p-2.5 text-xs"
					>
						<div className="flex items-center justify-between gap-2">
							<button
								type="button"
								className="font-semibold tabular-nums hover:underline"
								onClick={() => onSeek(a.t)}
							>
								{clock(a.t)} {a.run.sub} {DIR_LABEL[a.dir]}
							</button>
							<AlertBadge s={st} />
						</div>
						<div className="mt-1 text-[var(--fg2)]">
							自 <b>{stopName(a.from)}</b> 離站，推估載客 <b>{a.load}</b> 人
							{a.load > 50 && "（>50，重建值異常，不發布，交人工核對）"}
						</div>
						<div className="mt-1 text-[var(--muted)]">
							{`命中調度卡：${a.card.sub} ${a.card.from}→${a.card.to}・載客 ${a.card.band}・達門檻比率 ${a.card.ratio.toFixed(3)}（訓練期 ${a.card.n} 筆）`}
						</div>
						{a.load <= 50 && (
							<div className="mt-1.5 rounded-md bg-[var(--chip)] px-2 py-1 text-[var(--fg)]">
								{`建議：通知${to.join("、")}站務／客服——「這班座位不多，請告知下一班時刻」。系統不派車。`}
							</div>
						)}
						{resolved && (
							<div className="mt-1 text-[var(--muted)]">
								實際通過載客：
								{a.down.map(([s, l]) => `${stopName(s)} ${l}`).join("、")}
							</div>
						)}
					</li>
				);
			})}
		</ol>
	);
}
