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
      network: detectNetwork(phoneNumber),
      developer: 'Haseeb Sahil'
    },
    message: 'Data retrieved successfully'
  };

  // ===== EXTRACT NAME =====
  // Look for name in table structure
  const namePatterns = [
    /deducted\/collected from<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
    /<td[^>]*>deducted\/collected from<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
    /deducted\/collected from.*?<td[^>]*>([^<]+)<\/td>/i
  ];

  for (const pattern of namePatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name && name.length > 1 && !name.includes('border-bottom') && name !== '.' && !/^[.\s]+$/.test(name)) {
        result.record.name = cleanTextContent(name);
        break;
      }
    }
  }

  // ===== EXTRACT CNIC =====
  // Look for CNIC in holder of CNIC row
  const cnicPatterns = [
    /holder of CNIC No\.<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
    /CNIC No\.<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
    /holder of CNIC.*?<td[^>]*>([^<]+)<\/td>/i,
    /(\d{5}[-]?\d{7}[-]?\d{1})/
  ];

  for (const pattern of cnicPatterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      let cnic = match[1].trim().replace(/[^\d]/g, '');
      if (cnic.length === 13 && cnic !== '0000000000000') {
        result.record.cnic = cnic;
        break;
      }
    }
  }

  // ===== EXTRACT ADDRESS =====
  // First try: Look for address after name in table
  if (result.record.name) {
    // Find the row after name
    const nameRegex = new RegExp(`deducted\\/collected from[^<]*<td[^>]*>${escapeRegex(result.record.name)}<\\/td>`, 'i');
    const nameMatch = html.match(nameRegex);
    
    if (nameMatch) {
      const afterName = html.substring(nameMatch.index + nameMatch[0].length);
      
      // Look for the next table row with content
      const rowRegex = /<tr[^>]*>[\s\S]*?<td[^>]*>([^<]+)<\/td>[\s\S]*?<\/tr>/gi;
      const rows = afterName.match(rowRegex);
      
      if (rows && rows.length > 0) {
        for (const row of rows) {
          const cellMatch = row.match(/<td[^>]*>([^<]+)<\/td>/);
          if (cellMatch && cellMatch[1]) {
            const text = cellMatch[1].trim();
            // Check if this looks like an address (not empty, not just dots, not CNIC)
            if (text && text !== '.' && !/^\d{13}$/.test(text.replace(/\D/g, '')) && 
                text.length > 10 && !text.includes('border-bottom')) {
              result.record.address = cleanTextContent(text);
              break;
            }
          }
        }
      }
    }
  }

  // Second try: Direct extraction from specific pattern
  if (!result.record.address) {
    const addressPatterns = [
      /<td[^>]*>LACHMAN[^<]+<\/td>/i,
      /<td[^>]*>([A-Z][A-Z\s]+(?:POST OFFICE|TEHSIL|ZILAH|DISTRICT)[^<]+)<\/td>/i,
      /<td[^>]*>([A-Z][A-Z\s]{20,})<\/td>/
    ];

    for (const pattern of addressPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const address = match[1].trim();
        if (address && address.length > 15) {
          result.record.address = cleanTextContent(address);
          break;
        }
      }
    }
  }

  // Clean address from unwanted prefixes
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
function detectNetwork(phoneNumber) {
  const prefix = phoneNumber.substring(0, 4);
  const networks = {
    '0300': 'Mobilink',
    '0301': 'Mobilink',
    '0302': 'Mobilink',
    '0303': 'Ufone',
    '0304': 'Telenor',
    '0305': 'Telenor',
    '0306': 'Telenor',
    '0307': 'Telenor',
    '0308': 'Zong',
    '0309': 'Zong',
    '0310': 'Zong',
    '0311': 'Zong',
    '0312': 'Telenor',
    '0313': 'Ufone',
    '0314': 'Zong',
    '0315': 'Zong',
    '0316': 'Warid',
    '0317': 'Warid',
    '0318': 'Warid',
    '0319': 'SCOM',
    '0320': 'Jazz',
    '0321': 'Zong',
    '0322': 'Warid',
    '0323': 'Ufone',
    '0324': 'Mobilink',
    '0325': 'Mobilink',
    '0326': 'Mobilink',
    '0327': 'Mobilink',
    '0328': 'Mobilink',
    '0329': 'Mobilink',
    '0330': 'Mobilink',
    '0331': 'Zong',
    '0332': 'Warid',
    '0333': 'Ufone',
    '0334': 'Mobilink',
    '0335': 'Mobilink',
    '0336': 'Mobilink',
    '0337': 'Jazz',
    '0338': 'Warid',
    '0339': 'Warid',
    '0340': 'Telenor',
    '0341': 'Telenor',
    '0342': 'Telenor',
    '0343': 'Zong',
    '0344': 'Telenor',
    '0345': 'Telenor',
    '0346': 'Telenor',
    '0347': 'Telenor',
    '0348': 'Warid',
    '0349': 'Zong'
  };
  
  return networks[prefix] || 'Unknown';
}

function cleanTextContent(text) {
  return text
    .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
    .replace(/&nbsp;/g, ' ')   // Remove &nbsp;
    .replace(/[^\w\s.,\-]/gi, ' ')  // Keep only letters, numbers, spaces, dots, commas and hyphens
    .replace(/\s+/g, ' ')      // Remove extra spaces
    .replace(/\.{2,}/g, ' ')   // Remove multiple dots
    .trim();
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}