import { type ReactNode } from "react";

// Minimal, dependency-free Markdown renderer for the in-app Documentation. Supports exactly the subset
// the docs use: #/##/### headings, **bold**, `code`, [links](url), - / 1. lists, | tables |, > callouts,
// ``` fenced code, and --- rules. Authored content stays within this subset. Styled with the app palette.

function safeHref(href: string): string | null {
  const h = href.trim();
  if (/^https?:\/\//i.test(h) || (h.startsWith("/") && !h.startsWith("//"))) return h;
  return null;
}

function inline(text: string, kb: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) nodes.push(<strong key={`${kb}b${i}`} className="font-semibold text-slate-900">{m[1]}</strong>);
    else if (m[2] !== undefined) nodes.push(<code key={`${kb}c${i}`} className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-700">{m[2]}</code>);
    else if (m[3] !== undefined) {
      const href = safeHref(m[4]);
      if (href) nodes.push(<a key={`${kb}a${i}`} href={href} target="_blank" rel="noreferrer" className="text-brand-600 underline hover:text-brand-700">{m[3]}</a>);
      else nodes.push(m[3]);
    }
    last = re.lastIndex; i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const BLOCK_START = /^(#{1,4}\s|```|>|\s*[-*]\s|\s*\d+\.\s|\|)/;

type MarkdownProps = { source: string; variant?: "docs" | "chat" };
const chat = (variant: MarkdownProps["variant"]) => variant === "chat";

export default function Markdown({ source, variant = "docs" }: MarkdownProps) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0, key = 0;
  const push = (el: ReactNode) => out.push(<div key={key++}>{el}</div>);
  const gap = chat(variant) ? "my-1" : "my-2";
  const gapLg = chat(variant) ? "my-2" : "my-3";

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // fenced code block
    if (line.trim().startsWith("```")) {
      const buf: string[] = []; const start = i; i++;
      let closed = false;
      while (i < lines.length) {
        if (lines[i].trim().startsWith("```")) { closed = true; i++; break; }
        buf.push(lines[i]); i++;
      }
      if (closed) push(<pre className={`${gapLg} overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs leading-relaxed text-slate-100`}><code>{buf.join("\n")}</code></pre>);
      else push(<p className={`${gap} text-sm leading-relaxed text-slate-700`}>{inline(buf.length ? buf.join("\n") : line.replace(/^```\s?/, ""), `fence${start}`)}</p>);
      continue;
    }

    // headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length, txt = inline(h[2], `h${i}`);
      if (lvl === 1) push(<h1 className={chat(variant) ? "mb-1 text-base font-bold text-slate-900" : "mb-3 text-2xl font-bold text-slate-900"}>{txt}</h1>);
      else if (lvl === 2) push(<h2 className={chat(variant) ? "mb-1 mt-2 text-sm font-bold text-slate-900" : "mb-2 mt-6 border-b border-slate-100 pb-1.5 text-lg font-bold text-slate-900"}>{txt}</h2>);
      else if (lvl === 3) push(<h3 className={chat(variant) ? "mb-0.5 mt-1.5 text-xs font-bold uppercase tracking-wide text-brand-700" : "mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-brand-700"}>{txt}</h3>);
      else push(<h4 className={chat(variant) ? "mb-0.5 mt-1 text-sm font-semibold text-slate-800" : "mb-1 mt-3 text-sm font-semibold text-slate-800"}>{txt}</h4>);
      i++; continue;
    }

    // horizontal rule
    if (/^---+$/.test(line.trim())) { push(<hr className={`${chat(variant) ? "my-2" : "my-5"} border-slate-100`} />); i++; continue; }

    // blockquote / callout
    if (line.trim().startsWith(">")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) { buf.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      push(<blockquote className={`${gapLg} rounded-r-lg border-l-4 border-amber-300 bg-amber-50/70 px-3 py-2 text-sm text-slate-700`}>{buf.map((b, k) => <p key={k} className={k ? "mt-1" : ""}>{inline(b, `q${i}-${k}`)}</p>)}</blockquote>);
      continue;
    }

    // table
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|/.test(lines[i + 1])) {
      const header = line.trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map((s) => s.trim())); i++; }
      push(
        <div className={`${gapLg} overflow-x-auto rounded-lg border border-slate-200`}>
          <table className={`w-full ${chat(variant) ? "text-xs" : "text-sm"}`}>
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
      push(<ul className={`${gap} list-disc space-y-0.5 pl-4 text-sm leading-relaxed text-slate-700 marker:text-brand-400`}>{items.map((it, k) => <li key={k}>{inline(it, `ul${i}-${k}`)}</li>)}</ul>);
      continue;
    }

    // ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      push(<ol className={`${gap} list-decimal space-y-0.5 pl-4 text-sm leading-relaxed text-slate-700 marker:text-brand-500 marker:font-semibold`}>{items.map((it, k) => <li key={k}>{inline(it, `ol${i}-${k}`)}</li>)}</ol>);
      continue;
    }

    // paragraph
    const buf: string[] = [];
    while (i < lines.length && lines[i].trim() && !BLOCK_START.test(lines[i]) && !/^---+$/.test(lines[i].trim())) { buf.push(lines[i]); i++; }
    push(<p className={`${gap} text-sm leading-relaxed text-slate-700`}>{inline(buf.join(" "), `p${i}`)}</p>);
  }

  return (
    <div className={chat(variant) ? "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0" : undefined}>
      {out}
    </div>
  );
}
