// CNIC Search API - Pak Sim Owner Details
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
          message: 'Use CNIC number for search'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the CNIC parameter
      const cnic = url.searchParams.get('cnic');

      // If no cnic parameter
      if (!cnic) {
        return Response.json({
          success: false,
          error: 'CNIC number is required',
          message: 'Please provide CNIC number for search'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean the CNIC - remove all non-digits
      const cleanedCNIC = cnic.toString().replace(/\D/g, '');
      
      // Validate CNIC format (13 digits without dashes)
      if (!/^\d{13}$/.test(cleanedCNIC)) {
        return Response.json({
          success: false,
          error: 'Invalid CNIC format',
          message: 'CNIC must be 13 digits (without dashes)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch data using CNIC
      const data = await fetchDataByCNIC(cleanedCNIC);
      
      // Return response
      return Response.json({
        success: true,
        cnic: cleanedCNIC,
        data: data,
        count: data.records.length
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

// ========== FETCH DATA BY CNIC ==========
async function fetchDataByCNIC(cnicNumber) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  // Create form data - using CNIC instead of phone number
  const formData = new URLSearchParams();
  formData.append('number', cnicNumber); // Website accepts CNIC in same field
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
    return parseHTML(html, cnicNumber);
    
  } catch (error) {
    return {
      success: false,
      records: [],
      message: 'Failed to fetch data'
    };
  }
}

// ========== HTML PARSER ==========
function parseHTML(html, cnicNumber) {
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
    result.message = 'No records found for this CNIC';
    return result;
  }

  // Look for table rows
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html))) {
    rows.push(rowMatch[1]);
  }

  // Filter only rows that contain the CNIC
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip header row
    if (row.includes('<th>') || row.toLowerCase().includes('mobile') && 
        row.toLowerCase().includes('name') && row.toLowerCase().includes('cnic')) {
      continue;
    }

    // Check if row contains the CNIC (with or without dashes)
    const rowContainsCNIC = row.includes(cnicNumber) || 
                           row.includes(formatCNICWithDashes(cnicNumber));
    
    if (!rowContainsCNIC) {
      continue; // Skip rows that don't have this CNIC
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
        cnic: cells[2] || '',
        address: cells[3] || '',
        network: detectNetwork(cells[0] || ''),
        status: 'Active',
        country: 'Pakistan'
      };

      // Only add if mobile number is valid
      if (record.mobile && /^03\d{9}$/.test(record.mobile)) {
        result.records.push(record);
      }
    }
  }

  if (result.records.length === 0) {
    result.success = false;
    result.message = 'No valid mobile records found for this CNIC';
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

function formatCNICWithDashes(cnic) {
  if (!cnic || cnic.length !== 13) return cnic;
  return cnic.substring(0, 5) + '-' + cnic.substring(5, 12) + '-' + cnic.substring(12);
}

function detectNetwork(mobile) {
  if (!mobile) return 'Unknown';
  
  const num = mobile.toString().replace(/\D/g, '');
  const prefix = num.substring(2, 4); // Get the 3rd and 4th digits after 03
  
  const networks = {
    '30': 'Jazz',
    '31': 'Jazz',
    '32': 'Warid/Jazz',
    '33': 'Zong',
    '34': 'Telenor',
    '35': 'Jazz',
    '36': 'Zong',
    '37': 'Jazz',
    '38': 'Mobilink',
    '39': 'Telenor'
  };
  
  return networks[prefix] || 'Unknown';
}