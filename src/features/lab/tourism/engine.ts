/**
 * src/features/lab/tourism/engine.ts
 *
 * Core rule engine for validating tourism reachability,
 * attraction opening hours, round-trip bus connections,
 * and last-bus stranding risk on Route 6670.
 *
 * Notice: Pure data contract & rule validation. No UI/visual styling.
 */

import type {
	Attraction,
	DayType,
	DayTypeSource,
	DwellLeg,
	InboundLeg,
	ItineraryRequest,
	LastBusRiskAssessment,
	OutboundLeg,
	ReachabilityResult,
	RiskLevel,
	TimetableData,
	TimetableTrip,
	TouristProfile,
} from "./types";

export const STANDARD_UNVERIFIED_BACKUP_NOTICE =
	"此6670快照未找到符合回程，其他服務未查證，請向營運方確認";

const STRICT_TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const STRICT_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates and converts "HH:MM" 24h format to total minutes from midnight [0, 1439].
 * Rejects invalid hours (>23), invalid minutes (>59), negative, non-string, or malformed inputs.
 */
export function timeToMinutes(timeStr: string): number {
	if (typeof timeStr !== "string" || !STRICT_TIME_REGEX.test(timeStr)) {
		return -1;
	}
	const [hStr, mStr] = timeStr.split(":");
	const h = Number.parseInt(hStr, 10);
	const m = Number.parseInt(mStr, 10);
	if (
		Number.isNaN(h) ||
		Number.isNaN(m) ||
		h < 0 ||
		h > 23 ||
		m < 0 ||
		m > 59
	) {
		return -1;
	}
	return h * 60 + m;
}

/**
 * Converts total minutes from midnight [0, 1439] back to "HH:MM".
 * Does NOT wrap around past midnight silently (% 1440).
 * Returns null if minutes is out of range (<0 or >= 1440) or not a finite number.
 */
