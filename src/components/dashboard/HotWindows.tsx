import {
	type Day,
	type HotWindow,
	hotCounts,
	type Seats,
} from "#/features/dashboard/replay";
import { DIR_LABEL } from "./status";

export default function HotWindows({
	day,
	hot,
	t,
	seats,
}: {
	day: Day;
	hot: HotWindow[];
	t: number;
	seats: Seats;
}) {
	const counts = hotCounts(day, hot, t, seats);
	const hour = Math.floor(t / 3600);
	return (
		<table className="w-full text-xs">
			<thead>
				<tr className="text-left text-[var(--muted)]">
					<th className="py-1 font-medium">窗口</th>
					<th className="py-1 text-right font-medium">留出期／日</th>
					<th className="py-1 text-right font-medium">今日</th>
				</tr>
			</thead>
			<tbody>
				{hot.map((w, i) => {
					const applies = w.rest === day.rest;
					const now = applies && hour === w.hour;
					return (
						<tr
							key={`${w.sub}${w.dir}${w.hour}${w.rest}`}
							className={`border-t border-[var(--line)] ${applies ? "" : "opacity-45"}`}
							style={now ? { background: "var(--active-bg)" } : undefined}
						>
							<td className="py-1.5">
								<span className="tabular-nums text-[var(--muted)]">
									{i + 1}.
								</span>{" "}
								{w.sub} {DIR_LABEL[w.dir]} {w.hour}–{w.hour + 1} 時{" "}
								{w.rest ? "休息日" : "上班日"}
								{now && (
									<span className="ml-1 font-semibold text-[var(--accent)]">
										進行中
									</span>
								)}
							</td>
							<td className="py-1.5 text-right tabular-nums">
								{w.perDay.toFixed(2)}
							</td>
							<td className="py-1.5 text-right font-semibold tabular-nums">
								{applies ? counts[i] : "—"}
							</td>
						</tr>
					);
				})}
			</tbody>
		</table>
	);
}
