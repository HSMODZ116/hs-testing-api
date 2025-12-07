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
          {
            error: "phone parameter required. Example: /?phone=03027665767",
          },
          400
        );
      }

      // Fetch phone records
      const phoneRecords = await fetchRecords(phone);
      if (phoneRecords.length === 0) {
        return jsonResponse({ success: true, phone, records: [] });
      }

      // Fetch CNIC records from first result
      const cnic = phoneRecords[0].CNIC;
      const cnicRecords = cnic ? await fetchRecords(cnic) : [];

      // Merge & deduplicate
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

/* ------------------------- JSON Response Helper ------------------------- */
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

/* ------------------------- Fetch Records ------------------------- */

async function fetchRecords(value) {
  const POST_URL = "https://paksimownerdetails.com/SecureInfo.php";

  const payload =
    "numberCnic=" + encodeURIComponent(value) + "&searchNumber=search";

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139 Mobile Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
    Referer: "https://paksimownerdetails.com/",
  };

  const res = await fetch(POST_URL, {
    method: "POST",
    headers,
    body: payload,
  });

  const html = await res.text();
  return parseTableHtml(html);
}

/* ------------------------- HTML Table Parser ------------------------- */

function parseTableHtml(html) {
  const rows = [];

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(html))) {
    const rowHtml = match[1];

    const cols = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) =>
        m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
    );

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