const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 9091;
const DATA_FILE = path.join(__dirname, "data.json");
const HTML_FILE = path.join(__dirname, "work-records.html");
const ADMIN_PASSWORD = "admin123";

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    }
  } catch (e) { console.error("Load error:", e.message); }
  return [];
}

function saveData(records) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(records, null, 2), "utf8");
}

function getBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => body += chunk);
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve({}); }
    });
    req.on("error", reject);
  });
}

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "*"
  });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath) {
  fs.readFile(filePath, "utf8", (err, content) => {
    if (err) {
      res.writeHead(500);
      res.end("Server error");
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
  });
}

function checkAdmin(headers) {
  return headers["x-admin-password"] === ADMIN_PASSWORD;
}

function parsePath(url) {
  const u = new URL(url, "http://localhost");
  const parts = u.pathname.split("/").filter(Boolean);
  return { pathname: u.pathname, parts, search: u.searchParams };
}

const server = http.createServer(async (req, res) => {
  const { pathname, parts, search } = parsePath(req.url);

  // CORS preflight
  if (req.method === "OPTIONS") {
    sendJSON(res, 200, {});
    return;
  }

  // Serve HTML
  if (pathname === "/" || pathname === "/index.html") {
    sendFile(res, HTML_FILE);
    return;
  }

  // ===== API =====
  // GET /api/records
  if (pathname === "/api/records" && req.method === "GET") {
    sendJSON(res, 200, loadData());
    return;
  }

  // POST /api/auth
  if (pathname === "/api/auth" && req.method === "POST") {
    const body = await getBody(req);
    const ok = body.password === ADMIN_PASSWORD;
    sendJSON(res, ok ? 200 : 401, { ok });
    return;
  }

  // POST /api/records
  if (pathname === "/api/records" && req.method === "POST") {
    const body = await getBody(req);
    if (!body.productNo || !body.name || !body.quantity || !body.worker) {
      sendJSON(res, 400, { error: "缺少必填字段" });
      return;
    }
    const records = loadData();
    const rec = {
      id: Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
      worker: body.worker.trim(),
      productNo: body.productNo.trim(),
      name: body.name.trim(),
      quantity: parseFloat(body.quantity) || 0,
      baskets: parseFloat(body.baskets) || 0,
      notes: (body.notes || "").trim(),
      status: "pending",
      createdAt: new Date().toISOString()
    };
    records.unshift(rec);
    saveData(records);
    sendJSON(res, 201, rec);
    return;
  }

  // PUT /api/records/:id
  if (parts.length === 3 && parts[0] === "api" && parts[1] === "records" && req.method === "PUT") {
    if (!checkAdmin(req.headers)) {
      sendJSON(res, 401, { error: "需要管理员权限" });
      return;
    }
    const id = parts[2];
    const body = await getBody(req);
    const records = loadData();
    const idx = records.findIndex(r => r.id === id);
    if (idx === -1) { sendJSON(res, 404, { error: "未找到" }); return; }
    if (body.worker !== undefined) records[idx].worker = body.worker.trim();
    if (body.productNo !== undefined) records[idx].productNo = body.productNo.trim();
    if (body.name !== undefined) records[idx].name = body.name.trim();
    if (body.quantity !== undefined) records[idx].quantity = parseFloat(body.quantity) || 0;
    if (body.baskets !== undefined) records[idx].baskets = parseFloat(body.baskets) || 0;
    if (body.notes !== undefined) records[idx].notes = body.notes.trim();
    if (body.status !== undefined) records[idx].status = body.status;
    records[idx].editedAt = new Date().toISOString();
    saveData(records);
    sendJSON(res, 200, records[idx]);
    return;
  }

  // DELETE /api/records/:id
  if (parts.length === 3 && parts[0] === "api" && parts[1] === "records" && req.method === "DELETE") {
    if (!checkAdmin(req.headers)) {
      sendJSON(res, 401, { error: "需要管理员权限" });
      return;
    }
    const id = parts[2];
    const records = loadData().filter(r => r.id !== id);
    saveData(records);
    sendJSON(res, 200, { ok: true });
    return;
  }

  // 404
  sendJSON(res, 404, { error: "Not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on http://0.0.0.0:" + PORT);
});


