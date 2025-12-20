// Combined API - Jazz SIM Owner Details (Phone & CNIC Search)
// File: jazz-worker.js

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
          message: 'Use Jazz mobile number (0300-0309 or 0320-0329) or CNIC number'
        }, null, 2), {
          status: 404,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Get the num parameter
      const num = url.searchParams.get('num');

      // If no num parameter
      if (!num) {
        return Response.json({
          success: false,
          error: 'Parameter is required',
          message: 'Use Jazz mobile number (0300-0309 or 0320-0329) or CNIC number'
        }, {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Clean the input - remove all non-digits
      const cleanedNum = num.toString().replace(/\D/g, '');
      
      let result;
      let type;

      // Detect if it's a phone number or CNIC based on length
      if (cleanedNum.length === 13) {
        // It's a CNIC
        type = 'cnic';
        
        // Validate CNIC format
        if (!/^\d{13}$/.test(cleanedNum)) {
          return Response.json({
            success: false,
            error: 'Invalid CNIC format',
            message: 'CNIC must be 13 digits (without dashes)'
          }, {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        result = await fetchData(cleanedNum, 'cnic');
        
      } else if (cleanedNum.length === 10 || cleanedNum.length === 11 || cleanedNum.length === 12) {
        // It's a phone number
        type = 'phone';
        
        // Format phone number
        let phoneNumber = cleanedNum;
        if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
          phoneNumber = '0' + cleanedNum.substring(2);
        } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
          phoneNumber = '0' + cleanedNum;
        }

        // Validate Jazz number format
        const isValidJazzNumber = validateJazzNumber(phoneNumber);
        if (!isValidJazzNumber.valid) {
          return Response.json({
            success: false,
            error: 'Invalid Jazz mobile number',
            message: isValidJazzNumber.message
          }, {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        
        result = await fetchData(phoneNumber, 'phone');
        
      } else {
        return Response.json({
          success: false,
          error: 'Invalid input length',
          message: 'Jazz number should be 11 digits (03XXXXXXXXX) or CNIC should be 13 digits'
        }, {
          status: 400,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Prepare response according to desired structure
      const responseData = prepareResponse(result, num, type);

      // Return response
      return Response.json(responseData, {
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
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};

// ========== VALIDATE JAZZ NUMBER ==========
function validateJazzNumber(phoneNumber) {
  // Must be 11 digits starting with 03
  if (!/^03\d{9}$/.test(phoneNumber)) {
    return {
      valid: false,
      message: 'Invalid Pakistani mobile number format. Must start with 03 and be 11 digits'
    };
  }

  // Get the prefix (first 4 digits)
  const prefix = phoneNumber.substring(0, 4);
  
  // Jazz prefixes: 0300-0309, 0320-0329
  const jazzPrefixes = [
    '0300', '0301', '0302', '0303', '0304', '0305', '0306', '0307', '0308', '0309',
    '0320', '0321', '0322', '0323', '0324', '0325', '0326', '0327', '0328', '0329'
  ];

  if (!jazzPrefixes.includes(prefix)) {
    return {
      valid: false,
      message: 'Not a Jazz number. Jazz numbers must start with 0300-0309 or 0320-0329'
    };
  }

  return {
    valid: true,
    message: 'Valid Jazz number'
  };
}

// ========== FETCH DATA FUNCTION ==========
async function fetchData(number, type) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  // Create form data as per website
  const formData = new URLSearchParams();
  formData.append('number', number);
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
    return parseHTML(html, number, type);
    
  } catch (error) {
    return {
      success: false,
      records: [],
      message: 'Failed to fetch data from source'
    };
  }
}

// ========== HTML PARSER ==========
function parseHTML(html, number, type) {
  const result = {
    success: true,
    records: [],
    message: 'Data retrieved successfully'
  };

  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    result.success = false;
    result.message = type === 'phone' 
      ? 'No records found for this phone number'
      : 'No records found for this CNIC';
    return result;
  }

  // Look for table rows
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html))) {
    rows.push(rowMatch[1]);
  }

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
      const mobile = formatMobile(cells[0] || '');
      const name = cells[1] || '';
      const cnic = formatCNIC(cells[2] || '');
      const address = cells[3] || '';

      // Validate Jazz number
      const isValidJazz = validateJazzNumber(mobile);
      
      // Create record
      const record = {
        mobile: mobile,
        name: name,
        cnic: cnic,
        address: address,
        network: 'Jazz',
        status: 'Active',
        country: 'Pakistan'
      };

      // For phone search, validate the mobile number matches and is Jazz
      if (type === 'phone') {
        const formattedSearchNum = formatMobile(number);
        if (record.mobile === formattedSearchNum && isValidJazz.valid) {
          result.records.push(record);
        }
      } else if (type === 'cnic') {
        // For CNIC search, validate CNIC matches and number is Jazz
        if (formatCNIC(record.cnic) === number && isValidJazz.valid) {
          result.records.push(record);
        }
      }
    }
  }

  if (result.records.length === 0) {
    result.success = false;
    result.message = type === 'phone'
      ? 'No valid Jazz records found for this phone number'
      : 'No valid Jazz records found for this CNIC';
  }

  return result;
}

// ========== PREPARE RESPONSE ==========
function prepareResponse(result, originalQuery, type) {
  const timestamp = new Date().toISOString();
  
  // If no records found
  if (!result.success || result.records.length === 0) {
    return {
      success: false,
      query: originalQuery,
      message: result.message,
      meta: {
        timestamp: timestamp,
        developer: "Haseeb Sahil",
        credit: "@hsmodzofc2"
      }
    };
  }

  // Get first record (for single record response)
  const record = result.records[0];
  
  return {
    success: true,
    query: originalQuery,
    result: {
      name: record.name || "N/A",
      cnic: record.cnic || "N/A",
      address: record.address || "N/A",
      network: record.network || "Jazz"
    },
    meta: {
      timestamp: timestamp,
      developer: "Haseeb Sahil",
      credit: "@hsmodzofc2"
    }
  };
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
  
  // Remove all non-digits including hyphens
  let cleaned = cnic.replace(/\D/g, '');
  
  // Return only digits without any formatting
  return cleaned;
}

function formatCNICWithDashes(cnic) {
  if (!cnic || cnic.length !== 13) return cnic;
  return cnic.substring(0, 5) + '-' + cnic.substring(5, 12) + '-' + cnic.substring(12);
}