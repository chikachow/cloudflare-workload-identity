// RFC 7519 section 2: colon-free strings are opaque; strings containing a colon
// must follow RFC 3986 URI syntax. Validate without decoding or normalization.
export function isNonEmptyStringOrUri(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.includes(":")) return true;
  if (/[^\u0021-\u007e]/u.test(value)) return false;

  const components =
    /^([A-Za-z][A-Za-z0-9+.-]*):(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/u.exec(value);
  if (components === null) return false;
  const [, , authority, path, query = "", fragment = ""] = components;
  return (
    (authority === undefined || isAuthority(authority)) &&
    /^(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]|%[0-9A-Fa-f]{2})*$/u.test(path!) &&
    /^(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9A-Fa-f]{2})*$/u.test(query) &&
    /^(?:[A-Za-z0-9._~!$&'()*+,;=:@/?-]|%[0-9A-Fa-f]{2})*$/u.test(fragment)
  );
}

function isAuthority(value: string): boolean {
  const parts =
    /^(?:((?:[A-Za-z0-9._~!$&'()*+,;=:-]|%[0-9A-Fa-f]{2})*)@)?(\[[^\]]*\]|(?:[A-Za-z0-9._~!$&'()*+,;=-]|%[0-9A-Fa-f]{2})*)(?::[0-9]*)?$/u.exec(
      value,
    );
  if (parts === null) return false;
  const host = parts[2]!;
  if (!host.startsWith("[")) return true;
  const literal = host.slice(1, -1);
  // IPvFuture is part of RFC 3986 even though WHATWG URL does not accept it.
  return /^v[0-9A-Fa-f]+\.[A-Za-z0-9._~!$&'()*+,;=:-]+$/iu.test(literal) || isIpv6(literal);
}

function isIpv6(value: string): boolean {
  // Validate only an isolated IPv6 address with URL, never the identifier.
  // Restrict its alphabet to prevent preprocessing or URL-component injection.
  if (!/^[0-9A-Fa-f:.]+$/u.test(value)) return false;
  try {
    new URL(`https://[${value}]/`);
    return true;
  } catch {
    return false;
  }
}
