// Sim Owner Details API
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
          message: 'Use Pakistani mobile number starting with 03'
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
          message: 'Phone number is required'
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

      // Validate Pakistani mobile number format (ALL numbers allowed)
      if (!/^03\d{9}$/.test(phoneNumber)) {
        return Response.json({
          success: false,
          error: 'Invalid Pakistani mobile number',
          message: 'Number must be in format: 03XXXXXXXXX'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Check if it's a Zong number
      const isZongNumber = /^03[1-3]\d{8}$/.test(phoneNumber);
      
      // Fetch data only for Zong numbers
      let data;
      if (isZongNumber) {
        data = await fetchZongData(phoneNumber);
      } else {
        // For non-Zong numbers, return message
        return Response.json({
          success: false,
          phone: phoneNumber,
          data: null,
          message: 'Only Zong numbers (031, 032, 033) are supported for data retrieval'
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
      
      // Return response for Zong numbers
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
      message: 'No record found for this Zong number'
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
    // Pattern 3: Direct name extraction
    /from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:having|holder)/i,
    // Pattern 4: Extract from certificate format
    /collected\/deducted from\s+([^()]+?)\s+having/i
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

  // Alternative: Look for name in uppercase format
  if (!result.record.name) {
    const upperNamePattern = /FROM\s+([A-Z\s]+?)\s+HAVING/;
    const upperMatch = upperText.match(upperNamePattern);
    if (upperMatch && upperMatch[1]) {
      const extractedName = upperMatch[1].trim();
      if (extractedName.length >= 2) {
        result.record.name = formatName(extractedName.toLowerCase());
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
      /holder of CNIC no\.\s+(\d{5}\-\d{7}\-\d)/i,
      /CNIC no\.\s+ON\s+(\d{5}\-\d{7}\-\d)/i
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
        endIndex = Math.min(200, textAfterName.length);
      }
      
      if (endIndex > 0) {
        const addressText = textAfterName.substring(0, endIndex).trim();
        if (addressText.length > 5) {
          result.record.address = cleanAddress(addressText);
        }
      }
    }
  }

  // Alternative address extraction
  if (!result.record.address) {
    // Try to extract address between name and CNIC
    if (result.record.name && result.record.cnic) {
      const nameUpper = result.record.name.toUpperCase();
      const cnicUpper = result.record.cnic;
      
      const nameIndex = upperText.indexOf(nameUpper);
      const cnicIndex = upperText.indexOf(cnicUpper);
      
      if (nameIndex !== -1 && cnicIndex !== -1 && cnicIndex > nameIndex) {
        const addressText = upperText.substring(nameIndex + nameUpper.length, cnicIndex).trim();
        if (addressText.length > 5) {
          result.record.address = cleanAddress(addressText);
        }
      }
    }
  }

  // ===== FINAL VALIDATION =====
  // At least name or CNIC should be present
  if (!result.record.name && !result.record.cnic) {
    // Check if this is actually a Zong record
    if (!upperText.includes('ZONG') && !upperText.includes('MOBILE#')) {
      return {
        success: false,
        message: 'No Zong record found for this number'
      };
    }
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
    .replace(/FROM NAME AND ADDRESS OF THE PERSON/gi, '')
    .replace(/FROM WHOM TAX COLLECTED DEDUCTED/gi, '')
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