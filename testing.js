export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const phone =
        url.searchParams.get("phone") ||
        (request.method === "POST"
          ? (await request.json().catch(() => ({}))).phone
          : "");

      if (!phone) {
        return jsonResponse(
          { error: "phone parameter required. Example: /?phone=03027665767" },
          400
        );
      }

      // 1) Phone Records
      const phoneRecords = await fetchRecords(phone);
      if (phoneRecords.length === 0) {
        return jsonResponse({ success: true, phone, records: [] });
      }

      // 2) CNIC Records
      const cnic = phoneRecords[0].CNIC;
      const cnicRecords = cnic ? await fetchRecords(cnic) : [];

      // Merge + Remove Duplicates
      const all = [...phoneRecords, ...cnicRecords];
      const unique = [];
      const seen = new Set();

      for (const rec of all) {
        const key = `${rec.Mobile}-${rec.CNIC}`;
        if (!seen.has(key)) {
          seen.add(key);
          unique.push(rec);
        }
      }

      return jsonResponse({
        success: true,
        phone,
        records: unique,
      });
    } catch (err) {
      return jsonResponse(
        {
          success: false,
          error: "Request failed",
          details: err.message,
        },
        500
      );
    }
  },
};

/* ----------------------------- JSON Helper ----------------------------- */

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/* ----------------------------- Fetch Records ----------------------------- */

async function fetchRecords(value) {
  const POST_URL = "https://paksimownerdetails.com/SecureInfo.php";

  const payload = `cnic=${encodeURIComponent(value)}&search=Search`;

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "*/*",
    Referer: "https://paksimownerdetails.com/",
  };

  const res = await fetch(POST_URL, {
    method: "POST",
    headers,
    body: payload,
  });

  const html = await res.text();
  return parseTable(html);
}

/* ----------------------------- HTML Parser ----------------------------- */

function parseTable(html) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

  let match;
  while ((match = rowRegex.exec(html))) {
    const rowHtml = match[1];

    const cols = [
      ...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi),
    ].map((m) => m[1].replace(/<[^>]+>/g, "").trim());

    if (cols.length >= 3) {
      rows.push({
        Mobile: cols[0] || null,
        Name: cols[1] || null,
        CNIC: cols[2] || null,
        Address: cols[3] || null,
        Country: "Pakistan",
      });
    }
  }

  return rows;
}