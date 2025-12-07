// Single Worker API - Pak Sim Owner Details
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
          message: 'Use: /?phone=03001234567 or /?cnic=3810390345114'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get phone or CNIC from query parameters
      const phone = url.searchParams.get('phone') || 
                    url.searchParams.get('number') || 
                    url.searchParams.get('mobile') || 
                    url.searchParams.get('query');

      const cnic = url.searchParams.get('cnic') || 
                   url.searchParams.get('id') || 
                   url.searchParams.get('cnicnumber');

      // If no phone or CNIC parameter
      if (!phone && !cnic) {
        return Response.json({
          success: false,
          error: 'Phone number or CNIC is required',
          example_phone: 'https://api.your-worker.workers.dev/?phone=03001234567',
          example_cnic: 'https://api.your-worker.workers.dev/?cnic=3810390345114',
          supported_params: ['phone', 'number', 'mobile', 'query', 'cnic', 'id', 'cnicnumber']
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let searchType, searchValue, cleanedValue;

      if (phone) {
        // Process phone number search
        searchType = 'phone';
        cleanedValue = phone.toString().replace(/\D/g, '');
        
        // Add leading zero if needed
        if (cleanedValue.startsWith('92') && cleanedValue.length === 12) {
          searchValue = '0' + cleanedValue.substring(2);
        } else if (cleanedValue.startsWith('3') && cleanedValue.length === 10) {
          searchValue = '0' + cleanedValue;
        } else {
          searchValue = cleanedValue;
        }

        // Validate Pakistani number format
        if (!/^03\d{9}$/.test(searchValue)) {
          return Response.json({
            success: false,
            error: 'Invalid Pakistani mobile number',
            received: phone,
            expected: '03XXXXXXXXX (11 digits)',
            cleaned: searchValue
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } else {
        // Process CNIC search
        searchType = 'cnic';
        searchValue = cnic.toString().replace(/\D/g, '');
        cleanedValue = searchValue;

        // Validate CNIC format (13 digits)
        if (searchValue.length !== 13) {
          return Response.json({
            success: false,
            error: 'Invalid CNIC number',
            received: cnic,
            expected: '13 digits (without dashes)',
            cleaned: searchValue
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Fetch data from paksimownerdetails.com
      const data = await fetchData(searchType, searchValue, cleanedValue);
      
      // Return response
      return Response.json({
        success: true,
        [searchType]: cleanedValue,
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
async function fetchData(searchType, searchValue, cleanedValue) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  // Create form data as per website
  const formData = new URLSearchParams();
  
  if (searchType === 'phone') {
    formData.append('number', searchValue);
  } else {
    formData.append('cnic', searchValue);
  }
  
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
  return parseHTML(html, searchType, cleanedValue);
}

// ========== HTML PARSER ==========
function parseHTML(html, searchType, searchValue) {
  const result = {
    records: []
  };

  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      html.includes('Sorry') && html.includes('found')) {
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
        status: cells[4] || 'Unknown',
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
  
  // Remove all non-digits including hyphens
  let cleaned = cnic.replace(/\D/g, '');
  
  // Return only digits without any formatting
  return cleaned;
}