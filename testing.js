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
          message: 'Use: /?num=03001234567 or /?num=3810360039127'
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
          example_cnic: 'https://api.your-worker.workers.dev/?num=3810360039127',
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
          return Response.json({
            success: false,
            error: 'Invalid phone number',
            received: num,
            cleaned: searchValue,
            expected: 'Phone number (03XXXXXXXXX - 11 digits)'
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
    // Try different CNIC formats
    // Format 1: With dashes (XXXXX-XXXXXXX-X)
    const formattedCNIC1 = searchValue.substring(0, 5) + '-' + 
                          searchValue.substring(5, 12) + '-' + 
                          searchValue.substring(12);
    
    // Format 2: Without dashes (plain 13 digits)
    const formattedCNIC2 = searchValue;
    
    // Format 3: With spaces
    const formattedCNIC3 = searchValue.substring(0, 5) + ' ' + 
                          searchValue.substring(5, 12) + ' ' + 
                          searchValue.substring(12);
    
    // Try first format (most common)
    formData.append('cnic', formattedCNIC1);
  }
  
  formData.append('search', 'search');

  console.log('Sending request with:', {
    url: url,
    searchType: searchType,
    searchValue: searchValue,
    formData: formData.toString()
  });

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
  
  // Debug: Save HTML for inspection
  // console.log('Response HTML length:', html.length);
  // console.log('Response first 2000 chars:', html.substring(0, 2000));
  
  return parseHTML(html);
}

// ========== HTML PARSER ==========
function parseHTML(html) {
  const result = {
    records: []
  };

  // Check if no records found
  const noRecordsPatterns = [
    'No record found',
    'not found',
    'Sorry.*found',
    'Please try with other',
    'Invalid CNIC',
    'No Data Found',
    'Record not found',
    '0 Records Found'
  ];

  const lowerHTML = html.toLowerCase();
  for (const pattern of noRecordsPatterns) {
    if (lowerHTML.includes(pattern.toLowerCase())) {
      return result;
    }
  }

  // Try to find data in HTML
  // Method 1: Look for table structure
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch = tableRegex.exec(html);
  
  if (!tableMatch) {
    // Method 2: Look for specific data patterns
    return extractDataFromPatterns(html);
  }

  // Process table data
  const tableContent = tableMatch[1];
  const rows = extractRowsFromTable(tableContent);
  
  for (const row of rows) {
    const record = extractRecordFromRow(row);
    if (record && (record.mobile || record.name || record.cnic)) {
      result.records.push(record);
    }
  }

  // If no records found in table, try alternative extraction
  if (result.records.length === 0) {
    return extractDataFromPatterns(html);
  }

  return result;
}

function extractRowsFromTable(tableHTML) {
  const rows = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(tableHTML)) !== null) {
    const rowContent = rowMatch[1];
    
    // Skip empty rows and header rows
    if (rowContent.includes('<th>') || 
        rowContent.toLowerCase().includes('number') ||
        rowContent.toLowerCase().includes('name') ||
        rowContent.toLowerCase().includes('cnic') ||
        rowContent.toLowerCase().includes('address')) {
      continue;
    }
    
    // Check if row has actual data (contains digits for phone or CNIC)
    if (/\d{10,}/.test(rowContent)) {
      rows.push(rowContent);
    }
  }
  
  return rows;
}

function extractRecordFromRow(rowHTML) {
  // Extract all table cells
  const cells = [];
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let cellMatch;
  
  while ((cellMatch = cellRegex.exec(rowHTML)) !== null) {
    let content = cleanHTMLContent(cellMatch[1]);
    cells.push(content);
  }

  // Different column arrangements are possible
  if (cells.length >= 3) {
    // Try to identify which cell contains what
    const record = {
      mobile: '',
      name: '',
      cnic: '',
      address: '',
      status: 'Active',
      country: 'Pakistan'
    };

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      
      // Check for mobile number
      if (/^0?3\d{9}$/.test(cell.replace(/\D/g, '')) && !record.mobile) {
        record.mobile = formatMobile(cell);
      }
      // Check for CNIC
      else if (cell.replace(/\D/g, '').length === 13 && !record.cnic) {
        record.cnic = formatCNIC(cell);
      }
      // Check for name (contains letters, not just digits)
      else if (/[a-zA-Z]/.test(cell) && !/\d{10,}/.test(cell) && !record.name) {
        record.name = cell;
      }
      // Check for address (usually longer text)
      else if (cell.length > 10 && !record.address && !/^0?3\d{9}$/.test(cell.replace(/\D/g, '')) && cell.replace(/\D/g, '').length !== 13) {
        record.address = cell;
      }
    }

    // If we found at least mobile or CNIC or name, return the record
    if (record.mobile || record.cnic || record.name) {
      return record;
    }
  }
  
  return null;
}

function extractDataFromPatterns(html) {
  const result = {
    records: []
  };

  // Look for specific patterns in the HTML
  // Pattern 1: Look for mobile numbers
  const mobileRegex = /0?3\d{2}[\s-]?\d{7}/g;
  const mobiles = html.match(mobileRegex) || [];

  // Pattern 2: Look for CNIC numbers
  const cnicRegex = /\b\d{5}[\s-]?\d{7}[\s-]?\d\b/g;
  const cnicMatches = html.match(cnicRegex) || [];

  // Pattern 3: Look for names (between tags)
  const nameRegex = /<td[^>]*>([A-Za-z\s\.]+)<\/td>/gi;
  const names = [];
  let nameMatch;
  while ((nameMatch = nameRegex.exec(html)) !== null) {
    const name = cleanHTMLContent(nameMatch[1]);
    if (name.length > 2) {
      names.push(name);
    }
  }

  // Try to create records from found data
  if (mobiles.length > 0) {
    for (let i = 0; i < Math.min(mobiles.length, names.length); i++) {
      const record = {
        mobile: formatMobile(mobiles[i]),
        name: names[i] || '',
        cnic: cnicMatches[i] ? formatCNIC(cnicMatches[i]) : '',
        address: '',
        status: 'Active',
        country: 'Pakistan'
      };
      
      if (record.mobile || record.name) {
        result.records.push(record);
      }
    }
  }

  return result;
}

function cleanHTMLContent(content) {
  return content
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
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