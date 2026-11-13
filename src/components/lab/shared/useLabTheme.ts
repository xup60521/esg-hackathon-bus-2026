import { useEffect, useState } from "react";
import { THEME_KEY, type Theme } from "#/lib/palette";

/** Same light/dark choice and storage key as the map and analysis pages. */
export function useLabTheme(): [Theme, () => void] {
	const [theme, setTheme] = useState<Theme>("light");
	useEffect(() => {
		const saved = localStorage.getItem(THEME_KEY);
		if (saved === "dark" || saved === "light") setTheme(saved);
	}, []);
	const toggle = () =>
		setTheme((t) => {
			const next = t === "light" ? "dark" : "light";
			localStorage.setItem(THEME_KEY, next);
			return next;
		});
	return [theme, toggle];
}
