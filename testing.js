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
      console.log(`Network detected: ${network} for ${phoneNumber}`);
      
      // Fetch raw HTML
      const rawHtml = await fetchRawHtml(phoneNumber);
      
      // Parse based on network
      let records = [];
      
      if (network === 'Telenor') {
        // Special parsing for Telenor text format
        const telenorData = parseTelenorTextFormat(rawHtml, phoneNumber);
        if (telenorData && telenorData.Name) {
          records = [telenorData];
        } else {
          // Fallback to table parsing
          records = parseTableHtml(rawHtml);
        }
      } else {
        // For other networks, use table parsing
        records = parseTableHtml(rawHtml);
        
        // Also fetch CNIC records if available
        if (records.length > 0 && records[0].CNIC) {
          const cnic = records[0].CNIC;
          const cnicHtml = await fetchRawHtml(cnic);
          const cnicRecords = parseTableHtml(cnicHtml);
          records = [...records, ...cnicRecords];
        }
      }

      // Remove duplicates and empty records
      const unique = removeDuplicates(records);
      
      // Filter out invalid records
      const validRecords = unique.filter(rec => 
        rec.Name && 
        rec.Name !== '.' && 
        rec.Name !== 'Serial No' &&
        !rec.Name.includes('0000000000000') &&
        !rec.Mobile?.includes('Serial No') &&
        !rec.Mobile?.includes('Certified that')
      );

      return jsonResponse({
        success: true,
        phone: phoneNumber,
        network: network,
        records: validRecords,
        rawDataPreview: rawHtml.substring(0, 500) // For debugging
      });
    } catch (err) {
      console.error('Error:', err);
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

/* ------------------------- Fetch Raw HTML ------------------------- */
async function fetchRawHtml(value) {
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

  return await res.text();
}

/* ------------------------- Parse Telenor Text Format ------------------------- */
function parseTelenorTextFormat(html, phoneNumber) {
  console.log('Parsing Telenor text format...');
  
  // Clean HTML for text extraction
  let cleanText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Check if this is Telenor format (has the specific pattern)
  if (!cleanText.includes('has been deducted/collected from') &&
      !cleanText.includes('MSISDN') &&
      !cleanText.includes('Serial No')) {
    console.log('Not Telenor format');
    return null;
  }
  
  const result = {
    Mobile: phoneNumber,
    Name: '',
    CNIC: '',
    Address: '',
    Network: 'Telenor',
    Country: 'Pakistan'
  };
  
  // Convert to uppercase for easier matching
  const upperText = cleanText.toUpperCase();
  
  // ===== EXTRACT MSISDN =====
  const msisdnMatch = upperText.match(/MSISDN\s+(\d{10})/);
  if (msisdnMatch) {
    result.Mobile = '0' + msisdnMatch[1];
  }
  
  // ===== EXTRACT NAME =====
  // Based on screenshot: "has been deducted/collected from" then name on next line
  const namePatterns = [
    /HAS BEEN DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]+?)(?=\s+(?:LACHMAN|POST|TEHSIL|$))/i,
    /DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]+)/i,
    /FROM\s+([A-Z][A-Z\s]{3,50})/i
  ];
  
  for (const pattern of namePatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2 && name !== 'HAS BEEN' && !name.includes('DEDUCTED')) {
        result.Name = formatProperName(name);
        console.log('Found name:', result.Name);
        break;
      }
    }
  }
  
  // Alternative: Look for name in the lines after the pattern
  if (!result.Name) {
    const lines = cleanText.split('\n').map(line => line.trim());
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('has been deducted/collected from') ||
          lines[i].includes('deducted/collected from')) {
        // Next line might contain the name
        if (i + 1 < lines.length) {
          const nameLine = lines[i + 1].trim();
          if (nameLine && nameLine.length > 3 && /^[A-Z]/.test(nameLine)) {
            result.Name = formatProperName(nameLine);
            break;
          }
        }
      }
    }
  }
  
  // ===== EXTRACT ADDRESS =====
  // Address is usually multiple lines after the name
  if (result.Name) {
    const nameUpper = result.Name.toUpperCase();
    const nameIndex = upperText.indexOf(nameUpper);
    
    if (nameIndex !== -1) {
      const afterName = cleanText.substring(nameIndex + result.Name.length);
      
      // Look for address lines (typically contain location keywords)
      const addressLines = [];
      const lines = afterName.split('\n');
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && 
            (trimmedLine.includes('POST OFFICE') ||
             trimmedLine.includes('TEHSIL') ||
             trimmedLine.includes('ZILAH') ||
             trimmedLine.includes('DISTRICT') ||
             trimmedLine.length > 20)) {
          
          addressLines.push(trimmedLine);
          if (addressLines.join(' ').length > 30) {
            break;
          }
        }
      }
      
      if (addressLines.length > 0) {
        result.Address = formatAddress(addressLines.join(' '));
        console.log('Found address:', result.Address);
      }
    }
  }
  
  // Alternative address extraction using regex
  if (!result.Address) {
    const addressPatterns = [
      /LACHMAN WALA POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH[\s\S]+?BHAKKAR/i,
      /POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH/i,
      /TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+/i
    ];
    
    for (const pattern of addressPatterns) {
      const match = cleanText.match(pattern);
      if (match) {
        result.Address = formatAddress(match[0]);
        break;
      }
    }
  }
  
  // ===== EXTRACT CNIC =====
  const cnicPatterns = [
    /CNIC NO[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i,
    /HOLDER OF CNIC[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i,
    /(\d{5}-\d{7}-\d{1})/,
    /(\d{13})/
  ];
  
  for (const pattern of cnicPatterns) {
    const match = cleanText.match(pattern);
    if (match && match[1]) {
      const cnic = match[1].replace(/[^\d]/g, '');
      if (cnic.length === 13) {
        result.CNIC = cnic;
        console.log('Found CNIC:', result.CNIC);
        break;
      }
    }
  }
  
  // If no CNIC found, check for CNIC in the table parsing fallback
  if (!result.CNIC) {
    // Try to find CNIC in the text (format like "3810360039127" from screenshot)
    const cnicSimpleMatch = cleanText.match(/(\d{5}\s?\d{7}\s?\d{1})/);
    if (cnicSimpleMatch) {
      result.CNIC = cnicSimpleMatch[1].replace(/\s/g, '');
    }
  }
  
  // Validate we have at least some data
  if (!result.Name && !result.Address && !result.CNIC) {
    console.log('No valid data extracted from Telenor format');
    return null;
  }
  
  return result;
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

/* ------------------------- Helper Functions ------------------------- */
function removeDuplicates(records) {
  const unique = [];
  const seen = new Set();

  for (const rec of records) {
    const key = `${rec.Mobile || ''}-${rec.CNIC || ''}-${rec.Name || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(rec);
    }
  }

  return unique;
}

function formatProperName(name) {
  return name
    .split(' ')
    .map(word => {
      if (word.length > 0) {
        // Handle names like "MUHAMMAD" -> "Muhammad"
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');
}

function formatAddress(address) {
  return address
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word, index) => {
      // Keep location keywords in uppercase
      const locationWords = [
        'TEHSIL', 'ZILAH', 'POST', 'OFFICE', 'DISTRICT',
        'BHAKKAR', 'LACHMAN', 'WALA', 'ZAMEWALA', 
        'GHULAMAN', 'KALOR', 'KOT', 'NUMBER'
      ];
      
      const upperWord = word.toUpperCase();
      if (locationWords.includes(upperWord)) {
        return upperWord;
      }
      
      // Proper case for other words
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');
}