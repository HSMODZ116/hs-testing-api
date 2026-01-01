// Telenor Sim Owner Details API - Updated for freshsimdata.net
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
          message: 'Use mobile number in format: 03451234567 or 923451234567'
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
          message: 'Enter mobile number starting with 03 or 92'
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

      // Validate Pakistani number format
      if (!/^03\d{9}$/.test(phoneNumber)) {
        return Response.json({
          success: false,
          error: 'Invalid mobile number format',
          message: 'Please enter valid Pakistani mobile number (03451234567 or 923451234567)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch data for the number
      const data = await fetchFreshSimData(phoneNumber);
      
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

// ========== FETCH FROM FRESHSIMDATA.NET ==========
async function fetchFreshSimData(phoneNumber) {
  const url = 'https://freshsimdata.net/numberDetails.php';
  
  const formData = new URLSearchParams();
  formData.append('number', phoneNumber);
  formData.append('searchBtn', 'search');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://freshsimdata.net',
        'Referer': 'https://freshsimdata.net/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData.toString()
    });

    const html = await response.text();
    return extractFreshSimData(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch data from server'
    };
  }
}

// ========== EXTRACT DATA FROM FRESHSIMDATA ==========
function extractFreshSimData(html, phoneNumber) {
  // Check if no records found
  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes('no record found') || 
      lowerHtml.includes('data not found') ||
      lowerHtml.includes('try another') ||
      (lowerHtml.includes('sorry') && lowerHtml.includes('not found'))) {
    return {
      success: false,
      message: 'No record found for this number'
    };
  }

  const result = {
    success: true,
    record: {
      mobile: phoneNumber,
      name: '',
      cnic: '',
      address: '',
      network: 'Telenor',
      developer: 'Haseeb Sahil'
    },
    message: 'Data retrieved successfully'
  };

  // ===== EXTRACT FROM SCREENSHOT-LIKE FORMAT =====
  // Based on the screenshot structure
  
  // Clean HTML for better parsing
  const cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const upperHtml = cleanHtml.toUpperCase();

  // ===== EXTRACT MSISDN (Mobile Number) =====
  const msisdnMatch = upperHtml.match(/MSISDN\s+(\d+)/i);
  if (msisdnMatch && msisdnMatch[1]) {
    result.record.mobile = '0' + msisdnMatch[1];
  }

  // ===== EXTRACT NAME =====
  // Look for "has been deducted/collected from" pattern
  const namePatterns = [
    /HAS BEEN DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]+?)(?=\s+LACHMAN|\s+TEHSIL|\s+HAVING|\s+CNIC|$)/i,
    /DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]+?)(?=\s+LACHMAN|\s+TEHSIL|\s+HAVING|\s+CNIC|$)/i,
    /FROM\s+([A-Z][A-Z\s]+?)(?=\s+LACHMAN|\s+TEHSIL|\s+HAVING|\s+CNIC|$)/i
  ];

  for (const pattern of namePatterns) {
    const match = upperHtml.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name && name.length > 3 && !name.includes('DEDUCTED') && !name.includes('COLLECTED')) {
        result.record.name = formatName(name);
        break;
      }
    }
  }

  // ===== EXTRACT ADDRESS =====
  if (result.record.name) {
    // Find address after name
    const nameIndex = upperHtml.indexOf(result.record.name.toUpperCase());
    if (nameIndex !== -1) {
      const afterName = upperHtml.substring(nameIndex + result.record.name.length);
      
      const addressPatterns = [
        /([A-Z\s,.-]+?TEHSIL[A-Z\s]+?ZILAH[A-Z\s]+?$)/,
        /([A-Z\s,.-]+?(?:TEHSIL|DISTRICT|POST OFFICE)[A-Z\s,.-]+?$)/,
        /([A-Z\s,.-]+?(?:TEHSIL|DISTRICT)[A-Z\s,.-]+?(?:CNIC|NTN|$))/,
        /([A-Z\s,.-]+?(?:POST OFFICE)[A-Z\s,.-]+?(?:TEHSIL|CNIC|$))/
      ];

      for (const pattern of addressPatterns) {
        const addressMatch = afterName.match(pattern);
        if (addressMatch && addressMatch[1]) {
          let address = addressMatch[1].trim();
          
          // Remove "having NTN number holder of CNIC No." or similar text
          address = address.replace(/HAVING NTN NUMBER HOLDER OF CNIC NO.*$/i, '');
          address = address.replace(/HOLDER OF CNIC NO.*$/i, '');
          
          if (address.length > 10) {
            result.record.address = formatAddress(address);
            break;
          }
        }
      }
    }
  }

  // Alternative address extraction from specific patterns
  if (!result.record.address) {
    const addressPatterns = [
      /LACHMAN WALA POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH[\s\S]+?BHAKKAR/i,
      /POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+/i,
      /TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+/i
    ];

    for (const pattern of addressPatterns) {
      const match = upperHtml.match(pattern);
      if (match && match[0]) {
        const address = match[0].trim();
        if (address.length > 20) {
          result.record.address = formatAddress(address);
          break;
        }
      }
    }
  }

  // ===== EXTRACT CNIC =====
  const cnicPatterns = [
    /CNIC NO[.\s]*(\d{5}[-]?\d{7}[-]?\d{1})/i,
    /HOLDER OF CNIC NO[.\s]*(\d{5}[-]?\d{7}[-]?\d{1})/i,
    /(\d{5}[-]\d{7}[-]\d{1})/,
    /(\d{13})/
  ];

  for (const pattern of cnicPatterns) {
    const match = upperHtml.match(pattern);
    if (match && match[1]) {
      let cnic = match[1].replace(/[^\d]/g, '');
      if (cnic.length === 13 && cnic !== '0000000000000') {
        result.record.cnic = cnic;
        break;
      }
    }
  }

  // ===== FALLBACK: DOM PARSING =====
  if (!result.record.name || !result.record.address) {
    // Try to parse table structure if exists
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Look for text content in paragraphs or divs
    const textElements = doc.querySelectorAll('p, div, span, td');
    let fullText = '';
    
    textElements.forEach(el => {
      if (el.textContent && el.textContent.trim().length > 20) {
        fullText += ' ' + el.textContent.trim();
      }
    });

    if (fullText) {
      const upperText = fullText.toUpperCase();
      
      // Extract name from text
      if (!result.record.name) {
        const nameMatch = upperText.match(/FROM\s+([A-Z][A-Z\s]+?)(?=\s+(?:LACHMAN|POST|TEHSIL|CNIC|$))/i);
        if (nameMatch && nameMatch[1]) {
          result.record.name = formatName(nameMatch[1]);
        }
      }
      
      // Extract address from text
      if (!result.record.address && result.record.name) {
        const addressMatch = upperText.match(/POST OFFICE[\s\S]+?(?:TEHSIL|DISTRICT)[\s\S]+?(?:CNIC|$)/i);
        if (addressMatch && addressMatch[0]) {
          result.record.address = formatAddress(addressMatch[0]);
        }
      }
    }
  }

  // ===== FINAL VALIDATION =====
  if (!result.record.name && !result.record.address && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid data found in the response'
    };
  }

  // Clean and format data
  if (result.record.address) {
    result.record.address = result.record.address
      .replace(/^(?:DEDUCTED|COLLECTED|FROM)\s*/gi, '')
      .replace(/\.{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return result;
}

// ========== HELPER FUNCTIONS ==========
function formatName(name) {
  return name
    .toUpperCase()
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
}

function formatAddress(address) {
  return address
    .toUpperCase()
    .replace(/[^\w\s,.-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/,/g, ', ')
    .replace(/\s*,\s*/g, ', ')
    .trim()
    .split(' ')
    .map(word => {
      if (['TEHSIL', 'ZILAH', 'POST', 'OFFICE', 'DISTRICT'].includes(word)) {
        return word;
      }
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(' ');
}