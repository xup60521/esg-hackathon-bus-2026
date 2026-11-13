import { AlertTriangle, Check, Clock3, X } from "lucide-react";
import type { AlertState, SeatStatus } from "#/features/dashboard/replay";

/** Reserved status colours (dataviz status palette); always shown with a label or icon. */
export const STATUS: Record<
	SeatStatus,
	{ label: string; color: string; ink: string }
> = {
	ok: { label: "有座位", color: "#0ca30c", ink: "#ffffff" },
	few: { label: "座位不多", color: "#fab219", ink: "#0b0b0b" },
	full: { label: "推估座位已滿", color: "#d03b3b", ink: "#ffffff" },
	unknown: {
		label: "資料不足（交人工核對）",
		color: "#8b8f98",
		ink: "#ffffff",
	},
};

export const ALERT: Record<
	AlertState,
	{ label: string; color: string; Icon: typeof Check }
> = {
	pending: { label: "待驗證", color: "var(--muted)", Icon: Clock3 },
	hit: { label: "命中", color: "#0ca30c", Icon: Check },
	miss: { label: "錯誤提示", color: "#d03b3b", Icon: X },
	review: {
		label: "資料異常，交人工核對",
		color: "#8b8f98",
		Icon: AlertTriangle,
	},
};

export function StatusDot({ s }: { s: SeatStatus }) {
	return (
		<span
			className="inline-block size-2.5 shrink-0 rounded-full"
			style={{ background: STATUS[s].color }}
		/>
	);
}

export function AlertBadge({ s }: { s: AlertState }) {
	const { label, color, Icon } = ALERT[s];
	return (
		<span
			className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[11px] font-semibold"
			style={{ color }}
		>
			<Icon className="size-3" />
			<span className="text-[var(--fg)]">{label}</span>
		</span>
	);
}

export const DIR_LABEL: Record<number, string> = {
	1: "往日月潭",
	[-1]: "往臺中",
	0: "方向未知",
};
