import { type ReactNode } from "react";

// Minimal, dependency-free Markdown renderer for the in-app Documentation. Supports exactly the subset
// the docs use: #/##/### headings, **bold**, `code`, [links](url), - / 1. lists, | tables |, > callouts,
// ``` fenced code, and --- rules. Authored content stays within this subset. Styled with the app palette.

function inline(text: string, kb: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={`${kb}b${i}`} className="font-semibold text-slate-900">{m[1]}</strong>);
    else if (m[2] !== undefined) nodes.push(<code key={`${kb}c${i}`} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-700">{m[2]}</code>);
    else if (m[3] !== undefined) nodes.push(<a key={`${kb}a${i}`} href={m[4]} target="_blank" rel="noreferrer" className="text-brand-600 underline hover:text-brand-700">{m[3]}</a>);
    last = re.lastIndex; i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BLOCK_START = /^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\|)/;

export default function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0, key = 0;
  const push = (el: ReactNode) => out.push(<div key={key++}>{el}</div>);

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // fenced code block
    if (line.trim().startsWith("```")) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { buf.push(lines[i]); i++; }
      i++;
      push(<pre className="my-3 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100"><code>{buf.join("\n")}</code></pre>);
      continue;
    }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length, txt = inline(h[2], `h${i}`);
      if (lvl === 1) push(<h1 className="mb-3 text-2xl font-bold text-slate-900">{txt}</h1>);
      else if (lvl === 2) push(<h2 className="mb-2 mt-6 border-b border-slate-100 pb-1.5 text-lg font-bold text-slate-900">{txt}</h2>);
      else if (lvl === 3) push(<h3 className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-brand-700">{txt}</h3>);
      else push(<h4 className="mb-1 mt-3 text-sm font-semibold text-slate-800">{txt}</h4>);
      i++; continue;
    }

    // horizontal rule
    if (/^---+$/.test(line.trim())) { push(<hr className="my-5 border-slate-100" />); i++; continue; }

    // blockquote / callout
    if (line.trim().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      push(<blockquote className="my-3 rounded-r-lg border-l-4 border-amber-300 bg-amber-50/70 px-4 py-2.5 text-sm text-slate-700">{buf.map((b, k) => <p key={k} className={k ? "mt-1" : ""}>{inline(b, `q${i}-${k}`)}</p>)}</blockquote>);
      continue;
    }

    // table
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const header = line.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim())); i++; }
      push(
        <div className="my-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>{header.map((hd, k) => <th key={k} className="px-4 py-2.5 font-semibold">{inline(hd, `th${k}`)}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r, rk) => <tr key={rk} className="hover:bg-slate-50">{r.map((c, ck) => <td key={ck} className="px-4 py-2.5 align-top text-slate-700">{inline(c, `td${rk}-${ck}`)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      push(<ul className="my-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700 marker:text-brand-400">{items.map((it, k) => <li key={k}>{inline(it, `ul${i}-${k}`)}</li>)}</ul>);
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      push(<ol className="my-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-slate-700 marker:text-brand-500 marker:font-semibold">{items.map((it, k) => <li key={k}>{inline(it, `ol${i}-${k}`)}</li>)}</ol>);
      continue;
    }

    // paragraph
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i]) && !/^---+$/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
    push(<p className="my-2 text-sm leading-relaxed text-slate-700">{inline(buf.join(" "), `p${i}`)}</p>);
  }

  return <div>{out}</div>;
}
