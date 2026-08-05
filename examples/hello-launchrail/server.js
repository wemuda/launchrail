import { createServer } from "node:http";

export function greeting(name = "world") {
  return `Hello, ${name}!`;
}

const server = createServer((req, res) => {
  const name = new URL(req.url, "http://localhost").searchParams.get("name") ?? "world";
  res.setHeader("content-type", "text/plain");
  res.end(greeting(name));
});

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const port = process.env.PORT ?? 3000;
  server.listen(port, () => console.log(`hello-launchrail listening on http://localhost:${port}`));
}
