/** Shared with synthetic missing-stop regression tests; no row-level result. */
export const metadataSql = `
      SELECT 
        count(*) as total_trips,
        min(board_date) as start_date,
        max(board_date) as end_date,
        count(DISTINCT board_date) as active_dates,
        sum(CASE WHEN trim(coalesce(board_stop, '')) != '' AND trim(coalesce(alight_stop, '')) != '' THEN 1 ELSE 0 END) as valid_od_trips,
        sum(CASE WHEN board_stop = alight_stop THEN 1 ELSE 0 END) as same_stop_od,
        sum(CASE WHEN trim(coalesce(alight_stop, '')) = '' THEN 1 ELSE 0 END) as missing_alight_stop,
        sum(CASE WHEN trim(coalesce(board_stop, '')) = '' THEN 1 ELSE 0 END) as missing_board_stop,
        sum(CASE WHEN board_ts IS NULL OR alight_ts IS NULL THEN 1 ELSE 0 END) as missing_duration,
        sum(CASE WHEN alight_ts - board_ts BETWEEN 180 AND 21600 THEN 1 ELSE 0 END) as valid_dur_count,
        coalesce(sum(CASE WHEN alight_ts - board_ts BETWEEN 180 AND 21600 THEN alight_ts - board_ts END), 0) as duration_sum_sec,
        sum(CASE WHEN board_stop = alight_stop AND alight_ts - board_ts > 0 AND alight_ts - board_ts < 180 THEN 1 ELSE 0 END) as same_stop_under3,
        sum(CASE WHEN board_date != date(board_ts, 'unixepoch', '+8 hours') THEN 1 ELSE 0 END) as board_date_mismatch,
        sum(CASE WHEN strftime('%H', board_ts, 'unixepoch', '+8 hours') IS NULL THEN 1 ELSE 0 END) as missing_hour,
        sum(CASE WHEN alight_ts IS NULL THEN 1 ELSE 0 END) as missing_alight_ts,
        sum(CASE WHEN alight_ts - board_ts < 0 THEN 1 ELSE 0 END) as negative_dur,
        sum(CASE WHEN alight_ts - board_ts = 0 THEN 1 ELSE 0 END) as zero_dur,
        sum(CASE WHEN alight_ts - board_ts > 0 AND alight_ts - board_ts < 180 THEN 1 ELSE 0 END) as under_3min,
        sum(CASE WHEN alight_ts - board_ts > 21600 THEN 1 ELSE 0 END) as over_6hr
      FROM trips
    `;
