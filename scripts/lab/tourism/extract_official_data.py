#!/usr/bin/env python3
"""
scripts/lab/tourism/extract_official_data.py

Extracts official Taiwan Trip Sun Moon Lake Line (6670) timetable from
Taiwan Trip website (https://www.taiwantrip.com.tw/Frontend/Bustime/TimeTable/R0005)
or raw HTML snapshot, strictly verifies HTML table structures, and generates:
1. public/data/lab/tourism/timetable.json
2. public/data/lab/tourism/attractions.json

Key requirements addressed:
- Detailed provenance, snapshot sha256, exact retrieval date.
- Strict structural validation of all 4 tables (columns, rows, time formats).
- Subroute marked as 'inferred' by stopping pattern, not official exact codes.
- Accurate stop mapping (puli_brewery mapped directly to puli_brewery).
- Attractions catalog with fine-grained field-level verification status.
"""

import hashlib
import json
import os
import re

SOURCE_URL = "https://www.taiwantrip.com.tw/Frontend/Bustime/TimeTable/R0005"
SNAPSHOT_PATH = "public/data/lab/tourism/raw_timetable_snapshot.html"
RETRIEVED_DATE = "2026-11-04"

# Mapping official stop names in HTML to standardized stop IDs
STOP_ID_MAP = {
    "台中航空站": "airport",
    "臺中干城站": "taichung",
    "臺中車站(民族路口)": "taichung_station",
    "民興公園(執行分署)": "minxing_park",
    "捷運大慶站": "daqing",
    "高鐵臺中站": "thsr",
    "埔里遊客中心": "puli_visitor",
    "牛耳石雕公園": "niuer",
    "崎下": "qixia",
    "大成國小": "dacheng_school",
    "榮民醫院": "veterans_hospital",
    "埔里酒廠": "puli_brewery",
    "仁愛公園": "renai_park",
    "中台禪寺": "chungtai",
    "中台世界博物館": "chungtai_museum",
    "福興溫泉遊客中心": "fuxing_hotspring",
    "地理中心碑": "geo_center",
    "埔里站": "puli",
    "暨南大學(校內)": "jnu_campus",
    "暨南大學(校外)": "jnu",
    "桃米坑(紙教堂)": "taomi",
    "大雁(澀水社區)": "dayan",
    "新城國小": "xincheng_school",
    "三育神學院": "sanyu",
    "經典驛棧": "classic_inn",
    "晶園渡假村": "jingyuan",
    "九族文化村(部分班次停靠)": "formosan",
    "魚池": "yuchi",
    "日月老茶場": "tea",
    "日月潭": "sunmoonlake",
    "水社": "shuishe",
    "向山行政中心(部分班次停靠)": "xiangshan",
    "五權車站": "wuquan_station",
}

EXPECTED_COLUMN_COUNT = 34
TIME_PATTERN = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


def clean_cell(text: str) -> str:
    cleaned = re.sub(r"<[^>]+>", "", text).strip()
    return cleaned if cleaned != "" else "-"


