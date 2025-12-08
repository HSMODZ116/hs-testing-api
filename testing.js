// Single Worker API - Pak Sim Owner Details
// Updated to support both phone number and CNIC search

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
          message: 'Use Pakistani mobile number starting with 03 or CNIC'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the search parameter - can be either 'num' for phone or 'cnic' for CNIC
      const num = url.searchParams.get('num');
      const cnic = url.searchParams.get('cnic');

      // If no search parameter provided
      if (!num && !cnic) {
        return Response.json({
          success: false,
          error: 'Search parameter is required',
          message: 'Use either Pakistani mobile number starting with 03 or CNIC number'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      let searchType = '';
      let searchValue = '';
      let phoneNumber = '';
      let cnicNumber = '';

      // Determine search type and validate
      if (num) {
        // Phone number search
        searchType = 'phone';
        // Clean the input - remove all non-digits
        const cleanedNum = num.toString().replace(/\D/g, '');
        
        // Add leading zero if needed
        if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
          phoneNumber = '0' + cleanedNum.substring(2);
        } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
          phoneNumber = '0' + cleanedNum;
        } else {
          phoneNumber = cleanedNum;
        }

        // Validate Pakistani number format
        if (!/^03\d{9}$/.test(phoneNumber)) {
          return Response.json({
            success: false,
            error: 'Invalid Pakistani mobile number',
            message: 'Use Pakistani mobile number starting with 03 (e.g., 03001234567)'
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        searchValue = phoneNumber;
      } else if (cnic) {
        // CNIC search
        searchType = 'cnic';
        // Clean the CNIC - remove all non-digits including hyphens
        cnicNumber = cnic.toString().replace(/\D/g, '');
        
        // Validate CNIC format (13 digits without dashes)
        if (cnicNumber.length !== 13) {
          return Response.json({
            success: false,
            error: 'Invalid CNIC number',
            message: 'CNIC must be 13 digits (e.g., 3810360039127)'
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        searchValue = cnicNumber;
      }

      // Fetch data from paksimownerdetails.com
      const data = await fetchData(searchType, searchValue);
      
      // Return response with structure
      return Response.json({
        success: true,
        searchType: searchType,
        searchValue: searchValue,
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
  } else if (searchType === 'cnic') {
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
  return parseHTML(html, searchType);
}

// ========== HTML PARSER ==========
function parseHTML(html, searchType) {
  const result = {
    searchType: searchType,
    records: []
  };

  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found')) ||
      html.includes('Record Not Found')) {
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
    if (row.includes('<th>') || 
        (row.toLowerCase().includes('mobile') && row.toLowerCase().includes('name')) ||
        (row.includes('Number') && row.includes('Name') && row.includes('CNIC'))) {
      continue;
    }

    // Extract cells from row
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(row))) {
      let content = cellMatch[1]
        .replace(/<[^>]+>/g, '')  // Remove HTML tags
        .replace(/&nbsp;/g, ' ')  // Replace &nbsp; with space
        .replace(/<img[^>]*>/g, '') // Remove image tags
        .replace(/\s+/g, ' ')      // Replace multiple spaces with single space
        .trim();
      
      // Clean emojis and extra spaces
      content = content.replace(/[^\x00-\x7F]/g, '').trim();
      cells.push(content);
    }

    // We need at least 4 columns: Mobile, Name, CNIC, Address
    if (cells.length >= 4) {
      const record = {
        mobile: formatMobile(cells[0] || ''),
        name: (cells[1] || '').replace(/\.$/, '').trim(), // Remove trailing dot
        cnic: formatCNIC(cells[2] || ''),
        address: cells[3] || '',
        status: 'Active',
        network: detectNetwork(cells[0] || ''),
        country: 'Pakistan'
      };

      // Validate record has at least mobile or name
      if (record.mobile || record.name) {
        result.records.push(record);
      }
    }
  }

  // If searching by CNIC, also extract CNIC from title if available
  if (searchType === 'cnic' && result.records.length > 0) {
    const cnicRegex = /<title>(\d{13})<\/title>/i;
    const cnicMatch = html.match(cnicRegex);
    if (cnicMatch && cnicMatch[1]) {
      result.searchValue = cnicMatch[1];
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

function detectNetwork(mobile) {
  const num = formatMobile(mobile);
  
  if (!num) return 'Unknown';
  
  // Network prefixes in Pakistan
  const networkPrefixes = {
    '0300': 'Jazz', '0301': 'Zong', '0302': 'Warid', '0303': 'Ufone',
    '0304': 'Telenor', '0305': 'Jazz', '0306': 'Telenor', '0307': 'Jazz',
    '0308': 'Warid', '0309': 'Mobilink', '0310': 'Zong', '0311': 'Jazz',
    '0312': 'Warid', '0313': 'Ufone', '0314': 'Telenor', '0315': 'Jazz',
    '0316': 'Zong', '0317': 'Warid', '0318': 'Ufone', '0319': 'Telenor',
    '0320': 'Jazz', '0321': 'Zong', '0322': 'Warid', '0323': 'Ufone',
    '0324': 'Telenor', '0325': 'Jazz', '0326': 'Zong', '0327': 'Warid',
    '0328': 'Ufone', '0329': 'Telenor', '0330': 'Jazz', '0331': 'Zong',
    '0332': 'Warid', '0333': 'Ufone', '0334': 'Telenor', '0335': 'Jazz',
    '0336': 'Zong', '0337': 'Warid', '0338': 'Ufone', '0339': 'Telenor',
    '0340': 'Jazz', '0341': 'Zong', '0342': 'Warid', '0343': 'Ufone',
    '0344': 'Telenor', '0345': 'Jazz', '0346': 'Zong', '0347': 'Warid',
    '0348': 'Ufone', '0349': 'Telenor'
  };
  
  const prefix = num.substring(0, 4);
  return networkPrefixes[prefix] || 'Unknown';
}