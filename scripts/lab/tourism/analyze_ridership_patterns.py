#!/usr/bin/env python3
"""
scripts/lab/tourism/analyze_ridership_patterns.py

Analyzes 2024-2025 monthly midstop ridership data across all 24 months in data/midstop-months/
specifically for tourism-related stops.

CRITICAL INTEGRITY PRINCIPLE (Defect 10):
- Historical 2024-2025 tap events CANNOT be used to prove 2026 last-bus overcrowding or operations.
- Zero taps (e.g. at Sun Moon Tea Factory) CANNOT be causally attributed to "flag stop" or "account attribution".
- No causal assertions: reports strictly observational distributions and explicit limitations.
"""

import glob
import json
import os
from collections import defaultdict

DATA_DIR = "data/midstop-months"


def main():
    files = sorted(glob.glob(os.path.join(DATA_DIR, "*.json")))
    print(f"Found {len(files)} monthly data files in {DATA_DIR}")

    tourism_stops = {
        "向山行政中心",
        "九族文化村",
        "桃米坑",
        "日月老茶場",
        "日月潭",
        "水社",
        "牛耳石雕公園",
        "大雁",
    }

    inbound_hourly = defaultdict(
        lambda: defaultdict(lambda: {"boardings": 0, "alightings": 0})
    )
    outbound_hourly = defaultdict(
        lambda: defaultdict(lambda: {"boardings": 0, "alightings": 0})
    )

    total_trips_counted = 0
    days_seen = set()

    for fpath in files:
        with open(fpath, "r", encoding="utf-8") as f:
            rows = json.load(f)
            for row in rows:
                date, subroute, direction, stop, hour, b, a = row
                days_seen.add(date)
                total_trips_counted += b + a

                if stop in tourism_stops:
                    if direction == "inbound":
                        inbound_hourly[stop][hour]["boardings"] += b
                        inbound_hourly[stop][hour]["alightings"] += a
                    elif direction == "outbound":
                        outbound_hourly[stop][hour]["boardings"] += b
                        outbound_hourly[stop][hour]["alightings"] += a

    print(
        f"Analyzed {len(days_seen)} days across {len(files)} months. Total tap events: {total_trips_counted}"
    )

    insights = {
        "metadata": {
            "description": "6670 觀光沿線重點站點 2024-2025 歷史電子票證上下車刷卡筆數紀錄（純觀測資料）",
            "totalDays": len(days_seen),
            "totalMonths": len(files),
            "retrievedDate": "2026-11-04",
            "integrityNotice": [
                "1. 歷史 2024-2025 年電子票證刷卡記錄僅為過往已登車成功刷卡之客觀觀測值，不能作為 2026 年班車營運、準點或滿載的證明。",
                "2. 刷卡為 0 之站點（如日月老茶場）僅代表該資料集未記錄到票證扣款，其成因未有官方驗證文獻（可能涉及分段計費設定、票證設備、特約套票或其它因素），嚴格禁止推論為招呼站、旅客無需求或資料歸戶原因。",
                "3. 未登車旅客、排隊候車者及使用紙本套票/現金之旅客均不涵蓋於此資料集內。",
            ],
        },
        "stopsAnalysis": {},
    }

    for stop in sorted(tourism_stops):
        in_hours = {}
        for h in range(6, 23):
            in_hours[str(h)] = inbound_hourly[stop][h]

        out_hours = {}
        for h in range(6, 23):
            out_hours[str(h)] = outbound_hourly[stop][h]

        total_in_boardings = sum(
            inbound_hourly[stop][h]["boardings"] for h in range(24)
        )
        total_out_alightings = sum(
            outbound_hourly[stop][h]["alightings"] for h in range(24)
        )

        peak_dept_hour = max(
            range(24), key=lambda h: inbound_hourly[stop][h]["boardings"]
        )
        evening_in_boardings = sum(
            inbound_hourly[stop][h]["boardings"] for h in range(16, 24)
        )
        evening_ratio = (
            (evening_in_boardings / total_in_boardings * 100)
            if total_in_boardings > 0
            else 0
        )

        insights["stopsAnalysis"][stop] = {
            "totalInboundBoardings": total_in_boardings,
            "totalOutboundAlightings": total_out_alightings,
            "peakDepartureHour": peak_dept_hour,
            "peakDepartureHourBoardings": inbound_hourly[stop][peak_dept_hour][
                "boardings"
            ],
            "eveningBoardingsCount": evening_in_boardings,
            "eveningBoardingsRatioPercent": round(evening_ratio, 2),
            "zeroCountObservation": (
                "觀測到 2024-2025 年上下車刷卡筆數記錄為 0，成因未知且無官方證據，不作任何因果推論。"
                if total_in_boardings == 0
                else None
            ),
            "inboundHourly": in_hours,
            "outboundHourly": out_hours,
        }

    out_file = "public/data/lab/tourism/ridership_insights.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(insights, f, ensure_ascii=False, indent=2)
    print(f"Saved {out_file} ({os.path.getsize(out_file)} bytes)")


if __name__ == "__main__":
    main()
