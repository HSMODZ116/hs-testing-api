// Zong Single Number API - Pak Sim Owner Details
// File: worker.js

export default {
  async fetch(request) {
    try {
      // Handle CORS
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }

      const url = new URL(request.url);
      const path = url.pathname;

      // Only handle root path
      if (path !== '/') {
        return new Response(JSON.stringify({
          error: 'Not found',
          message: 'Use Zong mobile number for search'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the number parameter
      const num = url.searchParams.get('num');

      // If no num parameter
      if (!num) {
        return Response.json({
          error: 'Phone number is required',
          message: 'Use Zong mobile number starting with 03'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean the input - remove all non-digits
      const cleanedNum = num.toString().replace(/\D/g, '');
      
      // Add leading zero if needed
      let phoneNumber = cleanedNum;
      if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
        phoneNumber = '0' + cleanedNum.substring(2);
      } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
        phoneNumber = '0' + cleanedNum;
      }

      // Validate Pakistani number format
      if (!/^03\d{9}$/.test(phoneNumber)) {
        return Response.json({
          error: 'Invalid mobile number',
          message: 'Use Pakistani mobile number starting with 03'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if it's a Zong number (033X, 034X)
      const prefix = phoneNumber.substring(2, 4);
      const zongPrefixes = ['33', '34'];
      
      if (!zongPrefixes.includes(prefix)) {
        return Response.json({
          error: 'Not a Zong number',
          message: 'Only Zong numbers are supported (033X, 034X)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch data
      const data = await fetchZongData(phoneNumber);
      
      // Return only real data
      return Response.json(data, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      return Response.json({
        error: 'Server error',
        message: error.message
      }, {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// ========== FETCH ZONG DATA ==========
async function fetchZongData(phoneNumber) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  const formData = new URLSearchParams();
  formData.append('number', phoneNumber);
  formData.append('search', 'search');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://paksimownerdetails.com',
        'Referer': 'https://paksimownerdetails.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData.toString()
    });

    const html = await response.text();
    return extractRealData(html, phoneNumber);
    
  } catch (error) {
    return {
      real_name: "",
      real_cnic: "",
      real_address: "",
      message: "Failed to fetch data"
    };
  }
}

// ========== EXTRACT REAL DATA ==========
function extractRealData(html, phoneNumber) {
  const result = {
    real_name: "",
    real_cnic: "",
    real_address: ""
  };

  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return result;
  }

  // Clean HTML for text extraction
  const cleanText = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const upperText = cleanText.toUpperCase();

  // ===== EXTRACT REAL CNIC =====
  // Look for CNIC pattern with 13 digits
  const cnicRegex = /\b(\d{5}[-]?\d{7}[-]?\d)\b/g;
  let cnicMatch;
  
  while ((cnicMatch = cnicRegex.exec(upperText)) !== null) {
    const possibleCNIC = cnicMatch[1].replace(/\D/g, '');
    if (possibleCNIC.length === 13) {
      result.real_cnic = formatCNIC(possibleCNIC);
      break;
    }
  }

  // ===== EXTRACT REAL NAME =====
  // Look for name in certificate format
  const namePatterns = [
    // Pattern 1: FROM [NAME] HAVING/HOLDER/CNIC
    /FROM\s+([A-Z][A-Z\s]{2,50}?)\s+(?:HAVING|HOLDER|CNIC|ON)/,
    // Pattern 2: Rupees [NAME] HAVING/HOLDER
    /RUPEES\s+([A-Z][A-Z\s]{2,50}?)\s+(?:HAVING|HOLDER)/,
    // Pattern 3: Tax [NAME] HAVING/HOLDER
    /TAX\s+([A-Z][A-Z\s]{2,50}?)\s+(?:HAVING|HOLDER)/,
    // Pattern 4: Certificate that [NAME] 
    /CERTIFIED\s+THAT\s+([A-Z][A-Z\s]{2,50}?)\s+(?:HAS|HAVING|HOLDER)/
  ];

  for (const pattern of namePatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      const extractedName = cleanTextContent(match[1]);
      if (extractedName.length > 2 && !extractedName.includes('TAX') && !extractedName.includes('CERTIFIED')) {
        result.real_name = formatName(extractedName);
        break;
      }
    }
  }

  // ===== EXTRACT REAL ADDRESS =====
  if (result.real_name) {
    // Find name in text
    const nameIndex = upperText.indexOf(result.real_name.toUpperCase());
    if (nameIndex !== -1) {
      const textAfterName = cleanText.substring(nameIndex + result.real_name.length);
      
      // Look for address ending markers
      const endMarkers = ['HAVING', 'HOLDER', 'CNIC', 'ON', 'NTN', 'MOBILE'];
      let addressText = textAfterName;
      let endIndex = -1;
      
      for (const marker of endMarkers) {
        const index = addressText.toUpperCase().indexOf(marker);
        if (index !== -1 && (endIndex === -1 || index < endIndex)) {
          endIndex = index;
        }
      }
      
      if (endIndex !== -1) {
        addressText = addressText.substring(0, endIndex);
      }
      
      // Take first 100 characters as address
      addressText = addressText.substring(0, 100).trim();
      
      // Clean address
      const cleanAddress = cleanTextContent(addressText);
      if (cleanAddress.length > 3 && 
          !cleanAddress.includes('CERTIFIED') && 
          !cleanAddress.includes('TAX') &&
          !cleanAddress.includes('RUPEES')) {
        result.real_address = cleanAddress;
      }
    }
  }

  return result;
}

// ========== HELPER FUNCTIONS ==========
function cleanTextContent(text) {
  return text
    .replace(/[^A-Z\s.,\-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatName(name) {
  return name
    .split(' ')
    .map(word => {
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');
}

function formatCNIC(cnic) {
  if (!cnic || cnic.length !== 13) return cnic;
  // Remove any existing dashes
  const digits = cnic.replace(/\D/g, '');
  if (digits.length === 13) {
    return digits.substring(0, 5) + '-' + digits.substring(5, 12) + '-' + digits.substring(12);
  }
  return cnic;
}