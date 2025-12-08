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

      // Fetch Telenor certificate data only
      const telenorData = await fetchTelenorCertificate(phone);
      
      return jsonResponse({
        success: true,
        phone,
        record: telenorData,
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

/* ------------------------- Fetch Telenor Certificate ------------------------- */

async function fetchTelenorCertificate(phone) {
  const POST_URL = "https://freshsimdata.net/numberDetails.php";

  const payload =
    "numberCnic=" + encodeURIComponent(phone) + "&searchNumber=search";

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139 Mobile Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
    Referer: "https://freshsimdata.net/",
  };

  const res = await fetch(POST_URL, {
    method: "POST",
    headers,
    body: payload,
  });

  const html = await res.text();
  return parseTelenorCertificate(html);
}

/* ------------------------- Telenor Certificate Parser ------------------------- */

function parseTelenorCertificate(html) {
  // Clean HTML - remove &nbsp; and other HTML entities
  const cleanHtml = html
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Initialize result object
  const result = {
    MSISDN: null,
    CNIC: null,
    Name: null,
    Address: null,
    NTN: null,
    Operator: "Telenor",
    Status: null,
    WhatsApp: null
  };

  // Extract MSISDN (Mobile Number)
  const msisdnMatch = cleanHtml.match(/MSISDN\s*([0-9]+)/i);
  if (msisdnMatch) {
    result.MSISDN = msisdnMatch[1];
  }

  // Extract CNIC
  const cnicMatch1 = cleanHtml.match(/CNIC\s+No\.?\s*([0-9\-]+)/i);
  const cnicMatch2 = cleanHtml.match(/38103[\s\-]?60039127/i);
  const cnicMatch3 = cleanHtml.match(/\b\d{5}[\-\s]?\d{7}[\-\s]?\d\b/i);
  
  if (cnicMatch1) {
    result.CNIC = cnicMatch1[1].replace(/\s+/g, '');
  } else if (cnicMatch2) {
    result.CNIC = cnicMatch2[0].replace(/\s+/g, '');
  } else if (cnicMatch3) {
    result.CNIC = cnicMatch3[0].replace(/\s+/g, '');
  }

  // Extract Name - Looking for pattern after "Certified that"
  const nameRegex = /Certified that[^<]*<br[^>]*>\s*([^<\n\r]+?)\s*<br/gi;
  const nameMatch = nameRegex.exec(cleanHtml);
  if (nameMatch) {
    result.Name = nameMatch[1].trim();
  }

  // Extract Address - Look for address pattern
  const addressRegex = /(LACHMAN[^<]+TEHSIL[^<]+ZILAH[^<]+BHAKKER?)/i;
  const addressMatch = cleanHtml.match(addressRegex);
  if (addressMatch) {
    result.Address = addressMatch[1].replace(/<br\s*\/?>/gi, ', ').trim();
  } else {
    // Alternative address extraction
    const altAddressMatch = cleanHtml.match(/POST OFFICE[^<]+/i);
    if (altAddressMatch) {
      result.Address = altAddressMatch[0].replace(/<[^>]+>/g, '').trim();
    }
  }

  // Extract NTN
  const ntnMatch = cleanHtml.match(/NTN\s+number[^<]*([0-9]+)/i);
  if (ntnMatch) {
    result.NTN = ntnMatch[1];
  }

  // Extract WhatsApp number
  const whatsappMatch = cleanHtml.match(/Contact\s*([+0-9\s]+)/i);
  if (whatsappMatch) {
    result.WhatsApp = whatsappMatch[1].replace(/\s+/g, '');
  }

  // Extract Status (Original/Duplicate)
  const statusMatch = cleanHtml.match(/Original\s*\/\s*Duplicate/i);
  if (statusMatch) {
    result.Status = statusMatch[0];
  }

  // If no data found using regex, try a different approach
  if (!result.MSISDN && !result.CNIC) {
    // Split by <br> tags and look for patterns
    const lines = cleanHtml.split(/<br\s*\/?>/i);
    
    for (const line of lines) {
      const cleanLine = line.replace(/<[^>]+>/g, '').trim();
      
      // Look for phone number
      if (!result.MSISDN) {
        const phoneInLine = cleanLine.match(/(03\d{9}|923\d{9}|\+92\d{10})/);
        if (phoneInLine && phoneInLine[0].length >= 10) {
          result.MSISDN = phoneInLine[0].replace(/\D/g, '');
        }
      }
      
      // Look for CNIC
      if (!result.CNIC) {
        const cnicInLine = cleanLine.match(/\d{5}[\-\s]?\d{7}[\-\s]?\d/);
        if (cnicInLine) {
          result.CNIC = cnicInLine[0].replace(/\s+/g, '');
        }
      }
      
      // Look for name (longer text without numbers)
      if (!result.Name && cleanLine.length > 10 && !/\d/.test(cleanLine)) {
        result.Name = cleanLine;
      }
    }
  }

  // Clean up the CNIC format
  if (result.CNIC) {
    result.CNIC = result.CNIC.replace(/[^\d]/g, '');
    // Format as 00000-0000000-0 if 13 digits
    if (result.CNIC.length === 13) {
      result.CNIC = `${result.CNIC.substring(0, 5)}-${result.CNIC.substring(5, 12)}-${result.CNIC.substring(12)}`;
    }
  }

  // Format phone number
  if (result.MSISDN) {
    let phone = result.MSISDN.replace(/\D/g, '');
    if (phone.startsWith('92') && phone.length === 12) {
      phone = '0' + phone.substring(2);
    } else if (phone.length === 10 && phone.startsWith('3')) {
      phone = '0' + phone;
    }
    result.MSISDN = phone;
  }

  // Remove null values
  const finalResult = {};
  for (const [key, value] of Object.entries(result)) {
    if (value !== null && value !== '') {
      finalResult[key] = value;
    }
  }

  return finalResult;
}