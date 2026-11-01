/** Client-side loaders for the static, pre-processed official geo assets in /public/geo. */

export type Stop = {
	id: string;
	name: string; // fare-stage name used in the trip data
	officialName: string;
	lat: number;
	lon: number;
	elevation: number;
	seq: number;
};

export type TerrainMeta = {
	bounds: [number, number, number, number]; // west, south, east, north
	width: number;
	height: number;
	minElevation: number;
	maxElevation: number;
	/** lighter Terrarium PNG for the terrain mesh (optional) */
	elevationSmall?: string;
	/** stylized texture files */
	texture?: string;
	textureLight?: string;
	/** raw Int16 heightmap used for the mesh and for draping */
	heightmap?: { file: string; width: number; height: number };
};

export type RoadClass =
	| "freeway"
	| "expressway"
	| "provincial"
	| "county"
	| "local";
export type Road = { cls: RoadClass; path: [number, number][] };
export type DistrictLabel = {
	town: string;
	county: string;
	lon: number;
	lat: number;
	area_km2?: number;
};
export type CountyLabel = { county: string; lon: number; lat: number };
export type RoadLabel = { name: string; lon: number; lat: number; cls: string };

export type RoutePair = { coords: [number, number][]; distance: number };

export type GeoAssets = {
	stops: Stop[];
	stopByName: Map<string, Stop>;
	terrain: TerrainMeta;
	townships: GeoJSON.FeatureCollection;
	routes: Record<string, RoutePair>;
	network: GeoJSON.FeatureCollection;
	sampler: ElevationSampler;
	mesh: TerrainMesh;
	textureUrl: { dark: string; light: string };
	roads: Road[];
	roadLabels: RoadLabel[];
	counties: GeoJSON.FeatureCollection | null;
	districtLabels: DistrictLabel[];
	countyLabels: CountyLabel[];
};

/** Vertical exaggeration so hills read at regional scale. */
export const EXAGGERATION = 1.6;

export class ElevationSampler {
	constructor(
		private data: Float32Array,
		private meta: TerrainMeta,
	) {}

	get grid() {
		return this.meta;
	}

	/** Raw (unexaggerated) elevation at grid index. */
	raw(i: number): number {
		return this.data[i];
	}

	/** Exaggerated elevation (m) at lon/lat, bilinear-interpolated. */
	at(lon: number, lat: number): number {
		const { bounds, width, height } = this.meta;
		const [w, s, e, n] = bounds;
		const x = ((lon - w) / (e - w)) * (width - 1);
		const y = ((n - lat) / (n - s)) * (height - 1);
		if (x < 0 || y < 0 || x > width - 1 || y > height - 1) return 0;
		const x0 = Math.floor(x);
		const y0 = Math.floor(y);
		const x1 = Math.min(x0 + 1, width - 1);
		const y1 = Math.min(y0 + 1, height - 1);
		const fx = x - x0;
		const fy = y - y0;
		const d = this.data;
		const top = d[y0 * width + x0] * (1 - fx) + d[y0 * width + x1] * fx;
		const bot = d[y1 * width + x0] * (1 - fx) + d[y1 * width + x1] * fx;
		return (top * (1 - fy) + bot * fy) * EXAGGERATION;
	}

	/** Drape a lon/lat path onto the terrain, lifted by `lift` meters. */
	drape(coords: [number, number][], lift = 20): [number, number, number][] {
		return coords.map(([lon, lat]) => [lon, lat, this.at(lon, lat) + lift]);
	}
}

/**
 * Load the raw Int16 heightmap. Deliberately avoids canvas `getImageData`: privacy-hardened
 * browsers (Brave, Helium, …) add noise to canvas reads, which turns Terrarium-encoded PNG
 * heights into ±256 m spikes.
 */
async function loadSampler(meta: TerrainMeta): Promise<ElevationSampler> {
	const hm = meta.heightmap;
	if (!hm) throw new Error("terrain.json has no heightmap entry");
	const res = await fetch(`/geo/${hm.file}`);
	if (!res.ok) throw new Error(`/geo/${hm.file}: ${res.status}`);
	const buf = await res.arrayBuffer();
	const view = new DataView(buf);
	const out = new Float32Array(hm.width * hm.height);
	for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true);
	return new ElevationSampler(out, {
		...meta,
		width: hm.width,
		height: hm.height,
	});
}

export type TerrainMesh = {
	attributes: {
		POSITION: { value: Float32Array; size: 3 };
		TEXCOORD_0: { value: Float32Array; size: 2 };
	};
	indices: { value: Uint32Array; size: 1 };
};

