// filename: worker.js

const DEVELOPER = "@istgrehu";
const TARGET_BASE = "https://pakistandatabase.com";
const TARGET_PATH = "/databases/sim.php";
const MIN_INTERVAL = 1.0; // seconds
const ALLOW_UPSTREAM = true;

// Simple in-memory rate limiting (per request - for global rate limiting use KV)
let lastCall = 0;

// Helper functions
function isMobile(value) {
    return /^92\d{9,12}$/.test((value || "").trim());
}

function isCnic(value) {
    return /^\d{13}$/.test((value || "").trim());
}

function classifyQuery(value) {
    const v = value.trim();
    if (isMobile(v)) {
        return { type: "mobile", value: v };
    }
    if (isCnic(v)) {
        return { type: "cnic", value: v };
    }
    throw new Error("Invalid query. Use mobile with country code (92...) or CNIC (13 digits).");
}

function rateLimitWait() {
    const now = Date.now() / 1000;
    const elapsed = now - lastCall;
    if (elapsed < MIN_INTERVAL) {
        return false;
    }
    lastCall = now;
    return true;
}

async function fetchUpstream(queryValue) {
    if (!ALLOW_UPSTREAM) {
        throw new Error("Upstream fetching disabled.");
    }
    
    if (!rateLimitWait()) {
        throw new Error("Rate limit exceeded. Please wait before making another request.");
    }

    const url = `${TARGET_BASE.replace(/\/$/, '')}${TARGET_PATH}`;
    const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
        "Referer": TARGET_BASE.replace(/\/$/, '') + "/",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
    };

    const body = new URLSearchParams({
        search_query: queryValue
    }).toString();

    const response = await fetch(url, {
        method: "POST",
        headers: headers,
        body: body
    });

    if (!response.ok) {
        throw new Error(`Upstream request failed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
}

function parseTable(html) {
    const results = [];
    
    // Look for table rows with data - this regex approach works for simple tables
    // For complex HTML, consider using a lightweight HTML parser
    const tableMatch = html.match(/<table[^>]*>(.*?)<\/table>/is);
    if (!tableMatch) return results;
    
    const tableHtml = tableMatch[1];
    const rowMatches = tableHtml.match(/<tr[^>]*>(.*?)<\/tr>/gis);
    
    if (!rowMatches) return results;
    
    for (const row of rowMatches) {
        const cellMatches = row.match(/<td[^>]*>(.*?)<\/td>/gis);
        if (!cellMatches || cellMatches.length < 4) continue;
        
        const cols = cellMatches.map(cell => {
            const textMatch = cell.match(/<td[^>]*>(.*?)<\/td>/i);
            if (textMatch) {
                return textMatch[1].replace(/<[^>]*>/g, '').trim();
            }
            return "";
        });
        
        results.push({
            mobile: cols[0] || null,
            name: cols[1] || null,
            cnic: cols[2] || null,
            address: cols[3] || null,
        });
    }
    
    return results;
}

function makeResponseObject(query, qtype, results) {
    return {
        query: query,
        query_type: qtype,
        results_count: results.length,
        results: results,
        developer: DEVELOPER
    };
}

function respondJson(obj, pretty, status = 200) {
    const text = JSON.stringify(obj, null, pretty ? 2 : null);
    return new Response(text, {
        status: status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        }
    });
}

async function handleApiLookup(queryValue, pretty = false) {
    try {
        const classified = classifyQuery(queryValue);
        
        try {
            const html = await fetchUpstream(classified.value);
            const results = parseTable(html);
            const obj = makeResponseObject(classified.value, classified.type, results);
            return respondJson(obj, pretty);
        } catch (fetchError) {
            return respondJson({
                error: "Fetch failed",
                detail: fetchError.message,
                developer: DEVELOPER
            }, pretty, 500);
        }
    } catch (classifyError) {
        return respondJson({
            error: "Invalid query",
            detail: classifyError.message,
            developer: DEVELOPER
        }, pretty, 400);
    }
}

addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Max-Age": "86400"
            }
        });
    }
    
    // Home page
    if (path === "/" && request.method === "GET") {
        const sampleGet = `${url.origin}/api/lookup?query=923323312487&pretty=1`;
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Pakistan Number/CNIC Info API</title>
                <meta charset="utf-8">
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 40px auto; padding: 20px; }
                    code { background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
                    ul { line-height: 1.8; }
                </style>
            </head>
            <body>
                <h2>Pakistan Number/CNIC Info API - Live Mode</h2>
                <p>Mode: LIVE | Developer: ${DEVELOPER}</p>
                <p>Use GET or POST:</p>
                <ul>
                    <li>GET /api/lookup?query=&lt;value&gt;&amp;pretty=1 — example: 
                        <a href='${sampleGet}'>${sampleGet}</a></li>
                    <li>GET /api/lookup/&lt;value&gt; — example: <a href='/api/lookup/923323312487'>/api/lookup/923323312487</a></li>
                    <li>POST /api/lookup with JSON <code>{"query":"923..."}</code></li>
                </ul>
                <p><strong>Examples:</strong></p>
                <ul>
                    <li>Mobile: 923001234567</li>
                    <li>CNIC: 1234512345678</li>
                </ul>
            </body>
            </html>
        `;
        return new Response(html, {
            headers: {
                "Content-Type": "text/html; charset=utf-8"
            }
        });
    }
    
    // Health check
    if (path === "/health" && request.method === "GET") {
        return respondJson({
            status: "ok",
            developer: DEVELOPER
        }, false);
    }
    
    // API routes
    if (path.startsWith("/api/lookup")) {
        const pretty = url.searchParams.get("pretty") === "1" || 
                      url.searchParams.get("pretty") === "true" ||
                      url.searchParams.get("pretty") === "True";
        
        // GET /api/lookup?query=...
        if (request.method === "GET" && (url.searchParams.has("query") || url.searchParams.has("q") || url.searchParams.has("value"))) {
            const query = url.searchParams.get("query") || 
                         url.searchParams.get("q") || 
                         url.searchParams.get("value");
            if (!query) {
                return respondJson({
                    error: "Use ?query=<mobile or cnic>",
                    developer: DEVELOPER
                }, pretty, 400);
            }
            return handleApiLookup(query, pretty);
        }
        
        // GET /api/lookup/{value}
        if (request.method === "GET" && path.startsWith("/api/lookup/") && path !== "/api/lookup") {
            const query = decodeURIComponent(path.split("/api/lookup/")[1]);
            return handleApiLookup(query, pretty);
        }
        
        // POST /api/lookup
        if (request.method === "POST") {
            try {
                const contentType = request.headers.get("content-type") || "";
                
                if (contentType.includes("application/json")) {
                    const data = await request.json();
                    const query = data.query || data.number || data.value;
                    
                    if (!query) {
                        return respondJson({
                            error: 'Send JSON {"query":"..."}',
                            developer: DEVELOPER
                        }, pretty, 400);
                    }
                    
                    return handleApiLookup(query, pretty);
                } else if (contentType.includes("application/x-www-form-urlencoded")) {
                    const formData = await request.formData();
                    const query = formData.get("query") || formData.get("number") || formData.get("value");
                    
                    if (!query) {
                        return respondJson({
                            error: 'Send form data with "query" field',
                            developer: DEVELOPER
                        }, pretty, 400);
                    }
                    
                    return handleApiLookup(query, pretty);
                } else {
                    // Try to parse as text/plain
                    const text = await request.text();
                    if (text) {
                        try {
                            const data = JSON.parse(text);
                            const query = data.query || data.number || data.value;
                            if (query) {
                                return handleApiLookup(query, pretty);
                            }
                        } catch {
                            // If it's not JSON, treat it as raw query
                            return handleApiLookup(text.trim(), pretty);
                        }
                    }
                    
                    return respondJson({
                        error: "Unsupported content type. Use JSON or form data",
                        developer: DEVELOPER
                    }, pretty, 400);
                }
            } catch (error) {
                return respondJson({
                    error: "Invalid request",
                    detail: error.message,
                    developer: DEVELOPER
                }, pretty, 400);
            }
        }
        
        // No query provided
        return respondJson({
            error: "Use ?query=<mobile or cnic>",
            developer: DEVELOPER
        }, pretty, 400);
    }
    
    // 404 for other routes
    return new Response("Not Found", { 
        status: 404,
        headers: {
            "Content-Type": "text/plain; charset=utf-8"
        }
    });
}