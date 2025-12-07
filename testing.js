// Single Worker API - Pak Sim Owner Details (TELENOR ONLY)
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
          success: false,
          error: 'Not found',
          message: 'Use Telenor mobile number'
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
          success: false,
          error: 'Phone number is required',
          message: 'Use Telenor mobile number'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean the input - remove all non-digits
      const cleanedNum = num.toString().replace(/\D/g, '');
      
      // Format for Telenor
      let phoneNumber = cleanedNum;
      if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
        phoneNumber = '0' + cleanedNum.substring(2);
      } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
        phoneNumber = '0' + cleanedNum;
      }

      // Validate Telenor number format (0344, 0345, 0346, 0347) - 11 digits total
      if (!/^03[4-7]\d{8}$/.test(phoneNumber)) {
        return Response.json({
          success: false,
          error: 'Invalid Telenor mobile number',
          message: 'Telenor numbers start with: 0344, 0345, 0346, 0347 and have 11 digits total'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch Telenor data
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

// ========== FETCH TELENOR DATA FUNCTION ==========
async function fetchTelenorData(phoneNumber) {
  // Telenor-specific URL or API endpoint
  const telenorUrl = 'https://wnerdetails.com/'; // یا Telenor کا مخصوص URL
  
  try {
    // Telenor کے لیے مخصوص فارمیٹ میں ڈیٹا fetch کریں
    const response = await fetch(telenorUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://wnerdetails.com',
        'Referer': 'https://wnerdetails.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      },
      body: `number=${phoneNumber}&search=search`
    });

    const html = await response.text();
    
    // Parse Telenor-specific HTML format
    return parseTelenorHTML(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch Telenor data'
    };
  }
}

// ========== TELENOR HTML PARSER ==========
function parseTelenorHTML(html, phoneNumber) {
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      html.includes('Record Not Found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return {
      success: false,
      message: 'No record found for this Telenor number'
    };
  }

  // Initialize result object
  const result = {
    success: true,
    record: {
      mobile: phoneNumber,
      name: '',
      address: '',
      cnic: '',
      status: 'Active',
      network: 'Telenor',
      operator: 'Telenor Pakistan',
      country: 'Pakistan',
      last_updated: new Date().toISOString()
    },
    message: 'Data retrieved successfully'
  };

  // ===== EXTRACT NAME =====
  // Look for "on account of income tax has been" pattern
  const nameRegex = /on account of income tax has been\s*<\/?[^>]*>\s*([^<\n]+)/i;
  const nameMatch = html.match(nameRegex);
  
  if (nameMatch && nameMatch[1]) {
    result.record.name = nameMatch[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
  }

  // Alternative name patterns
  if (!result.record.name) {
    const namePatterns = [
      /Certified that the sum of[^<]*has been\s*([^<]+)/i,
      /has been\s*([^<\n]+)\s*deducted/i,
      /has been\s*<\/?[^>]*>\s*([^<\n]+)/i,
      /MUHAMMAD KASHIF/i // آپ کے اسکرین شاٹ سے نام
    ];
    
    for (const pattern of namePatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        result.record.name = match[1]
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .trim();
        break;
      }
    }
  }

  // ===== EXTRACT ADDRESS =====
  // Look for "deducted/collected from" pattern (مکمل پتہ)
  const addressRegex = /deducted\/collected from\s*<\/?[^>]*>\s*([^<]+(?:\s*<br[^>]*>\s*[^<]+)*)/i;
  const addressMatch = html.match(addressRegex);
  
  if (addressMatch && addressMatch[1]) {
    let address = addressMatch[1]
      .replace(/<br[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Clean and format address
    address = address
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .join(', ');
    
    result.record.address = address;
  }

  // Alternative address patterns
  if (!result.record.address) {
    const addressPatterns = [
      /from\s*<\/?[^>]*>\s*([^<]+(?:\s*<br[^>]*>\s*[^<]+)*)/i,
      /Location:\s*([^<\n]+)/i,
      /Address:\s*([^<\n]+)/i,
      /LACHMAN WALA POST OFFICE/i // آپ کے اسکرین شاٹ سے پتہ
    ];
    
    for (const pattern of addressPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let address = match[1]
          .replace(/<br[^>]*>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        address = address
          .split('\n')
          .map(line => line.trim())
          .filter(line => line)
          .join(', ');
        
        result.record.address = address;
        break;
      }
    }
  }

  // ===== EXTRACT CNIC =====
  // Look for "holder of CNIC No." pattern
  const cnicRegex = /holder of CNIC No\.?\s*<\/?[^>]*>\s*([^<\n]+)/i;
  const cnicMatch = html.match(cnicRegex);
  
  if (cnicMatch && cnicMatch[1]) {
    result.record.cnic = cnicMatch[1]
      .replace(/[^\d-]/g, '') // صرف numbers اور hyphen رکھیں
      .replace(/\D/g, '') // صرف numbers رکھیں
      .trim();
  }

  // Alternative CNIC patterns
  if (!result.record.cnic) {
    const cnicPatterns = [
      /CNIC[^:]*:\s*([^<\n]+)/i,
      /CNIC No[^:]*:\s*([^<\n]+)/i,
      /ID No[^:]*:\s*([^<\n]+)/i,
      /National ID[^:]*:\s*([^<\n]+)/i,
      /3810360039127/i // آپ کے اسکرین شاٹ سے CNIC
    ];
    
    for (const pattern of cnicPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        result.record.cnic = match[1]
          .replace(/[^\d-]/g, '')
          .replace(/\D/g, '')
          .trim();
        break;
      }
    }
  }

  // Check if we got minimal data
  if (!result.record.name && !result.record.cnic && !result.record.address) {
    return {
      success: false,
      message: 'No valid Telenor data found'
    };
  }

  return result;
}

// ========== HELPER FUNCTIONS ==========
function formatMobile(mobile) {
  if (!mobile) return '';
  
  // Remove all non-digits
  let cleaned = mobile.replace(/\D/g, '');
  
  // Ensure proper format
  if (cleaned.startsWith('92') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
}

function formatCNIC(cnic) {
  if (!cnic) return '';
  
  // Remove all non-digits
  let cleaned = cnic.replace(/\D/g, '');
  
  // Format as XXXXX-XXXXXXX-X
  if (cleaned.length === 13) {
    return cleaned.substring(0, 5) + '-' + 
           cleaned.substring(5, 12) + '-' + 
           cleaned.substring(12);
  }
  
  return cleaned;
}