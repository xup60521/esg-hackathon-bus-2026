import { ExternalLink } from "lucide-react";

export type Source = {
	label: string;
	url?: string;
	/** YYYY-MM-DD the source was read */
	accessed: string;
	/** what this source was used to support */
	evidence: string;
};

export function SourceList({ sources }: { sources: Source[] }) {
	return (
		<ul className="grid gap-2 text-xs leading-relaxed">
			{sources.map((s) => (
				<li
					key={s.label}
					className="rounded-lg border border-[var(--line)] px-3 py-2"
				>
					<div className="flex flex-wrap items-center gap-x-2 font-semibold">
						{s.url ? (
							<a
								href={s.url}
								target="_blank"
								rel="noreferrer"
								className="inline-flex items-center gap-1 underline decoration-[var(--axis)] underline-offset-2"
							>
								{s.label}
								<ExternalLink className="size-3" />
							</a>
						) : (
							s.label
						)}
						<span className="font-normal text-[var(--muted)]">
							查閱 {s.accessed}
						</span>
					</div>
					<div className="mt-0.5 text-[var(--fg2)]">{s.evidence}</div>
				</li>
			))}
		</ul>
	);
}

export function LimitationList({ items }: { items: string[] }) {
	return (
		<ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-[var(--fg2)]">
			{items.map((t) => (
				<li key={t}>{t}</li>
			))}
		</ul>
	);
}

/** Where the numbers came from and how to regenerate them. */
export function Provenance({
	generatedAt,
	dataThrough,
	source,
	command,
}: {
	generatedAt?: string;
	dataThrough?: string;
	source: string;
	command?: string;
}) {
	return (
		<dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
			<dt className="text-[var(--muted)]">資料來源</dt>
			<dd>{source}</dd>
			{dataThrough && (
				<>
					<dt className="text-[var(--muted)]">資料截至</dt>
					<dd>{dataThrough}</dd>
				</>
			)}
			{generatedAt && (
				<>
					<dt className="text-[var(--muted)]">產生時間</dt>
					<dd>{generatedAt}</dd>
				</>
			)}
			{command && (
				<>
					<dt className="text-[var(--muted)]">重現</dt>
					<dd>
						<code className="rounded bg-[var(--chip)] px-1.5 py-0.5">
							{command}
						</code>
					</dd>
				</>
			)}
		</dl>
	);
}
