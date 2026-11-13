/**
 * src/features/lab/tourism/sampleScenarios.ts
 *
 * Pre-computed and dynamic benchmark scenarios for Route 6670
 * Tourism Reachability & Last-Bus Risk Engine.
 */

import { verifyTripReachability } from './engine';
import type { Attraction, ScenarioExample, TimetableData } from './types';

export function generateSampleScenarios(
  timetable: TimetableData,
  attractions: Attraction[]
): ScenarioExample[] {
  const scenarios: Omit<ScenarioExample, 'result'>[] = [
    {
      scenarioId: 'scenario_thsr_to_xiangshan',
      title: '高鐵臺中站 往 向山遊客中心 (平日晨間悠活遊)',
      targetUser: '搭乘高鐵抵達臺中、欲直達向山遊客中心與欣賞清水模建築之個人或情侶旅客',
      description:
        '驗證搭乘 6670F 延駛向山班次直達向山行政中心，並在安全緩衝內搭車返回高鐵臺中站。',
      request: {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2026-11-05', // Thursday (weekday)
        departureTime: '08:30',
        customDwellMinutes: 90,
        profile: 'general',
      },
    },
    {
      scenarioId: 'scenario_taichung_to_paperdome',
      title: '臺中干城站 往 桃米坑紙教堂 (假日親子生態半日遊)',
      targetUser: '攜帶孩童之家庭旅客，需要較充裕之步行緩衝時間與安全停留時段',
      description:
        '驗證桃米坑紙教堂假日接駁，考量親子同行步行倍率 (1.3x) 與回程末班車安全性。',
      request: {
        originStopId: 'taichung',
        attractionId: 'paper_dome',
        departureDate: '2026-11-07', // Saturday (holiday)
        departureTime: '10:00',
        customDwellMinutes: 90,
        profile: 'family',
      },
    },
    {
      scenarioId: 'scenario_paperdome_closed_wednesday',
      title: '紙教堂週三一般公休條件不成立，例外待確認',
      targetUser: '未注意景點休館時間之一般旅客',
      description:
        '依一般週三四公休規則拒絕本模擬；國定假日、寒暑假與預約團例外需確認。',
      request: {
        originStopId: 'thsr',
        attractionId: 'paper_dome',
        departureDate: '2026-11-04', // Wednesday (closed day for Paper Dome)
        departureTime: '09:00',
        customDwellMinutes: 90,
        profile: 'general',
      },
    },
    {
      scenarioId: 'scenario_dwell_exceeds_close_rejected',
      title: '停留時間跨越閉館安全拒絕 (拒絕擅自截短旅客停留)',
      targetUser: '午後出發且自訂較長停留時間之旅客',
      description:
        '旅客於 12:45 搭車抵達向山 (約 14:17 入園)，自訂停留 180 分鐘將跨越 17:00 閉館時間；系統安全拒絕行程，絕不擅自縮短旅客停留時間。',
      request: {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2026-11-05', // Thursday (weekday)
        departureTime: '12:30',
        customDwellMinutes: 180,
        profile: 'general',
      },
    },
    {
      scenarioId: 'scenario_stranded_xiangshan',
      title: '向山行政中心傍晚嚴重滯留情境 (STRANDED 示範與標準查證警報)',
      targetUser: '出發較晚或停留過久、錯過向山 16:30 返回高鐵末班車之旅客',
      description:
        '旅客錯過向山直達高鐵之6670快照末班車，系統觸發 STRANDED 警報，並依誠信規範提示向營運方確認其他未查證服務。',
      request: {
        originStopId: 'thsr',
        attractionId: 'xiangshan_visitor_center',
        departureDate: '2026-11-05', // Thursday (weekday)
        departureTime: '12:30',
        customDwellMinutes: 150,
        profile: 'general',
      },
    },
  ];

  return scenarios.map((scenario) => ({
    ...scenario,
    result: verifyTripReachability(scenario.request, timetable, attractions),
  }));
}
