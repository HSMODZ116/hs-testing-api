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

      // Fetch data from paksimownerdetails.com
      const data = await fetchData(phoneNumber);
      
      // Return response with old structure
      return Response.json({
        success: true,
        phone: phoneNumber,
        data: data
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

// ========== FETCH DATA FUNCTION ==========
async function fetchData(phoneNumber) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  // Create form data as per website
  const formData = new URLSearchParams();
  formData.append('number', phoneNumber);
  formData.append('search', 'search');

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
  
  // Check if this is Telenor-specific format (your screenshot format)
  if (html.includes('on account of income tax has been') || 
      html.includes('deducted/collected from') || 
      html.includes('holder of CNIC No.')) {
    return parseTelenorFormatHTML(html, phoneNumber);
  } else {
    // Regular Jazz format
    return parseRegularHTML(html);
  }
}

// ========== TELENOR FORMAT HTML PARSER ==========
function parseTelenorFormatHTML(html, phoneNumber) {
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
    message: 'Telenor data retrieved successfully',
    raw_html: html.substring(0, 500) // debugging کے لیے
  };

  // ===== EXTRACT NAME =====
  // Look for "on account of income tax has been" pattern
  const nameRegex = /on account of income tax has been[\s\S]*?>([^<]+)</i;
  const nameMatch = html.match(nameRegex);
  
  if (nameMatch && nameMatch[1]) {
    result.record.name = nameMatch[1]
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Alternative name search
  if (!result.record.name) {
    // Look for text after "has been"
    const hasBeenRegex = /has been[\s\S]*?>([^<]+)</i;
    const hasBeenMatch = html.match(hasBeenRegex);
    
    if (hasBeenMatch && hasBeenMatch[1]) {
      result.record.name = hasBeenMatch[1]
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // ===== EXTRACT ADDRESS =====
  // Look for "deducted/collected from" pattern
  const addressRegex = /deducted\/collected from[\s\S]*?>([^<]+(?:<br[^>]*>[\s\S]*?)*?)</i;
  const addressMatch = html.match(addressRegex);
  
  if (addressMatch && addressMatch[1]) {
    let address = addressMatch[1]
      .replace(/<br[^>]*>/gi, ', ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    result.record.address = address;
  }

  // Alternative address search
  if (!result.record.address) {
    // Look for text after "from"
    const fromRegex = /from[\s\S]*?>([^<]+(?:<br[^>]*>[\s\S]*?)*?)</i;
    const fromMatch = html.match(fromRegex);
    
    if (fromMatch && fromMatch[1]) {
      let address = fromMatch[1]
        .replace(/<br[^>]*>/gi, ', ')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      result.record.address = address;
    }
  }

  // ===== EXTRACT CNIC =====
  // Look for "holder of CNIC No." pattern
  const cnicRegex = /holder of CNIC No\.[\s\S]*?>([^<]+)</i;
  const cnicMatch = html.match(cnicRegex);
  
  if (cnicMatch && cnicMatch[1]) {
    result.record.cnic = cnicMatch[1]
      .replace(/\D/g, '')
      .trim();
  }

  // Alternative CNIC search
  if (!result.record.cnic) {
    // Look for CNIC pattern anywhere in text
    const cnicPattern = /(\d{5}-\d{7}-\d{1}|\d{13})/;
    const cnicPatternMatch = html.match(cnicPattern);
    
    if (cnicPatternMatch) {
      result.record.cnic = cnicPatternMatch[1].replace(/\D/g, '');
    }
  }

  // If no data found, mark as unsuccessful
  if (!result.record.name && !result.record.address && !result.record.cnic) {
    result.success = false;
    result.message = 'No Telenor data found in response';
    delete result.record;
  }

  return result;
}

// ========== REGULAR HTML PARSER (Jazz format) ==========
function parseRegularHTML(html) {
  const result = {
    records: []
  };

  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return result;
  }

  // Look for table rows
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html))) {
    rows.push(rowMatch[1]);
  }

  // Skip header row (first row with th tags)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip header row
    if (row.includes('<th>') || row.toLowerCase().includes('mobile') && 
        row.toLowerCase().includes('name') && row.toLowerCase().includes('cnic')) {
      continue;
    }

    // Extract cells from row
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(row))) {
      let content = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Clean emojis and extra spaces
      content = content.replace(/[^\x00-\x7F]/g, '').trim();
      cells.push(content);
    }

    // We need at least 4 columns: Mobile, Name, CNIC, Address
    if (cells.length >= 4) {
      const record = {
        mobile: formatMobile(cells[0] || ''),
        name: cells[1] || '',
        cnic: formatCNIC(cells[2] || ''),
        address: cells[3] || '',
        status: cells[4] || 'Active',
        network: 'Jazz',
        country: 'Pakistan'
      };

      // Validate record has at least mobile or name
      if (record.mobile || record.name) {
        result.records.push(record);
      }
    }
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
  
  // Return only digits without any formatting
  return cleaned;
}