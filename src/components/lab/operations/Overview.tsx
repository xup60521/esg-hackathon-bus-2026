import { Link, useRouter } from "@tanstack/react-router";
import { ArrowRight, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import {
	DIRECTIONS,
	type Direction,
} from "#/features/lab/operations/directions";
import {
	Chip,
	FreshnessBanner,
	KindBadge,
	Section,
	type Status,
	StatusPill,
} from "../shared";
import { KIND_META } from "../shared/tokens";
import { VIEWS } from "./views";

type IndexItem = {
	n: number;
	slug: string;
	status: Status;
	report: string | null;
	hold: string | null;
	title: string | null;
	excerpt: string | null;
	dataFiles: { name: string; bytes: number }[];
	reportUpdated: string | null;
};
type Index = {
	generatedAt: string;
	unmappedFolders: string[];
	items: IndexItem[];
};

const DATA_THROUGH = "2025-12-31";

export default function Overview() {
	const router = useRouter();
	const routes = Object.keys(router.routesByPath);
	const [index, setIndex] = useState<Index | null>(null);
	const [error, setError] = useState<string | null>(null);
	useEffect(() => {
		fetch("/data/lab/operations/directions.json")
			.then((r) => {
				if (!r.ok) throw new Error(`directions.json: HTTP ${r.status}`);
				return r.json() as Promise<Index>;
			})
			.then(setIndex, (e: Error) => setError(e.message));
	}, []);

	const submitted = index?.items.filter(
		(i) => i.status === "ready" && !i.hold,
	).length;

	return (
		<>
			<header className="mt-6">
				<div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent)]">
					6670 台灣好行日月潭線 · 研究實驗室
				</div>
				<h1 className="mt-1 text-2xl font-bold">十個應用方向的研究與原型</h1>
				<p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-[var(--fg2)]">
					每個方向都以 2024–2025
					年的電子票證彙總或明示的情境假設做原型，並標出資料種類、來源與限制。
					刷卡只記錄成功搭上車的人，不能當成完整需求、候車或拒載；這裡沒有任何即時資料。
				</p>
			</header>

			<div className="mt-4">
				<FreshnessBanner
					dataThrough={DATA_THROUGH}
					what="全案票證資料"
					note="所有方向都用同一份歷史資料；任何標為「現在」的畫面都是歷史回放或情境，不是現況。"
				/>
			</div>

			<Section
				className="mt-4"
				title="資料種類標籤"
				subtitle="每一頁、每個數字都屬於下列其中一種。看到標籤就知道能怎麼用、不能怎麼用。"
			>
				<dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
					{(Object.keys(KIND_META) as (keyof typeof KIND_META)[]).map((k) => (
						<div
							key={k}
							className="flex items-start gap-2 text-xs leading-relaxed"
						>
							<dt className="shrink-0">
								<KindBadge kind={k} />
							</dt>
							<dd className="text-[var(--fg2)]">{KIND_META[k].hint}</dd>
						</div>
					))}
				</dl>
			</Section>

			<div className="mt-6 flex flex-wrap items-baseline gap-x-3">
				<h2 className="text-base font-semibold">十個方向</h2>
				<span className="text-xs text-[var(--muted)]">
					{error
						? `進度索引讀取失敗：${error}`
						: index
							? `${submitted} 個已提交成果；「已提交」只表示報告與資料已進入 repo，尚未代表通過驗證`
							: "讀取進度中…"}
				</span>
			</div>

			<ul className="mt-3 grid gap-3 md:grid-cols-2">
				{DIRECTIONS.map((d) => (
					<DirectionCard
						key={d.n}
						d={d}
						item={index?.items.find((i) => i.n === d.n)}
						loaded={index !== null}
						routes={routes}
					/>
				))}
			</ul>

			<Section
				className="mt-6"
				title="延伸提案原型：即時剩餘座位與預約專車"
				subtitle="國道不能站立，車滿時中途站的人上不了車也無從得知。以歷史刷卡回放站牌會顯示的座位狀態，並模擬只收預約、電腦分配的加開專車。"
				badges={
					<>
						<KindBadge kind="history" />
						<KindBadge kind="scenario" />
					</>
				}
			>
				<Link to="/lab" search={{ view: "seats" }} className="btn btn-active">
					開啟原型 <ArrowRight className="size-3.5" />
				</Link>
			</Section>

			{index && index.unmappedFolders.length > 0 && (
				<p className="mt-4 text-xs text-[var(--muted)]">
					尚未對應到方向的資料夾：{index.unmappedFolders.join("、")}
				</p>
			)}
		</>
	);
}

function DirectionCard({
	d,
	item,
	loaded,
	routes,
}: {
	d: Direction;
	item: IndexItem | undefined;
	loaded: boolean;
	routes: string[];
}) {
	const slug = item?.slug ?? d.slug;
	const status: Status = d.blocked
		? "blocked"
		: d.hold
			? "partial"
			: (item?.status ?? "pending");
	const childRoute =
		routes.includes(`/lab/${slug}`) && !d.hold ? `/lab/${slug}` : null;
	const hasView = VIEWS[slug] !== undefined && !d.hold;
	return (
		<li className="panel flex flex-col gap-2 p-4">
			<div className="flex items-start gap-3">
				<span
					className="grid size-7 shrink-0 place-items-center rounded-lg border border-[var(--line)] bg-[var(--chip)] text-xs font-bold tabular-nums"
					aria-hidden
				>
					{d.n}
				</span>
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-semibold leading-snug">{d.title}</h3>
					<p className="mt-0.5 text-xs leading-relaxed text-[var(--fg2)]">
						{d.question}
					</p>
				</div>
				{loaded &&
					(d.hold ? (
						<Chip tone="--st-partial">修正中</Chip>
					) : (
						<StatusPill status={status} />
					))}
			</div>

			<div className="flex flex-wrap gap-1.5">
				{d.kinds.map((k) => (
					<KindBadge key={k} kind={k} />
				))}
			</div>

			<p className="text-xs leading-relaxed text-[var(--muted)]">
				<span className="font-medium text-[var(--fg2)]">
					可行性（A-007 工程判斷）
				</span>
				：{d.feasibility}
			</p>

			{item?.excerpt && (
				<p className="rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-2 text-xs leading-relaxed text-[var(--fg2)]">
					<span className="font-medium text-[var(--fg)]">報告摘要</span>：
					{item.excerpt}
				</p>
			)}
			{d.blocked && (
				<p className="text-xs text-[var(--fg2)]">資料受阻：{d.blocked}</p>
			)}

			<div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
				{childRoute ? (
					<Link to={childRoute as "/lab"} className="btn btn-active">
						開啟原型 <ArrowRight className="size-3.5" />
					</Link>
				) : hasView ? (
					<Link to="/lab" search={{ view: slug }} className="btn btn-active">
						開啟原型 <ArrowRight className="size-3.5" />
					</Link>
				) : (
					<span className="text-xs text-[var(--muted)]">
						{status === "pending" ? "尚未提交原型" : "尚未接入網頁原型"}
					</span>
				)}
				{item?.report && !d.hold && (
					<span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted)]">
						<FileText className="size-3" /> {item.report}
					</span>
				)}
			</div>
		</li>
	);
}
