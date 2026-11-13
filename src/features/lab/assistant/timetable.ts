/** 表定時刻查詢（純函式）。資料是官網擷取的靜態時刻表，不含即時位置或誤點。 */
import type { StopDef } from "./stops";
import type {
	DayType,
	Direction,
	TimetableData,
	TimetableTable,
} from "./types";

export const toMin = (t: string) =>
	Number(t.slice(0, 2)) * 60 + Number(t.slice(3));

export type Hit = {
	day: DayType;
	direction: Direction;
	no: string;
	from: string;
	dep: string;
	to?: string;
	arr?: string;
	/** 該班在表上最後停靠的站（表定終點） */
	terminal: string;
};

/** 官網定義：平日＝周一~周四；假日＝周五~周日。weekday：0=日。 */
export const dayTypeOfWeekday = (weekday: number): DayType =>
	weekday >= 1 && weekday <= 4 ? "weekday" : "holiday";

/** 該班在 names 中第一個有時間的站（回傳欄位索引） */
function indexIn(
	table: TimetableTable,
	times: (string | null)[],
	names: string[],
) {
	for (const name of names) {
		const i = table.stops.indexOf(name);
		if (i >= 0 && times[i]) return i;
	}
	return -1;
}

/** 列出某日型、起訖站的所有班次（依出發時間排序）。dest 省略時，只要該班在起站之後還有停靠站即算。 */
export function queryTrips(
	tt: TimetableData,
	opts: {
		day: DayType;
		origin: StopDef;
		dest?: StopDef;
		direction?: Direction;
	},
): Hit[] {
	const hits: Hit[] = [];
	for (const table of tt.tables) {
		if (table.day !== opts.day) continue;
		if (opts.direction && table.direction !== opts.direction) continue;
		for (const trip of table.trips) {
			const o = indexIn(table, trip.times, opts.origin.tt);
			if (o < 0) continue;
			let last = -1;
			for (let i = trip.times.length - 1; i >= 0; i--)
				if (trip.times[i]) {
					last = i;
					break;
				}
			if (last <= o) continue; // 起站是該班終點，不是上車站
			const d = opts.dest ? indexIn(table, trip.times, opts.dest.tt) : -1;
			if (opts.dest && d <= o) continue; // 沒停靠，或方向相反
			hits.push({
				day: table.day,
				direction: table.direction,
				no: trip.no,
				from: table.stops[o],
				dep: trip.times[o] as string,
				...(opts.dest
					? { to: table.stops[d], arr: trip.times[d] as string }
					: {}),
				terminal: table.stops[last],
			});
		}
	}
	return hits.sort((a, b) => toMin(a.dep) - toMin(b.dep));
}

export function countTrips(tt: TimetableData) {
	return tt.tables.map((t) => ({
		day: t.day,
		direction: t.direction,
		trips: t.trips.length,
	}));
}
