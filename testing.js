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

      // ALLOW ALL TYPES OF NUMBERS - NO RESTRICTION HERE
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

      // Fetch data for all numbers
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
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found')) ||
      html.includes('VIP Paid Services') ||
      html.includes('Click here for New Search')) {
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

  // ===== DIRECT TABLE PARSING =====
  // Extract data directly from table structure
  
  // 1. Extract Name from table
  const nameMatch = html.match(/<td[^>]*colspan="[^"]*"[^>]*>([^<]+)<\/td>\s*<\/tr>\s*<tr[^>]*>\s*<td[^>]*>deducted\/collected from<\/td>/i);
  if (nameMatch && nameMatch[1]) {
    const name = nameMatch[1].trim();
    if (name && !name.includes('border-bottom') && name !== '.') {
      result.record.name = cleanTextContent(name);
    }
  }
  
  // Alternative name extraction
  if (!result.record.name) {
    const namePattern = /deducted\/collected from<\/td>\s*<td[^>]*colspan="3"[^>]*>([^<]+)<\/td>/i;
    const nameAltMatch = html.match(namePattern);
    if (nameAltMatch && nameAltMatch[1]) {
      const name = nameAltMatch[1].trim();
      if (name && name !== '.' && !name.includes('border-bottom')) {
        result.record.name = cleanTextContent(name);
      }
    }
  }

  // 2. Extract Address (row after name)
  if (result.record.name) {
    // Find the address row which comes after name
    const addressPattern = new RegExp(`<td[^>]*colspan="3"[^>]*>${escapeRegex(result.record.name)}<\\/td>[\\s\\S]*?<tr[^>]*>[\\s\\S]*?<td[^>]*colspan="[^"]*"[^>]*>([^<]+)<\\/td>`, 'i');
    const addressMatch = html.match(addressPattern);
    
    if (addressMatch && addressMatch[1]) {
      const address = addressMatch[1].trim();
      // Check if it's a valid address (not empty, not just dots)
      if (address && address !== '.' && !address.includes('border-bottom') && address.length > 10) {
        result.record.address = cleanTextContent(address);
      }
    }
  }

  // Alternative address extraction
  if (!result.record.address) {
    // Look for LACHMAN WALA pattern (from your example)
    const addressPattern2 = /<td[^>]*colspan="3"[^>]*>([A-Z\s]+POST OFFICE[^<]+)<\/td>/i;
    const addressMatch2 = html.match(addressPattern2);
    if (addressMatch2 && addressMatch2[1]) {
      const address = addressMatch2[1].trim();
      if (address && address.length > 10) {
        result.record.address = cleanTextContent(address);
      }
    }
  }

  // 3. Extract CNIC
  const cnicPattern = /holder of CNIC No\.<\/td>\s*<td[^>]*colspan="2"[^>]*>\s*([^<]+)<\/td>/i;
  const cnicMatch = html.match(cnicPattern);
  
  if (cnicMatch && cnicMatch[1]) {
    const cnic = cnicMatch[1].trim().replace(/[^\d]/g, '');
    if (cnic.length === 13 && cnic !== '0000000000000') {
      result.record.cnic = cnic;
    }
  }

  // Alternative CNIC extraction
  if (!result.record.cnic) {
    const cnicPattern2 = /(\d{5}-\d{7}-\d{1})/;
    const cnicMatch2 = html.match(cnicPattern2);
    if (cnicMatch2 && cnicMatch2[1]) {
      const cnic = cnicMatch2[1].replace(/-/g, '');
      if (cnic.length === 13) {
        result.record.cnic = cnic;
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
      const nameRegex = /HAS BEEN\s+([A-Z][A-Z\s]+?)\s+DEDUCTED\/COLLECTED FROM/i;
      const nameMatchText = upperText.match(nameRegex);
      if (nameMatchText && nameMatchText[1]) {
        result.record.name = cleanTextContent(nameMatchText[1]);
      }
    }
    
    // Extract address
    if (!result.record.address && result.record.name) {
      const nameIndex = upperText.indexOf(result.record.name);
      if (nameIndex !== -1) {
        const afterName = upperText.substring(nameIndex + result.record.name.length);
        const addressMatchText = afterName.match(/DEDUCTED\/COLLECTED FROM\s+([A-Z\s.,]+?)(?=\s+(?:HAVING|HOLDER|CNIC|ON\s+))/i);
        if (addressMatchText && addressMatchText[1]) {
          result.record.address = cleanTextContent(addressMatchText[1]);
        }
      }
    }
    
    // Extract CNIC
    if (!result.record.cnic) {
      const cnicMatchText = upperText.match(/(\d{5}-\d{7}-\d{1})/);
      if (cnicMatchText && cnicMatchText[1]) {
        result.record.cnic = cnicMatchText[1].replace(/-/g, '');
      }
    }
  }

  // ===== FINAL CLEANUP =====
  // Remove "DEDUCTED COLLECTED FROM" from address if present
  if (result.record.address) {
    result.record.address = result.record.address
      .replace(/^(?:DEDUCTED|COLLECTED|FROM)\s*/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ===== FINAL VALIDATION =====
  if (!result.record.name && !result.record.address && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid data found'
    };
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

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}