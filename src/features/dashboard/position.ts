import type { GeoAssets } from "#/lib/geo";
import type { Run } from "./replay";

type P3 = [number, number, number];
type Seg = { path: P3[]; frac: number[]; meters: number };

const ROAD_FACTOR = 1.3; // straight line → road, only when no OSRM path exists

function haversine(a: [number, number], b: [number, number]) {
	const R = 6371000;
	const k = Math.PI / 180;
	const s =
		Math.sin(((b[1] - a[1]) * k) / 2) ** 2 +
		Math.cos(a[1] * k) *
			Math.cos(b[1] * k) *
			Math.sin(((b[0] - a[0]) * k) / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * 公車位置（回放用，代替日後的車機定位）：在同一班次相鄰兩個刷卡站之間，
 * 依兩站刷卡時間，沿 OSRM 道路路徑等速內插。
 */
export function makeGeo(assets: GeoAssets, stops: [number, string][]) {
	const byOrder = new Map(
		stops.map(([o, n]) => [o, assets.stopByName.get(n)] as const),
	);
	const segs = new Map<string, Seg>();
	const anchors = new WeakMap<Run, { t: number; stop: number }[]>();

	const point = (o: number): P3 => {
		const s = byOrder.get(o);
		if (!s) return [0, 0, 0];
		return [s.lon, s.lat, assets.sampler.at(s.lon, s.lat) + 60];
	};

	function seg(a: number, b: number): Seg {
		const key = `${a}|${b}`;
		const hit = segs.get(key);
		if (hit) return hit;
		const A = byOrder.get(a);
		const B = byOrder.get(b);
		const pair = A && B ? assets.routes[`${A.name}|${B.name}`] : undefined;
		const coords: [number, number][] =
			pair && pair.coords.length >= 2
				? pair.coords
				: [
						[A?.lon ?? 0, A?.lat ?? 0],
						[B?.lon ?? 0, B?.lat ?? 0],
					];
		const cum = [0];
		for (let i = 1; i < coords.length; i++)
			cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
		const total = cum[cum.length - 1] || 1;
		const out: Seg = {
			path: assets.sampler.drape(coords, 60),
			frac: cum.map((c) => c / total),
			meters: pair ? pair.distance : total * ROAD_FACTOR,
		};
		segs.set(key, out);
		return out;
	}

	/** taps kept only while they move monotonically in the run's direction */
	function runAnchors(run: Run) {
		const cached = anchors.get(run);
		if (cached) return cached;
		const ev = run.events;
		const dir =
			run.dir || Math.sign((ev[ev.length - 1]?.stop ?? 0) - (ev[0]?.stop ?? 0));
		const out: { t: number; stop: number }[] = [];
		for (const e of ev) {
			const prev = out[out.length - 1];
			if (!prev || (e.stop - prev.stop) * dir >= 0) out.push(e);
		}
		anchors.set(run, out);
		return out;
	}

	function position(run: Run, t: number): P3 | null {
		const a = runAnchors(run);
		if (a.length === 0 || t < a[0].t) return null;
		let i = 0;
		while (i + 1 < a.length && a[i + 1].t <= t) i++;
		const p = a[i];
		const q = a[i + 1];
		if (!q || q.stop === p.stop || q.t <= p.t) return point(p.stop);
		const s = seg(p.stop, q.stop);
		const f = (t - p.t) / (q.t - p.t);
		let k = 1;
		while (k < s.frac.length - 1 && s.frac[k] < f) k++;
		const f0 = s.frac[k - 1];
		const g = s.frac[k] > f0 ? (f - f0) / (s.frac[k] - f0) : 0;
		const u = s.path[k - 1];
		const v = s.path[k];
		return [
			u[0] + (v[0] - u[0]) * g,
			u[1] + (v[1] - u[1]) * g,
			u[2] + (v[2] - u[2]) * g + 30,
		];
	}

	return {
		point,
		position,
		dist: (a: number, b: number) => (a === b ? 0 : seg(a, b).meters),
	};
}

export type Geo = ReturnType<typeof makeGeo>;