/** Regular-grid terrain mesh in lon/lat/metres (exaggerated), textured across the bounds. */
export function buildTerrainMesh(sampler: ElevationSampler): TerrainMesh {
	const { width: w, height: h, bounds } = sampler.grid;
	const [west, south, east, north] = bounds;
	const pos = new Float32Array(w * h * 3);
	const uv = new Float32Array(w * h * 2);
	for (let y = 0; y < h; y++) {
		const v = y / (h - 1);
		const lat = north - v * (north - south);
		for (let x = 0; x < w; x++) {
			const u = x / (w - 1);
			const i = y * w + x;
			pos[i * 3] = west + u * (east - west);
			pos[i * 3 + 1] = lat;
			pos[i * 3 + 2] = sampler.raw(i) * EXAGGERATION;
			uv[i * 2] = u;
			uv[i * 2 + 1] = v;
		}
	}
	const idx = new Uint32Array((w - 1) * (h - 1) * 6);
	let k = 0;
	for (let y = 0; y < h - 1; y++) {
		for (let x = 0; x < w - 1; x++) {
			const a = y * w + x;
			const b = a + 1;
			const c = a + w;
			const d = c + 1;
			idx[k++] = a;
			idx[k++] = c;
			idx[k++] = b;
			idx[k++] = b;
			idx[k++] = c;
			idx[k++] = d;
		}
	}
	return {
		attributes: {
			POSITION: { value: pos, size: 3 },
			TEXCOORD_0: { value: uv, size: 2 },
		},
		indices: { value: idx, size: 1 },
	};
}

const json = <T>(url: string): Promise<T> =>
	fetch(url).then((r) => {
		if (!r.ok) throw new Error(`${url}: ${r.status}`);
		return r.json() as Promise<T>;
	});

/** Optional asset: resolves to `fallback` when missing (e.g. not generated yet). */
const optional = <T>(url: string, fallback: T): Promise<T> =>
	json<T>(url).catch(() => fallback);

export async function loadGeoAssets(): Promise<GeoAssets> {
	const [stops, terrain, townships, routes, network] = await Promise.all([
		json<Stop[]>("/geo/stops.json"),
		json<TerrainMeta>("/geo/terrain.json"),
		json<GeoJSON.FeatureCollection>("/geo/townships.geojson"),
		json<{ pairs: Record<string, RoutePair> }>("/geo/routes.json"),
		json<GeoJSON.FeatureCollection>("/geo/route-network.geojson"),
	]);
	const dark = `/geo/${terrain.texture ?? "terrain-texture.png"}`;
	const textureUrl = {
		dark,
		light: terrain.textureLight ? `/geo/${terrain.textureLight}` : dark,
	};
	const [
		sampler,
		roadsRaw,
		roadLabels,
		counties,
		districtLabels,
		countyLabels,
	] = await Promise.all([
		loadSampler(terrain),
		optional<{
			classes: RoadClass[];
			lines: [number, [number, number][]][];
		} | null>("/geo/roads.json", null),
		optional<RoadLabel[]>("/geo/road-labels.json", []),
		optional<GeoJSON.FeatureCollection | null>("/geo/counties.geojson", null),
		optional<DistrictLabel[]>("/geo/district-labels.json", []),
		optional<CountyLabel[]>("/geo/county-labels.json", []),
	]);
	const roads: Road[] = roadsRaw
		? roadsRaw.lines.map(([c, path]) => ({ cls: roadsRaw.classes[c], path }))
		: [];
	return {
		stops: [...stops].sort((a, b) => a.seq - b.seq),
		stopByName: new Map(stops.map((s) => [s.name, s])),
		terrain,
		townships,
		routes: routes.pairs,
		network,
		sampler,
		mesh: buildTerrainMesh(sampler),
		textureUrl,
		roads,
		roadLabels,
		counties,
		districtLabels,
		countyLabels,
	};
}

/** Flatten (Multi)Polygon / (Multi)LineString features into plain rings/lines. */
export function featureLines(fc: GeoJSON.FeatureCollection): {
	coords: [number, number][];
	props: Record<string, unknown>;
}[] {
	const out: { coords: [number, number][]; props: Record<string, unknown> }[] =
		[];
	for (const f of fc.features) {
		const g = f.geometry;
		const props = (f.properties ?? {}) as Record<string, unknown>;
		const push = (c: GeoJSON.Position[]) => {
			out.push({ coords: c as [number, number][], props });
		};
		if (g.type === "Polygon") for (const r of g.coordinates) push(r);
		else if (g.type === "MultiPolygon")
			for (const p of g.coordinates) for (const r of p) push(r);
		else if (g.type === "LineString") push(g.coordinates);
		else if (g.type === "MultiLineString")
			for (const l of g.coordinates) push(l);
	}
	return out;
}
