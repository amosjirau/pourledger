import { parseCoordinates, passportPath } from "../../lib/chain.ts";

export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const coordinates = parseCoordinates({
    chain: params.get("chain") ?? "", registry: params.get("registry") ?? "",
    kind: params.get("kind") ?? "", id: params.get("id") ?? "",
  });
  if (!coordinates) return new Response("Invalid passport coordinates.", { status: 400 });
  return new Response(null, { status: 303, headers: { Location: passportPath(coordinates) } });
}