def parse_and_validate_html(html: str):
    """
    Parses and validates the 4 timetable tables from HTML.
    Raises ValueError if table count, column count, or cell formats are invalid.
    """
    tables = re.findall(
        r'<table class="table table-hover table-bordered t_schedule"[^>]*>(.*?)</table>',
        html,
        re.DOTALL,
    )
    if len(tables) < 4:
        raise ValueError(f"Expected at least 4 schedule tables, found {len(tables)}")

    table_types = [
        ("weekday_outbound", "平日去程 (往向山/日月潭)", tables[0]),
        ("weekday_inbound", "平日回程 (往臺中/航空站)", tables[1]),
        ("holiday_outbound", "假日去程 (往向山/日月潭)", tables[2]),
        ("holiday_inbound", "假日回程 (往臺中/航空站)", tables[3]),
    ]

    result = {}

    for key, label, tbl in table_types:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tbl, re.DOTALL)
        if len(rows) < 2:
            raise ValueError(f"Table {key} has insufficient rows ({len(rows)})")

        header_cells = [
            clean_cell(c)
            for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", rows[0], re.DOTALL)
        ]

        if len(header_cells) != EXPECTED_COLUMN_COUNT:
            raise ValueError(
                f"Table {key} header count mismatch: expected {EXPECTED_COLUMN_COUNT}, got {len(header_cells)}"
            )

        trips = []
        for r_idx, r in enumerate(rows[1:], 1):
            cells = [
                clean_cell(c)
                for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.DOTALL)
            ]
            if not cells:
                continue
            if len(cells) != EXPECTED_COLUMN_COUNT:
                raise ValueError(
                    f"Table {key} row {r_idx} column count mismatch: expected {EXPECTED_COLUMN_COUNT}, got {len(cells)}"
                )

            trip_no_str = cells[0]
            trip_number = int(trip_no_str) if trip_no_str.isdigit() else r_idx
            remark = cells[1]

            stop_times = {}
            for col_idx in range(2, len(header_cells)):
                stop_name = header_cells[col_idx]
                stop_id = STOP_ID_MAP.get(stop_name, stop_name)
                val = cells[col_idx]
                if val != "-":
                    if not TIME_PATTERN.match(val):
                        raise ValueError(
                            f"Invalid time format in {key} row {r_idx} ({stop_name}): {val}"
                        )
                    stop_times[stop_id] = val

            # Subroute is inferred from stopping pattern (NOT official exact designation)
            has_xiangshan = "xiangshan" in stop_times
            has_formosan = "formosan" in stop_times
            has_puli = "puli" in stop_times
            has_chungtai = "chungtai" in stop_times
            has_airport = "airport" in stop_times

            inferred = "6670B"  # direct route
            if has_airport:
                inferred = "6670E"
            elif has_chungtai:
                inferred = "6670C"
            elif has_formosan:
                inferred = "6670A"
            elif has_xiangshan:
                inferred = "6670F"
            elif has_puli:
                inferred = "6670D"

            trips.append(
                {
                    "tripNumber": trip_number,
                    "inferredSubroute": inferred,
                    "subrouteClassification": "inferred",
                    "remark": remark,
                    "stopTimes": stop_times,
                }
            )

        result[key] = {
            "label": label,
            "totalTrips": len(trips),
            "stopsHeader": [
                {"name": name, "id": STOP_ID_MAP.get(name, name)}
                for name in header_cells[2:]
            ],
            "trips": trips,
        }

    return result


