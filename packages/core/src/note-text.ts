/** Plain-text preview of note markdown, for surfaces that don't render markdown. */
export function markdownToPlainText(markdown: string, maxLength?: number): string {
  const text = markdown
    .replace(/```[^\n]*\n?/g, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>+)\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, "")
    .replace(/(\*\*|__|~~|`)/g, "")
    .replace(/(^|\W)[*_](\S[^*_]*)[*_](?=\W|$)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  return maxLength != null && text.length > maxLength ? `${text.slice(0, maxLength).trimEnd()}…` : text;
}
