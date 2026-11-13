/**
 * Light & dark palettes. Categorical sub-route colours are the dataviz reference steps,
 * validated with the six-checks script (light vs #ffffff, dark vs #10141c). Light slots
 * aqua/yellow/magenta sit below 3:1 → relieved by the per-sub-route value list in the side panel.
 */
type RGBA = [number, number, number, number];

export type Theme = "light" | "dark";

export const SUBROUTES = [
	"6670A",
	"6670B",
	"6670D",
	"6670E",
	"6670F",
	"6670H",
] as const;

/** Derived from the stops each sub-route actually serves in the 2024–2025 card data. */
export const SUBROUTE_LABELS: Record<string, string> = {
	"6670A": "A · 經埔里站、九族文化村",
	"6670B": "B · 經暨大校內（不停埔里站）",
	"6670D": "D · 經埔里站",
	"6670E": "E · 台中航空站發車",
	"6670F": "F · 延駛水社、向山",
	"6670H": "H · 臺中⇄埔里站",
};

export type RoadClassKey =
	| "freeway"
	| "expressway"
	| "provincial"
	| "county"
	| "local";

export type ThemePalette = {
	/** Fixed categorical order — colour follows the sub-route, never its rank. */
	subroutes: Record<string, string>;
	boardingHex: string;
	alightingHex: string;
	/** third categorical slot, used for middle-stop boardings in the analysis page */
	middleHex: string;
	riderHex: string;
	chartSurface: string;
	map: {
		boundary: RGBA;
		countyBoundary: RGBA;
		route: RGBA;
		routeGlow: RGBA;
		rider: RGBA;
		riderStroke: RGBA;
		boardings: RGBA;
		alightings: RGBA;
		stopDot: RGBA;
		stopStroke: RGBA;
		label: RGBA;
		labelOutline: RGBA;
		countyLabel: RGBA;
		districtLabel: RGBA;
		roadLabel: RGBA;
		roadLabelBg: RGBA;
		roads: Record<RoadClassKey, RGBA>;
	};
	tooltip: Record<string, string>;
};

const hex = (h: string, a = 255): RGBA => [
	Number.parseInt(h.slice(1, 3), 16),
	Number.parseInt(h.slice(3, 5), 16),
	Number.parseInt(h.slice(5, 7), 16),
	a,
];

export const PALETTES: Record<Theme, ThemePalette> = {
	light: {
		subroutes: {
			"6670A": "#2a78d6",
			"6670B": "#eb6834",
			"6670D": "#1baf7a",
			"6670E": "#eda100",
			"6670F": "#e87ba4",
			"6670H": "#008300",
		},
		boardingHex: "#2a78d6",
		alightingHex: "#eb6834",
		middleHex: "#1baf7a",
		riderHex: "#d97300",
		chartSurface: "#ffffff",
		map: {
			boundary: [70, 80, 95, 70],
			countyBoundary: [55, 64, 80, 160],
			route: hex("#1c5cab"),
			routeGlow: hex("#3987e5", 60),
			rider: hex("#e68000"),
			riderStroke: [255, 255, 255, 255],
			boardings: hex("#2a78d6", 240),
			alightings: hex("#eb6834", 240),
			stopDot: [255, 255, 255, 255],
			stopStroke: [30, 36, 48, 255],
			label: [24, 28, 38, 255],
			labelOutline: [255, 255, 255, 235],
			countyLabel: [40, 46, 58, 225],
			districtLabel: [72, 80, 96, 235],
			roadLabel: [255, 255, 255, 255],
			roadLabelBg: [96, 102, 114, 230],
			roads: {
				local: [100, 105, 115, 60],
				county: [100, 106, 118, 95],
				provincial: [110, 104, 98, 135],
				expressway: [128, 112, 92, 155],
				freeway: [140, 112, 82, 180],
			},
		},
		tooltip: {
			background: "rgba(255,255,255,0.97)",
			color: "#1c1f26",
			border: "1px solid rgba(20,24,32,0.12)",
			boxShadow: "0 8px 24px rgba(20,24,32,0.12)",
			muted: "#5f6470",
		},
	},
	dark: {
		subroutes: {
			"6670A": "#3987e5",
			"6670B": "#d95926",
			"6670D": "#199e70",
			"6670E": "#c98500",
			"6670F": "#d55181",
			"6670H": "#008300",
		},
		boardingHex: "#3987e5",
		alightingHex: "#d95926",
		middleHex: "#199e70",
		riderHex: "#ffcd6e",
		chartSurface: "#10141c",
		map: {
			boundary: [200, 214, 230, 70],
			countyBoundary: [225, 232, 242, 150],
			route: [125, 212, 255, 255],
			routeGlow: [70, 160, 255, 70],
			rider: [255, 205, 110, 255],
			riderStroke: [255, 245, 220, 255],
			boardings: [57, 135, 229, 235],
			alightings: [217, 89, 38, 235],
			stopDot: [240, 239, 236, 255],
			stopStroke: [16, 20, 28, 255],
			label: [240, 239, 236, 255],
			labelOutline: [8, 12, 20, 230],
			countyLabel: [240, 239, 236, 210],
			districtLabel: [205, 212, 222, 225],
			roadLabel: [20, 24, 32, 255],
			roadLabelBg: [236, 230, 218, 220],
			roads: {
				local: [190, 200, 215, 55],
				county: [200, 208, 220, 80],
				provincial: [222, 226, 232, 105],
				expressway: [236, 230, 218, 120],
				freeway: [240, 234, 222, 140],
			},
		},
		tooltip: {
			background: "rgba(14,18,27,0.96)",
			color: "#f0efec",
			border: "1px solid rgba(255,255,255,0.12)",
			boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
			muted: "#c3c2b7",
		},
	},
};

export const THEME_KEY = "bus6670-theme";

/** Palette-driven CSS variables (sub-route colours etc.); neutral UI tokens live in styles.css. */
export function themeVars(theme: Theme): React.CSSProperties {
	const p = PALETTES[theme];
	const vars: Record<string, string> = {
		"--boarding": p.boardingHex,
		"--alighting": p.alightingHex,
		"--middle": p.middleHex,
		"--rider": p.riderHex,
		"--chart-surface": p.chartSurface,
	};
	for (const [k, v] of Object.entries(p.subroutes)) vars[`--s-${k}`] = v;
	return vars as React.CSSProperties;
}
