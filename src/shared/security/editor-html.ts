// Browser-side allow-list for HTML loaded into the rich-text editor (defence in depth; OWASP review
// 2026-10-25, A05). The server sanitises everything it stores and serves, but the editor can also be
// filled from this tab's own storage (a restored draft), and a contentEditable element runs event
// handlers in the markup it is given. The markup is parsed into an inert document (nothing loads or
// runs there) and only the same elements as the server allow-list are kept; everything else is
// reduced to its text. Links keep https and mailto targets only.

const ALLOWED = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "S", "UL", "OL", "LI", "BLOCKQUOTE", "A"]);
const DROP_WITH_CONTENT = new Set(["SCRIPT", "STYLE", "TEXTAREA", "OPTION", "NOSCRIPT", "TITLE", "TEMPLATE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH"]);

function clean(source: Node, target: Node, doc: Document): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.appendChild(doc.createTextNode(child.textContent ?? ""));
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const element = child as Element;
    const tag = element.tagName.toUpperCase();
    if (DROP_WITH_CONTENT.has(tag)) continue;
    if (!ALLOWED.has(tag)) {
      clean(element, target, doc); // keep the text, drop the element
      continue;
    }
    const copy = doc.createElement(tag.toLowerCase());
    if (tag === "A") {
      const href = element.getAttribute("href") ?? "";
      if (/^(https:\/\/|mailto:)/i.test(href.trim())) copy.setAttribute("href", href.trim());
      copy.setAttribute("rel", "noopener noreferrer nofollow ugc");
      copy.setAttribute("target", "_blank");
    }
    clean(element, copy, doc);
    target.appendChild(copy);
  }
}

/** Returns markup that is safe to assign to innerHTML of the editor. */
export function sanitizeForEditor(html: string): string {
  if (!html) return "";
  const inert = new DOMParser().parseFromString(html, "text/html");
  const output = document.implementation.createHTMLDocument("");
  const container = output.createElement("div");
  clean(inert.body, container, output);
  return container.innerHTML;
}
