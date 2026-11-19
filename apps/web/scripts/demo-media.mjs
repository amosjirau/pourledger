import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";

// Chromium frames come from the production app during the actual Anvil run.
export async function startRecording(page, directory) {
  const devtools = await page.context().newCDPSession(page);
  const ffmpeg = spawn("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-framerate", "8",
    "-i", "pipe:0", "-an", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    join(directory, "local-workflow.mp4"),
  ], { stdio: ["pipe", "ignore", "inherit"] });
  const exited = once(ffmpeg, "exit");
  exited.catch(() => {});
  ffmpeg.stdin.on("error", () => {});
  let frame;
  devtools.on("Page.screencastFrame", ({ data, sessionId }) => {
    frame = Buffer.from(data, "base64");
    void devtools.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await devtools.send("Page.startScreencast", { format: "jpeg", quality: 85 });
  const timer = setInterval(() => {
    if (frame && ffmpeg.stdin.writable && !ffmpeg.stdin.writableNeedDrain) ffmpeg.stdin.write(frame);
  }, 125);
  return async () => {
    clearInterval(timer);
    await devtools.send("Page.stopScreencast").catch(() => {});
    await devtools.detach().catch(() => {});
    ffmpeg.stdin.end();
    const [code] = await exited;
    if (code !== 0) throw new Error(`Demo recording failed with ffmpeg exit ${code}.`);
  };
}
