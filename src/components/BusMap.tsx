import {
	AmbientLight,
	COORDINATE_SYSTEM,
	DirectionalLight,
	LightingEffect,
	type MapViewState,
} from "@deck.gl/core";
import { TripsLayer } from "@deck.gl/geo-layers";
import {
	ColumnLayer,
	PathLayer,
	ScatterplotLayer,
	TextLayer,
} from "@deck.gl/layers";
import { SimpleMeshLayer } from "@deck.gl/mesh-layers";
import DeckGL from "@deck.gl/react";
import { memo, useMemo, useState } from "react";

import {
	featureLines,
	type GeoAssets,
	type RoadClass,
	type Stop,
} from "#/lib/geo";
import { PALETTES, type Theme, type ThemePalette } from "#/lib/palette";

export type AnimatedTrip = {
	path: [number, number, number][];
	timestamps: number[]; // seconds since service-day midnight
	sub: string;
};

export type StopValue = { boardings: number; alightings: number };

type Props = {
	assets: GeoAssets;
	theme: Theme;
	stopValues: Map<string, StopValue>;
	/** value that maps to the tallest column height */
	scaleMax: number;
	trips: AnimatedTrip[] | null;
	currentTime: number;
};

const INITIAL_VIEW: MapViewState = {
	longitude: 120.775,
	latitude: 23.985,
	zoom: 10.45,
	pitch: 56,
	bearing: 22,
	maxPitch: 75,
	minZoom: 9,
	maxZoom: 13.2,
};

/** Always labelled; the closely spaced intermediate stops appear once zoomed in. */
const MAJOR_STOPS = new Set([
	"台中航空站",
	"臺中",
	"高鐵臺中站",
	"埔里站",
	"暨南大學校內",
	"九族文化村",
	"日月潭",
	"向山行政中心",
]);

// zoom thresholds for progressive detail
const ZOOM_DISTRICT_LABELS = 10.6;
const ZOOM_LOCAL_ROADS = 11.2;
const ZOOM_MINOR_STOPS = 11.6;

const COLUMN_MAX_HEIGHT = 9000; // meters, at scaleMax
const COLUMN_OFFSET = 0.0021; // degrees lon between boarding/alighting column

const ROAD_WIDTH: Record<RoadClass, { width: number; order: number }> = {
	local: { width: 0.6, order: 0 },
	county: { width: 0.8, order: 1 },
	provincial: { width: 1, order: 2 },
	expressway: { width: 1.2, order: 3 },
	freeway: { width: 1.4, order: 4 },
};

const FONT = '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif';
const NO_DEPTH = { depthCompare: "always" } as const;

// Module-level constants: passing new objects every render makes deck.gl
// re-initialise effects / controllers on every animation frame.
const EFFECTS = [
	new LightingEffect({
		ambient: new AmbientLight({ color: [255, 255, 255], intensity: 1.15 }),
		sun: new DirectionalLight({
			color: [255, 244, 225],
			intensity: 1.6,
			direction: [-2, -3, -4],
		}),
	}),
];
// Ambient-only (≈ unlit): hillshading is baked into the texture.
const TERRAIN_MATERIAL = {
	ambient: 0.87,
	diffuse: 0,
	shininess: 0,
	specularColor: [0, 0, 0] as [number, number, number],
};
const CONTROLLER = { touchRotate: true, inertia: true } as const;
const COLUMN_MATERIAL = { ambient: 0.6, diffuse: 0.7, shininess: 32 };
const ORIGIN: [number, number, number] = [0, 0, 0];
const PIXEL_RATIO =
	typeof window === "undefined"
		? 1
		: Math.min(window.devicePixelRatio || 1, 1.5);

