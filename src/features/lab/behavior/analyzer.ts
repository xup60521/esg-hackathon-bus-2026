import type {
	ArchetypeId,
	DataInventoryItem,
	OdFeasibilityReport,
} from "./types";

/**
 * Expected total trip count invariant in 6670 dataset (2024-2025).
 */
export const EXPECTED_TOTAL_TRIPS = 1_800_910;

/**
 * Categorize raw ticket type strings into standardized behavioral groups.
 */
export function categorizeTicketType(
	ticketType: string | null,
): "general" | "student" | "concession" | "tpass_commuter" | "other" {
	const t = (ticketType ?? "").trim().toUpperCase();

	if (t.includes("學生") || t.includes("暨南大學") || t.includes("聯合科大")) {
		return "student";
	}
	if (
		t.includes("敬老") ||
		t.includes("愛心") ||
		t.includes("博愛") ||
		t.includes("陪伴") ||
		t.includes("仁愛")
	) {
		return "concession";
	}
	if (
		t.includes("通勤") ||
		t.includes("中彰投苗") ||
		t.includes("境(市民)") ||
		t.includes("境(非市民)")
	) {
		return "tpass_commuter";
	}
	if (
		t.includes("一般") ||
		t.includes("全票") ||
		t.includes("EASY") ||
		t.includes("ECCB") ||
		t.includes("IPASS") ||
		t.includes("ICASH") ||
		t.includes("LINEPAY") ||
		t === "I_PAY" ||
		t === "優待票"
	) {
		return "general";
	}
	return "other";
}

/**
 * Filter valid duration: trips >= 3 minutes (180s) and <= 6 hours (21600s).
 */
export function isValidDuration(durationSec: number): boolean {
	return durationSec >= 180 && durationSec <= 21600;
}

/**
 * Ordered manual rules. Weekend and AM/PM counts are descriptive only.
 */
export function classifyOdArchetype(params: {
	boardStop: string;
	alightStop: string;
	trips: number;
	avgDurationMin: number | null;
	weekendRatio: number;
	amPeakRatio: number;
	pmPeakRatio: number;
	studentRatio: number;
}): { archetype: ArchetypeId; label: string } {
	const { boardStop, alightStop, avgDurationMin, studentRatio, trips } = params;

	// 1. Same-stop review group; short duration is a separate analysis exclusion.
	if (boardStop === alightStop) {
		return {
			archetype: "abnormal_tap",
			label: "同站 OD 待查組",
		};
	}

	// 2. Named stops or student ticket share.
	const isCampus =
		boardStop.includes("暨南大學") ||
		alightStop.includes("暨南大學") ||
		boardStop === "崎下" ||
		alightStop === "崎下";

	if (isCampus || studentRatio >= 0.25) {
		return {
			archetype: "campus_student",
			label: "校名站點或學生票占比組",
		};
	}

	// 3. Named endpoint corridor.
	const isSunMoonLakeOrVillage =
		boardStop === "日月潭" ||
		alightStop === "日月潭" ||
		boardStop === "九族文化村" ||
		alightStop === "九族文化村";

	const isTaichungHub =
		boardStop === "高鐵臺中站" ||
		alightStop === "高鐵臺中站" ||
		boardStop === "臺中" ||
		alightStop === "臺中";

	if (isSunMoonLakeOrVillage && isTaichungHub) {
		return {
			archetype: "tourism_intercity",
			label: "臺中端至日月潭／九族走廊",
		};
	}

	// 4. Puli endpoint corridor.
	const isPuli = boardStop === "埔里站" || alightStop === "埔里站";
	if (isPuli && isTaichungHub) {
		return {
			archetype: "regional_commute",
			label: "臺中端至埔里走廊",
		};
	}

	// 5. Duration and volume threshold.
	if (avgDurationMin !== null && avgDurationMin <= 50.0 && trips >= 1000) {
		return {
			archetype: "local_shuttle",
			label: "平均時長不逾50分鐘且千筆以上組",
		};
	}

	// 6. Remaining OD pairs.
	return {
		archetype: "intermediate_minor",
		label: "其餘 OD 組",
	};
}

/**
 * Produce the official OD Feasibility Report adhering to project rules:
 * - Single-trip OD is feasible (exact board/alight stop per row).
 * - Multi-trip / return visit / transfer tracking is strictly infeasible due to lack of card IDs.
 * - Card tap != total passenger demand / queue / refusal.
 */
export function getOdFeasibilityReport(): OdFeasibilityReport {
	return {
		singleTripOdFeasible: true,
		returnTripTrackingFeasible: false,
		transferChainFeasible: false,
		loyaltyAnalysisFeasible: false,
		reasons: {
			singleTripOd:
				"可依單筆上下車站聚合 OD；實際缺站與缺時間數以本次 qualityEvidence 查詢為準，時長另套分析窗口。",
			returnTripTracking:
				"嚴格不可行（工程與資安限制）：ETL 階段已徹底移除電子票證卡號（card number / UID）與司機代號。任何單一乘客的跨旅次關聯已物理中斷，無法將下午回程旅次與上午去程旅次鏈結，禁止以無卡號資料臆測或推估回訪率、回程率或旅客滯留時間。",
			transferChain:
				"嚴格不可行：無卡號且無客運與其他運具（如臺鐵、高鐵、臺灣好行其他路線）之交易串接識別碼，無法判定乘客是否轉乘其他路線或完成一日遊路徑。",
			cardTapLimitation:
				"資料本質限制：刷卡資料僅代表「成功完成上下車刷卡之搭乘人次」。不包含因客滿被拒載（capacity rejection）、放棄候車之潛在需求、排隊流失乘客或非電子票證（如現金/紙票，若有）乘車者；且上車刷卡時間為登車刷卡當下，非抵達站點開始候車之時間，不得直接將刷卡時間視為候車起點。",
		},
	};
}

/**
 * Compare local aggregate dataset (public/data/midstop.json) vs database trips table.
 */
export function getDataInventoryComparison(): DataInventoryItem[] {
	return [
		{
			datasetName: "Turso / libSQL `trips` Table",
			location: "本地/雲端資料庫 trips 資料表",
			rowCount: 1_800_910,
			hasOdPairs: true,
			canReconstructOd: true,
			hasCardId: false,
			canTrackReturnTrips: false,
			canTrackTransfers: false,
			notes:
				"旅次表，每一列為一次刷卡旅次紀錄，具備 board_stop, alight_stop, board_ts, alight_ts, subroute, ticket_type, vehicle；卡號已於前置作業去識別化移除。",
		},
		{
			datasetName: "Aggregate `public/data/midstop.json`",
			location: "public/data/midstop.json & data/midstop-months/*.json",
			rowCount: 292_562,
			hasOdPairs: false,
			canReconstructOd: false,
			hasCardId: false,
			canTrackReturnTrips: false,
			canTrackTransfers: false,
			notes:
				"按 (date, subroute, direction, stop, hour) 彙總之中間站上下車事件邊際計數表。上車 (boardings) 與下車 (alightings) 已拆解為獨立事件，無法單憑此檔重構個別旅客之 OD 起訖配對。",
		},
	];
}
