import type { TRPCRouterRecord } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "#/db";
import { dailyStop, dailySubroute, trips } from "#/db/schema";
import { createTRPCRouter, publicProcedure } from "./init";

const ridershipRouter = {
	/** Daily trips per sub-route over the whole dataset (~4k rows). */
	daily: publicProcedure.query(async () => {
		const rows = await getDb()
			.select()
			.from(dailySubroute)
			.orderBy(asc(dailySubroute.date));
		return rows;
	}),

	/** Daily boardings/alightings per stop (~12k rows), packed as tuples. */
	stopDaily: publicProcedure.query(async () => {
		const rows = await getDb().select().from(dailyStop);
		return rows.map(
			(r) => [r.date, r.stop, r.boardings, r.alightings] as const,
		);
	}),

	/** Every trip that boarded on one service day (Asia/Taipei). */
	day: publicProcedure
		.input(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
		.query(async ({ input }) => {
			const rows = await getDb()
				.select({
					b: trips.boardTs,
					a: trips.alightTs,
					from: trips.boardStop,
					to: trips.alightStop,
					sub: trips.subroute,
					ticket: trips.ticketType,
				})
				.from(trips)
				.where(eq(trips.boardDate, input.date))
				.orderBy(asc(trips.boardTs));
			return rows;
		}),
} satisfies TRPCRouterRecord;

export const trpcRouter = createTRPCRouter({
	ridership: ridershipRouter,
});
export type TRPCRouter = typeof trpcRouter;
