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
    // CNIC کے لیے شاید الگ فیلڈ ہو
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
  console.log('HTML Response length:', html.length);
  console.log('HTML first 500 chars:', html.substring(0, 500));
  
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
      html.includes('Record Not Found') ||
      html.includes('try again')) {
    console.log('No records found in HTML');
    return result;
  }

  // Try to extract data from the table structure in your screenshot
  // The HTML structure shows table rows with data
  
  // Method 1: Look for table rows with specific pattern
  const tableRows = html.match(/<tr>[\s\S]*?<\/tr>/gi);
  
  if (tableRows) {
    console.log('Found table rows:', tableRows.length);
    
    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i];
      
      // Skip header rows
      if (row.includes('<th>') || row.includes('Number') && row.includes('Name') && row.includes('CNIC')) {
        continue;
      }
      
      // Extract TD cells
      const cells = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
      
      if (cells && cells.length >= 4) {
        const record = {
          mobile: '',
          name: '',
          cnic: '',
          address: '',
          status: 'Active',
          network: '',
          country: 'Pakistan'
        };
        
        // Parse each cell
        for (let j = 0; j < cells.length; j++) {
          const cellContent = cells[j].replace(/<[^>]+>/g, '')
                                      .replace(/&nbsp;/g, ' ')
                                      .trim();
          
          switch(j) {
            case 0: // Number
              record.mobile = formatMobile(cellContent);
              record.network = detectNetwork(cellContent);
              break;
            case 1: // Name
              record.name = cellContent.replace(/\.$/, '').trim();
              break;
            case 2: // CNIC
              record.cnic = formatCNIC(cellContent);
              break;
            case 3: // Address
              record.address = cellContent;
              break;
          }
        }
        
        // Only add if we have valid data
        if (record.mobile || record.name) {
          result.records.push(record);
        }
      }
    }
  }
  
  // Method 2: Try alternative parsing if first method didn't work
  if (result.records.length === 0) {
    // Look for data in the format shown in your screenshot
    const dataRegex = /<td>(\d+)<\/td>\s*<td>([^<]+)<\/td>\s*<td>(\d+)<\/td>\s*<td>([^<]+)<\/td>/gi;
    let match;
    
    while ((match = dataRegex.exec(html)) !== null) {
      const record = {
        mobile: formatMobile(match[1]),
        name: match[2].replace(/\.$/, '').trim(),
        cnic: formatCNIC(match[3]),
        address: match[4].trim(),
        status: 'Active',
        network: detectNetwork(match[1]),
        country: 'Pakistan'
      };
      
      result.records.push(record);
    }
  }
  
  // Method 3: Look for data in JSON-like format if available
  if (result.records.length === 0) {
    // Try to find any data that looks like phone numbers and CNIC
    const phoneMatches = html.match(/\b03\d{9}\b/g);
    const cnicMatches = html.match(/\b\d{13}\b/g);
    
    if (phoneMatches && cnicMatches) {
      // Simple extraction - this is a fallback
      console.log('Using fallback extraction');
    }
  }
  
  console.log('Parsed records:', result.records.length);
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
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    // Already in correct format
    return cleaned;
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