/** Data contract only; presentation is owned by the integrating UI author. */
export type ForecastModel = 'seasonal7' | 'weekday_mean4' | 'weekday_median4' | 'mean28';
export interface ForecastMetrics {
  n: number;
  mae: number | null;
  rmse: number | null;
  /** Ratio, not an accuracy score. Null when actual sum is zero. */
  wape: number | null;
  /** Prediction minus actual; negative means underforecast. */
  bias: number | null;
  peakN: number;
  peakUnderforecastShare: number | null;
}
export interface ForecastGroupSummary {
  id: string;
  observedDays: number;
  missingDays: number;
  totalBoardings: number;
  peakThresholdTrainingP90: number | null;
  validationCommonDays: number;
  testCommonDays: number;
  testObservedDays: number;
  selectedModel: ForecastModel | null;
  validationMetrics: Record<ForecastModel, ForecastMetrics>;
  testMetrics: Record<ForecastModel, ForecastMetrics>;
  individualSupportMetrics: Record<'validation' | 'test', Record<ForecastModel, ForecastMetrics>>;
  monthlyTest: Array<{ month: string; metrics: Record<ForecastModel, ForecastMetrics> }>;
  historicalNextDay: {
    date: string;
    origin: string;
    model: ForecastModel | null;
    prediction: number | null;
    status: 'historical_demo_not_current_forecast';
  };
}
export interface ForecastSummary {
  schemaVersion: 1;
  target: 'daily_observed_card_boardings';
  timezone: 'Asia/Taipei';
  observationWindow: [string, string];
  protocol: {
    horizonDays: number;
    availabilityAssumption: string;
    validationWindow: [string, string];
    testWindow: [string, string];
    modelSelection: string;
    evaluation: string;
    missing: string;
    models: Record<ForecastModel, string>;
    peakMetric: string;
  };
  quality: {
    inputRows: number;
    mergedRows: number;
    referenceReconciled: boolean;
    boardings: number;
    alightings: number;
    unknownDirectionBoardings: number;
    unknownDirectionShare: number | null;
    calendarDays: number;
    boardingObservedDays: number;
    missingBoardingDates: string[];
    alightingOnlyDates: string[];
  };
  sources: Array<{ path: string; sha256: string; rows: number }>;
  referenceSha256: string;
  warnings: string[];
  groups: ForecastGroupSummary[];
}
export interface ForecastBacktestRow {
  date: string;
  actual: number | null;
  predictions: Record<ForecastModel, number | null>;
  commonSupport: boolean;
}
export interface ForecastResults extends Omit<ForecastSummary, 'groups'> {
  groups: Array<ForecastGroupSummary & {
    daily: Array<[string, number | null]>;
    backtest: ForecastBacktestRow[];
  }>;
}
export const forecastDataPaths = {
  summary: '/data/lab/forecast/summary.json',
  results: '/data/lab/forecast/results.json',
} as const;
