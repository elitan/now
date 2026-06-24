import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";

export interface RunningServer {
  server: Server;
  port: number;
  close: () => Promise<void>;
}

export type FetchHandler = (request: Request) => Promise<Response>;

export async function startNodeServer(
  handler: FetchHandler,
  port: number,
  hostname = "127.0.0.1",
): Promise<RunningServer> {
  const server = createServer(function handleNodeRequest(request, response) {
    void respond(request, response, handler, port);
  });

  await new Promise<void>(function waitForListen(resolveListen, rejectListen) {
    server.once("error", rejectListen);
    server.listen(port, hostname, function handleListen() {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    port: actualPort,
    close: function closeServer() {
      return new Promise<void>(function waitForClose(resolveClose, rejectClose) {
        server.close(function handleClose(error) {
          if (error) {
            rejectClose(error);
            return;
          }

          resolveClose();
        });
      });
    },
  };
}

async function respond(
  request: IncomingMessage,
  response: ServerResponse,
  handler: FetchHandler,
  port: number,
): Promise<void> {
  try {
    const webRequest = createWebRequest(request, port);
    const webResponse = await handler(webRequest);
    await writeWebResponse(response, webResponse);
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    response.statusCode = 500;
    response.setHeader("content-type", "text/plain; charset=utf-8");
    response.end(message);
  }
}

export function createWebRequest(request: IncomingMessage, port: number): Request {
  const host = request.headers.host ?? `127.0.0.1:${port}`;
  const protoHeader = request.headers["x-forwarded-proto"];
  const protocol = Array.isArray(protoHeader) ? protoHeader[0] : (protoHeader ?? "http");
  const url = new URL(request.url ?? "/", `${protocol}://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const method = request.method ?? "GET";
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(request) as unknown as ReadableStream;
    init.duplex = "half";
  }

  return new Request(url, init);
}

export async function writeWebResponse(
  response: ServerResponse,
  webResponse: Response,
): Promise<void> {
  response.statusCode = webResponse.status;
  response.statusMessage = webResponse.statusText;

  webResponse.headers.forEach(function setHeader(value, key) {
    response.setHeader(key, value);
  });

  if (!webResponse.body) {
    response.end();
    return;
  }

  await new Promise<void>(function waitForPipe(resolvePipe, rejectPipe) {
    const readable = Readable.fromWeb(webResponse.body as never);
    readable.on("error", rejectPipe);
    response.on("error", rejectPipe);
    response.on("finish", resolvePipe);
    readable.pipe(response);
  });
}
