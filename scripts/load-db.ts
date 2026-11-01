/// <reference types="bun" />
/**
 * Load data/trips.csv (produced by scripts/etl_excel.py) into the Turso/libSQL DB,
 * then build the aggregate tables.  Usage: bun scripts/load-db.ts [--aggregates-only]
 */
import { createClient, type InStatement } from '@libsql/client'

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL missing (.env)')
const db = createClient({ url, authToken: process.env.DATABASE_TOKEN })

const COLS = [
  'id', 'issuer', 'ticket_type', 'subroute', 'vehicle', 'board_ts', 'board_date', 'board_stop', 'board_seq',
  'alight_ts', 'alight_stop', 'alight_seq', 'fare_paid', 'fare_full', 'fare_discounted', 'discount',
] as const
const ROWS_PER_STMT = 120 // 16 cols * 120 = 1920 params
const STMTS_PER_BATCH = 10

const taipeiDate = (ts: number) => new Date((ts + 8 * 3600) * 1000).toISOString().slice(0, 10)
const int = (v: string) => (v === '' ? null : Number(v))
const str = (v: string) => (v === '' ? null : v)

async function loadTrips() {
  const text = await Bun.file('data/trips.csv').text()
  const lines = text.split('\n')
  const header = lines[0].trim().split(',')
  console.log('header', header.join(','))
  await db.execute('DELETE FROM trips')

  let pending: InStatement[] = []
  let rows: (string | number | null)[] = []
  let n = 0
  const t0 = Date.now()
  const flushStmt = () => {
    if (!rows.length) return
    const count = rows.length / COLS.length
    const ph = `(${COLS.map(() => '?').join(',')})`
    pending.push({ sql: `INSERT INTO trips (${COLS.join(',')}) VALUES ${Array(count).fill(ph).join(',')}`, args: rows })
    rows = []
  }
  const flushBatch = async () => {
    if (!pending.length) return
    for (let attempt = 0; ; attempt++) {
      try { await db.batch(pending, 'write'); break } catch (e) {
        if (attempt >= 4) throw e
        console.warn('retry', attempt, (e as Error).message)
        await Bun.sleep(2000 * (attempt + 1))
      }
    }
    pending = []
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '')
    if (!line) continue
    // values never contain commas/quotes (checked in ETL output)
    const [issuer, ticketType, subroute, vehicle, boardTs, boardSeq, boardStop, alightTs, alightSeq, alightStop, farePaid, fareFull, fareDisc, discount] = line.split(',')
    const bts = Number(boardTs)
    n++
    rows.push(n, issuer, ticketType, subroute, vehicle, bts, taipeiDate(bts), boardStop, int(boardSeq),
      int(alightTs), str(alightStop), int(alightSeq), int(farePaid), int(fareFull), int(fareDisc), int(discount))
    if (rows.length >= ROWS_PER_STMT * COLS.length) flushStmt()
    if (pending.length >= STMTS_PER_BATCH) {
      await flushBatch()
      if (n % 60000 < ROWS_PER_STMT * STMTS_PER_BATCH) console.log(`${n} rows, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
    }
  }
  flushStmt()
  await flushBatch()
  console.log(`loaded ${n} trips in ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

async function buildAggregates() {
  await db.batch([
    'DELETE FROM daily_subroute',
    `INSERT INTO daily_subroute (date, subroute, trips, revenue)
       SELECT board_date, subroute, COUNT(*), COALESCE(SUM(fare_paid),0) FROM trips GROUP BY 1,2`,
    'DELETE FROM daily_stop',
    `INSERT INTO daily_stop (date, stop, boardings, alightings)
       SELECT date, stop, SUM(b), SUM(a) FROM (
         SELECT board_date AS date, board_stop AS stop, 1 AS b, 0 AS a FROM trips
         UNION ALL
         SELECT board_date, alight_stop, 0, 1 FROM trips WHERE alight_stop IS NOT NULL
       ) GROUP BY 1,2`,
    'DELETE FROM daily_hour',
    `INSERT INTO daily_hour (date, hour, boardings)
       SELECT board_date, CAST(((board_ts + 28800) % 86400) / 3600 AS INTEGER), COUNT(*) FROM trips GROUP BY 1,2`,
  ], 'write')
  for (const t of ['trips', 'daily_subroute', 'daily_stop', 'daily_hour']) {
    const r = await db.execute(`SELECT COUNT(*) AS c FROM ${t}`)
    console.log(t, r.rows[0].c)
  }
}

if (!process.argv.includes('--aggregates-only')) await loadTrips()
await buildAggregates()