def build_curated_attractions():
    """Bounded transcription of evidence supplied by the host, not a web verifier."""
    attractions = [{'id': 'xiangshan_visitor_center',
      'name': '向山行政暨遊客中心',
      'englishName': 'Xiangshan Administration and Visitor Center',
      'stopId': 'xiangshan',
      'stopName': '向山行政中心(部分班次停靠)',
      'category': 'architecture_nature',
      'coordinates': None,
      'coordinatesStatus': 'UNKNOWN',
      'walkTimeMinutes': 2,
      'walkTimeStatus': 'ASSUMED_ESTIMATE',
      'walkDistanceMeters': None,
      'walkPathNote': '演算法情境假設，未實測步行路徑、距離或無障礙設施。',
      'openTime': '09:00',
      'closeTime': '17:00',
      'lastEntryTime': None,
      'lastEntryStatus': 'UNKNOWN',
      'closedDays': [],
      'recommendedDwellMinutes': 90,
      'minDwellMinutes': 45,
      'ticketRequired': None,
      'ticketInfo': '收費條件與金額未核實，請向景點確認',
      'ticketStatus': 'UNKNOWN',
      'officialUrl': 'https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=78',
      'provenance': {'exactSourceUrl': 'https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=78',
                     'retrievedDate': '2026-11-04',
                     'evidenceBasis': '主代理實讀官方正文後提供之取證摘要，非本腳本自動驗證；未保存景點HTML。',
                     'sourceScheduleNote': '官方正文每日09:00-17:00，天災或修繕可能休園。',
                     'verifiedFields': ['name', 'openTime', 'scheduleNote', 'closeTime'],
                     'assumedFields': ['stopId',
                                       'stopName',
                                       'walkTimeMinutes',
                                       'recommendedDwellMinutes',
                                       'minDwellMinutes',
                                       'closedDays'],
                     'unknownFields': ['coordinates',
                                       'walkDistanceMeters',
                                       'ticketInfo',
                                       'lastEntryTime',
                                       'ticketRequired']},
      'highlights': [],
      'scheduleNote': '官方正文每日09:00-17:00，天災或修繕可能休園。'},
     {'id': 'paper_dome',
      'name': '紙教堂 (新故鄉見學園區)',
      'englishName': 'Paper Dome',
      'stopId': 'taomi',
      'stopName': '桃米坑(紙教堂)',
      'category': 'culture_eco',
      'coordinates': None,
      'coordinatesStatus': 'UNKNOWN',
      'walkTimeMinutes': 6,
      'walkTimeStatus': 'ASSUMED_ESTIMATE',
      'walkDistanceMeters': None,
      'walkPathNote': '演算法情境假設，未實測步行路徑、距離或無障礙設施。',
      'openTime': '09:30',
      'closeTime': '17:00',
      'lastEntryTime': '16:30',
      'lastEntryStatus': 'OFFICIAL_VERIFIED',
      'closedDays': ['Wednesday', 'Thursday'],
      'recommendedDwellMinutes': 90,
      'minDwellMinutes': 45,
      'ticketRequired': True,
      'ticketInfo': '收費入園，詳官網；金額未核實',
      'ticketStatus': 'UNKNOWN',
      'officialUrl': 'https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=4',
      'provenance': {'exactSourceUrl': 'https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=4',
                     'retrievedDate': '2026-11-04',
                     'evidenceBasis': '主代理實讀官方正文後提供之取證摘要，非本腳本自動驗證；未保存景點HTML。',
                     'sourceScheduleNote': '週五至週二09:30-17:00，最後入園16:30；週三四公休，但國定假日、寒暑假、預約團例外。除夕亦休；週六限定夜景依公告，不納入本模擬。',
                     'verifiedFields': ['name',
                                        'openTime',
                                        'scheduleNote',
                                        'lastEntryTime',
                                        'closedDays',
                                        'ticketRequired'],
                     'assumedFields': ['stopId',
                                       'stopName',
                                       'walkTimeMinutes',
                                       'recommendedDwellMinutes',
                                       'minDwellMinutes',
                                       'closeTime'],
                     'unknownFields': ['coordinates', 'walkDistanceMeters', 'ticketInfo']},
      'highlights': [],
      'scheduleNote': '週五至週二09:30-17:00，最後入園16:30；週三四公休，但國定假日、寒暑假、預約團例外。除夕亦休；週六限定夜景依公告，不納入本模擬。'},
     {'id': 'formosan_village',
      'name': '九族文化村',
      'englishName': 'Formosan Aboriginal Culture Village',
      'stopId': 'formosan',
      'stopName': '九族文化村(部分班次停靠)',
      'category': 'amusement_culture',
      'coordinates': None,
      'coordinatesStatus': 'UNKNOWN',
      'walkTimeMinutes': 3,
      'walkTimeStatus': 'ASSUMED_ESTIMATE',
      'walkDistanceMeters': None,
      'walkPathNote': '演算法情境假設，未實測步行路徑、距離或無障礙設施。',
      'openTime': '09:30',
      'closeTime': '17:00',
      'lastEntryTime': None,
      'lastEntryStatus': 'UNKNOWN',
      'closedDays': [],
      'recommendedDwellMinutes': 240,
      'minDwellMinutes': 120,
      'ticketRequired': None,
      'ticketInfo': '收費條件與金額未核實，請向景點確認',
      'ticketStatus': 'UNKNOWN',
      'officialUrl': 'https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=13',
      'provenance': {'exactSourceUrl': 'https://www.sunmoonlake.gov.tw/attractions/Attractions?A=20&Id=13',
                     'retrievedDate': '2026-11-04',
                     'evidenceBasis': '主代理實讀官方正文後提供之取證摘要，非本腳本自動驗證；未保存景點HTML。',
                     'sourceScheduleNote': '官方正文平日09:30-17:00、假日09:30-17:30；本模擬統一17:00為保守假設，官方平假日定義未與6670班表對齊。',
                     'verifiedFields': ['name', 'openTime', 'scheduleNote'],
                     'assumedFields': ['stopId',
                                       'stopName',
                                       'walkTimeMinutes',
                                       'recommendedDwellMinutes',
                                       'minDwellMinutes',
                                       'closeTime',
                                       'closedDays'],
                     'unknownFields': ['coordinates',
                                       'walkDistanceMeters',
                                       'ticketInfo',
                                       'lastEntryTime',
                                       'ticketRequired']},
      'highlights': [],
      'scheduleNote': '官方正文平日09:30-17:00、假日09:30-17:30；本模擬統一17:00為保守假設，官方平假日定義未與6670班表對齊。'}]
    for attraction in attractions:
        attraction["provenance"]["retrievedDate"] = RETRIEVED_DATE
    return attractions


