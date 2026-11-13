/** 問答原型共用型別。資料依據分三類，回答時必須標明，不可混為「即時」。 */

/** official=官網文字；official-image=官網票價圖片（人工目視）；timetable=官網表定時刻；history=歷史刷卡統計 */
export type Basis = "official" | "official-image" | "timetable" | "history";

export type Source = {
	id: string;
	title: string;
	url: string;
	/** 本研究擷取日（Asia/Taipei） */
	retrievedAt: string;
	/** 頁面自身標示的更新日期；官網路線頁沒有標示則為 null */
	pageDate: string | null;
	note?: string;
};

export type KbEntry = {
	id: string;
	title: string;
	/** 觸發詞（已正規化：臺→台、小寫）；命中越長的詞分數越高 */
	triggers: string[];
	/** 必須同時出現其中之一才算相關（可省略） */
	anyOf?: string[];
	lines: string[];
	basis: Basis;
	sources: string[];
	/** 資料限制或與其他來源衝突的提醒 */
	caution?: string;
	followUps?: string[];
};

export type AnswerKind = "answer" | "clarify" | "refusal";

export type Answer = {
	kind: AnswerKind;
	headline: string;
	lines: string[];
	table?: { head: string[]; rows: string[][] };
	basis: Basis[];
	sources: Source[];
	caution?: string;
	followUps?: string[];
	/** 可稽核的判斷依據：走哪一條規則、命中什麼 */
	trace: string;
};

export type DayType = "weekday" | "holiday";
export type Direction = "outbound" | "inbound";

export type Trip = { no: string; note: string; times: (string | null)[] };
export type TimetableTable = {
	day: DayType;
	direction: Direction;
	stops: string[];
	trips: Trip[];
};
export type TimetableData = {
	source: string;
	retrievedAt: string;
	pageUpdatedAt: string | null;
	changeNotice: string | null;
	dayRule: string;
	tables: TimetableTable[];
};

export type HistoryData = {
	sourceFile: string;
	range: [string, string];
	observedDays: number;
	calendarDays: number;
	daysPerWeekday: number[];
	totalBoardings: number;
	unknownDirectionBoardings: number;
	cells: [string, Direction, number, number, number][];
};

export type Context = {
	timetable: TimetableData;
	history: HistoryData;
	/** 使用者端目前時間（Asia/Taipei 的星期與 HH:MM）；省略時「今天/現在」會要求補充 */
	now?: { weekday: number; hhmm: string };
};
