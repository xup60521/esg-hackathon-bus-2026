/**
 * scripts/lab/tourism/export_sample_scenarios.ts
 *
 * Runs the scenario generator and saves public/data/lab/tourism/sample-scenarios.json.
 */

import { generateSampleScenarios } from '../../../src/features/lab/tourism/sampleScenarios';
import type { Attraction, TimetableData } from '../../../src/features/lab/tourism/types';

import timetableData from '../../../public/data/lab/tourism/timetable.json';
import attractionsData from '../../../public/data/lab/tourism/attractions.json';

const timetable = timetableData as unknown as TimetableData;
const attractions = attractionsData.attractions as unknown as Attraction[];

const scenarios = generateSampleScenarios(timetable, attractions);

const outputPath = 'public/data/lab/tourism/sample-scenarios.json';
await Bun.write(outputPath, JSON.stringify(scenarios, null, 2));

console.log(`Saved ${outputPath} (${scenarios.length} benchmark scenarios)`);
