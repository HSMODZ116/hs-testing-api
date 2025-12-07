// Telenor Sim Owner Details API
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
          message: 'Use Telenor mobile number'
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
          message: 'Use Telenor mobile number starting with 03'
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

      // Validate it's a Telenor number (0344, 0345, 0346, 0347)
      if (!/^03[4-7]\d{8}$/.test(phoneNumber)) {
        return Response.json({
          success: false,
          error: 'Invalid Telenor mobile number',
          message: 'Telenor numbers start with: 0344, 0345, 0346, 0347'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch Telenor data from paksimownerdetails.com
      const data = await fetchTelenorData(phoneNumber);
      
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

// ========== FETCH TELENOR DATA ==========
async function fetchTelenorData(phoneNumber) {
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
    return parseTelenorCertificateHTML(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch data'
    };
  }
}

// ========== TELENOR CERTIFICATE HTML PARSER ==========
function parseTelenorCertificateHTML(html, phoneNumber) {
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return {
      success: false,
      message: 'No record found for this Telenor number'
    };
  }

  const result = {
    success: true,
    record: {
      mobile: phoneNumber,
      name: '',
      address: '',
      cnic: ''
    },
    message: 'Telenor data retrieved successfully'
  };

  // ===== CLEAN HTML AND EXTRACT TEXT =====
  // Remove scripts, styles, and other unnecessary elements
  let cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/onclick=["'][^"']*["']/gi, '')
    .replace(/onload=["'][^"']*["']/gi, '')
    .replace(/javascript:[^"'\s]*/gi, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');

  // ===== EXTRACT NAME =====
  // Method 1: Look for pattern exactly like in screenshot
  const namePatterns = [
    /has been\s+([A-Z][A-Z\s]+?)\s+deducted/i,
    /has been\s+([A-Z][A-Z\s]+?)\s*<\/?/i,
    /has been[^>]*>([^<]+)</i,
    /deducted\/collected from[^>]*>([^<]+)</i
  ];

  for (const pattern of namePatterns) {
    const match = cleanHtml.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 2 && !name.includes('div') && !name.includes('span')) {
        result.record.name = name.toUpperCase();
        break;
      }
    }
  }

  // Method 2: Look in the entire HTML for uppercase name patterns
  if (!result.record.name) {
    const uppercaseWords = cleanHtml.match(/[A-Z][A-Z\s]{2,20}[A-Z]/g);
    if (uppercaseWords) {
      for (const word of uppercaseWords) {
        const cleanWord = word.trim();
        // Check if it looks like a name (not too long, no common address words)
        if (cleanWord.length > 3 && cleanWord.length < 30 &&
            !cleanWord.includes('ROAD') &&
            !cleanWord.includes('TOWN') &&
            !cleanWord.includes('DISTRICT') &&
            !cleanWord.includes('TEHSIL') &&
            !cleanWord.includes('POST') &&
            !cleanWord.includes('OFFICE')) {
          result.record.name = cleanWord;
          break;
        }
      }
    }
  }

  // ===== EXTRACT ADDRESS =====
  // Method 1: Look for address after "deducted/collected from" and name
  if (result.record.name) {
    const nameForRegex = result.record.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const addressPattern = new RegExp(`${nameForRegex}\\s*([^<]+?)\\s*(?:having|holder|on|$)`, 'i');
    const addressMatch = cleanHtml.match(addressPattern);
    
    if (addressMatch && addressMatch[1]) {
      let address = addressMatch[1].trim();
      // Clean the address
      address = cleanAddressText(address);
      if (address.length > 10) {
        result.record.address = address.toUpperCase();
      }
    }
  }

  // Method 2: Look for common address patterns
  if (!result.record.address) {
    const addressPatterns = [
      /LACHMAN WALA POST OFFICE[\s\S]+?BHAKKAR/i,
      /NANKANA ROAD[\s\S]+?DISTRICT F/i,
      /([A-Z][A-Z\s]+ROAD[^<]+DISTRICT[^<]+)/i,
      /([A-Z][A-Z\s]+TOWN[^<]+DISTRICT[^<]+)/i,
      /([A-Z][A-Z\s]+TEHSIL[^<]+DISTRICT[^<]+)/i
    ];

    for (const pattern of addressPatterns) {
      const match = cleanHtml.match(pattern);
      if (match && match[1]) {
        let address = match[1].trim();
        address = cleanAddressText(address);
        if (address.length > 10) {
          result.record.address = address.toUpperCase();
          break;
        }
      }
    }
  }

  // Method 3: Extract all text between name and "having NTN"
  if (!result.record.address && result.record.name) {
    const nameEscaped = result.record.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const betweenRegex = new RegExp(`${nameEscaped}([\\s\\S]+?)having NTN`, 'i');
    const betweenMatch = cleanHtml.match(betweenRegex);
    
    if (betweenMatch && betweenMatch[1]) {
      let address = betweenMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      address = cleanAddressText(address);
      if (address.length > 10) {
        result.record.address = address.toUpperCase();
      }
    }
  }

  // ===== EXTRACT CNIC =====
  // Method 1: Look for CNIC pattern from screenshot
  const cnicPatterns = [
    /holder of CNIC No\.\s*on\s*(\d{13})/i,
    /CNIC No\.\s*(\d{13})/i,
    /(\d{5}-\d{7}-\d{1})/,
    /(\d{13})/
  ];

  for (const pattern of cnicPatterns) {
    const match = cleanHtml.match(pattern);
    if (match && match[1]) {
      const cnic = match[1].replace(/\D/g, '');
      if (cnic.length === 13 && cnic !== '0000000000000') {
        result.record.cnic = cnic;
        break;
      }
    }
  }

  // Method 2: Look for 13-digit number in the text
  if (!result.record.cnic) {
    const allNumbers = cleanHtml.match(/\d{13}/g);
    if (allNumbers) {
      for (const num of allNumbers) {
        if (num !== '0000000000000') {
          result.record.cnic = num;
          break;
        }
      }
    }
  }

  // ===== FINAL VALIDATION =====
  // Check if we have minimal data
  if (!result.record.name && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid Telenor data found in certificate'
    };
  }

  // Clean up the data
  if (result.record.name) {
    result.record.name = result.record.name.toUpperCase();
  }
  
  if (result.record.address) {
    result.record.address = result.record.address.toUpperCase();
  }

  return result;
}

// ========== HELPER FUNCTIONS ==========
function cleanAddressText(text) {
  return text
    .replace(/<[^>]+>/g, ' ')  // Remove HTML tags
    .replace(/[^\w\s.,\-]/g, ' ')  // Remove special characters
    .replace(/\s+/g, ' ')  // Remove extra spaces
    .replace(/\b(?:div|span|class|style|id)\b/gi, '')  // Remove HTML keywords
    .trim();
}

function formatMobile(mobile) {
  if (!mobile) return '';
  let cleaned = mobile.replace(/\D/g, '');
  if (cleaned.startsWith('92') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }
  return cleaned;
}