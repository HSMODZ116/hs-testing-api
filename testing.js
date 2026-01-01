export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const phone =
        url.searchParams.get("phone") ||
        url.searchParams.get("num") ||
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

      // Clean and format phone number
      let phoneNumber = phone.toString().replace(/\D/g, '');
      
      if (phoneNumber.startsWith('92') && phoneNumber.length === 12) {
        phoneNumber = '0' + phoneNumber.substring(2);
      } else if (phoneNumber.startsWith('3') && phoneNumber.length === 10) {
        phoneNumber = '0' + phoneNumber;
      }

      // Validate Pakistani number format
      if (!/^03\d{9}$/.test(phoneNumber)) {
        return jsonResponse({
          error: 'Invalid mobile number format',
          message: 'Please enter valid Pakistani mobile number (03451234567 or 923451234567)'
        }, 400);
      }

      // Detect network
      const network = detectNetwork(phoneNumber);
      
      // Fetch phone records
      const phoneRecords = await fetchRecords(phoneNumber);
      
      // Check if this looks like Telenor format (based on your output)
      const isTelenorFormat = phoneRecords.some(record => 
        record.Mobile && 
        (record.Mobile.includes('MSISDN') || 
         record.Mobile.includes('Serial No') ||
         record.Mobile.includes('Certified that'))
      );
      
      let finalRecords = phoneRecords;
      
      // If it's Telenor format, parse it specially
      if (network === 'Telenor' && isTelenorFormat) {
        console.log('Detected Telenor format, parsing specially...');
        const telenorData = parseTelenorFormatFromRecords(phoneRecords, phoneNumber);
        if (telenorData) {
          finalRecords = [telenorData];
        }
      } else {
        // For other networks, fetch CNIC records if available
        if (phoneRecords.length > 0) {
          const cnic = phoneRecords[0].CNIC;
          const cnicRecords = cnic ? await fetchRecords(cnic) : [];
          finalRecords = [...phoneRecords, ...cnicRecords];
        }
      }

      // Remove duplicates
      const unique = [];
      const seen = new Set();

      for (const rec of finalRecords) {
        const key = `${rec.Mobile || ''}-${rec.CNIC || ''}-${rec.Name || ''}`;
        if (!seen.has(key) && rec.Name && rec.Name !== '.') {
          seen.add(key);
          unique.push(rec);
        }
      }

      return jsonResponse({
        success: true,
        phone: phoneNumber,
        network: network,
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
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    },
  });
}

/* ------------------------- Detect Network ------------------------- */
function detectNetwork(phoneNumber) {
  const prefixes = {
    'Telenor': ['0345', '0346', '0347'],
    'Jazz': ['0300', '0301', '0302', '0303', '0304', '0305', '0306', '0307', '0308', '0309'],
    'Zong': ['0311', '0312', '0313', '0314', '0315'],
    'Ufone': ['0331', '0332', '0333', '0334', '0335', '0336', '0337'],
    'Warid': ['0320', '0321', '0322', '0323', '0324', '0325'],
  };

  for (const [network, prefixList] of Object.entries(prefixes)) {
    if (prefixList.some(prefix => phoneNumber.startsWith(prefix))) {
      return network;
    }
  }
  
  return 'Unknown';
}

/* ------------------------- Fetch Records ------------------------- */

async function fetchRecords(value) {
  const POST_URL = "https://freshsimdata.net/numberDetails.php";

  const payload =
    "numberCnic=" + encodeURIComponent(value) + "&searchNumber=search";

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
  console.log('HTML length:', html.length);
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
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
    );

    if (cols.length >= 1) {
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

/* ------------------------- Parse Telenor Format ------------------------- */
function parseTelenorFormatFromRecords(records, phoneNumber) {
  console.log('Parsing Telenor format...');
  
  // Create result object
  const result = {
    Mobile: phoneNumber,
    Name: '',
    CNIC: '',
    Address: '',
    Network: 'Telenor',
    Country: 'Pakistan'
  };
  
  // Extract MSISDN from records
  const msisdnRecord = records.find(r => r.Mobile === 'MSISDN');
  if (msisdnRecord && msisdnRecord.Name) {
    result.Mobile = '0' + msisdnRecord.Name.replace(/\D/g, '');
  }
  
  // Extract CNIC
  const cnicRecord = records.find(r => 
    r.Mobile && r.Mobile.includes('CNIC No.') && r.Name
  );
  if (cnicRecord && cnicRecord.Name) {
    result.CNIC = cnicRecord.Name.replace(/[^\d]/g, '');
  }
  
  // Since we don't have Name and Address in table format,
  // we need to fetch raw HTML and parse differently
  console.log('Telenor basic info extracted:', {
    mobile: result.Mobile,
    cnic: result.CNIC
  });
  
  return result;
}

/* ------------------------- Alternative: Fetch and parse raw HTML for Telenor ------------------------- */
async function fetchTelenorDataDirectly(phoneNumber) {
  try {
    const POST_URL = "https://freshsimdata.net/numberDetails.php";
    const payload = "numberCnic=" + encodeURIComponent(phoneNumber) + "&searchNumber=search";
    
    const headers = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36",
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": "https://freshsimdata.net/",
    };

    const res = await fetch(POST_URL, {
      method: "POST",
      headers,
      body: payload,
    });

    const html = await res.text();
    
    // Clean HTML
    const cleanHtml = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    console.log('Raw HTML cleaned length:', cleanHtml.length);
    
    // Try to extract Telenor format data
    return parseTelenorFromText(cleanHtml, phoneNumber);
    
  } catch (error) {
    console.error('Error fetching Telenor data:', error);
    return null;
  }
}

function parseTelenorFromText(text, phoneNumber) {
  const result = {
    Mobile: phoneNumber,
    Name: '',
    CNIC: '',
    Address: '',
    Network: 'Telenor',
    Country: 'Pakistan'
  };
  
  // Look for patterns in the text
  const upperText = text.toUpperCase();
  
  // Extract CNIC
  const cnicMatch = upperText.match(/CNIC NO[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i);
  if (cnicMatch) {
    result.CNIC = cnicMatch[1].replace(/[^\d]/g, '');
  }
  
  // Extract Name - look for "has been deducted/collected from" pattern
  const namePatterns = [
    /HAS BEEN DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]+?)(?=\s+(?:LACHMAN|POST|TEHSIL|$))/i,
    /DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]+)/i,
    /FROM\s+([A-Z][A-Z\s]{3,50})/i
  ];
  
  for (const pattern of namePatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2) {
        result.Name = formatName(name);
        break;
      }
    }
  }
  
  // Extract Address - look for address patterns
  if (result.Name) {
    const nameUpper = result.Name.toUpperCase();
    const nameIndex = upperText.indexOf(nameUpper);
    
    if (nameIndex !== -1) {
      const afterName = upperText.substring(nameIndex + nameUpper.length);
      const addressMatch = afterName.match(/([A-Z][A-Z\s,.-]{20,100})/);
      if (addressMatch) {
        result.Address = addressMatch[0].trim();
      }
    }
  }
  
  return result;
}

function formatName(name) {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}