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
  const url = 'https://freshsimdata.net/numberDetails.php';
  
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
    return extractTelenorData(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch data'
    };
  }
}

// ========== EXTRACT TELENOR DATA ==========
function extractTelenorData(html, phoneNumber) {
  // Check if no records found - Looser check
  // Only fail if explicitly says "No record found"
  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes('no record found') && 
      (lowerHtml.includes('sorry') || lowerHtml.includes('try again'))) {
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

  // ===== BETTER EXTRACTION FROM TABLE =====
  // First try to find the main table
  const tableMatch = html.match(/<table[^>]*>[\s\S]*?<\/table>/i);
  
  if (tableMatch) {
    const tableHtml = tableMatch[0];
    
    // ===== EXTRACT NAME =====
    // Look for name in table structure
    const namePatterns = [
      /<td[^>]*>has been<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
      /has been[\s\S]*?<td[^>]*>([^<]+)<\/td>\s*<\/tr>\s*<tr[^>]*>\s*<td[^>]*>deducted\/collected from<\/td>/i,
      /has been[\s\S]*?<td[^>]*>([A-Z][A-Z\s]+)<\/td>/i
    ];
    
    for (const pattern of namePatterns) {
      const match = tableHtml.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        if (name && name !== '.' && !name.includes('border-bottom')) {
          result.record.name = cleanTextContent(name);
          break;
        }
      }
    }
    
    // ===== EXTRACT ADDRESS =====
    if (result.record.name) {
      const addressPattern = /deducted\/collected from<\/td>\s*<td[^>]*colspan="[^"]*"[^>]*>([^<]+)<\/td>/i;
      const addressMatch = tableHtml.match(addressPattern);
      
      if (addressMatch && addressMatch[1]) {
        const address = addressMatch[1].trim();
        if (address && address !== '.' && address.length > 10) {
          result.record.address = cleanTextContent(address);
        }
      }
    }
    
    // ===== EXTRACT CNIC =====
    const cnicPatterns = [
      /holder of CNIC No\.<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
      /CNIC No\.<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
      /on<\/td>\s*<td[^>]*>([^<]+)<\/td>/i
    ];
    
    for (const pattern of cnicPatterns) {
      const match = tableHtml.match(pattern);
      if (match && match[1]) {
        const cnic = match[1].trim().replace(/[^\d]/g, '');
        if (cnic.length === 13 && cnic !== '0000000000000') {
          result.record.cnic = cnic;
          break;
        }
      }
    }
  }

  // ===== FALLBACK: TEXT EXTRACTION =====
  if (!result.record.name || !result.record.address) {
    // Clean HTML to text
    let cleanText = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const upperText = cleanText.toUpperCase();
    
    // Extract name
    if (!result.record.name) {
      const nameRegex = /HAS BEEN\s+([A-Z][A-Z\s]+?)\s+(?:DEDUCTED|COLLECTED|FROM)/i;
      const nameMatch = upperText.match(nameRegex);
      if (nameMatch && nameMatch[1]) {
        result.record.name = cleanTextContent(nameMatch[1]);
      }
    }
    
    // Extract address
    if (!result.record.address && result.record.name) {
      const nameIndex = upperText.indexOf(result.record.name);
      if (nameIndex !== -1) {
        const afterName = upperText.substring(nameIndex + result.record.name.length);
        const addressMatch = afterName.match(/DEDUCTED\/COLLECTED FROM\s+([A-Z\s.,]+?)(?=\s+(?:HAVING|HOLDER|CNIC|ON))/i);
        if (addressMatch && addressMatch[1]) {
          result.record.address = cleanTextContent(addressMatch[1]);
        }
      }
    }
    
    // Extract CNIC
    if (!result.record.cnic) {
      const cnicMatch = upperText.match(/(\d{5}-\d{7}-\d{1})/);
      if (cnicMatch && cnicMatch[1]) {
        result.record.cnic = cnicMatch[1].replace(/-/g, '');
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

  // Clean address
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
function cleanTextContent(text) {
  return text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/[^\w\s.,\-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .trim();
}