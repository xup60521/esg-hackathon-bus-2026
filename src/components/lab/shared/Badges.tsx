import {
	BadgeCheck,
	BookOpenCheck,
	CircleDashed,
	CircleSlash,
	Eye,
	History,
	Info,
	LineChart,
	RadioTower,
	ShieldAlert,
	SlidersHorizontal,
	TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { type DataKind, KIND_META, STATUS_META, type Status } from "./tokens";

const KIND_ICON: Record<DataKind, ReactNode> = {
	history: <History className="size-3" />,
	scenario: <SlidersHorizontal className="size-3" />,
	forecast: <LineChart className="size-3" />,
	"live-unavailable": <RadioTower className="size-3" />,
	unverified: <TriangleAlert className="size-3" />,
	official: <BookOpenCheck className="size-3" />,
};

/** Tinted outline chip. Meaning is carried by icon + text, colour only reinforces it. */
export function Chip({
	tone,
	icon,
	children,
	title,
}: {
	tone: string;
	icon?: ReactNode;
	children: ReactNode;
	title?: string;
}) {
	return (
		<span
			title={title}
			className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none"
			style={{
				color: `var(${tone})`,
				borderColor: `color-mix(in srgb, var(${tone}) 45%, transparent)`,
				background: `color-mix(in srgb, var(${tone}) 10%, transparent)`,
			}}
		>
			{icon}
			{children}
		</span>
	);
}

export function KindBadge({ kind }: { kind: DataKind }) {
	return (
		<Chip
			tone={`--k-${kind}`}
			icon={KIND_ICON[kind]}
			title={KIND_META[kind].hint}
		>
			{KIND_META[kind].label}
		</Chip>
	);
}

const STATUS_ICON: Record<Status, ReactNode> = {
	ready: <BadgeCheck className="size-3" />,
	partial: <CircleDashed className="size-3" />,
	blocked: <CircleSlash className="size-3" />,
	pending: <CircleDashed className="size-3" />,
};
export function StatusPill({ status }: { status: Status }) {
	return (
		<Chip
			tone={`--st-${status}`}
			icon={STATUS_ICON[status]}
			title={STATUS_META[status].hint}
		>
			{STATUS_META[status].label}
		</Chip>
	);
}

export type Severity = "info" | "watch" | "review";
const SEV: Record<Severity, { label: string; icon: ReactNode }> = {
	info: { label: "提示", icon: <Info className="size-3" /> },
	watch: { label: "關注", icon: <Eye className="size-3" /> },
	review: { label: "需人工評估", icon: <ShieldAlert className="size-3" /> },
};
export function SeverityTag({ severity }: { severity: Severity }) {
	return (
		<Chip tone={`--sev-${severity}`} icon={SEV[severity].icon}>
			{SEV[severity].label}
		</Chip>
	);
}
