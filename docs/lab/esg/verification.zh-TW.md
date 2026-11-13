# 本輪實際驗證

測試環境 Bun v1.4.4。這是修正實作交付，不是獨立 review 背書。未修改系統 invariant registry；目前 registry 無已接受保證。

| 命令 | 真實結果 |
| --- | --- |
| `bun test src/features/lab/esg/calculator.test.ts` | exit 0；12 pass、0 fail、72 expect calls，9 ms |
| `./node_modules/.bin/tsc --ignoreConfig --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target es2022 --types bun src/features/lab/esg/*.ts scripts/lab/esg/*.ts` | exit 0，無診斷 |
| `bun scripts/lab/esg/run-analysis.ts` | exit 0；從授權資料庫重新 SELECT 聚合，重產四份 JSON 與 report.zh-TW.md |
| `bun scripts/lab/esg/verify-artifacts.ts` | exit 0；四份 schema v2、1,800,910 旅次、24 月、492 組 OD/支線、三個情境重算通過 |

產製輸出：725 個有紀錄日、2024-01-01 至 2025-12-31。192 組快取有向配對，觀測 206 組有向 OD，差額包括 14 組同站配對。網路配對涵蓋 1,794,629 旅次，同站假設 0 公里 6,281 旅次，其他缺距離 0，缺對清單空陣列。已知路網近似人公里 95,157,851.25600006，浮點累加保留完整值，不冒充實際軌跡。

針對性測試涵蓋：柴油 L 與電力 kWh 換算、kg 與 pkm 強度、零排放比率 null、零活動仍拒絕不合法參數、負值／NaN／Infinity、分流總和不足或超過 1、非整數旅次、運算溢位、因子單位錯誤、缺距離 null、同站零距離假設、未知站、埔里與 6670H 的固定集合語義、人公里結構守恆。缺距離時停止全體排放比較，但仍驗證分流合法性。

產物驗證以完整 OD/支線重新加總，與月度及全期對照，並重算情境。會檢查來源 status、缺距離旅次、月度排放 null 與全電巴購電排放大於零。初版驗證逐值嚴格相等因浮點累加順序出現約 1e-18 強度差異而失敗，改採相對 1e-10 容差後通過，不修改原始聚合數值。首次局部 tsc 因 TypeScript 6 要求顯式 `--ignoreConfig` 出現 TS5112，修正命令後通過。

未執行全專案 build 或瀏覽器測試，避免觸發並行中的路由產製，且本輪無 UI 變更。無 commit、push、deploy、依賴或 lockfile 變更；主 devlog/tracker 未寫入。只在 docs/lab/esg、src/features/lab/esg、scripts/lab/esg、public/data/lab/esg 寫檔。

限制仍存在：燃油 CO2e 合成、運具排放強度、分流與效率未校準；OSRM 正反向共用且無支線約束；無實際能源、營運里程、拒載或候車資料。故只有成功刷卡旅次聚合是觀測量，營運排放與比較差額皆為獨立假設展示。詳見 sources.zh-TW.md 與 integration.zh-TW.md。