/** Static scenery (terrain, borders, roads, labels) — rebuilt only on zoom-tier / theme change. */
function useSceneryLayers(
	assets: GeoAssets,
	zoom: number,
	theme: Theme,
	pal: ThemePalette,
) {
	const { sampler } = assets;

	const townLines = useMemo(
		() =>
			featureLines(assets.townships).map((l) => ({
				path: sampler.drape(l.coords, 25),
			})),
		[assets.townships, sampler],
	);
	const countyLines = useMemo(
		() =>
			assets.counties
				? featureLines(assets.counties).map((l) => ({
						path: sampler.drape(l.coords, 30),
					}))
				: [],
		[assets.counties, sampler],
	);
	const roads = useMemo(() => {
		const draped = assets.roads
			.map((r) => ({
				...ROAD_WIDTH[r.cls],
				cls: r.cls,
				path: sampler.drape(r.path, 15),
			}))
			.sort((a, b) => a.order - b.order);
		return {
			major: draped.filter((r) => r.cls !== "local"),
			local: draped.filter((r) => r.cls === "local"),
		};
	}, [assets.roads, sampler]);
	const network = useMemo(
		() =>
			featureLines(assets.network).map((l) => ({
				path: sampler.drape(l.coords, 40),
			})),
		[assets.network, sampler],
	);
	const toLabels = <T extends { lon: number; lat: number }>(
		rows: T[],
		text: (r: T) => string,
		lift: number,
	) =>
		rows.map((d) => ({
			text: text(d),
			position: [d.lon, d.lat, sampler.at(d.lon, d.lat) + lift] as [
				number,
				number,
				number,
			],
		}));
	// biome-ignore lint/correctness/useExhaustiveDependencies: toLabels only closes over sampler
	const labels = useMemo(
		() => ({
			district: toLabels(assets.districtLabels, (d) => d.town, 150),
			county: toLabels(assets.countyLabels, (d) => d.county, 300),
			road: toLabels(assets.roadLabels, (d) => d.name, 60),
		}),
		[assets.districtLabels, assets.countyLabels, assets.roadLabels, sampler],
	);

	const showDistricts = zoom >= ZOOM_DISTRICT_LABELS;
	const showLocal = zoom >= ZOOM_LOCAL_ROADS;
	const m = pal.map;

	return useMemo(
		() => [
			new SimpleMeshLayer({
				id: "terrain",
				data: [1],
				mesh: assets.mesh,
				texture: assets.textureUrl[theme],
				getPosition: () => ORIGIN,
				coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
				material: TERRAIN_MATERIAL,
				_instanced: false,
			}),
			new PathLayer({
				id: "townships",
				data: townLines,
				getPath: (d) => d.path,
				getColor: m.boundary,
				getWidth: 1,
				widthUnits: "pixels",
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
			new PathLayer({
				id: "counties",
				data: countyLines,
				getPath: (d) => d.path,
				getColor: m.countyBoundary,
				getWidth: 2,
				widthUnits: "pixels",
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
			new PathLayer({
				id: "roads-local",
				data: roads.local,
				visible: showLocal,
				getPath: (d) => d.path,
				getColor: (d: { cls: RoadClass }) => m.roads[d.cls],
				getWidth: (d) => d.width,
				widthUnits: "pixels",
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
			new PathLayer({
				id: "roads-major",
				data: roads.major,
				getPath: (d) => d.path,
				getColor: (d: { cls: RoadClass }) => m.roads[d.cls],
				getWidth: (d) => d.width,
				widthUnits: "pixels",
				capRounded: true,
				jointRounded: true,
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
			new PathLayer({
				id: "route-glow",
				data: network,
				getPath: (d) => d.path,
				getColor: m.routeGlow,
				getWidth: 10,
				widthUnits: "pixels",
				capRounded: true,
				jointRounded: true,
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
			new PathLayer({
				id: "route",
				data: network,
				getPath: (d) => d.path,
				getColor: m.route,
				getWidth: 3,
				widthUnits: "pixels",
				capRounded: true,
				jointRounded: true,
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
			new TextLayer({
				id: "county-labels",
				data: labels.county,
				getPosition: (d) => d.position,
				getText: (d) => d.text,
				getSize: 16,
				getColor: m.countyLabel,
				characterSet: "auto",
				fontFamily: FONT,
				fontWeight: 700,
				outlineWidth: 4,
				outlineColor: m.labelOutline,
				fontSettings: { sdf: true },
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
			new TextLayer({
				id: "district-labels",
				data: labels.district,
				visible: showDistricts,
				getPosition: (d) => d.position,
				getText: (d) => d.text,
				getSize: 12.5,
				getColor: m.districtLabel,
				characterSet: "auto",
				fontFamily: FONT,
				fontWeight: 500,
				outlineWidth: 3,
				outlineColor: m.labelOutline,
				fontSettings: { sdf: true },
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
			new TextLayer({
				id: "road-labels",
				data: labels.road,
				visible: showLocal,
				getPosition: (d) => d.position,
				getText: (d) => d.text,
				getSize: 10,
				getColor: m.roadLabel,
				background: true,
				getBackgroundColor: m.roadLabelBg,
				backgroundPadding: [3, 1],
				characterSet: "auto",
				fontFamily: FONT,
				fontWeight: 700,
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme, getBackgroundColor: theme },
			}),
		],
		[
			assets,
			theme,
			m,
			townLines,
			countyLines,
			roads,
			network,
			labels,
			showDistricts,
			showLocal,
		],
	);
}

function BusMap({
	assets,
	theme,
	stopValues,
	scaleMax,
	trips,
	currentTime,
}: Props) {
	const { sampler } = assets;
	const pal = PALETTES[theme];
	const m = pal.map;
	// zoom quantised so React only re-renders when a detail tier could change
	const [zoom, setZoom] = useState(INITIAL_VIEW.zoom);
	const scenery = useSceneryLayers(assets, zoom, theme, pal);

	const stopsZ = useMemo(
		() =>
			assets.stops.map((s) => ({ stop: s, z: sampler.at(s.lon, s.lat) + 40 })),
		[assets.stops, sampler],
	);
	const showMinorStops = zoom >= ZOOM_MINOR_STOPS;
	const stopLabelData = useMemo(
		() =>
			showMinorStops
				? stopsZ
				: stopsZ.filter((d) => MAJOR_STOPS.has(d.stop.name)),
		[stopsZ, showMinorStops],
	);

	const columns = useMemo(() => {
		const k = COLUMN_MAX_HEIGHT / Math.max(scaleMax, 1);
		return stopsZ.flatMap(({ stop, z }) => {
			const v = stopValues.get(stop.name) ?? { boardings: 0, alightings: 0 };
			return [
				{
					stop,
					kind: "boardings" as const,
					position: [stop.lon - COLUMN_OFFSET / 2, stop.lat, z] as [
						number,
						number,
						number,
					],
					height: v.boardings * k,
				},
				{
					stop,
					kind: "alightings" as const,
					position: [stop.lon + COLUMN_OFFSET / 2, stop.lat, z] as [
						number,
						number,
						number,
					],
					height: v.alightings * k,
				},
			];
		});
	}, [stopsZ, stopValues, scaleMax]);

	// Riders currently on board, clustered into "bus" bubbles (riders sharing a position).
	const buses = useMemo(() => {
		if (!trips) return [];
		const t = currentTime;
		const groups = new Map<
			string,
			{ position: [number, number, number]; riders: number }
		>();
		for (const trip of trips) {
			const ts = trip.timestamps;
			if (t < ts[0] || t >= ts[ts.length - 1]) continue;
			let lo = 0;
			let hi = ts.length - 1;
			while (hi - lo > 1) {
				const mid = (lo + hi) >> 1;
				if (ts[mid] <= t) lo = mid;
				else hi = mid;
			}
			const f = ts[hi] > ts[lo] ? (t - ts[lo]) / (ts[hi] - ts[lo]) : 0;
			const a = trip.path[lo];
			const b = trip.path[hi];
			const p: [number, number, number] = [
				a[0] + (b[0] - a[0]) * f,
				a[1] + (b[1] - a[1]) * f,
				a[2] + (b[2] - a[2]) * f + 40,
			];
			const key = `${Math.round(p[0] / 0.004)}:${Math.round(p[1] / 0.004)}`;
			const g = groups.get(key);
			if (g) g.riders++;
			else groups.set(key, { position: p, riders: 1 });
		}
		return [...groups.values()];
	}, [trips, currentTime]);

	const layers = [
		...scenery,
		trips &&
			new TripsLayer<AnimatedTrip>({
				id: "trips",
				data: trips,
				getPath: (d) => d.path,
				getTimestamps: (d) => d.timestamps,
				getColor: m.rider,
				currentTime,
				trailLength: 900,
				fadeTrail: true,
				widthMinPixels: 2,
				getWidth: 2.5,
				widthUnits: "pixels",
				opacity: 0.85,
				parameters: NO_DEPTH,
				updateTriggers: { getColor: theme },
			}),
		new ColumnLayer({
			id: "stop-columns",
			data: columns,
			diskResolution: 16,
			radius: 260,
			extruded: true,
			getPosition: (d) => d.position,
			getElevation: (d) => d.height,
			getFillColor: (d) =>
				d.kind === "boardings" ? m.boardings : m.alightings,
			material: COLUMN_MATERIAL,
			pickable: true,
			autoHighlight: true,
			highlightColor: [255, 255, 255, 90],
			// smooth growth while stepping through days; per-frame in day replay
			transitions: trips ? undefined : { getElevation: 250 },
			updateTriggers: { getFillColor: theme },
		}),
		trips &&
			new ScatterplotLayer({
				id: "buses",
				data: buses,
				getPosition: (d) => d.position,
				getRadius: (d) => 4 + Math.sqrt(d.riders) * 2.2,
				radiusUnits: "pixels",
				getFillColor: m.rider,
				getLineColor: m.riderStroke,
				stroked: true,
				lineWidthUnits: "pixels",
				getLineWidth: 1.5,
				opacity: 0.9,
				parameters: NO_DEPTH,
				updateTriggers: { getFillColor: theme, getLineColor: theme },
			}),
		new ScatterplotLayer({
			id: "stop-dots",
			data: stopsZ,
			getPosition: (d) => [d.stop.lon, d.stop.lat, d.z],
			getRadius: 5,
			radiusUnits: "pixels",
			getFillColor: m.stopDot,
			getLineColor: m.stopStroke,
			lineWidthUnits: "pixels",
			getLineWidth: 2,
			stroked: true,
			parameters: NO_DEPTH,
			updateTriggers: { getFillColor: theme, getLineColor: theme },
		}),
		new TextLayer({
			id: "stop-labels",
			data: stopLabelData,
			getPosition: (d) => [d.stop.lon, d.stop.lat, d.z],
			getText: (d) => d.stop.name,
			getSize: 13,
			getColor: m.label,
			getPixelOffset: [0, 16],
			getTextAnchor: "middle",
			getAlignmentBaseline: "top",
			characterSet: "auto",
			fontFamily: FONT,
			fontWeight: 700,
			outlineWidth: 3,
			outlineColor: m.labelOutline,
			fontSettings: { sdf: true },
			parameters: NO_DEPTH,
			updateTriggers: { getColor: theme },
		}),
	];

	return (
		<DeckGL
			initialViewState={INITIAL_VIEW}
			onViewStateChange={({ viewState }) => {
				const z = Math.round((viewState as MapViewState).zoom * 10) / 10;
				if (z !== zoom) setZoom(z);
			}}
			controller={CONTROLLER}
			layers={layers}
			effects={EFFECTS}
			useDevicePixels={PIXEL_RATIO}
			getTooltip={({ object }) => {
				if (!object || !("kind" in object)) return null;
				const s = object.stop as Stop;
				const v = stopValues.get(s.name) ?? { boardings: 0, alightings: 0 };
				const { muted, ...style } = pal.tooltip;
				return {
					html: `<div style="font-weight:700;margin-bottom:4px">${s.name}</div>
            <div style="color:${muted};font-size:11px;margin-bottom:6px">${s.officialName}</div>
            <div>上車 Boardings <b>${v.boardings.toLocaleString()}</b></div>
            <div>下車 Alightings <b>${v.alightings.toLocaleString()}</b></div>`,
					style: {
						...style,
						borderRadius: "8px",
						padding: "10px 12px",
						fontSize: "12px",
						fontFamily: 'Manrope, "Noto Sans TC", sans-serif',
					},
				};
			}}
		/>
	);
}

export default memo(BusMap);
