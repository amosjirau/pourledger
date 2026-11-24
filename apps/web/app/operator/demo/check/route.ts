import { parseDemoRun } from "../../../../lib/demo-run.ts";
import { demoConfiguration, isOperatorHost, verifyDemo } from "../../../../lib/demo-verify.ts";

export async function POST(request: Request) {
  const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
  if (!isOperatorHost(request.headers) || request.headers.get("origin") !== `http://${request.headers.get("host")}`) {
    return response({ error: "Operator route unavailable." }, 404);
  }
  let config: ReturnType<typeof demoConfiguration>;
  try {
    config = demoConfiguration();
  } catch {
    return response({ error: "Operator route unavailable." }, 404);
  }
  try {
    const body = await request.text();
    if (body.length > 8192) return response({ error: "Journal exceeds the supported size." }, 413);
    const run = parseDemoRun(JSON.parse(body), config.target);
    return response(await verifyDemo(run, config));
  } catch (error) {
    // Viem errors can include the configured RPC URL and request details.
    return response({ error: error instanceof Error && error.constructor === Error ? error.message : "Read-only verification failed. Check the configured RPC and journal." }, 422);
  }
}
