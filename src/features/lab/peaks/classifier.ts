import type { GovernmentCalendar, DayType, StopRole } from "./types";

/** Government office calendar is an analysis proxy, not a bus schedule. */
export function classifyDate(
	date: string,
	calendar: GovernmentCalendar,
): {
	dayType: DayType;
	governmentRest: boolean;
	calendarNote?: string;
	dayOfWeek: number;
} {
	const day = calendar.days[date];
	if (!day) throw new Error(`Government calendar missing date: ${date}`);
	return {
		dayType: day.rest ? "government_restday" : "government_workday",
		governmentRest: day.rest,
		calendarNote: day.note,
		dayOfWeek: (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7,
	};
}

/** Analyst candidate labels only; no endpoint/intermediate claims without branch schedules. */
export function classifyStopRole(stop: string): StopRole {
	if (["臺中", "高鐵臺中站", "埔里站"].includes(stop))
		return "transport_hub_candidate";
	if (["暨南大學", "暨南大學校內"].includes(stop)) return "campus_candidate";
	if (stop === "台中航空站") return "airport_candidate";
	return "unknown";
}
