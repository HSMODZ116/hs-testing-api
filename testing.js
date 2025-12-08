// Combined API - Pak Sim Owner Details (Phone & CNIC Search)
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
          message: 'Use Pakistani mobile number starting with 03 or CNIC number'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the num parameter
      const num = url.searchParams.get('num');

      // If no num parameter
      if (!num) {
        return Response.json({
          success: false,
          error: 'Parameter is required',
          message: 'Use Pakistani mobile number starting with 03 or CNIC number'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
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
            headers: { 'Content-Type': 'application/json' }
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

        // Validate Pakistani number format
        if (!/^03\d{9}$/.test(phoneNumber)) {
          return Response.json({
            success: false,
            error: 'Invalid Pakistani mobile number',
            message: 'Use Pakistani mobile number starting with 03 (e.g., 03123456789)'
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        result = await fetchData(phoneNumber, 'phone');
        
      } else {
        return Response.json({
          success: false,
          error: 'Invalid input length',
          message: 'Phone number should be 11 digits (03XXXXXXXXX) or CNIC should be 13 digits'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Return response
      return Response.json({
        success: true,
        type: type,
        input: cleanedNum,
        data: result,
        count: result.records ? result.records.length : 0
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

    // For CNIC search, filter only rows containing the CNIC
    if (type === 'cnic') {
      const rowContainsCNIC = row.includes(number) || 
                             row.includes(formatCNICWithDashes(number));
      
      if (!rowContainsCNIC) {
        continue; // Skip rows that don't have this CNIC
      }
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
        status: 'Active',
        country: 'Pakistan'
      };

      // For phone search, validate the mobile number matches
      if (type === 'phone') {
        const formattedSearchNum = formatMobile(number);
        if (record.mobile === formattedSearchNum) {
          result.records.push(record);
        }
      } else if (type === 'cnic') {
        // For CNIC search, validate CNIC matches
        if (formatCNIC(record.cnic) === number) {
          result.records.push(record);
        }
      }
    }
  }

  if (result.records.length === 0) {
    result.success = false;
    result.message = type === 'phone'
      ? 'No valid records found for this phone number'
      : 'No valid records found for this CNIC';
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
  
  // Remove all non-digits including hyphens
  let cleaned = cnic.replace(/\D/g, '');
  
  // Return only digits without any formatting
  return cleaned;
}

function formatCNICWithDashes(cnic) {
  if (!cnic || cnic.length !== 13) return cnic;
  return cnic.substring(0, 5) + '-' + cnic.substring(5, 12) + '-' + cnic.substring(12);
}