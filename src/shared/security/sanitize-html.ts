import "server-only";

// Server-side allow-list HTML sanitiser [SPEC NFR-SEC, threat model "Stored XSS"]. User rich text
// is sanitised on write, before it is stored, and again on read as defence in depth. Only basic
// formatting survives: no scripts, styles, event handlers, images, iframes, forms or classes.
// Links keep only https and mailto targets and always open safely in a new tab.
import sanitizeHtmlLibrary from "sanitize-html";

const RICH_TEXT: sanitizeHtmlLibrary.IOptions = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "a"],
  // rel and target are always overwritten by the transform below; user-supplied values never survive.
  allowedAttributes: { a: ["href", "rel", "target"] },
  allowedSchemes: ["https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  // Content of these elements is dropped entirely, not kept as text.
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "title", "template", "iframe", "object", "embed", "svg", "math"],
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: { ...(attribs.href ? { href: attribs.href } : {}), rel: "noopener noreferrer nofollow ugc", target: "_blank" },
    }),
  },
};

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };

/** Sanitises rich text from a user. The result is safe to render as HTML. */
export function sanitizeRichText(html: string): string {
  return sanitizeHtmlLibrary(html, RICH_TEXT).trim();
}

/** Plain text of (sanitised or untrusted) HTML, for excerpts and length checks. Render it as text only. */
export function htmlToPlainText(html: string): string {
  const text = sanitizeHtmlLibrary(html.replace(/<\/(p|li|blockquote)>|<br\s*\/?>/gi, "$& "), { allowedTags: [], allowedAttributes: {}, nonTextTags: RICH_TEXT.nonTextTags });
  return text
    .replace(/&(amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalises untrusted plain text: no control characters, Unix newlines, at most two blank lines. */
export function cleanPlainText(text: string): string {
  return (
    text
      .replace(/\r\n?/g, "\n")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
