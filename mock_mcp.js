const http = require("node:http");

const server = http.createServer((req, res) => {
	console.log(`[MOCK] ${req.method} ${req.url}`);
	if (req.url === "/sse") {
		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"Mcp-Session-Id": "mock-1234",
		});
		// Send a relative URL as endpoint
		res.write("event: endpoint\ndata: /messages?sessionId=mock-1234\n\n");
	} else if (req.url.startsWith("/messages")) {
		let body = "";
		req.on("data", (c) => (body += c));
		req.on("end", () => {
			console.log("[MOCK Body]", body);
			res.writeHead(202);
			res.end("Accepted");
		});
	} else {
		res.writeHead(404);
		res.end();
	}
});
server.listen(3457, () => console.log("Mock listening on 3457"));
