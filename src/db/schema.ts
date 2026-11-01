import {
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
} from "drizzle-orm/sqlite-core";

/** One row per smart-card tap-in/tap-out trip on route 6670 (2024–2025). Card numbers and driver ids are intentionally not stored. */
export const trips = sqliteTable(
	"trips",
	{
		id: integer().primaryKey(),
		issuer: text().notNull(), // EasyCard / iPASS / ICASH / ...
		ticketType: text("ticket_type").notNull(),
		subroute: text().notNull(), // 6670A, 6670D, ...
		vehicle: text().notNull(),
		boardTs: integer("board_ts").notNull(), // unix seconds
		boardDate: text("board_date").notNull(), // YYYY-MM-DD, Asia/Taipei
		boardStop: text("board_stop").notNull(),
		boardSeq: integer("board_seq"),
		alightTs: integer("alight_ts"),
		alightStop: text("alight_stop"),
		alightSeq: integer("alight_seq"),
		farePaid: integer("fare_paid"),
		fareFull: integer("fare_full"),
		fareDiscounted: integer("fare_discounted"),
		discount: integer(),
	},
	(t) => [index("trips_board_date_idx").on(t.boardDate)],
);

/** Pre-aggregated per day & sub-route (timeline overview). */
export const dailySubroute = sqliteTable(
	"daily_subroute",
	{
		date: text().notNull(),
		subroute: text().notNull(),
		trips: integer().notNull(),
		revenue: integer().notNull(),
	},
	(t) => [primaryKey({ columns: [t.date, t.subroute] })],
);

/** Pre-aggregated per day & stop (stop columns over a date range). */
export const dailyStop = sqliteTable(
	"daily_stop",
	{
		date: text().notNull(),
		stop: text().notNull(),
		boardings: integer().notNull(),
		alightings: integer().notNull(),
	},
	(t) => [primaryKey({ columns: [t.date, t.stop] })],
);

/** Pre-aggregated per day & hour of boarding (Asia/Taipei). */
export const dailyHour = sqliteTable(
	"daily_hour",
	{
		date: text().notNull(),
		hour: integer().notNull(),
		boardings: integer().notNull(),
	},
	(t) => [primaryKey({ columns: [t.date, t.hour] })],
);
