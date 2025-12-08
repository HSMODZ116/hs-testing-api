// Zong Sim Owner Details API
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

      if (path !== '/') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Not found',
          message: 'Use Zong mobile number starting with 031, 032, 033'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const num = url.searchParams.get('num');

      if (!num) {
        return Response.json({
          success: false,
          error: 'Phone number is required',
          message: 'Use Zong mobile number starting with 031, 032, 033'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const cleanedNum = num.toString().replace(/\D/g, '');
      
      let phoneNumber = cleanedNum;
      if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
        phoneNumber = '0' + cleanedNum.substring(2);
      } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
        phoneNumber = '0' + cleanedNum;
      }

      // Validate Zong number ONLY (031x, 032x, 033x)
      if (!/^03[1-3]\d{8}$/.test(phoneNumber)) {
        return Response.json({
          success: false,
          error: 'Invalid Zong mobile number',
          message: 'Only Zong numbers are supported: 031, 032, 033'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch data
      const data = await fetchZongData(phoneNumber);
      
      // Return response
      return Response.json({
        success: data.success,
        phone: phoneNumber,
        data: data.record || null,
        message: data.message
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });

    } catch (error) {
      return Response.json({
        success: false,
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
    return extractZongData(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch Zong data'
    };
  }
}

// ========== EXTRACT ZONG DATA ==========
function extractZongData(html, phoneNumber) {
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return {
      success: false,
      message: 'No Zong record found for this number'
    };
  }

  const result = {
    success: true,
    record: {
      mobile: phoneNumber,
      name: '',
      cnic: '',
      address: '',
      network: 'Zong',
      developer: 'Haseeb Sahil'
    },
    message: 'Zong data retrieved successfully'
  };

  // ===== CLEAN HTML AND CONVERT TO TEXT =====
  let cleanText = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Case sensitive text (for name extraction)
  const caseText = cleanText;
  // Uppercase text (for pattern matching)
  const upperText = cleanText.toUpperCase();

  // ===== EXTRACT NAME (REAL NAME) =====
  // Look for name pattern in the HTML (like "rana usman" in screenshot)
  const namePatterns = [
    // Pattern 1: Look for lowercase name after certificate number
    /CFBHK\d+\-[A-Z]+\s+([a-z\s]+?)\s+\d/,
    // Pattern 2: Look for name in sentence case
    /Date of Issue\.\s+\d+\s+[A-Za-z]+\s+\d+\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/,
    // Pattern 3: Direct name extraction from visible text
    /MOBILE#:\s+\d+\s+(?:Certified that a sum of\s+)?(?:Rupees\s+)?(?:On account of\s+)?(?:Income Tax\s+)?(?:has been\s+)?(?:collected\/deducted from\s+)?(?:\(Name and address of the person from whom tax collected\/deducted\)\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/
  ];

  for (const pattern of namePatterns) {
    const match = caseText.match(pattern);
    if (match && match[1]) {
      const extractedName = match[1].trim();
      // Validate name (should have at least 2 characters and contain letters)
      if (extractedName.length >= 2 && /[A-Za-z]/.test(extractedName)) {
        result.record.name = formatName(extractedName);
        break;
      }
    }
  }

  // ===== EXTRACT CNIC =====
  // CNIC pattern: 5 digits - 7 digits - 1 digit
  const cnicRegex = /\b(\d{5}\-\d{7}\-\d)\b/;
  const cnicMatch = cleanText.match(cnicRegex);
  if (cnicMatch) {
    result.record.cnic = cnicMatch[1];
  }

  // Alternative CNIC extraction
  if (!result.record.cnic) {
    const cnicPatterns = [
      /CNIC[:\s]*(\d{5}\-\d{7}\-\d)/i,
      /CNIC NO[.\s]*(\d{5}\-\d{7}\-\d)/i,
      /holder of CNIC no\.\s+(\d{5}\-\d{7}\-\d)/i
    ];
    
    for (const pattern of cnicPatterns) {
      const match = upperText.match(pattern);
      if (match && match[1]) {
        result.record.cnic = match[1];
        break;
      }
    }
  }

  // ===== EXTRACT ADDRESS =====
  // Try to extract address based on name position
  if (result.record.name) {
    const nameUpper = result.record.name.toUpperCase();
    const nameIndex = upperText.indexOf(nameUpper);
    
    if (nameIndex !== -1) {
      const textAfterName = upperText.substring(nameIndex + nameUpper.length);
      
      // Find address ending markers
      const endMarkers = ['HAVING NTN', 'HOLDER OF CNIC', 'CNIC', 'ON 00', 'OR DURING'];
      let endIndex = -1;
      
      for (const marker of endMarkers) {
        const index = textAfterName.indexOf(marker);
        if (index !== -1 && (endIndex === -1 || index < endIndex)) {
          endIndex = index;
        }
      }
      
      if (endIndex === -1) {
        // If no marker found, take reasonable amount of text
        endIndex = Math.min(150, textAfterName.length);
      }
      
      if (endIndex > 0) {
        const addressText = textAfterName.substring(0, endIndex).trim();
        if (addressText.length > 5) {
          result.record.address = cleanAddress(addressText);
        }
      }
    }
  }

  // Alternative address extraction from certificate format
  if (!result.record.address) {
    const addressStart = upperText.indexOf('FROM (NAME AND ADDRESS OF THE PERSON');
    if (addressStart !== -1) {
      const addressText = upperText.substring(addressStart, addressStart + 300);
      const addressEndMarkers = ['HAVING', 'HOLDER', 'CNIC'];
      let addressEnd = -1;
      
      for (const marker of addressEndMarkers) {
        const index = addressText.indexOf(marker);
        if (index !== -1 && (addressEnd === -1 || index < addressEnd)) {
          addressEnd = index;
        }
      }
      
      if (addressEnd > 50) {
        // Extract the part after the "FROM" description
        const fromIndex = addressText.indexOf('FROM');
        if (fromIndex !== -1) {
          const actualAddress = addressText.substring(fromIndex + 4, addressEnd);
          result.record.address = cleanAddress(actualAddress);
        }
      }
    }
  }

  // ===== FINAL VALIDATION =====
  // At least name or CNIC should be present
  if (!result.record.name && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid Zong data found (name or CNIC required)'
    };
  }

  return result;
}

// ========== HELPER FUNCTIONS ==========
function cleanTextContent(text) {
  return text
    .replace(/[^A-Za-z\s.,\-]/g, ' ')  // Keep letters, spaces, dots, commas and hyphens
    .replace(/\s+/g, ' ')               // Remove extra spaces
    .replace(/\.{2,}/g, ' ')            // Remove multiple dots
    .trim();
}

function cleanAddress(text) {
  return text
    .replace(/[^A-Za-z0-9\s.,\-\/]/g, ' ')  // Keep alphanumeric and common address characters
    .replace(/\s+/g, ' ')                   // Remove extra spaces
    .replace(/\([^)]*\)/g, ' ')             // Remove parentheses content
    .trim();
}

function formatName(name) {
  // Capitalize first letter of each word
  return name
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}