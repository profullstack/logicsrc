import sanitizeHtml from "sanitize-html";

const allowedTags = sanitizeHtml.defaults.allowedTags.concat([
  "figure",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "img"
]);

const allowedAttributes = {
  ...sanitizeHtml.defaults.allowedAttributes,
  a: ["href", "name", "target", "rel"],
  img: ["src", "alt", "title", "width", "height", "loading"],
  code: ["class"],
  pre: ["class"]
};

export function sanitizeRenderedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes,
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: {
      img: ["http", "https"]
    },
    allowProtocolRelative: false
  });
}