def main():
    html_content = None
    if os.path.exists(SNAPSHOT_PATH):
        print(f"Reading cached HTML snapshot from {SNAPSHOT_PATH}...")
        with open(SNAPSHOT_PATH, "rb") as f:
            raw_bytes = f.read()
            html_content = raw_bytes.decode("utf-8", errors="ignore")
    else:
        raise FileNotFoundError("Missing recorded HTML snapshot; obtain a new dated snapshot explicitly before extracting.")

    sha256_hash = hashlib.sha256(raw_bytes).hexdigest()
    print(f"HTML Snapshot SHA256: {sha256_hash}")

    schedules = parse_and_validate_html(html_content)

    timetable_output = {
        "metadata": {
            "routeNumber": "6670",
            "routeName": "台灣好行日月潭線",
            "operator": "南投汽車客運股份有限公司 (南投客運)",
            "authority": "交通部觀光署 / 交通部公路局",
            "sourceUrl": SOURCE_URL,
            "snapshotSha256": sha256_hash,
            "retrievedDate": RETRIEVED_DATE,
            "scheduleType": "OFFICIAL_FIXED_SCHEDULE",
            "validityRange": "UNKNOWN",
            "scheduleNotes": [
                "平日班次為周一~周四",
                "假日班次為周五~周日",
                "中台禪寺路線維持例假日行駛",
            ],
            "subrouteDisclaimer": "官網時刻表僅提供班次編號與停靠時間，6670A~F 為依停靠模式推論 (inferred)，非官方正式車次代碼。",
            "lastBusDisclaimer": "SAFE 等級僅代表排定班次具緩衝，不保證現場路況準點、行車安全或必有空位。",
        },
        "schedules": schedules,
    }

    curated_attractions = build_curated_attractions()
    attractions_output = {
        "metadata": {
            "description": "6670 三景點官方正文摘要與演算法情境假設",
            "authority": "日月潭國家風景區管理處、台灣好行官網及各景點公告",
            "retrievedDate": RETRIEVED_DATE,
            "totalAttractions": len(curated_attractions),
            "verificationMethod": "依主代理提供的三景點官方正文摘要有限標記；網址本身不構成驗證，假設與未知欄位另列。",
        },
        "attractions": curated_attractions,
    }

    out_timetable_path = "public/data/lab/tourism/timetable.json"
    out_attractions_path = "public/data/lab/tourism/attractions.json"

    with open(out_timetable_path, "w", encoding="utf-8") as f:
        json.dump(timetable_output, f, ensure_ascii=False, indent=2)
    print(
        f"Saved {out_timetable_path} ({os.path.getsize(out_timetable_path)} bytes)"
    )

    with open(out_attractions_path, "w", encoding="utf-8") as f:
        json.dump(attractions_output, f, ensure_ascii=False, indent=2)
    print(
        f"Saved {out_attractions_path} ({os.path.getsize(out_attractions_path)} bytes)"
    )


if __name__ == "__main__":
    main()
