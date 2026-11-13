# 到站事件三臂情境重跑

從專案根目錄執行：

```sh
python3 -I docs/proposal/drafts/experiments/threearm/event_sim_v2.py /絕對路徑/trips.db
```

需要 Python 3 標準庫、指定的唯讀 SQLite 資料庫，以及既有 `public/data/lab/seats/arrivals-YYYY-MM.json`、`summary.json`、`public/geo/stops.json` 與休假日曆。到站檔是既有 seats 建置的輸出，資料庫查詢只用來計算上游人數。輸出 `event-results-v2.csv`，每列為日期與參數組合；重跑會覆寫這個新輸出。方法和限制見 `../../threearm-v2.zh-TW.md`。舊的候選初篩檔案未變更。
