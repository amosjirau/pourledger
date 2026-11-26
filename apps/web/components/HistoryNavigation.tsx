import Link from "next/link";

export function HistoryNavigation({ path, query, field, next, label }: {
  path: string; query: Record<string, string | undefined>; field: string; next?: string; label: string;
}) {
  if (!query[field] && !next) return null;
  function href(cursor?: string) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...query, [field]: cursor })) if (value) params.set(key, value);
    return params.size ? `${path}?${params}` : path;
  }
  return <nav className="project-nav" aria-label={`${label} pages`}>
    {query[field] && <Link href={href()} prefetch={false}>First page of {label}</Link>}
    {next && <Link href={href(next)} prefetch={false}>More {label}</Link>}
  </nav>;
}
