# 十二小時自主研究與原型

使用者授權十方向獨立代理、自主子代理、UI 入網頁與用量限制備援。期限 2026-11-04 12:50 +0800。主代理 GPT-6.1 Sol 負責派工、資料契約、整合、驗證。Claude Sonnet 5.5 擁有全部視覺設計權；Gemini/GPT 僅資料與邏輯。

十方向採獨立 features/lab/<slug> 模組、scripts/lab/<slug> 重現工具、public/data/lab/<slug> 公開彙總與 docs/lab/<slug> 報告。Claude 擁有對應 /lab 頁、元件；operations 擁有共同入口與共用 UI。主代理修改共用路由/依賴，保留既有未提交工作。無正式資料時提供明示情境或限制，禁止編造即時與成果。

生命週期：各方向讀本地資料及官方來源，完成方法與可重現原型，交付後主代理驗證，Claude 整合網頁，再由獨立代理檢查資料與實作。缺資料可降成透明情境工具，不降成虛構成果。第一版目標前四小時，整合與修復至第九小時，最後三小時驗證與交付。完成通知驅動續作，不輪詢執行中的 delegate。十二小時為上限，提早達標不空耗額度。

## Invariants

INV-1 不修改他人既有首頁/中間站等未提交工作。INV-2 UI 僅 Claude 設計，指定備援依使用者授權。INV-3 刷卡、情境、預測、即時資料明確區分。既有 registry 無已接受系統保證，本輪不新增持久保證。

## Acceptance criteria

AC-1 十方向各有獨立代理、研究報告與可驗證成果或明確資料阻礙。AC-2 可執行成果含重現命令、來源、限制。AC-3 Claude 實作網頁入口與適用功能。AC-4 整合後相關測試及建置通過，未通過明示。AC-5 用量限制依序處理，無擅自付費 OpenCode 模型。

## Validation

主代理逐結果檢查來源及實際執行，對資料/演算法測試與網頁 build 做整合檢查。獨立審查最終 diff 與限制說明。無外部 API/營運資料時不宣稱正式即時或減碳成效。

## Minimality check

沿用現有 TanStack/Bun 工具與本地彙總資料。避免十套基建、重複下載原始票證、加入付費 API 或改造首頁。由 Claude 做 /lab 入口統一導覽，非UI代理交付可消費的JSON與純邏輯。

## 路由整合澄清

operations Claude獨占src/routes/lab.tsx版面及src/routes/lab.index.tsx總覽；visualization與assistant各僅輸出內容，版面提供shared shell。主代理最後產生routeTree。公開彙總cube.json可納入交付，保持按需載入。
