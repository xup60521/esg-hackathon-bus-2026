import { ColumnLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import BusMap from "#/components/BusMap";
import type { Run, SeatStatus } from "#/features/dashboard/replay";
import type { GeoAssets } from "#/lib/geo";
import { PALETTES, type Theme } from "#/lib/palette";
import { DIR_LABEL, STATUS } from "./status";

type P3 = [number, number, number];
type RGBA = [number, number, number, number];

export type StopMark = {
	name: string;
	position: P3;
	selected: boolean;
	/** terminals and a few key mid stops always carry a label */
	major: boolean;
	/** next-bus ETA in the current direction, e.g. "2 分" */
	badge: string | null;
};

export type BusDot = {
	run: Run;
	position: P3;
	load: number;
	status: SeatStatus;
	dir: number;
	/** heading to the selected stop */
	focus: boolean;
	/** has a pending dispatch alert */
	alerted: boolean;
};

const rgba = (hex: string, a = 255): RGBA => [
	Number.parseInt(hex.slice(1, 3), 16),
	Number.parseInt(hex.slice(3, 5), 16),
	Number.parseInt(hex.slice(5, 7), 16),
	a,
];
const ACCENT: Record<Theme, string> = { light: "#b35c00", dark: "#ffcd6e" };
const SURFACE: Record<Theme, RGBA> = {
	light: [255, 255, 255, 255],
	dark: [16, 20, 28, 255],
};
const NO_DEPTH = { depthCompare: "always" } as const;
const FONT = '"Noto Sans TC", Manrope, sans-serif';
const EMPTY = new Map();
const PILLAR_M = 1100; // stop pillar height above terrain (exaggerated scene)
const PILLAR_SELECTED_M = 2400;
const PILLAR_MATERIAL = { ambient: 0.55, diffuse: 0.75, shininess: 24 };
const pillarTop = (d: StopMark): P3 => [
	d.position[0],
	d.position[1],
	d.position[2] + (d.selected ? PILLAR_SELECTED_M : PILLAR_M),
];
// frames the route in the gap between the side panels
const VIEW = {
	longitude: 120.77,
	latitude: 24.0,
	zoom: 9.75,
	pitch: 50,
	bearing: 12,
};

export default function DashboardMap({
	assets,
	theme,
	buses,
	stops,
	onStopClick,
}: {
	assets: GeoAssets;
	theme: Theme;
	buses: BusDot[];
	stops: StopMark[];
	onStopClick: (name: string) => void;
}) {
	const accent = rgba(ACCENT[theme]);
	const pal = PALETTES[theme].map;
	const selectedStops = stops.filter((d) => d.selected);
	const overlays = [
		// ground ring under each stop so its footprint reads at any pitch
		new ScatterplotLayer<StopMark>({
			id: "stop-base",
			data: stops,
			getPosition: (d) => d.position,
			getRadius: (d) => (d.selected ? 14 : 8),
			radiusUnits: "pixels",
			getFillColor: (d) => (d.selected ? accent : pal.route),
			getLineColor: SURFACE[theme],
			stroked: true,
			lineWidthUnits: "pixels",
			getLineWidth: 2,
			parameters: NO_DEPTH,
			updateTriggers: {
				getFillColor: [theme, selectedStops[0]?.name],
				getRadius: selectedStops[0]?.name,
			},
		}),
		new ColumnLayer<StopMark>({
			id: "stop-pillar",
			data: stops,
			diskResolution: 12,
			radius: 320,
			extruded: true,
			getPosition: (d) => d.position,
			getElevation: (d) => (d.selected ? PILLAR_SELECTED_M : PILLAR_M),
			getFillColor: (d) => (d.selected ? accent : pal.route),
			material: PILLAR_MATERIAL,
			pickable: true,
			autoHighlight: true,
			highlightColor: [255, 255, 255, 110],
			onClick: ({ object }) => object && onStopClick(object.name),
			updateTriggers: {
				getFillColor: [theme, selectedStops[0]?.name],
				getElevation: selectedStops[0]?.name,
			},
		}),
		new ScatterplotLayer<StopMark>({
			id: "stop-cap",
			data: stops,
			getPosition: pillarTop,
			getRadius: (d) => (d.selected ? 7 : 5),
			radiusUnits: "pixels",
			getFillColor: SURFACE[theme],
			getLineColor: (d) => (d.selected ? accent : pal.route),
			stroked: true,
			lineWidthUnits: "pixels",
			getLineWidth: 2.5,
			pickable: true,
			onClick: ({ object }) => object && onStopClick(object.name),
			parameters: NO_DEPTH,
			updateTriggers: {
				getFillColor: theme,
				getLineColor: [theme, selectedStops[0]?.name],
				getPosition: selectedStops[0]?.name,
				getRadius: selectedStops[0]?.name,
			},
		}),
		// sign-style labels on the selected stop and the terminals / major stops; the rest show on hover
		new TextLayer<StopMark>({
			id: "stop-sign",
			data: stops.filter((d) => d.selected || d.major),
			getPosition: pillarTop,
			getText: (d) => (d.badge ? `${d.name}  ${d.badge}` : d.name),
			getSize: (d) => (d.selected ? 15 : 13),
			getColor: (d) => (d.selected ? rgba("#ffffff") : pal.label),
			background: true,
			getBackgroundColor: (d) =>
				d.selected
					? accent
					: [SURFACE[theme][0], SURFACE[theme][1], SURFACE[theme][2], 235],
			getBorderColor: (d) => (d.selected ? accent : pal.route),
			getBorderWidth: 1.5,
			backgroundPadding: [6, 3],
			getPixelOffset: [0, -10],
			getTextAnchor: "middle",
			getAlignmentBaseline: "bottom",
			characterSet: "auto",
			fontFamily: FONT,
			fontWeight: 700,
			pickable: true,
			onClick: ({ object }) => object && onStopClick(object.name),
			parameters: NO_DEPTH,
			updateTriggers: {
				getText: stops.map((d) => d.badge).join(),
				getColor: [theme, selectedStops[0]?.name],
				getBackgroundColor: [theme, selectedStops[0]?.name],
				getBorderColor: [theme, selectedStops[0]?.name],
				getSize: selectedStops[0]?.name,
				getPosition: selectedStops[0]?.name,
			},
		}),
		new ScatterplotLayer<BusDot>({
			id: "bus-ring",
			data: buses.filter((b) => b.focus || b.alerted),
			getPosition: (d) => d.position,
			getRadius: 16,
			radiusUnits: "pixels",
			filled: false,
			stroked: true,
			getLineColor: accent,
			lineWidthUnits: "pixels",
			getLineWidth: (d) => (d.alerted ? 3.5 : 2),
			parameters: NO_DEPTH,
		}),
		new ScatterplotLayer<BusDot>({
			id: "bus",
			data: buses,
			getPosition: (d) => d.position,
			getRadius: 11,
			radiusUnits: "pixels",
			getFillColor: (d) => rgba(STATUS[d.status].color),
			getLineColor: SURFACE[theme],
			stroked: true,
			lineWidthUnits: "pixels",
			getLineWidth: 2,
			pickable: true,
			parameters: NO_DEPTH,
			updateTriggers: { getLineColor: theme },
		}),
		new TextLayer<BusDot>({
			id: "bus-load",
			data: buses,
			getPosition: (d) => d.position,
			getText: (d) => String(d.load),
			getSize: 11,
			getColor: (d) => rgba(STATUS[d.status].ink),
			fontFamily: FONT,
			fontWeight: 700,
			getTextAnchor: "middle",
			getAlignmentBaseline: "center",
			parameters: NO_DEPTH,
		}),
	];

	return (
		<BusMap
			assets={assets}
			theme={theme}
			stopValues={EMPTY}
			scaleMax={1}
			trips={null}
			currentTime={0}
			overlays={overlays}
			onStopClick={onStopClick}
			initialView={VIEW}
			hideStops
			overlayTooltip={(o) => {
				if (o && typeof o === "object" && "badge" in o) {
					const m = o as StopMark;
					return `<b>${m.name}</b>${m.badge ? `・下一班 ${m.badge}` : ""}<div>點選查看站牌</div>`;
				}
				if (!o || typeof o !== "object" || !("run" in o)) return null;
				const b = o as BusDot;
				return `<b>${b.run.sub} ${DIR_LABEL[b.dir]}</b>（車號 ${b.run.vehicle}）
					<div>推估車上 <b>${b.load}</b> 人・${STATUS[b.status].label}</div>`;
			}}
		/>
	);
}
