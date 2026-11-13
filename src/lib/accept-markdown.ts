// Explicit opt-in only. Wildcards alone keep browser HTML, and q=0 refuses Markdown.
export function prefersMarkdown(accept: string | null): boolean {
  const ranges = (accept ?? "").toLowerCase().split(",").map((part, index) => {
    const [type, ...params] = part.trim().split(";").map(value => value.trim());
    const quality = params.find(param => /^q\s*=/.test(param))?.split("=")[1]?.trim();
    const q = quality === undefined ? 1 : /^(0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(quality) ? Number(quality) : 0;
    return { type, q, index };
  });
  const best = (type: string) => ranges.filter(range => range.type === type).sort((a, b) => b.q - a.q || a.index - b.index)[0];
  const markdown = best("text/markdown");
  if (!markdown || markdown.q === 0) return false;
  const html = best("text/html") ?? best("text/*") ?? best("*/*");
  return !html || markdown.q > html.q || (markdown.q === html.q && (html.type !== "text/html" || markdown.index < html.index));
}
