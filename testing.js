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
        const telenorData = parseTelenorTextFormatFixed(rawHtml, phoneNumber);
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
        !rec.Mobile?.includes('Certified that') &&
        rec.Name.length > 3
      );

      return jsonResponse({
        success: true,
        phone: phoneNumber,
        network: network,
        records: validRecords
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

/* ------------------------- FIXED Telenor Text Format Parser ------------------------- */
function parseTelenorTextFormatFixed(html, phoneNumber) {
  console.log('Parsing Telenor text format (FIXED)...');
  
  // First, clean HTML but preserve structure
  let cleanText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<span[^>]*>/gi, ' ')
    .replace(/<\/span>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Check if this is Telenor format
  const isTelenorFormat = 
    cleanText.includes('has been deducted/collected from') ||
    cleanText.includes('on account of income tax');
  
  if (!isTelenorFormat) {
    console.log('Not Telenor format');
    return null;
  }
  
  console.log('Telenor format detected, parsing...');
  
  const result = {
    Mobile: phoneNumber,
    Name: '',
    CNIC: '',
    Address: '',
    Network: 'Telenor',
    Country: 'Pakistan'
  };
  
  // Get the text between "on account of income tax" and "holder of CNIC No."
  const startMarker = 'on account of income tax';
  const endMarker = 'holder of CNIC No';
  
  const startIndex = cleanText.indexOf(startMarker);
  const endIndex = cleanText.indexOf(endMarker);
  
  if (startIndex === -1 || endIndex === -1) {
    console.log('Could not find markers');
    return null;
  }
  
  // Extract the relevant section
  const dataSection = cleanText.substring(startIndex, endIndex + 100); // +100 to include CNIC
  console.log('Data section extracted:', dataSection.substring(0, 200));
  
  // ===== EXTRACT NAME =====
  // Name comes right after "deducted/collected from" 
  const namePattern = /deducted\/collected from\s+([A-Z][A-Z\s]+?)(?=\s+(?:LACHMAN|POST|TEHSIL|ZILAH|$))/i;
  const nameMatch = dataSection.match(namePattern);
  
  if (nameMatch && nameMatch[1]) {
    const rawName = nameMatch[1].trim();
    // Clean the name - remove extra words
    const nameParts = rawName.split(' ').filter(word => 
      word.length > 1 && 
      !word.includes('.') &&
      word !== 'DEDUCTED' &&
      word !== 'COLLECTED' &&
      word !== 'FROM'
    );
    
    if (nameParts.length > 0) {
      result.Name = formatProperName(nameParts.join(' '));
      console.log('Name extracted:', result.Name);
    }
  }
  
  // If name not found with pattern, try alternative
  if (!result.Name) {
    const lines = dataSection.split('\n').map(line => line.trim());
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('deducted/collected from')) {
        // Look for name in next lines
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const potentialName = lines[j].trim();
          if (potentialName && 
              /^[A-Z][A-Z\s]+$/.test(potentialName) &&
              !potentialName.includes('POST') &&
              !potentialName.includes('TEHSIL') &&
              !potentialName.includes('OFFICE') &&
              potentialName.split(' ').length <= 5) {
            result.Name = formatProperName(potentialName);
            break;
          }
        }
        break;
      }
    }
  }
  
  // ===== EXTRACT ADDRESS =====
  // Address comes after the name
  if (result.Name) {
    const nameUpper = result.Name.toUpperCase();
    const nameIndex = dataSection.toUpperCase().indexOf(nameUpper);
    
    if (nameIndex !== -1) {
      const afterName = dataSection.substring(nameIndex + result.Name.length);
      
      // Find address - it's the text before "holder of CNIC" or "having NTN"
      const addressEndIndex = Math.min(
        afterName.indexOf('holder of CNIC'),
        afterName.indexOf('having NTN'),
        afterName.indexOf('On Our Paid')
      );
      
      if (addressEndIndex !== -1) {
        let rawAddress = afterName.substring(0, addressEndIndex).trim();
        
        // Clean the address
        rawAddress = rawAddress
          .replace(/^\s*,\s*|\s*,\s*$/g, '')
          .replace(/\s+/g, ' ')
          .replace(/\.{2,}/g, ' ')
          .trim();
        
        if (rawAddress.length > 10) {
          result.Address = formatAddress(rawAddress);
          console.log('Address extracted:', result.Address);
        }
      }
    }
  }
  
  // Alternative address extraction
  if (!result.Address) {
    // Look for address patterns
    const addressPatterns = [
      /LACHMAN WALA POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH[\s\S]+?BHAKKAR/i,
      /POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH/i,
      /TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+/i
    ];
    
    for (const pattern of addressPatterns) {
      const match = dataSection.match(pattern);
      if (match) {
        result.Address = formatAddress(match[0]);
        break;
      }
    }
  }
  
  // ===== EXTRACT CNIC =====
  // Look for CNIC in the full text
  const cnicPatterns = [
    /CNIC No\.\s*([\d\s]+)/i,
    /holder of CNIC No\.\s*([\d\s]+)/i,
    /(\d{5}\s?\d{7}\s?\d{1})/,
    /3810\d{9}/
  ];
  
  for (const pattern of cnicPatterns) {
    const match = cleanText.match(pattern);
    if (match) {
      const cnic = (match[1] || match[0]).replace(/\s/g, '');
      if (cnic.length === 13) {
        result.CNIC = cnic;
        console.log('CNIC extracted:', result.CNIC);
        break;
      }
    }
  }
  
  // ===== EXTRACT MSISDN =====
  const msisdnMatch = cleanText.match(/MSISDN\s+(\d{10})/i);
  if (msisdnMatch) {
    result.Mobile = '0' + msisdnMatch[1];
  }
  
  // ===== VALIDATE AND CLEAN =====
  // If address contains name, remove it
  if (result.Address && result.Name) {
    const nameInAddress = result.Address.toUpperCase().indexOf(result.Name.toUpperCase());
    if (nameInAddress !== -1) {
      result.Address = result.Address.substring(0, nameInAddress).trim();
    }
  }
  
  // Clean address further
  if (result.Address) {
    result.Address = result.Address
      .replace(/^[.,\s]+|[.,\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove any remaining CNIC/NTN references
    result.Address = result.Address
      .replace(/having ntn number.*$/i, '')
      .replace(/holder of cnic.*$/i, '')
      .replace(/cnic no.*$/i, '')
      .trim();
  }
  
  // Final validation
  if (!result.Name && !result.Address && !result.CNIC) {
    console.log('No valid data extracted');
    return null;
  }
  
  console.log('Final Telenor data:', result);
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
        // Handle common name formats
        const lowerWord = word.toLowerCase();
        if (lowerWord === 'muhammad' || lowerWord === 'muhammed' || lowerWord === 'mohammad') {
          return 'Muhammad';
        }
        if (lowerWord === 'ali' || lowerWord === 'ahmed' || lowerWord === 'ahmad') {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        if (lowerWord === 'kashif') {
          return 'Kashif';
        }
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
        'BHAKKAR', 'LACHMAN', 'WALA', 'ZAMEWALA', 'ZIMAY',
        'GHULAMAN', 'KALOR', 'KOT', 'NUMBER', 'KALO'
      ];
      
      const upperWord = word.toUpperCase().replace(/[.,]/g, '');
      if (locationWords.includes(upperWord)) {
        return upperWord;
      }
      
      // Proper case for other words
      if (word.length > 0) {
        const cleanWord = word.replace(/[.,]/g, '');
        if (cleanWord.length > 0) {
          return cleanWord.charAt(0).toUpperCase() + cleanWord.slice(1).toLowerCase();
        }
      }
      return word;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}