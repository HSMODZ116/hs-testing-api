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
        const telenorData = parseTelenorTextFormatImproved(rawHtml, phoneNumber);
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

/* ------------------------- Improved Telenor Text Format Parser ------------------------- */
function parseTelenorTextFormatImproved(html, phoneNumber) {
  console.log('Parsing Telenor text format (improved)...');
  
  // Clean HTML for text extraction - preserve line breaks
  let cleanText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Check if this is Telenor format
  const isTelenorFormat = 
    cleanText.includes('has been deducted/collected from') ||
    cleanText.includes('MSISDN') ||
    cleanText.includes('Serial No') ||
    cleanText.includes('Certified that the sum of Rupees');
  
  if (!isTelenorFormat) {
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
  
  // Get lines for better parsing
  const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  console.log('Total lines:', lines.length);
  
  // ===== FIND KEY SECTIONS =====
  let startIndex = -1;
  let endIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Find where data starts
    if (startIndex === -1 && 
        (line.includes('has been deducted/collected from') || 
         line.includes('Certified that'))) {
      startIndex = i;
    }
    
    // Find where data ends (before paid services)
    if (startIndex !== -1 && endIndex === -1 && 
        (line.includes('Paid Services') || 
         line.includes('Contact') ||
         line.includes('WhatsApp') ||
         line.includes('For All'))) {
      endIndex = i;
      break;
    }
  }
  
  if (startIndex === -1) {
    startIndex = 0;
  }
  if (endIndex === -1) {
    endIndex = Math.min(startIndex + 10, lines.length);
  }
  
  // Extract relevant lines
  const dataLines = lines.slice(startIndex, endIndex);
  console.log('Data lines:', dataLines);
  
  const dataText = dataLines.join('\n');
  const upperText = dataText.toUpperCase();
  
  // ===== EXTRACT MSISDN =====
  const msisdnMatch = upperText.match(/MSISDN\s+(\d{10})/);
  if (msisdnMatch) {
    result.Mobile = '0' + msisdnMatch[1];
  }
  
  // ===== EXTRACT NAME - IMPROVED METHOD =====
  // Method 1: Look for name right after "from" keyword
  const fromIndex = upperText.indexOf('FROM');
  if (fromIndex !== -1) {
    const afterFrom = dataText.substring(fromIndex + 4).trim();
    
    // Take the first line after "from" as name
    const firstLineAfterFrom = afterFrom.split('\n')[0] || afterFrom.split('.')[0];
    if (firstLineAfterFrom && firstLineAfterFrom.trim().length > 3) {
      const potentialName = firstLineAfterFrom.trim();
      
      // Check if it looks like a name (not address keywords)
      if (!potentialName.toUpperCase().includes('POST') &&
          !potentialName.toUpperCase().includes('OFFICE') &&
          !potentialName.toUpperCase().includes('TEHSIL') &&
          !potentialName.toUpperCase().includes('ZILAH') &&
          potentialName.split(' ').length <= 5) {
        
        result.Name = formatProperName(potentialName);
        console.log('Name extracted (Method 1):', result.Name);
      }
    }
  }
  
  // Method 2: Look for lines that look like names
  if (!result.Name) {
    for (const line of dataLines) {
      const trimmedLine = line.trim();
      // Name criteria: starts with capital, 2-5 words, not too long
      if (trimmedLine.length > 3 && 
          trimmedLine.length < 50 &&
          /^[A-Z]/.test(trimmedLine) &&
          !trimmedLine.toUpperCase().includes('POST') &&
          !trimmedLine.toUpperCase().includes('TEHSIL') &&
          !trimmedLine.toUpperCase().includes('ZILAH') &&
          !trimmedLine.toUpperCase().includes('CERTIFIED') &&
          !trimmedLine.toUpperCase().includes('DEDUCTED')) {
        
        const wordCount = trimmedLine.split(' ').filter(w => w.length > 1).length;
        if (wordCount >= 2 && wordCount <= 5) {
          result.Name = formatProperName(trimmedLine);
          console.log('Name extracted (Method 2):', result.Name);
          break;
        }
      }
    }
  }
  
  // ===== EXTRACT ADDRESS - IMPROVED METHOD =====
  // Find address lines (contain location keywords)
  const addressLines = [];
  
  for (let i = 0; i < dataLines.length; i++) {
    const line = dataLines[i].trim();
    const upperLine = line.toUpperCase();
    
    // Skip if it's the name line
    if (result.Name && line.toUpperCase() === result.Name.toUpperCase()) {
      continue;
    }
    
    // Check if line looks like address
    const isAddressLine = 
      (upperLine.includes('POST') && upperLine.includes('OFFICE')) ||
      upperLine.includes('TEHSIL') ||
      upperLine.includes('ZILAH') ||
      upperLine.includes('DISTRICT') ||
      (line.length > 15 && /^[A-Z\s,.-]+$/.test(line)) ||
      (line.includes('.') && line.length > 20);
    
    if (isAddressLine && !upperLine.includes('CNIC') && !upperLine.includes('NTN')) {
      addressLines.push(line);
    }
  }
  
  if (addressLines.length > 0) {
    // Clean address - remove unwanted parts
    let rawAddress = addressLines.join(' ').trim();
    
    // Remove CNIC/NTN parts
    rawAddress = rawAddress.replace(/having ntn number.*$/i, '');
    rawAddress = rawAddress.replace(/holder of cnic no.*$/i, '');
    rawAddress = rawAddress.replace(/cnic no.*$/i, '');
    rawAddress = rawAddress.replace(/3810\d{9}/g, ''); // Remove CNIC if present
    rawAddress = rawAddress.replace(/for all paid services.*$/i, '');
    rawAddress = rawAddress.replace(/contact.*$/i, '');
    
    // Clean up
    rawAddress = rawAddress
      .replace(/\.{2,}/g, '.')
      .replace(/\s+/g, ' ')
      .replace(/^\s*\.\s*|\s*\.\s*$/g, '')
      .trim();
    
    if (rawAddress.length > 10) {
      result.Address = formatAddress(rawAddress);
      console.log('Address extracted:', result.Address);
    }
  }
  
  // ===== EXTRACT CNIC =====
  // Method 1: Look for CNIC pattern
  const cnicPatterns = [
    /CNIC NO[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i,
    /HOLDER OF CNIC[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i,
    /(\d{5}-\d{7}-\d{1})/,
    /3810\d{9}/ // Telenor CNIC often starts with 3810
  ];
  
  for (const pattern of cnicPatterns) {
    const match = dataText.match(pattern);
    if (match) {
      const cnic = match[1] ? match[1].replace(/[^\d]/g, '') : match[0].replace(/[^\d]/g, '');
      if (cnic.length === 13) {
        result.CNIC = cnic;
        console.log('CNIC extracted:', result.CNIC);
        break;
      }
    }
  }
  
  // Method 2: Look for 13 digit number
  if (!result.CNIC) {
    const cnicMatch = dataText.match(/(\d{13})/);
    if (cnicMatch && cnicMatch[1].startsWith('3810')) {
      result.CNIC = cnicMatch[1];
    }
  }
  
  // ===== POST-PROCESSING =====
  // If address contains name-like parts, move them to name
  if (result.Address && !result.Name) {
    const addressWords = result.Address.split(' ');
    if (addressWords.length > 0 && addressWords[0].length > 3) {
      const potentialFirstName = addressWords[0];
      if (/^[A-Z][a-z]+$/.test(potentialFirstName)) {
        result.Name = potentialFirstName;
        // Remove from address
        result.Address = result.Address.substring(potentialFirstName.length).trim();
      }
    }
  }
  
  // Clean up address
  if (result.Address) {
    result.Address = result.Address
      .replace(/^[.,\s]+|[.,\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  // Validate we have at least some data
  if (!result.Name && !result.Address && !result.CNIC) {
    console.log('No valid data extracted');
    return null;
  }
  
  console.log('Final result:', result);
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
        // Handle common name prefixes
        const lowerWord = word.toLowerCase();
        if (lowerWord === 'muhammad' || lowerWord === 'muhammed' || lowerWord === 'mohammad') {
          return 'Muhammad';
        }
        if (lowerWord === 'ali' || lowerWord === 'ahmed' || lowerWord === 'ahmad') {
          return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
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
        'BHAKKAR', 'LACHMAN', 'WALA', 'ZAMEWALA', 'ZIMAY', 'KALO',
        'GHULAMAN', 'KALOR', 'KOT', 'NUMBER'
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