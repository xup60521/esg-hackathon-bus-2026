/**
 * src/features/lab/tourism/types.ts
 *
 * TypeScript types and data contracts for Route 6670 Taiwan Trip Sun Moon Lake Line
 * tourism reachability and last-bus risk verification engine.
 *
 * Notice: Visual design (colors, badge styles, layout) is strictly reserved
 * for Claude. This module provides pure semantic data contracts and rule logic.
 */

export type TouristProfile = 'general' | 'senior_accessible' | 'family';

export type DayType = 'weekday' | 'holiday';

export type DayTypeSource = 'OFFICIAL_NOTES_CALENDAR' | 'MANUAL_OVERRIDE';

export type RiskLevel =
  | 'SAFE'
  | 'MODERATE'
  | 'HIGH_RISK'
  | 'CRITICAL'
  | 'STRANDED'
  | 'INVALID';

export type VerificationStatus =
  | 'OFFICIAL_VERIFIED'
  | 'ASSUMED_ESTIMATE'
  | 'UNKNOWN';

export interface AttractionCoordinates {
  lat: number;
  lon: number;
}

export interface AttractionProvenance {
  exactSourceUrl: string;
  evidenceBasis: string;
  sourceScheduleNote: string;
  retrievedDate: string;
  verifiedFields: string[];
  assumedFields: string[];
  unknownFields: string[];
}

export interface Attraction {
  id: string;
  name: string;
  englishName: string;
  stopId: string;
  stopName: string;
  category: string;
  coordinates: AttractionCoordinates | null;
  coordinatesStatus: VerificationStatus;
  walkTimeMinutes: number;
  walkTimeStatus: VerificationStatus;
  walkDistanceMeters: number | null;
  walkPathNote: string;
  openTime: string; // HH:MM
  closeTime: string; // HH:MM
  lastEntryTime: string | null; // HH:MM or null if unverified/unknown
  lastEntryStatus: VerificationStatus;
  scheduleNote: string;
  closedDays: string[]; // e.g. ["Wednesday", "Thursday"]
  recommendedDwellMinutes: number;
  minDwellMinutes: number;
  ticketRequired: boolean | null;
  ticketInfo: string;
  ticketStatus: VerificationStatus;
  officialUrl: string;
  provenance: AttractionProvenance;
  highlights: string[];
}

export interface TimetableTrip {
  tripNumber: number;
  inferredSubroute: string; // e.g. "6670A" (inferred by stopping pattern)
  subrouteClassification: 'inferred';
  remark: string;
  stopTimes: Record<string, string>; // stopId -> "HH:MM"
}

export interface StopHeader {
  name: string;
  id: string;
}

export interface ScheduleTable {
  label: string;
  totalTrips: number;
  stopsHeader: StopHeader[];
  trips: TimetableTrip[];
}

export interface TimetableMetadata {
  routeNumber: string;
  routeName: string;
  operator: string;
  authority: string;
  sourceUrl: string;
  snapshotSha256: string;
  retrievedDate: string; // YYYY-MM-DD
  scheduleType: string;
  validityRange: 'UNKNOWN';
  scheduleNotes: string[];
  subrouteDisclaimer: string;
  lastBusDisclaimer: string;
}

export interface TimetableData {
  metadata: TimetableMetadata;
  schedules: {
    weekday_outbound: ScheduleTable;
    weekday_inbound: ScheduleTable;
    holiday_outbound: ScheduleTable;
    holiday_inbound: ScheduleTable;
  };
}

export interface ItineraryRequest {
  originStopId: string; // e.g. 'thsr', 'taichung', 'puli'
  attractionId: string;
  departureDate: string; // YYYY-MM-DD (must be on/after snapshot date)
  departureTime: string; // HH:MM (strict 24h)
  customDwellMinutes?: number;
  profile?: TouristProfile;
  dayTypeOverride?: DayType; // Manual dayType override per official schedule notes
}

export interface LastBusRiskAssessment {
  riskLevel: RiskLevel;
  returnBusDepartureTime: string;
  lastBusDepartureTime: string;
  penultimateBusDepartureTime: string | null;
  bufferMinutes: number; // minutes from return bus departure to last bus
  remainingTripsCount: number; // actual count of subsequent trips reaching originStopId
  riskExplanation: string;
  backupPlan: string;
  disclaimer: string;
}

export interface OutboundLeg {
  tripNumber: number;
  inferredSubroute: string;
  subrouteClassification: 'inferred';
  departureTime: string;
  arrivalTime: string;
  walkToAttractionMinutes: number;
  attractionArrivalTime: string;
}

export interface DwellLeg {
  userRequestedDwellMinutes: number;
  actualDwellMinutes: number;
  waitingForOpenMinutes: number;
  attractionOpenTime: string;
  attractionCloseTime: string;
  attractionArrivalTime: string;
  attractionDepartureTime: string;
  walkToStopMinutes: number;
  busStopArrivalTime: string;
  isWithinOpenHours: boolean;
}

export interface InboundLeg {
  tripNumber: number;
  inferredSubroute: string;
  subrouteClassification: 'inferred';
  departureTime: string;
  destinationArrivalTime: string;
  waitAtStopMinutes: number;
}

export interface ReachabilityResult {
  status: 'conditional_snapshot_simulation';
  // True only under the supplied snapshot and assumptions; never travel validity.
  isValid: boolean;
  invalidReason?: string;
  originStopId: string;
  destinationStopId: string;
  attractionId: string;
  attractionName: string;
  dayType: DayType;
  dayTypeSource: DayTypeSource;
  timetableStatus: 'OFFICIAL_SCHEDULED' | 'NO_ACTIVE_SCHEDULE';
  outbound: OutboundLeg | null;
  dwell: DwellLeg | null;
  inbound: InboundLeg | null;
  lastBusRisk: LastBusRiskAssessment | null;
  warnings: string[];
  disclaimer: string;
}

export interface ScenarioExample {
  scenarioId: string;
  title: string;
  targetUser: string;
  description: string;
  request: ItineraryRequest;
  result: ReachabilityResult;
}
