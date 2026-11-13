import { Link } from "@tanstack/react-router";
import {
	ArrowLeft,
	FlaskConical,
	Map as MapIcon,
	Moon,
	Sun,
} from "lucide-react";
import type { ReactNode } from "react";
import { type Theme, themeVars } from "#/lib/palette";
import { labVars } from "./tokens";

/**
 * Frame for every /lab page: theme, navigation and the standing disclaimer. Only src/routes/lab.tsx
 * mounts it; child pages render their content only.
 */
export function LabShell({
	theme,
	onToggleTheme,
	children,
	showBack = false,
}: {
	theme: Theme;
	onToggleTheme: () => void;
	children: ReactNode;
	showBack?: boolean;
}) {
	return (
		<div
			data-theme={theme}
			style={{ ...themeVars(theme), ...labVars(theme) }}
			className="min-h-screen bg-[var(--bg)] text-[var(--fg)]"
		>
			<div className="mx-auto max-w-[1120px] px-4 py-5 sm:px-6">
				<nav className="flex flex-wrap items-center gap-2">
					{showBack ? (
						<Link to="/lab" search={{ view: undefined }} className="btn">
							<ArrowLeft className="size-4" /> 實驗室總覽
						</Link>
					) : (
						<span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
							<FlaskConical className="size-4" /> 6670 研究實驗室
						</span>
					)}
					<div className="ml-auto flex items-center gap-2">
						<Link to="/" className="btn">
							<MapIcon className="size-4" /> 3D 地圖
						</Link>
						<Link to="/analysis" className="btn">
							中站分析
						</Link>
						<button
							type="button"
							onClick={onToggleTheme}
							className="btn px-2"
							aria-label={theme === "light" ? "深色模式" : "淺色模式"}
						>
							{theme === "light" ? (
								<Moon className="size-4" />
							) : (
								<Sun className="size-4" />
							)}
						</button>
					</div>
				</nav>
				{children}
				<footer className="mt-10 border-t border-[var(--line)] pt-4 text-[11px] leading-relaxed text-[var(--muted)]">
					實驗室頁面為黑客松研究原型。資料為 2024–2025
					年歷史刷卡彙總或標明的情境假設，未接入即時資料；
					刷卡紀錄只含已成功搭乘者，不等於完整需求、候車人數、拒載或載客率。
				</footer>
			</div>
		</div>
	);
}
