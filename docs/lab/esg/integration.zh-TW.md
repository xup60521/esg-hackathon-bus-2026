# v2 整合契約與遷移

本次允許破壞式修正。既有錯誤欄位不保留相容別名，請主代理及整合者以 schemaVersion: 2 判讀。僅變更 ESG 方向四個目錄；未改 UI、依賴、lockfile、routeTree、主追蹤紀錄。沒有 commit/push/deploy。

| v1 | v2 |
| --- | --- |
| OFFICIAL_EMISSION_FACTORS / OfficialEmissionFactors | DEFAULT_EMISSION_FACTORS / EmissionFactors，逐項 status、sourceUrl、year、unit、boundary、notes |
| calculateEquityMetrics / EquityMetricsResult / isMidstopTrip / isTerminusStop | 移除。改 summarizeServiceStructure / classifySpecifiedEndpointTrip，只描述指定集合，不推公平性 |
| scope1KgCo2e / scope2KgCo2e | fuelCombustionKgCo2e / purchasedElectricityKgCo2e，只是情境燃燒與購電估算，未建立組織盤查邊界 |
| netAvoidedKgCo2e / abatementRatio | scenarioDifferenceKgCo2e / baselineToOperationalRatio，獨立情境比較；零營運分母為 null |
| carAvoidedKgCo2e 等 breakdown | carBaselineKgCo2e / motorcycleBaselineKgCo2e / otherTransitBaselineKgCo2e，只是基線組成 |
| totalVehicleKm 輸出 | inputVehicleKm 與 adjustedVehicleKm 分列，後者含 deadheadRatio |
| midstopAvoided、EACAI、spillover、protectionFactor | 全部刪除，無相容替代。沒有拒載資料，無法估公平改善 |
| 5 個政策預設與隱藏 ID 車公里加成 | 3 個電動化率展示，所有車公里均明確輸入，無依 ID 隱藏加成 |
| dataset.operatingDays 725 | operatingDays: null、recordedDates 為真實 distinct 紀錄日 |
| estimatedScheduledVehicleKm 5,143,875 | demonstration.inputVehicleKm 獨立展示輸入，預設 1,000,000，無紀錄日推導 |
| monthly 假設全期/24 排放 | 全部月度 operationalKgCo2e/scenarioDifferenceKgCo2e 為 null |
| od-carbon.topOD 假避免碳排 | od-carbon.od，完整依 OD + subroute 聚合，保留距離方法，不含走廊減量 |

所有 JSON 頂層有 schemaVersion。summary.dataset 包含旅次與距離覆蓋，summary.coverage 列出缺對與旅次量。summary.demonstration 與 scenarios.json 的排放純屬展示。報告不得標示為 Scope 盤查、淨零或政策最佳化結果。

TripODRecord.distanceKm 必須為非負有限數或 null。null 表示 unknown。若任何正旅次缺距離，totalPassengerKm 為 null，只報 knownDistancePkm 已知部分，evaluateScenario.comparison 為 null；不把部分人公里配全期排放。零人公里與零車公里的強度為 null。所有輸出為 kg CO2e、km、L、kWh、pkm，轉公噸需除 1000，轉 g/pkm 需乘 1000。比例為 0..1。

燃油耗必須 >0，電耗 >=0，空駛倍率 >=1，電動化率與每個分流在 0..1，四分流之和在浮點誤差 1e-9 內等於 1。負值、非有限值、溢位、錯單位與不合法比例會丟出 RangeError/TypeError，不靜默 clamp 或正規化。外層呼叫者應將錯誤呈現為輸入錯誤，不轉為零。

計算式：調整車公里 = 輸入車公里 × 空駛倍率；柴油 L = 調整車公里 × 柴油比例 / km/L；電力 kWh = 調整車公里 × 電動比例 × kWh/km；營運排放為兩能源量各乘係數後加總。反事實基線 = 人公里 × 各運具比例加權強度；scenarioDifference = 基線 − 營運排放，只做一次扣除。此差額不在盤查中抵扣。

重產命令 `bun scripts/lab/esg/run-analysis.ts`，需既有 DATABASE_URL/DATABASE_TOKEN，僅執行 SELECT 聚合。可用 ESG_SCENARIO_VKM 明示展示車公里。未提供資料庫或無資料就失敗，不再產生假空資料。外部查證不含原始旅次與 secrets。產製只有聚合 JSON，不輸出卡號或個別旅次。不要將獨立車公里展示分攤回月份。

指定集合是臺中、高鐵臺中站、台中航空站、日月潭、水社、向山行政中心。埔里列為集合外，只代表集合定義；不得寫成 6670H 中途站。未知名稱獨立 unknownStop。OSRM 是一般 driving 兩點近似，非逐班 GPS，未限制暨大/九族等支線途經；快取反向直接沿用正向。缺對保留 null，同站 0 是明示假設。刷卡只證明成功記錄的旅次，不能推導完整需求、職業／目的、拒載或公平性。
