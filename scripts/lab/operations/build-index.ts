/**
 * Scan what each research direction has actually delivered and publish a small index for /lab.
 * Re-run whenever a direction lands new files:
 *
 *   bun scripts/lab/operations/build-index.ts
 *
 * It only reads folder names, file sizes, report titles and the "摘要" paragraph. It does not judge
 * correctness: "已提交" means files exist, not that they passed review.
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { DIRECTIONS } from "../../../src/features/lab/operations/directions";

const sub = (root: string) =>
	existsSync(root) ? readdirSync(root).filter((n) => statSync(`${root}/${n}`).isDirectory()) : [];
const known = new Set(DIRECTIONS.flatMap((d) => [d.slug, ...(d.aliases ?? [])]));
const found = new Set(["docs/lab", "scripts/lab", "public/data/lab", "src/features/lab"].flatMap(sub));
const unmapped = [...found].filter((s) => !known.has(s)).sort();

function files(dir: string) {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((n) => statSync(`${dir}/${n}`).isFile())
		.map((n) => ({ name: n, bytes: statSync(`${dir}/${n}`).size }));
}

/** First paragraph under a "## 摘要" heading (or "## Summary"), flattened and clipped. */
function excerpt(md: string) {
	const m = md.match(/^##\s*(?:摘要|Summary)\s*\n+([\s\S]*?)(?=\n##\s|$)/m);
	if (!m) return null;
	const para = m[1].trim().split(/\n\s*\n/)[0].replace(/\s+/g, " ");
	return para.length > 260 ? `${para.slice(0, 258)}…` : para;
}

const items = DIRECTIONS.map((d) => {
	const names = [d.slug, ...(d.aliases ?? [])];
	const slug = names.find((n) => found.has(n)) ?? d.slug;
	const docsDir = `docs/lab/${slug}`;
	const reportPath = `${docsDir}/report.zh-TW.md`;
	const hasReport = existsSync(reportPath);
	const md = hasReport ? readFileSync(reportPath, "utf8") : "";
	const data = files(`public/data/lab/${slug}`);
	const scripts = sub("scripts/lab").includes(slug) ? files(`scripts/lab/${slug}`).length : 0;
	const feature = existsSync(`src/features/lab/${slug}`) ? files(`src/features/lab/${slug}`).length : 0;
	const status = d.blocked
		? "blocked"
		: hasReport && data.length > 0
			? "ready"
			: hasReport || data.length > 0 || scripts > 0 || feature > 0
				? "partial"
				: "pending";
	return {
		n: d.n,
		slug,
		status,
		blocked: d.blocked ?? null,
		report: hasReport ? reportPath : null,
		title: hasReport && !d.hold ? (md.match(/^#\s+(.+)$/m)?.[1] ?? null) : null,
		// a held direction must not leak its withdrawn report text into the hub
		excerpt: hasReport && !d.hold ? excerpt(md) : null,
		hold: d.hold ?? null,
		dataFiles: data,
		scriptFiles: scripts,
		featureFiles: feature,
		reportUpdated: hasReport ? statSync(reportPath).mtime.toISOString() : null,
	};
});

writeFileSync(
	"public/data/lab/operations/directions.json",
	`${JSON.stringify({ generatedAt: new Date().toISOString(), unmappedFolders: unmapped, items }, null, 1)}\n`,
);
for (const i of items)
	console.log(`${String(i.n).padStart(2)} ${i.slug.padEnd(14)} ${i.status.padEnd(8)} report=${i.report ? "yes" : "no "} data=${i.dataFiles.length}`);
if (unmapped.length) console.log("unmapped folders:", unmapped.join(", "));
