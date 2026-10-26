import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

test("health endpoint reports service status", async () => {
  const port = 3417;
  const child = spawn(process.execPath, ["src/server.js"], {
    env: { ...process.env, PORT: String(port), API_KEY: "", NODE_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    let ready = false;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/health`);
        if (r.ok) { ready = true; break; }
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    assert.equal(ready, true, "server did not start");
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "flock-urja-meter-api");
  } finally {
    child.kill("SIGTERM");
  }
});
