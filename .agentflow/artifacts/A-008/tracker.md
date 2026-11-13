# 十二小時研究與原型追蹤

目標：十方向自主研究、可驗證原型與 Claude 網頁。狀態：原型與驗收 12/12 完成；Git 交付待恢復，見[最終交付與恢復點](#最終交付與恢復點)。契約見 [design.md](design.md)。使用者授權自主決策、跨家族備援及子代理。共享 checkout 僅因資料可用性與各方向目錄互斥而採用，並非 OS 隔離。官方來源支持各家 coding/agent 能力，分工屬主代理判斷，非跨廠商評測排名。

## Tasks

- [DONE] T-1 — AI旅運需求預測模型

  負責：codex / gpt-6.1-sol；範圍：docs/lab/forecast、src/features/lab/forecast、scripts/lab/forecast、public/data/lab/forecast；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-2 — 車輛與班次最佳化配置

  負責：codex / gpt-6.1-sol；範圍：docs/lab/optimization、src/features/lab/optimization、scripts/lab/optimization、public/data/lab/optimization；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-3 — 尖峰與離峰運量分析

  負責：antigravity / gemini-3.8-flash-high；範圍：docs/lab/peaks、src/features/lab/peaks、scripts/lab/peaks、public/data/lab/peaks；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-4 — 旅客搭乘行為分析

  負責：antigravity / gemini-3.8-flash-high；範圍：docs/lab/behavior、src/features/lab/behavior、scripts/lab/behavior、public/data/lab/behavior；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-5 — 車輛載客率提升策略

  負責：codex / gpt-6.1-sol；範圍：docs/lab/occupancy、src/features/lab/occupancy、scripts/lab/occupancy、public/data/lab/occupancy；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-6 — 即時營運決策儀表板

  負責：claudeAgent / claude-sonnet-5-5；範圍：docs/lab/operations、src/features/lab/operations、scripts/lab/operations、public/data/lab/operations；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-7 — AI客服或智慧旅遊資訊服務

  負責：claudeAgent / claude-sonnet-5-5；範圍：docs/lab/assistant、src/features/lab/assistant、scripts/lab/assistant、public/data/lab/assistant；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-8 — 電子票證大數據視覺化

  負責：claudeAgent / claude-sonnet-5-5；範圍：docs/lab/visualization、src/features/lab/visualization、scripts/lab/visualization、public/data/lab/visualization；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-9 — 觀光景點與公共運輸整合應用

  負責：antigravity / gemini-3.8-flash-high；範圍：docs/lab/tourism、src/features/lab/tourism、scripts/lab/tourism、public/data/lab/tourism；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-10 — ESG及低碳公共運輸創新方案

  負責：antigravity / gemini-3.8-flash-high；範圍：docs/lab/esg、src/features/lab/esg、scripts/lab/esg、public/data/lab/esg；Claude 可寫契約中對應路由與元件。驗收 AC-1/2，UI 另 AC-3；依完成通知驗證及整合。失敗保留資料，usage limit 先停舊任務再依指定模型備援。實際 task handle 見 delegates.json。

- [DONE] T-11 — 主代理整合及相關測試/build，保留既有未提交變更，AC-4。

- [DONE] T-12 — 獨立最終審查、修正與中文交付，核對 AC-1 至 AC-5。

## 方向1第一版查核

主代理已讀完整建置與測試，重跑5項unittest通過。基準僅統計季節法，不能宣稱已完成AI模型；保留T-1 DOING。2024選模、2025測試分開，特徵落後於目標日，缺日保持null。已通知Claude operations可整合既有summary且揭露尖峰限制。新派Codex gpt-6.1-sol/high進行獨立ML補充，唯一新寫入forecast/ml子目錄，維持既有schema；實際handle見delegates.json supplemental。

## 方向2第一版查核

主代理已讀完整求解器與報告，重跑16項測試、131斷言及局部嚴格型別檢查通過。資源指派包含占用區間/累計工作量，固定基準不可刪，有限候選窮舉；50組獨立暴力枚舉有交叉核對。現階段為透明假設情境而非營運班表。已將JSON與介面通知Claude operations整合，T-2保留DOING等待最終獨立審查，原型驗證不等於真實營運驗收。

## 方向5第一版查核

主代理已讀報告與純函式，重跑8項測試/4633斷言通過，verify.ts確認24月292562列對帳與18情境守恆。未重跑既有資料庫查詢，唯讀audit作為代理執行證據；原始候選歸班仍未驗證。已通知Claude保留未驗證候選、參數容量與票證峰值界線，T-5維持DOING待最終審查與整合。

## 方向8第一版查核

主代理重跑22項測試及13項資料檢查全部通過，讀取報告/路由/shared契約。僅代理在/tmp副本做過瀏覽器操作，主站尚缺lab版面，T-8保留DOING待整合與獨立審查。決定納入2.7MB公開彙總cube，以靜態按需載入，不增加API。operations Claude明確獨占src/routes/lab.tsx版面與lab.index.tsx總覽，主代理最後產生routeTree，不改Claude視覺設計。

## 方向1 ML補充查核

主代理已讀ML完整建置/測試與報告，run.sh重跑真實訓練及6項測試通過。2024驗證選模及2025逐月擴張窗口可由trainingAudits查驗，目標日/未來值不進特徵或訓練。2025共同336日MAE276.55/WAPE10.70%，但2024輸中位數且可出預測覆蓋較低，禁止直接宣稱穩定優勢。已通知Claude可用獨立ML契約整合；T-1保留DOING待獨立審查與整合。

## 方向4需修正

主代理重跑舊7測試/52斷言通過，但讀程式發現未覆蓋缺陷：群名過推目的/族群；時長群平均以全旅次而非有效樣本加權；OD票種與overview不同分類；假日實為週末；完整206OD未輸出、僅top30；缺下車站flag錯查timestamp；靜態描述無實證。新派同Gemini模型修正、加測與重新產製，T-4 DOING且禁止整合舊結果。已通知Claude暫緩behavior。

## 方向9需修正

主代理讀engine/extractor並重跑舊12測試通過，但測試未涵蓋日期時間解析、開門前/末入、停留截短、回程目的站與班次排序漏洞。景點手填欄位缺逐欄來源卻標verified；硬編步行/纜車備援未驗證；歷史刷卡不能印證現行末班。官方班表頁已核對notes，週一至四/週五至日規則有來源，但國定假日額外推定無。已新派Gemini修正與取證，通知Claude暫緩tourism，拒用Gemini提出的視覺徽章配色。T-9 DOING未接受。

## 方向3與10需修正

主代理讀classifier/metrics與ESG模型，重跑合計28測試通過，但發現未覆蓋證據與統計口徑缺陷。peaks硬標6缺日為颱風停駛、假日表與官方政府日曆不一致、分析窗口冒充營業時間、週五返鄉因果無證據。ESG分流假設冒充問卷校準、年份/排放邊界未逐項驗證、車公里/每月排放任意假設、避免排放誤列Scope3、缺距離填0、未知站算中間站、任意保護係數當改善效果、輸入比例和/NaN等無驗證。分別新派Codex修正取證並加測，非usage limit切換；T-3/T-10 DOING未接受，Claude已通知暫緩舊數據。

## 方向7第一版查核

主代理重跑71測試與62題回歸評估通過。小修九族/向山停靠問句，直接查對應靜態班表而非泛用站序、不宣稱每班停；補測後72項/2188斷言通過。Biome對變更檔通過。已產生共用routeTree登錄lab版面與assistant/visualization路由，保留原analysis路由。主站整合仍待Claude完成與整體檢查，T-7 DOING。62題為實作者題庫非獨立準確率，票價人工轉錄有限；未接生成AI。

## 方向6整合查核

主代理重跑24項測試/60斷言通過，主checkout的bun run build首次通過。發現freshness把未來或2h內資料直接當可即時，誤讀TDX保留範圍；last1-calendar實為最近同星期同日型可用日卻標上週同日。已新派Claude在原operations/shared範圍修正語義與邏輯並加測，UI仍只Claude。T-6 DOING；主站build通過不等於全專案tsc或瀏覽器驗證通過。

## 方向3修正版查核

主代理讀v2契約/metrics/classifier，重跑18項測試與verify：24月292562鍵、124組核對通過。政府日曆、缺日unknown/null及24h分析窗口修正到位。授權目前operations唯一Claude寫入者新增PeaksView並遷移schema v2，接妥才解除peaks hold，其他hold不動。T-3仍DOING待UI與獨立review；此局部驗證不證上游完整。

## ESG v2與共用修正版查核

ESG主代理讀來源/遷移/計算，重跑12測試/72斷言及verify：四v2、24月、492OD支線、三情境重算通過。假設與官方已分開；燃油及運具係數仍未核實，UI只作假設展示。新派Claude建EsgView，接妥才解除esg hold。freshness修正與PeaksView交付後主代理重跑29測試/107斷言通過、讀freshness程式，已把時間近與即時適用性分離；未有主代理瀏覽器整合驗證。T-3/6/10仍DOING等UI/獨立review。

## 方向9第二次核查未接受

主代理重跑20測試通過並實讀3個官方景點內頁。紙教堂票價數字及九族末入16:00仍無來源卻標verified，九族假日閉館17:30未建模，水社仍用主站充來源；景點開放例外未處理。已派Codex有限縮減為取證景點/透明假設，非usage fallback。不能因改了標籤就視作取證。主專案tsc快照僅剩並行修正中的behavior與esg UI問題，沒有本次tourism型別錯，但不代表邏輯正確。T-9仍DOING且禁止UI接入。

## ESG介面完成與獨立審查啟動

ESG Claude交付並解除esg hold，回報主站build與desktop互動通過；主代理已讀交接與載入驗證邏輯摘要，獨立Codex新context唯讀審查目前穩定八方向與共用介面。使用者授權自主選擇模型，本輪選gpt-6.1-sol/high作獨立結果審查，非作者背書；所有視覺決策仍只Claude。審查排除仍寫入中的behavior/tourism；精確handle見stable-review.json。審查期間不改穩定範圍，後續新UI需另行覆蓋。

## 觀光第二修正版查核

主代理讀縮減報告/資料契約，重跑28測試/213斷言通過。三景點官方正文摘要、假設與未知分離，移除未證票價/九族末入/水社等；結果固定conditional_snapshot_simulation。新派Claude做TourismView，僅新增獨有檔案，不改穩定八方向review範圍或hold/index。T-9 DOING等UI與獨立review。

## 穩定八方向獨立審查結果

獨立review完成，4項P2、無P0/P1，主代理已自行修正並補測，75tests/2214assertions與Biome通過。詳 [審查與修正](stable-review-findings.md)。visualization純邏輯不在原review明示範圍，需後續覆核；behavior/tourism與新View另審。未把原review延伸成修後獨立背書。

## 觀光UI備援完成與補審

Antigravity Sonnet5.5觀光View交付，主代理重跑引擎+頁面57測試405斷言通過，未有瀏覽器操作。新Codex唯讀review覆蓋tourism完整資料/引擎/UI、先前漏覆核visualization純邏輯，以及原4P2修正；原review不再擴充。精確handle見tourism-viz-review.json。觀光hold待審查與整合後解除，behavior仍在原修正task執行中，禁止輪詢。

## 補審完成與四項邊界修正

獨立review覆蓋visualization完整純邏輯/資料與tourism及舊4P2修正，4新P2已主代理自行修正，134tests2636assertions與Biome通過。詳 [補審與修正](tourism-viz-review-findings.md)。觀光hold已解除且index重建，主站bun run build已exit0，僅既有sourcemap/chunk警告。行為hold仍保留，tsc僅behavior4個unused，不能搶寫原代理。T-9仍DOING等最後整合，T-4待完成通知。

## 方向4續作交付與審查/介面

Codex完成v2重產，主代理讀契約/報告/有效時長合成，重跑12測試82斷言及15項對帳通過。完整206OD、other票種、精確時長樣本、同站與短時交集獨立。新派獨立Codex唯讀review資料邏輯，並由Antigravity Sonnet5.5新增BehaviorView，範圍互斥且hold由主代理最後解除。精確handles見behavior-ui.json/behavior-review.json。T-4仍DOING待兩項交付。

## 方向4獨立review完成

無P0-P2，僅平均時長浮點進位P3；主代理修BigInt整數秒半入，13tests89斷言、15對帳與source Biome通過，已通知Claude。詳[結果](behavior-review-findings.md)。資料邏輯可整合，UI仍執行。

## Recovery

期限：2026-11-04 12:50 +0800。主代理 session 0dd2dc83-71ae-4a26-8389-61e79d655b93，根筆記本 A-008 所有權保留。十個 delegates 已取得 running 回應，精確 handles、模型、options 與派工內容存 [delegates.json](delegates.json)。完成通知會喚回本 thread；不要輪詢或排定監控。收到結果後讀結果、跑實際檢查，再更新 tracker。新review必須新 delegate_task。

UI fallback 僅在 usage limit：Claude Code Sonnet 5.5 -> Antigravity Sonnet 5.5 -> OpenCode deepseek v4.1 flash free；後兩者精確 model ID 尚未查目錄，啟用前驗證。不得使用其他付費 OpenCode。非UI可改用已授權 GPT/Gemini/Claude，先保全舊結果並取消不再需要的代理。

時間配置：前4小時第一版，接續5小時整合與修復，最後3小時獨立審查與驗證；不等待滿時、不承諾無資料成果。不建立排程來監控 delegates。未有持久系統 invariant，registry 不變。主代理 UI 不作視覺決策。開始時有既存未提交檔案，詳主筆記本前狀態；本輪只收自身路徑。


### 整合型別檢查快照

產生路由後第一次tsc --noEmit未通過。peaks/esg/tourism正修正中造成新舊介面暫時不一致，待代理完成後再檢查，不與寫入者競爭修復。另有既有src/routes/api.trpc.$.tsx的server選項型別錯，最終整合需釐清。不能宣稱全站型別通過。

### UI用量限制與備援

Claude Code觀光頁任務API rate limit失敗，task_cancel回傳failed，未留下TourismView/交接檔。已依使用者指定順序確認model catalog，轉Antigravity claude-sonnet-5-5-high，共享範圍仍僅TourismView與獨有子目錄，不碰獨立審查中的檔案。精確handle見tourism-ui-fallback.json。未啟動OpenCode或使用未授權模型。

## 方向4停滯確認與期限

2026-11-04T07:00Z使用者詢問卡住，依本次明確狀態請求讀thread完整7項活動：任務仍running，最後活動2026-11-03T17:17:20Z為多次Read與pnpm工具執行失敗，無pending request或後續進度。台灣時間最後01:17，查核時15:00。十二小時期限12:50已過。已呼叫task_cancel停止失效任務，保留既有檔案與behavior hold，尚未完成修正/驗收。先前主代理未及時識別停滯，是進度管理缺口；不把running當進展，不新增超期任務。

## 使用者授權續作

使用者明確說「ok 請繼續」，授權完成剩餘方向4/整合驗收，不推定新12小時額度。舊Gemini thread已查為interrupted、activeRunId null，允許新Codex獨占behavior目錄接手，保留舊檔作修正。UI仍由Claude，優先Antigravity Sonnet5.5因Claude Code先前rate limit。其餘方向已局部/獨立review，待最終全站檢查與交付。

## 使用者要求開發預覽

已依「先開dev server 讓我可以看看目前進度」啟動bun run dev --host 0.0.0.0，PTY session 82013，Vite ready，localhost:3000/lab。這是使用者要求保留的開發伺服器，勿在交接時誤停。區網192.168.0.166:3000/lab，Tailscale100.114.156.21:3000/lab。方向4 UI/review仍依完成通知續作。

## 方向4 UI上下文錯誤重試

Antigravity Sonnet回傳invalid_request_error：thinking.signature缺欄位，工具將run標completed但沒有交付View。task_cancel確認completed，僅留下views/behavior/model.ts。已用新delegate_task相同provider/model乾淨上下文接手，不切換UI模型；handle見behavior-ui-retry.json，其他方向結果保留。

## UI最後免費備援

Antigravity Sonnet5.5回Usage Limit Reached，reset4h47m，task_cancel確認completed。發現已留下完整BehaviorView與元件，主代理跑23UItests303斷言及全站tsc通過。已驗證目錄精確模型opencode/deepseek-v4.1-flash-free，依使用者最後備援啟動交付完成檢查，保留Claude設計，僅可本View範圍。不是付費OpenRouter DeepSeek型號。handle見behavior-ui-free.json。

## 使用者指定切回Claude

使用者確認Claude現在可用；已cancel免費備援並確認thread interrupted、activeRunId null，再用Claude Code Sonnet5.5/high接手既有行為UI，保留設計與檔案，完成操作驗收/交接，handle見behavior-ui-claude-return.json。dev server仍保留。

## 方向4介面驗收與最後檢查

Claude Code已交付操作驗收，主代理解除behavior hold並重建索引，十方向皆可從入口存取。全站bun test src：287pass/0fail/8111assertions；最後UI獨立review已啟動，handle見behavior-final-review.json，僅唯讀BehaviorView資料契約/互動語義，不設計。dev server82013依使用者保留。最終bun run build已exit0，僅sourcemap/chunk警告；等待最後UI獨立review後才宣稱全案完成。

## 最終交付與恢復點

本節取代上文歷史進度的待辦狀態。原十二小時已超時，後續由使用者「ok 請繼續」授權完成。十方向可從 /lab 存取，沒有 hold。最後 review 的 P2/P3 已主代理修正，證據見 [行為介面審查與修正](behavior-final-review-findings.md)。全部回報缺陷有對應修正，最後小修未獨立重審。完整交付與界線見 [總報告](../../../docs/lab/report.zh-TW.md)。

主代理最終實測：289 tests／8123 assertions、tsc、build 皆通過；局部 Biome 通過。localhost:3000/lab HTTP 200。所有派工已完成、失敗或取消，沒有待續跑代理。使用者要求保留的開發伺服器為 PTY 82013，並非待續跑任務。

Git 尚未提交／推送。HEAD 5861d0651eed3c9bd898bd5fd76ab1d18c19de5f，main，index 為空，remote origin https://github.com/xup60521/esg-hackathon-bus-2026.git；未進行任何 push。auto-commit／push 的授權仍在，但受限於既存混合變更的歸屬與依賴，不能把原有成果當成本輪變更吸收。

本輪來源可歸屬路徑：docs/lab/、scripts/lab/、src/features/lab/、src/components/lab/、public/data/lab/、src/routes/lab.tsx、lab.index.tsx、lab.assistant.tsx、lab.visualization.tsx、.agentflow/artifacts/A-008/，以及筆記本 A-008 進度。src/routeTree.gen.ts 為混合生成內容，本輪加 lab，但包含先前已存在 analysis 路由。

工作開始前已存在：.agentflow/ag.json、.gitignore、package.json、src/lib/palette.ts、src/routes/index.tsx、src/routeTree.gen.ts 的未提交變更；未追蹤 .agents/、docs/midstop-analysis.md、public/data/midstop.json 與月份檔、scripts/analysis/、skills-lock.json、src/components/MidstopCharts.tsx、src/lib/midstop.ts、midstop.test.ts、src/routes/analysis.tsx。既有 palette 的 themeVars／THEME_KEY 匯出被新 LabShell 使用，不能把新頁面提交為可獨立建置快照而忽略依賴，也不能在無可靠歸屬時把既有檔案合併歸為本輪。

下一個安全動作：核實上述原有變更的歸屬與可交付範圍，完成 task／owner separate commits，再依現行 auto-push 設定推送 main。恢復前重新讀即時 Git/index/config；不 reset、stash、rebase 或整包 git add。這是唯一未完成的交付動作；不需要再派研究或 UI 代理。
