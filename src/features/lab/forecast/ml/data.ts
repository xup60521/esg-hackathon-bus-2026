/** Independent ML experiment. No route, UI, or baseline schema changes. */
export const forecastMlPaths = {
  summary: '/data/lab/forecast/ml/summary.json',
  results: '/data/lab/forecast/ml/results.json',
} as const

export type MlModel = 'raw_squared' | 'raw_absolute' | 'residual_squared' | 'residual_absolute'
export type BaselineModel = 'seasonal7' | 'weekday_mean4' | 'weekday_median4' | 'mean28'
export type ForecastModel = MlModel | BaselineModel
export interface Metrics {
  n: number
  mae: number | null
  rmse: number | null
  wape: number | null
  bias: number | null
  peakN: number
  peakUnderforecastShare: number | null
}
export interface Availability {
  predictedCalendarDays: number
  evaluatedObservedDays: number
  observedDayCoverage: number | null
  individualSupportMetrics: Metrics
}
export interface Evaluation {
  calendarDays: number
  observedDays: number
  commonDays: number
  metrics: Partial<Record<ForecastModel, Metrics>>
  availability: Partial<Record<ForecastModel, Availability>>
}
export interface BacktestRow {
  date: string
  actual: number | null
  predictions: Partial<Record<ForecastModel, number | null>>
  commonSupport: boolean
  trainingCutoffExclusive: string
}
export interface TrainingAudit {
  model: MlModel
  cutoffExclusive: string
  trainingFirstTarget: string
  trainingLastTarget: string
  trainingRows: number
  trainingMae: number
  treeCount: number
  featureImportances: Record<string, number>
}
export interface ForecastMlSummary {
  schemaVersion: 1
  experiment: 'A-008-direction1-ml'
  target: 'daily_observed_card_boardings'
  group: 'total'
  timezone: 'Asia/Taipei'
  status: 'historical_backtest_not_current_forecast'
  selectedModel: MlModel
  baselineSelectedModel: BaselineModel
  protocol: {
    validationWindow: [string, string]
    testWindow: [string, string]
    horizonDays: 1
    retraining: string
    availabilityAssumption: string
    selection: string
    missing: string
    comparison: string
    coverage: string
    peakMetric: string
    intervals: null
  }
  model: {
    estimator: string
    parameters: Record<string, number>
    candidates: Record<MlModel, { residual: boolean; loss: string }>
    features: string[]
    predictionFloor: number
    residualDefinition: string
  }
  validationCandidateMetrics: Record<MlModel, Metrics>
  validation: Evaluation
  test: Evaluation
  monthlyTest: Array<Evaluation & { month: string }>
  peakThreshold2024P90: number
  quality: {
    inputRows: number
    mergedRows: number
    referenceReconciled: boolean
    boardings: number
    alightings: number
    unknownDirectionBoardings: number
    unknownDirectionShare: number | null
    calendarDays: number
    boardingObservedDays: number
    missingBoardingDates: string[]
    alightingOnlyDates: string[]
  }
  sources: Array<{ path: string; sha256: string; rows: number }>
  referenceSha256: string
  codeSha256: Record<string, string>
  runtime: Record<string, string>
  trainingAudits: TrainingAudit[]
  warnings: string[]
}
export interface ForecastMlResults {
  schemaVersion: 1
  summaryPath: '/data/lab/forecast/ml/summary.json'
  validation: BacktestRow[]
  test: BacktestRow[]
}
