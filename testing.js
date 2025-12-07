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
          message: 'Use: /?num=03001234567 or /?num=3810390345114'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the number parameter (can be phone or CNIC)
      const num = url.searchParams.get('num');

      // If no num parameter
      if (!num) {
        return Response.json({
          success: false,
          error: 'Number is required',
          example_phone: 'https://api.your-worker.workers.dev/?num=03001234567',
          example_cnic: 'https://api.your-worker.workers.dev/?num=3810390345114',
          description: 'Parameter can be either phone number (11 digits starting with 03) or CNIC (13 digits)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean the input
      const cleanedNum = num.toString().replace(/\D/g, '');
      
      let searchType, searchValue;

      // Determine if it's a phone number or CNIC
      if (cleanedNum.length === 13) {
        // It's a CNIC (13 digits)
        searchType = 'cnic';
        searchValue = cleanedNum;
      } else {
        // Try to process as phone number
        searchType = 'phone';
        
        // Add leading zero if needed
        if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
          searchValue = '0' + cleanedNum.substring(2);
        } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
          searchValue = '0' + cleanedNum;
        } else {
          searchValue = cleanedNum;
        }

        // Validate Pakistani number format
        if (!/^03\d{9}$/.test(searchValue)) {
          // If not valid phone, check if it might be something else
          return Response.json({
            success: false,
            error: 'Invalid input',
            received: num,
            cleaned: cleanedNum,
            expected: 'Phone number (03XXXXXXXXX - 11 digits) or CNIC (13 digits)',
            note: 'For phone: Must start with 03 and be 11 digits total. For CNIC: Must be 13 digits.'
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }

      // Fetch data from paksimownerdetails.com
      const data = await fetchData(searchType, searchValue);
      
      // Return response
      return Response.json({
        success: true,
        input: cleanedNum,
        type: searchType,
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
async function fetchData(searchType, searchValue) {
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
  return parseHTML(html);
}

// ========== HTML PARSER ==========
function parseHTML(html) {
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

    // We need at least 5 columns: Number, Name, CNIC, Address, Network
    if (cells.length >= 4) {
      const record = {
        mobile: formatMobile(cells[0] || ''),
        name: cells[1] || '',
        cnic: formatCNIC(cells[2] || ''),
        address: cells[3] || '',
        status: 'Active',
        country: 'Pakistan'
      };

      // Add network if available (5th column)
      if (cells.length >= 5) {
        // Remove emojis and clean network name
        record.network = cells[4].replace(/[^\x00-\x7F]/g, '').trim();
      }

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