export function minutesToTime(minutes: number): string | null {
	if (
		typeof minutes !== "number" ||
		!Number.isFinite(minutes) ||
		minutes < 0 ||
		minutes >= 1440
	) {
		return null;
	}
	const h = Math.floor(minutes / 60);
	const m = Math.floor(minutes % 60);
	return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/**
 * Validates a real calendar date string (YYYY-MM-DD), accounting for month lengths and leap years.
 */
export function isValidDateString(dateStr: string): boolean {
	if (typeof dateStr !== "string" || !STRICT_DATE_REGEX.test(dateStr)) {
		return false;
	}
	const [yStr, mStr, dStr] = dateStr.split("-");
	const y = Number.parseInt(yStr, 10);
	const m = Number.parseInt(mStr, 10);
	const d = Number.parseInt(dStr, 10);

	if (m < 1 || m > 12) return false;
	if (d < 1 || d > 31) return false;

	const isLeapYear = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
	const daysInMonths = [
		31,
		isLeapYear ? 29 : 28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31,
	];
	const maxDay = daysInMonths[m - 1];

	return d <= maxDay;
}

/**
 * Determines day type in a timezone-independent manner.
 * Strictly implements official Taiwan Trip 6670 schedule notes:
 * "平日班次為周一~周四，假日班次為周五~周日"
 * No arbitrary national holidays are injected without official evidence.
 * Supports manual override.
 */
export function getDayType(
	dateStr: string,
	manualOverride?: DayType,
): {
	isValidDate: boolean;
	dayType: DayType;
	dayOfWeek: string;
	source: DayTypeSource;
	error?: string;
} {
	if (
		manualOverride !== undefined &&
		manualOverride !== "weekday" &&
		manualOverride !== "holiday"
	) {
		return {
			isValidDate: false,
			dayType: "weekday",
			dayOfWeek: "Unknown",
			source: "MANUAL_OVERRIDE",
			error: "無效的 dayTypeOverride，只接受 weekday 或 holiday。",
		};
	}
	if (!isValidDateString(dateStr)) {
		return {
			isValidDate: false,
			dayType: "weekday",
			dayOfWeek: "Unknown",
			source: "OFFICIAL_NOTES_CALENDAR",
			error: `無效的真實日曆日期格式: ${dateStr}，必須為真實有效的 YYYY-MM-DD 格式。`,
		};
	}

	const [y, m, d] = dateStr.split("-").map((x) => Number.parseInt(x, 10));
	// Timezone-independent UTC day of week calculation
	const dayOfWeekIndex = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	const dayNames = [
		"Sunday",
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
	];
	const dayOfWeek = dayNames[dayOfWeekIndex];

	if (manualOverride) {
		return {
			isValidDate: true,
			dayType: manualOverride,
			dayOfWeek,
			source: "MANUAL_OVERRIDE",
		};
	}

	// Official Note: Weekday = Mon-Thu (1, 2, 3, 4); Holiday = Fri-Sun (5, 6, 0)
	const isHoliday =
		dayOfWeekIndex === 0 || dayOfWeekIndex === 5 || dayOfWeekIndex === 6;
	return {
		isValidDate: true,
		dayType: isHoliday ? "holiday" : "weekday",
		dayOfWeek,
		source: "OFFICIAL_NOTES_CALENDAR",
	};
}

/**
 * Returns walking speed multiplier based on tourist profile.
 * Notice: senior_accessible multiplier is purely a walking speed assumption,
 * NOT a guarantee of barrier-free wheelchair access on physical terrain.
 */
export function getWalkMultiplier(profile?: TouristProfile): {
	multiplier: number;
	accessibilityNotice?: string;
} {
	switch (profile) {
		case "senior_accessible":
			return {
				multiplier: 1.4,
				accessibilityNotice:
					"長者與無障礙輪廓套用 1.4 倍步速加權（僅為步行速度估算假設，不代表現地路徑符合無障礙標準或具備輪椅坡道設施）。",
			};
		case "family":
			return {
				multiplier: 1.3,
			};
		default:
			return {
				multiplier: 1.0,
			};
	}
}

/**
 * Finds the earliest available bus trip departing from `originStopId`
 * on or after `afterMinutes` that reaches `destinationStopId` (`destTime > originTime`).
 * Evaluates all matching trips and selects the minimum departure time.
 */
export function findOutboundTrip(
	scheduleTable: { trips: TimetableTrip[] },
	originStopId: string,
	destinationStopId: string,
	afterMinutes: number,
): { trip: TimetableTrip; originTime: string; destTime: string } | null {
	if (originStopId === destinationStopId) {
		return null;
	}

	let bestMatch: {
		trip: TimetableTrip;
		originTime: string;
		destTime: string;
		originMinutes: number;
	} | null = null;

	for (const t of scheduleTable.trips) {
		const oTime = t.stopTimes[originStopId];
		const dTime = t.stopTimes[destinationStopId];
		if (oTime && dTime) {
			const oMin = timeToMinutes(oTime);
			const dMin = timeToMinutes(dTime);
			if (oMin >= 0 && dMin >= 0 && oMin >= afterMinutes && dMin > oMin) {
				if (!bestMatch || oMin < bestMatch.originMinutes) {
					bestMatch = {
						trip: t,
						originTime: oTime,
						destTime: dTime,
						originMinutes: oMin,
					};
				}
			}
		}
	}

	if (!bestMatch) return null;
	return {
		trip: bestMatch.trip,
		originTime: bestMatch.originTime,
		destTime: bestMatch.destTime,
	};
}

/**
 * Finds the earliest available bus trip departing from `returnStopId`
 * on or after `afterMinutes` that reaches `userOriginStopId` (`arrTime > deptTime`).
 * Evaluates all matching trips and selects the minimum departure time.
 */
export function findInboundTrip(
	scheduleTable: { trips: TimetableTrip[] },
	userOriginStopId: string,
	returnStopId: string,
	afterMinutes: number,
): { trip: TimetableTrip; deptTime: string; arrTime: string } | null {
	if (userOriginStopId === returnStopId) {
		return null;
	}

	let bestMatch: {
		trip: TimetableTrip;
		deptTime: string;
		arrTime: string;
		deptMinutes: number;
	} | null = null;

	for (const t of scheduleTable.trips) {
		const deptTime = t.stopTimes[returnStopId];
		const arrTime = t.stopTimes[userOriginStopId];
		if (deptTime && arrTime) {
			const dMin = timeToMinutes(deptTime);
			const aMin = timeToMinutes(arrTime);
			if (dMin >= 0 && aMin >= 0 && dMin >= afterMinutes && aMin > dMin) {
				if (!bestMatch || dMin < bestMatch.deptMinutes) {
					bestMatch = {
						trip: t,
						deptTime,
						arrTime,
						deptMinutes: dMin,
					};
				}
			}
		}
	}

	if (!bestMatch) return null;
	return {
		trip: bestMatch.trip,
		deptTime: bestMatch.deptTime,
		arrTime: bestMatch.arrTime,
	};
}

/**
 * Assesses the last-bus risk dynamically for a return trip from `returnStopId`
 * to the specific `userOriginStopId`, counting exact remaining reachable trips.
 *
 * Rules:
 * - Filtered strictly by trips that serve `returnStopId` AND `userOriginStopId` (`arr > dept`).
 * - Accurately counts remaining trips reaching user's origin, does NOT estimate from minutes.
 * - Does not make unfounded passenger capacity or overcrowding claims.
 * - SAFE level disclaimer clearly explains buffer without guaranteeing boarding seats or operations.
 */
function dayTrips(
	timetable: TimetableData,
	dayType: DayType,
): { trips: TimetableTrip[] } {
	const schedules = timetable.schedules;
	return {
		trips:
			dayType === "weekday"
				? [
						...schedules.weekday_outbound.trips,
						...schedules.weekday_inbound.trips,
					]
				: [
						...schedules.holiday_outbound.trips,
						...schedules.holiday_inbound.trips,
					],
	};
}

export function calculateLastBusRisk(
	returnStopId: string,
	userOriginStopId: string,
	dayType: DayType,
	returnDepartureTime: string,
	timetable: TimetableData,
): LastBusRiskAssessment {
	const schedule = dayTrips(timetable, dayType);

	// Filter all trips that actually reach userOriginStopId from returnStopId
	const viableTrips: Array<{
		trip: TimetableTrip;
		deptMin: number;
		deptTime: string;
	}> = [];

	for (const t of schedule.trips) {
		const dTime = t.stopTimes[returnStopId];
		const aTime = t.stopTimes[userOriginStopId];
		if (dTime && aTime) {
			const dMin = timeToMinutes(dTime);
			const aMin = timeToMinutes(aTime);
			if (dMin >= 0 && aMin >= 0 && aMin > dMin) {
				viableTrips.push({ trip: t, deptMin: dMin, deptTime: dTime });
			}
		}
	}

	// Sort chronologically
	viableTrips.sort((a, b) => a.deptMin - b.deptMin);

	if (viableTrips.length === 0) {
		return {
			riskLevel: "INVALID",
			returnBusDepartureTime: returnDepartureTime,
			lastBusDepartureTime: "00:00",
			penultimateBusDepartureTime: null,
			bufferMinutes: -999,
			remainingTripsCount: 0,
			riskExplanation: `此6670快照中此站點 (${returnStopId}) 在 ${
				dayType === "weekday" ? "平日" : "假日"
			} 班表中無任何可直達返回【${userOriginStopId}】之班次。`,
			backupPlan: STANDARD_UNVERIFIED_BACKUP_NOTICE,
			disclaimer: timetable.metadata.lastBusDisclaimer,
		};
	}

	const lastTrip = viableTrips[viableTrips.length - 1];
	const penultimateTrip =
		viableTrips.length >= 2 ? viableTrips[viableTrips.length - 2] : null;

	const returnMin = timeToMinutes(returnDepartureTime);
	const lastMin = lastTrip.deptMin;
	const bufferMinutes = lastMin - returnMin;

	// Real count of remaining trips on or after returnDepartureTime reaching userOriginStopId
	const remainingTrips = viableTrips.filter((t) => t.deptMin >= returnMin);
	const remainingTripsCount = remainingTrips.length;

	let riskLevel: RiskLevel = "SAFE";
	let explanation = "";
	let backupPlan = "";

	if (bufferMinutes < 0 || remainingTripsCount === 0) {
		riskLevel = "STRANDED";
		explanation = `預計搭乘時間 (${returnDepartureTime}) 已超過返回【${userOriginStopId}】之當日末班車 (${lastTrip.deptTime})。`;
		backupPlan = STANDARD_UNVERIFIED_BACKUP_NOTICE;
	} else if (remainingTripsCount === 1 || bufferMinutes === 0) {
		riskLevel = "CRITICAL";
		explanation = `此班次即為返回【${userOriginStopId}】之當日最後 1 班排定公車 (${lastTrip.deptTime})。`;
		backupPlan = STANDARD_UNVERIFIED_BACKUP_NOTICE;
	} else if (bufferMinutes <= 35) {
		riskLevel = "HIGH_RISK";
		explanation = `距離末班車尚餘 ${bufferMinutes} 分鐘緩衝，當日返回【${userOriginStopId}】排定班次僅剩 ${remainingTripsCount} 班。`;
		backupPlan = `若錯過此班，末班車時間為 ${lastTrip.deptTime}。`;
	} else if (bufferMinutes <= 65) {
		riskLevel = "MODERATE";
		explanation = `距離末班車尚有 ${bufferMinutes} 分鐘緩衝，當日返回【${userOriginStopId}】剩餘 ${remainingTripsCount} 班排定車次。`;
		backupPlan = `若錯過此班，末班車時間為 ${lastTrip.deptTime}。`;
	} else {
		riskLevel = "SAFE";
		explanation = `距離末班車尚有充足時間緩衝 (${bufferMinutes} 分鐘)，返回【${userOriginStopId}】尚有 ${remainingTripsCount} 班排定車次。`;
		backupPlan = `末班車時間為 ${lastTrip.deptTime}。`;
	}

	return {
		riskLevel,
		returnBusDepartureTime: returnDepartureTime,
		lastBusDepartureTime: lastTrip.deptTime,
		penultimateBusDepartureTime: penultimateTrip
			? penultimateTrip.deptTime
			: null,
		bufferMinutes,
		remainingTripsCount,
		riskExplanation: `此6670快照中，${explanation}`,
		backupPlan,
		disclaimer: `SAFE 表示排定班表有充足緩衝班次（剩餘 ${remainingTripsCount} 班可達班次），但非保證營運安全、路況準點或現場必有座位。`,
	};
}

/**
 * Comprehensive verification of trip reachability, opening hours,
 * round-trip timetable execution, and origin-specific last-bus risk.
 */
function simulateTrip(
	request: ItineraryRequest,
	timetable: TimetableData,
	attractions: Attraction[],
): Omit<ReachabilityResult, "status"> {
	const warnings: string[] = [];
	const disclaimer = timetable.metadata.subrouteDisclaimer;

	// 1. Same-stop check
	const attraction = attractions.find((a) => a.id === request.attractionId);
	if (!attraction) {
		return {
			isValid: false,
			invalidReason: `找不到指定景點代碼: ${request.attractionId}`,
			originStopId: request.originStopId,
			destinationStopId: "unknown",
			attractionId: request.attractionId,
			attractionName: "未知景點",
			dayType: "weekday",
			dayTypeSource: "OFFICIAL_NOTES_CALENDAR",
			timetableStatus: "NO_ACTIVE_SCHEDULE",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: ["景點不存在於此三景點情境資料庫中。"],
			disclaimer,
		};
	}

	if (request.originStopId === attraction.stopId) {
		return {
			isValid: false,
			invalidReason: `出發地站點 (${request.originStopId}) 與景點所屬站點 (${attraction.stopId}) 相同，無需搭乘公路客運路線。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType: "weekday",
			dayTypeSource: "OFFICIAL_NOTES_CALENDAR",
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: ["起點與目的地相同，請直接步行或選擇其他景點。"],
			disclaimer,
		};
	}

	// 2. Validate calendar date & check historical date policy
	const dayTypeResult = getDayType(
		request.departureDate,
		request.dayTypeOverride,
	);
	if (!dayTypeResult.isValidDate) {
		return {
			isValid: false,
			invalidReason:
				dayTypeResult.error || `無效的出發日期格式: ${request.departureDate}`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType: "weekday",
			dayTypeSource: "OFFICIAL_NOTES_CALENDAR",
			timetableStatus: "NO_ACTIVE_SCHEDULE",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: ["請輸入真實日曆有效日期 (YYYY-MM-DD)。"],
			disclaimer,
		};
	}

	// Historical date verification restriction
	if (request.departureDate < timetable.metadata.retrievedDate) {
		return {
			isValid: false,
			invalidReason: `歷史日期 (${request.departureDate}) 不可使用 ${timetable.metadata.retrievedDate} 之班表快照認定有效；歷史排班與現行班表存在差異。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType: dayTypeResult.dayType,
			dayTypeSource: dayTypeResult.source,
			timetableStatus: "NO_ACTIVE_SCHEDULE",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: [`本班表快照檢索日期為 ${timetable.metadata.retrievedDate}。`],
			disclaimer,
		};
	}

	const { dayType, dayOfWeek, source: dayTypeSource } = dayTypeResult;

	// 3. Check closed days
	if (attraction.closedDays.includes(dayOfWeek)) {
		return {
			isValid: false,
			invalidReason: `景點【${attraction.name}】於 ${dayOfWeek} 的一般公休條件下不成立；國定假日、寒暑假、預約團等例外需另向景點確認。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: [
				`本模擬採一般公休日假設: ${attraction.closedDays.join(", ")}。`,
			],
			disclaimer,
		};
	}

	// 4. Validate departure time format
	const reqDeptMinutes = timeToMinutes(request.departureTime);
	if (reqDeptMinutes < 0) {
		return {
			isValid: false,
			invalidReason: `無效的 24 小時制出發時間格式: ${request.departureTime}，必須為 HH:MM。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: ["時間格式請輸入合法的 00:00 ~ 23:59。"],
			disclaimer,
		};
	}

	// 5. Validate dwell minutes
	const dwellMinutes =
		request.customDwellMinutes !== undefined
			? request.customDwellMinutes
			: attraction.recommendedDwellMinutes;

	if (
		typeof dwellMinutes !== "number" ||
		!Number.isFinite(dwellMinutes) ||
		dwellMinutes <= 0 ||
		!Number.isInteger(dwellMinutes)
	) {
		return {
			isValid: false,
			invalidReason: `無效的停留時間: ${request.customDwellMinutes}。停留時間必須為大於 0 之正整數分鐘。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: ["停留時間不可為負數、零或非數值。"],
			disclaimer,
		};
	}

	// 6. Find outbound trip (earliest departure)
	const outboundSchedule = dayTrips(timetable, dayType);

	const outboundMatch = findOutboundTrip(
		outboundSchedule,
		request.originStopId,
		attraction.stopId,
		reqDeptMinutes,
	);

	if (!outboundMatch) {
		return {
			isValid: false,
			invalidReason: `此6670快照在 ${request.departureTime} 之後，無從【${request.originStopId}】停靠【${attraction.stopName}】之去程公車班次（末班車已過或支線無停靠）。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: [
				"此6670快照未找到符合去程；其他服務未查證。",
				`目的地【${attraction.stopName}】可能僅特定班次停靠。`,
			],
			disclaimer,
		};
	}

	const { multiplier: walkMultiplier, accessibilityNotice } = getWalkMultiplier(
		request.profile,
	);
	if (accessibilityNotice) {
		warnings.push(accessibilityNotice);
	}

	const walkMinutes = Math.ceil(attraction.walkTimeMinutes * walkMultiplier);
	const busArrMinutes = timeToMinutes(outboundMatch.destTime);
	const rawAttrArrMinutes = busArrMinutes + walkMinutes;
	const rawAttrArrTime = minutesToTime(rawAttrArrMinutes);

	if (!rawAttrArrTime) {
		return {
			isValid: false,
			invalidReason: "抵達景點時間已跨越午夜，行程超出營運日範圍。",
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: ["跨日行程安全拒絕。"],
			disclaimer,
		};
	}

	const outboundLeg: OutboundLeg = {
		tripNumber: outboundMatch.trip.tripNumber,
		inferredSubroute: outboundMatch.trip.inferredSubroute,
		subrouteClassification: "inferred",
		departureTime: outboundMatch.originTime,
		arrivalTime: outboundMatch.destTime,
		walkToAttractionMinutes: walkMinutes,
		attractionArrivalTime: rawAttrArrTime,
	};

	// 7. Check opening hours, last entry time, and early arrival
	const openMinutes = timeToMinutes(attraction.openTime);
	const closeMinutes = timeToMinutes(attraction.closeTime);

	// If arrival after closing
	if (rawAttrArrMinutes >= closeMinutes) {
		return {
			isValid: false,
			invalidReason: `預計抵達景點時間為 ${rawAttrArrTime}，已超過景點打烊時間 (${attraction.closeTime})！行程無法成立。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: outboundLeg,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: [
				`景點營業時間為 ${attraction.openTime} ~ ${attraction.closeTime}。`,
			],
			disclaimer,
		};
	}

	// If last entry time exists and arrival is after last entry time -> REJECT
	if (attraction.lastEntryTime) {
		const lastEntryMinutes = timeToMinutes(attraction.lastEntryTime);
		if (rawAttrArrMinutes > lastEntryMinutes) {
			return {
				isValid: false,
				invalidReason: `預計抵達景點時間為 ${rawAttrArrTime}，已超過景點最後入園時間 (${attraction.lastEntryTime})！無法購票入園。`,
				originStopId: request.originStopId,
				destinationStopId: attraction.stopId,
				attractionId: attraction.id,
				attractionName: attraction.name,
				dayType,
				dayTypeSource,
				timetableStatus: "OFFICIAL_SCHEDULED",
				outbound: outboundLeg,
				dwell: null,
				inbound: null,
				lastBusRisk: null,
				warnings: [`最後入園時間為 ${attraction.lastEntryTime}。`],
				disclaimer,
			};
		}
	}

	// Handle arriving before opening:旅客需在門口等待開門
	let visitStartMinutes = rawAttrArrMinutes;
	let waitingForOpenMinutes = 0;
	if (rawAttrArrMinutes < openMinutes) {
		waitingForOpenMinutes = openMinutes - rawAttrArrMinutes;
		visitStartMinutes = openMinutes;
		warnings.push(
			`班車於 ${rawAttrArrTime} 抵達景點，早於開門時間 (${attraction.openTime})，旅客需等待開門約 ${waitingForOpenMinutes} 分鐘。`,
		);
	}

	// Calculate departure time from attraction without truncating user dwell
	const plannedAttrDeptMinutes = visitStartMinutes + dwellMinutes;
	const plannedAttrDeptTime = minutesToTime(plannedAttrDeptMinutes);

	// If dwell extends past close time: REJECT (do not silently truncate!)
	if (plannedAttrDeptMinutes > closeMinutes || plannedAttrDeptTime === null) {
		return {
			isValid: false,
			invalidReason: `依使用者預計停留 ${dwellMinutes} 分鐘，離開時間 (${
				plannedAttrDeptTime || "超出當日"
			}) 已超過景點打烊時間 (${attraction.closeTime})！系統不可擅自縮短旅客停留時間，行程無法成立。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: outboundLeg,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: [
				`景點打烊時間為 ${attraction.closeTime}，若欲成行請縮短自訂停留時間。`,
			],
			disclaimer,
		};
	}

	const attrDeptTime = plannedAttrDeptTime;
	const stopArrMinutes = plannedAttrDeptMinutes + walkMinutes;
	const stopArrTime = minutesToTime(stopArrMinutes);

	if (!stopArrTime) {
		return {
			isValid: false,
			invalidReason: "步行返回站牌時間已跨越午夜，行程超出營運日範圍。",
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: outboundLeg,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings: ["跨日行程安全拒絕。"],
			disclaimer,
		};
	}

	const dwellLeg: DwellLeg = {
		userRequestedDwellMinutes: dwellMinutes,
		actualDwellMinutes: dwellMinutes,
		waitingForOpenMinutes,
		attractionOpenTime: attraction.openTime,
		attractionCloseTime: attraction.closeTime,
		attractionArrivalTime: rawAttrArrTime,
		attractionDepartureTime: attrDeptTime,
		walkToStopMinutes: walkMinutes,
		busStopArrivalTime: stopArrTime,
		isWithinOpenHours: true,
	};

	// 8. Find inbound trip back to user's originStopId
	const inboundSchedule = dayTrips(timetable, dayType);

	const inboundMatch = findInboundTrip(
		inboundSchedule,
		request.originStopId,
		attraction.stopId,
		stopArrMinutes,
	);

	if (!inboundMatch) {
		const riskAssessment = calculateLastBusRisk(
			attraction.stopId,
			request.originStopId,
			dayType,
			stopArrTime,
			timetable,
		);

		return {
			isValid: false,
			invalidReason:
				riskAssessment.riskLevel === "INVALID"
					? `此6670快照未找到該站返回【${request.originStopId}】之匹配班次，其他服務未查證。`
					: `旅客於 ${stopArrTime} 抵達站牌，但此6670快照未找到該站返回【${request.originStopId}】之班次（末班車為 ${riskAssessment.lastBusDepartureTime}）。`,
			originStopId: request.originStopId,
			destinationStopId: attraction.stopId,
			attractionId: attraction.id,
			attractionName: attraction.name,
			dayType,
			dayTypeSource,
			timetableStatus: "OFFICIAL_SCHEDULED",
			outbound: outboundLeg,
			dwell: dwellLeg,
			inbound: null,
			lastBusRisk: riskAssessment,
			warnings: [
				riskAssessment.riskLevel === "INVALID"
					? "此6670快照未找到匹配回程，其他公車與服務未查證。"
					: "【末班車已過警報】：此6670快照未找到符合回程，其他公車與服務未查證。",
				riskAssessment.riskExplanation,
				riskAssessment.backupPlan,
			],
			disclaimer,
		};
	}

	const returnBusDeptMinutes = timeToMinutes(inboundMatch.deptTime);
	const waitMinutes = returnBusDeptMinutes - stopArrMinutes;

	const inboundLeg: InboundLeg = {
		tripNumber: inboundMatch.trip.tripNumber,
		inferredSubroute: inboundMatch.trip.inferredSubroute,
		subrouteClassification: "inferred",
		departureTime: inboundMatch.deptTime,
		destinationArrivalTime: inboundMatch.arrTime,
		waitAtStopMinutes: waitMinutes,
	};

	// 9. Calculate origin-specific last-bus risk
	const lastBusRisk = calculateLastBusRisk(
		attraction.stopId,
		request.originStopId,
		dayType,
		inboundMatch.deptTime,
		timetable,
	);

	if (lastBusRisk.riskLevel === "CRITICAL") {
		warnings.push(
			`【臨界末班車】：您搭乘的班次 (${inboundMatch.deptTime}) 即為返回【${request.originStopId}】之當日最後 1 班排定公車。`,
		);
	} else if (lastBusRisk.riskLevel === "HIGH_RISK") {
		warnings.push(
			`【高風險提醒】：距離末班車尚餘 ${lastBusRisk.bufferMinutes} 分鐘緩衝，返回【${request.originStopId}】僅剩 ${lastBusRisk.remainingTripsCount} 班排定車次。`,
		);
	}

	return {
		isValid: true,
		originStopId: request.originStopId,
		destinationStopId: attraction.stopId,
		attractionId: attraction.id,
		attractionName: attraction.name,
		dayType,
		dayTypeSource,
		timetableStatus: "OFFICIAL_SCHEDULED",
		outbound: outboundLeg,
		dwell: dwellLeg,
		inbound: inboundLeg,
		lastBusRisk,
		warnings,
		disclaimer,
	};
}

/** Public boundary: always returns conditional semantics, including rejected inputs. */
export function verifyTripReachability(
	request: ItineraryRequest,
	timetable: TimetableData,
	attractions: Attraction[],
): ReachabilityResult {
	const attraction = attractions.find((a) => a.id === request.attractionId);
	const warnings = [
		"僅為6670班表快照與假設的條件式模擬，isValid不代表旅行有效；快照有效範圍未知，任意未來日期不保證仍現行。",
		"步行時間、站點映射及建議停留時間為演算法情境假設，路徑未實測；自訂停留時間為使用者輸入。",
		"臨時休園、天災、修繕及班表異動未即時查證，出發前請向營運方及景點確認。",
	];
	if (attraction) {
		warnings.push(attraction.scheduleNote);
		if (attraction.lastEntryTime === null)
			warnings.push("最後入園時間未知，UNKNOWN不代表沒有末入限制。");
	}
	const dates = [
		timetable.metadata.retrievedDate,
		...attractions.map((a) => a.provenance.retrievedDate),
	];
	let error: string | undefined;
	if (dates.some((date) => !isValidDateString(date)))
		error = "資料快照日期無效，拒絕模擬。";
	else if (
		isValidDateString(request.departureDate) &&
		dates.some((date) => request.departureDate < date)
	)
		error = `歷史日期不可早於班表及景點快照 ${dates.slice().sort().at(-1)}。`;
	if (
		request.profile !== undefined &&
		!["general", "family", "senior_accessible"].includes(request.profile)
	)
		error = "無效的旅客輪廓。";
	if (attraction) {
		const open = timeToMinutes(attraction.openTime);
		const close = timeToMinutes(attraction.closeTime);
		const entry =
			attraction.lastEntryTime === null
				? null
				: timeToMinutes(attraction.lastEntryTime);
		if (
			!Number.isFinite(attraction.walkTimeMinutes) ||
			!Number.isInteger(attraction.walkTimeMinutes) ||
			attraction.walkTimeMinutes < 0 ||
			open < 0 ||
			close <= open ||
			(entry !== null && (entry < open || entry > close)) ||
			!Number.isInteger(attraction.recommendedDwellMinutes) ||
			attraction.recommendedDwellMinutes <= 0 ||
			!Number.isInteger(attraction.minDwellMinutes) ||
			attraction.minDwellMinutes <= 0
		)
			error = "景點資料無效：步行、停留或開放時間不合法，拒絕模擬。";
	}
	if (error)
		return {
			status: "conditional_snapshot_simulation",
			isValid: false,
			invalidReason: error,
			originStopId: request.originStopId,
			destinationStopId: attraction?.stopId ?? "unknown",
			attractionId: request.attractionId,
			attractionName: attraction?.name ?? "未知景點",
			dayType: "weekday",
			dayTypeSource: "OFFICIAL_NOTES_CALENDAR",
			timetableStatus: "NO_ACTIVE_SCHEDULE",
			outbound: null,
			dwell: null,
			inbound: null,
			lastBusRisk: null,
			warnings,
			disclaimer: timetable.metadata.subrouteDisclaimer,
		};
	const result = simulateTrip(request, timetable, attractions);
	return {
		...result,
		status: "conditional_snapshot_simulation",
		warnings: [...warnings, ...result.warnings],
	};
}
