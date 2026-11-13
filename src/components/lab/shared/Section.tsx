import type { ReactNode } from "react";

export function Section({
	title,
	subtitle,
	badges,
	children,
	className = "",
}: {
	title: string;
	subtitle?: ReactNode;
	badges?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section className={`panel p-4 ${className}`}>
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
				<h2 className="text-sm font-semibold">{title}</h2>
				{badges && (
					<div className="flex flex-wrap items-center gap-1.5">{badges}</div>
				)}
			</div>
			{subtitle && (
				<p className="mt-1 max-w-[80ch] text-xs leading-relaxed text-[var(--muted)]">
					{subtitle}
				</p>
			)}
			<div className="mt-3">{children}</div>
		</section>
	);
}

export function Stat({
	label,
	value,
	sub,
}: {
	label: string;
	value: ReactNode;
	sub?: ReactNode;
}) {
	return (
		<div className="rounded-lg border border-[var(--line)] bg-[var(--chip)] px-3 py-2">
			<div className="text-[11px] font-medium text-[var(--muted)]">{label}</div>
			<div className="mt-0.5 text-xl font-bold tabular-nums">{value}</div>
			{sub && (
				<div className="mt-0.5 text-[11px] leading-snug text-[var(--muted)]">
					{sub}
				</div>
			)}
		</div>
	);
}

export function Field({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div>
			<div className="mb-1.5 text-[11px] font-medium text-[var(--muted)]">
				{label}
			</div>
			{children}
		</div>
	);
}

export function Segmented<T extends string | number>({
	options,
	value,
	onChange,
	label,
}: {
	options: [T, string][];
	value: T;
	onChange: (v: T) => void;
	label?: string;
}) {
	return (
		<fieldset
			className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0"
			aria-label={label}
		>
			{options.map(([v, text]) => (
				<button
					key={String(v)}
					type="button"
					className={`btn ${v === value ? "btn-active" : ""}`}
					aria-pressed={v === value}
					onClick={() => onChange(v)}
				>
					{text}
				</button>
			))}
		</fieldset>
	);
}
