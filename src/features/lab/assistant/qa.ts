/** 問答驗證集執行器：測試與 scripts/lab/assistant/evaluate.ts 共用。 */
import { answer } from "./engine";
import type { Answer, AnswerKind, Basis, Context } from "./types";

export type QaItem = {
	id: string;
	q: string;
	now?: { weekday: number; hhmm: string };
	expect: {
		kind: AnswerKind;
		basis?: Basis;
		includes?: string[];
		excludes?: string[];
	};
};

export const answerText = (a: Answer) =>
	[
		a.headline,
		...a.lines,
		...(a.table
			? [a.table.head.join(" "), ...a.table.rows.map((r) => r.join(" "))]
			: []),
		a.caution ?? "",
	].join("\n");

export type QaResult = {
	id: string;
	q: string;
	pass: boolean;
	failures: string[];
	kind: AnswerKind;
	trace: string;
};

export function runQa(items: QaItem[], ctx: Context): QaResult[] {
	return items.map((it) => {
		const a = answer(it.q, it.now ? { ...ctx, now: it.now } : ctx);
		const text = answerText(a);
		const failures: string[] = [];
		if (a.kind !== it.expect.kind)
			failures.push(`kind ${a.kind} ≠ ${it.expect.kind}`);
		if (it.expect.basis && !a.basis.includes(it.expect.basis))
			failures.push(`basis ${a.basis.join(",")} 缺 ${it.expect.basis}`);
		for (const s of it.expect.includes ?? [])
			if (!text.includes(s)) failures.push(`缺少「${s}」`);
		for (const s of it.expect.excludes ?? [])
			if (text.includes(s)) failures.push(`不應出現「${s}」`);
		if (a.kind === "answer" && (a.sources.length === 0 || a.basis.length === 0))
			failures.push("answer 缺來源或資料依據");
		return {
			id: it.id,
			q: it.q,
			pass: failures.length === 0,
			failures,
			kind: a.kind,
			trace: a.trace,
		};
	});
}
