// Rewrites repo-relative links and images in the monorepo README to absolute
// GitHub URLs. The published npm README has no repository context, so relative
// targets like `docs/adr/` or `assets/logo.png` would 404 on npmjs.com. This
// keeps the repo README as the single source of truth while producing a
// package README whose links and logo resolve correctly on npm.
//
// The rewrite is intentionally scoped to the link/image forms this README
// actually uses (Markdown links, Markdown images, and HTML `src`/`href`).
// It does not parse fenced code blocks; the README keeps its relative links
// out of code fences, and the fixture test locks that assumption in.

// Targets we must not touch: anything with a URL scheme (https:, mailto:),
// protocol-relative `//host`, or a pure in-page anchor `#section`.
const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function isRewritable(target) {
  return target.length > 0 && !ABSOLUTE.test(target);
}

function splitFragment(target) {
  const hash = target.indexOf("#");
  return hash === -1 ? [target, ""] : [target.slice(0, hash), target.slice(hash)];
}

/**
 * @param {string} target repo-root-relative path, optionally with a #fragment
 * @param {"image" | "link"} kind image -> raw content URL, link -> blob/tree page
 * @param {{ repoUrl: string, ref: string, isDirectory: (path: string) => boolean }} opts
 */
function toAbsolute(target, kind, { repoUrl, ref, isDirectory }) {
  const [rawPath, fragment] = splitFragment(target);
  const hadTrailingSlash = rawPath.endsWith("/");
  const path = rawPath.replace(/^\.\//, "").replace(/\/+$/, "");
  if (path === "") return target;

  if (kind === "image") {
    return `${repoUrl}/raw/${ref}/${path}${fragment}`;
  }

  const dir = isDirectory(path);
  const view = dir ? "tree" : "blob";
  const trailing = dir && hadTrailingSlash ? "/" : "";
  return `${repoUrl}/${view}/${ref}/${path}${trailing}${fragment}`;
}

/**
 * Rewrite every repo-relative link and image target to an absolute GitHub URL.
 * Absolute URLs and in-page anchors are left untouched, so the transform is
 * idempotent: a second pass is a no-op.
 *
 * @param {string} markdown the source README contents
 * @param {{ repoUrl: string, ref: string, isDirectory: (path: string) => boolean }} opts
 * @returns {string}
 */
export function rewriteReadmeLinks(markdown, opts) {
  let out = markdown;

  // HTML <img src="...">
  out = out.replace(/(<img\b[^>]*?\bsrc=)("|')(.*?)\2/gi, (match, pre, quote, url) =>
    isRewritable(url) ? `${pre}${quote}${toAbsolute(url, "image", opts)}${quote}` : match,
  );

  // HTML href="..."
  out = out.replace(/(\bhref=)("|')(.*?)\2/gi, (match, pre, quote, url) =>
    isRewritable(url) ? `${pre}${quote}${toAbsolute(url, "link", opts)}${quote}` : match,
  );

  // Markdown images ![alt](url) — rewrite before links so their now-absolute
  // URLs are skipped by the link pass below.
  out = out.replace(/(!\[[^\]]*\]\()([^)\s]+)(\))/g, (match, pre, url, post) =>
    isRewritable(url) ? `${pre}${toAbsolute(url, "image", opts)}${post}` : match,
  );

  // Markdown link targets ](url). This also catches badge links of the form
  // [![alt](img)](target); the inner image URL is already absolute by now.
  out = out.replace(/(\]\()([^)\s]+)(\))/g, (match, pre, url, post) =>
    isRewritable(url) ? `${pre}${toAbsolute(url, "link", opts)}${post}` : match,
  );

  return out;
}
