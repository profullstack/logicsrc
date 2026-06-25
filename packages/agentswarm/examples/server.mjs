// Minimal self-host demo: proves the embeddable handler mounts on a plain
// Node server at /swarm. Uses a mock runner so it runs with zero deps and no
// API key — swap `runner` for `await createDeepAgentRunner({ model })` for real.
//
//   npm run build && npm run demo
//   curl -s localhost:8787/swarm -d '{"messages":[{"role":"user","content":"hi"}]}'
import { createServer } from "node:http";
import { createSwarmHandler } from "../dist/index.js";

const runner = {
  async run({ messages, threadId }) {
    const last = messages[messages.length - 1]?.content ?? "";
    return {
      threadId: threadId ?? `thread_${Date.now()}`,
      messages: [...messages, { role: "assistant", content: `echo: ${last}` }],
      output: `echo: ${last}`
    };
  }
};

const handle = createSwarmHandler({ runner });

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined
  });
  const response = await handle(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(8787, () => console.log("agentswarm demo on http://localhost:8787/swarm"));
