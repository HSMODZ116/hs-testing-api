// Combined Sim Owner Details API - Supports all networks including Telenor
// File: worker.js

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

      // Detect network based on prefix
      const network = detectNetwork(phoneNumber);
      console.log(`Detected network: ${network} for number: ${phoneNumber}`);

      let records = [];
      
      // For Telenor numbers (0345, 0346, 0347)
      if (network === 'Telenor') {
        records = await fetchTelenorRecords(phoneNumber);
      } else {
        // For other networks, use your existing code
        records = await fetchRecords(phoneNumber);
        
        // If no records found, also try with CNIC if available from first result
        if (records.length > 0) {
          const cnic = records[0].CNIC;
          if (cnic) {
            const cnicRecords = await fetchRecords(cnic);
            records = [...records, ...cnicRecords];
          }
        }
      }

      // Remove duplicates
      records = removeDuplicates(records);

      if (records.length === 0) {
        return jsonResponse({ 
          success: true, 
          phone: phoneNumber,
          network: network,
          records: [],
          message: 'No records found'
        });
      }

      return jsonResponse({
        success: true,
        phone: phoneNumber,
        network: network,
        records: records,
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

/* ------------------------- Fetch Records (Your existing code) ------------------------- */
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

  try {
    const res = await fetch(POST_URL, {
      method: "POST",
      headers,
      body: payload,
    });

    const html = await res.text();
    return parseTableHtml(html);
  } catch (error) {
    console.error('Error fetching records:', error);
    return [];
  }
}

/* ------------------------- Fetch Telenor Records ------------------------- */
async function fetchTelenorRecords(phoneNumber) {
  console.log(`Fetching Telenor data for: ${phoneNumber}`);
  
  try {
    // Try multiple sources for Telenor data
    const records = [];
    
    // Source 1: onlinesimdatabase.xyz (from your screenshot)
    const data1 = await fetchFromOnlineSimDB(phoneNumber);
    if (data1 && data1.success) {
      records.push(data1.record);
    }
    
    // Source 2: Try freshsimdata.net as fallback
    if (records.length === 0) {
      const data2 = await fetchRecords(phoneNumber);
      records.push(...data2);
    }
    
    return records;
    
  } catch (error) {
    console.error('Error fetching Telenor records:', error);
    return [];
  }
}

/* ------------------------- Fetch from OnlineSimDB ------------------------- */
async function fetchFromOnlineSimDB(phoneNumber) {
  const url = 'https://onlinesimdatabase.xyz/numberDetails.php';
  
  const formData = new URLSearchParams();
  formData.append('searchBtn', 'search');
  formData.append('number', phoneNumber);
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; TECNO KL4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://onlinesimdatabase.xyz',
        'Referer': 'https://onlinesimdatabase.xyz/',
        'Sec-Ch-Ua': '"Chromium";v="107", "Not=A?Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData.toString()
    });
    
    const html = await response.text();
    
    // Check for Cloudflare
    if (html.includes('cf-browser-verification') || html.includes('Checking your browser')) {
      console.log('Cloudflare protection detected');
      return null;
    }
    
    return extractTelenorData(html, phoneNumber);
    
  } catch (error) {
    console.error('Error fetching from OnlineSimDB:', error);
    return null;
  }
}

/* ------------------------- Extract Telenor Data (Special for Telenor format) ------------------------- */
function extractTelenorData(html, phoneNumber) {
  if (!html || html.length < 500) {
    return { success: false, message: 'Empty response' };
  }
  
  // Check for no records
  if (html.toLowerCase().includes('no record found') || 
      html.toLowerCase().includes('data not found')) {
    return { success: false, message: 'No record found' };
  }
  
  // Clean HTML
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const upperText = cleanHtml.toUpperCase();
  
  const result = {
    success: true,
    record: {
      Mobile: phoneNumber,
      Name: '',
      CNIC: '',
      Address: '',
      Network: 'Telenor',
      Country: 'Pakistan'
    },
    message: 'Data retrieved successfully'
  };
  
  // ===== EXTRACT NAME =====
  // Telenor specific patterns from screenshot
  const namePatterns = [
    /HAS BEEN DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]+?)(?=\s+(?:LACHMAN|POST|TEHSIL|ZILAH|$))/i,
    /DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]+?)(?=\s+[A-Z]{4,})/i,
    /FROM\s+([A-Z][A-Z\s]{3,50}?)(?=\s+(?:POST|TEHSIL|$))/i
  ];
  
  for (const pattern of namePatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2) {
        result.record.Name = formatName(name);
        break;
      }
    }
  }
  
  // ===== EXTRACT ADDRESS =====
  if (result.record.Name) {
    const nameUpper = result.record.Name.toUpperCase();
    const nameIndex = upperText.indexOf(nameUpper);
    
    if (nameIndex !== -1) {
      const afterName = upperText.substring(nameIndex + nameUpper.length);
      
      // Look for address patterns specific to Telenor format
      const addressPatterns = [
        /([A-Z][A-Z\s,.-]+POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+)/i,
        /(LACHMAN WALA[\s\S]+?BHAKKAR)/i,
        /(POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+)/i
      ];
      
      for (const pattern of addressPatterns) {
        const match = afterName.match(pattern);
        if (match && match[0]) {
          const address = match[0].trim();
          if (address.length > 20) {
            result.record.Address = formatTelenorAddress(address);
            break;
          }
        }
      }
    }
  }
  
  // ===== EXTRACT CNIC =====
  const cnicPatterns = [
    /CNIC NO[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i,
    /HOLDER OF CNIC[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i,
    /(\d{5}-\d{7}-\d{1})/
  ];
  
  for (const pattern of cnicPatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      const cnic = match[1].replace(/[^\d]/g, '');
      if (cnic.length === 13) {
        result.record.CNIC = cnic;
        break;
      }
    }
  }
  
  // ===== EXTRACT MSISDN =====
  const msisdnMatch = upperText.match(/MSISDN\s*[:]?\s*(\d{10})/i);
  if (msisdnMatch) {
    result.record.Mobile = '0' + msisdnMatch[1];
  }
  
  // Validate we got some data
  if (!result.record.Name && !result.record.Address && !result.record.CNIC) {
    return { success: false, message: 'No data found in response' };
  }
  
  return result;
}

/* ------------------------- HTML Table Parser (Your existing code) ------------------------- */
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

/* ------------------------- Remove Duplicates ------------------------- */
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

/* ------------------------- Helper Functions ------------------------- */
function formatName(name) {
  return name
    .trim()
    .split(' ')
    .map(word => {
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');
}

function formatTelenorAddress(address) {
  return address
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word, index) => {
      // Keep location words in uppercase
      const upperWords = ['TEHSIL', 'ZILAH', 'POST', 'OFFICE', 'DISTRICT', 'BHAKKAR'];
      const upperWord = word.toUpperCase();
      
      if (upperWords.includes(upperWord)) {
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