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
        return Response.json({
          success: false,
          error: 'Not found',
          message: 'Use: /?phone=03001234567'
        }, {
          status: 404
        });
      }

      // Get phone from query parameters
      const phone = url.searchParams.get('phone') || 
                    url.searchParams.get('number') || 
                    url.searchParams.get('mobile') || 
                    url.searchParams.get('query');

      // If no phone parameter
      if (!phone) {
        return Response.json({
          success: false,
          error: 'Phone number is required',
          example: 'https://api.your-worker.workers.dev/?phone=03001234567',
          supported_params: ['phone', 'number', 'mobile', 'query']
        }, {
          status: 400
        });
      }

      // Clean and validate phone
      const cleanedPhone = cleanPhoneNumber(phone);
      
      // Validate Pakistani number format
      if (!/^03\d{9}$/.test(cleanedPhone)) {
        return Response.json({
          success: false,
          error: 'Invalid Pakistani mobile number',
          received: phone,
          expected: '03XXXXXXXXX (11 digits)',
          cleaned: cleanedPhone
        }, {
          status: 400
        });
      }

      // Fetch data from paksimownerdetails.com
      const data = await fetchSimData(cleanedPhone);
      
      // Return response
      return Response.json({
        success: true,
        query: {
          original: phone,
          cleaned: cleanedPhone,
          timestamp: new Date().toISOString()
        },
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
        message: error.message,
        timestamp: new Date().toISOString()
      }, {
        status: 500
      });
    }
  }
};

// ========== PHONE CLEANING ==========
function cleanPhoneNumber(phone) {
  if (!phone) return '';
  
  // Remove all non-digits
  let cleaned = phone.toString().replace(/\D/g, '');
  
  // Convert formats
  if (cleaned.startsWith('92') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
}

// ========== FETCH DATA FROM WEBSITE ==========
async function fetchSimData(phoneNumber) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
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
    },
    body: formData.toString()
  });

  const html = await response.text();
  return parseSimData(html, phoneNumber);
}

// ========== IMPROVED PARSER ==========
function parseSimData(html, phoneNumber) {
  const result = {
    found: false,
    records: []
  };

  // Check for no records
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      html.includes('Sorry, no details found')) {
    return result;
  }

  // Try to find the main data table
  // First, look for table structure
  const tableStart = html.indexOf('<table');
  if (tableStart === -1) {
    return result;
  }

  const tableEnd = html.indexOf('</table>', tableStart);
  if (tableEnd === -1) {
    return result;
  }

  const tableHTML = html.substring(tableStart, tableEnd + 8);
  
  // Extract all rows
  const rows = [];
  let rowStart = 0;
  
  while ((rowStart = tableHTML.indexOf('<tr', rowStart)) !== -1) {
    const rowEnd = tableHTML.indexOf('</tr>', rowStart);
    if (rowEnd === -1) break;
    
    const rowHTML = tableHTML.substring(rowStart, rowEnd + 5);
    rows.push(rowHTML);
    rowStart = rowEnd + 5;
  }

  // Process rows (skip header row)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip header row (contains th tags or header text)
    if (row.includes('<th>') || 
        (row.toLowerCase().includes('mobile') && row.toLowerCase().includes('name'))) {
      continue;
    }

    // Extract cells using regex
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
    let cellMatch;
    
    while ((cellMatch = cellRegex.exec(row))) {
      let content = cellMatch[1]
        .replace(/<[^>]+>/g, '') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp;
        .replace(/[\r\n]+/g, ' ') // Replace newlines
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();
      
      // Remove emojis and special characters
      content = content.replace(/[^\x00-\x7F]/g, '').trim();
      
      cells.push(content);
    }

    // Debug: Log what we found
    console.log(`Row ${i}:`, cells);

    // Process based on number of cells
    if (cells.length >= 4) {
      const record = createRecordFromCells(cells, phoneNumber);
      if (record && record.mobile) {
        result.records.push(record);
        result.found = true;
      }
    } else if (cells.length === 1 && /^\d+$/.test(cells[0])) {
      // Sometimes phone number might be in separate row
      const record = {
        mobile: cleanPhoneNumber(cells[0]),
        name: '',
        cnic: '',
        address: '',
        status: 'Unknown',
        brand: 'Unknown',
        country: 'Pakistan',
        timestamp: new Date().toISOString()
      };
      
      if (record.mobile) {
        result.records.push(record);
        result.found = true;
      }
    }
  }

  // If no records found but HTML contains the number, create minimal record
  if (!result.found && html.includes(phoneNumber.substring(1))) {
    result.records.push({
      mobile: phoneNumber,
      name: 'Information not available',
      cnic: '',
      address: '',
      status: 'Unknown',
      brand: 'Unknown',
      country: 'Pakistan',
      timestamp: new Date().toISOString()
    });
    result.found = true;
  }

  return result;
}

// ========== CREATE RECORD FROM CELLS ==========
function createRecordFromCells(cells, phoneNumber) {
  // Based on your screenshot: Mobile, Name, CNIC, Address, Status, Brand
  const record = {
    mobile: '',
    name: '',
    cnic: '',
    address: '',
    status: 'Unknown',
    brand: 'Unknown',
    country: 'Pakistan',
    timestamp: new Date().toISOString()
  };

  // Try to identify each cell
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    
    // Mobile number (should be first cell)
    if (i === 0 && /^\d+$/.test(cell) && (cell.length === 10 || cell.length === 11)) {
      record.mobile = cleanPhoneNumber(cell);
    }
    // Name (second cell, contains letters)
    else if (i === 1 && /[a-zA-Z]/.test(cell)) {
      record.name = cell;
    }
    // CNIC (13 digits or with dashes)
    else if ((cell.length === 13 && /^\d+$/.test(cell)) || 
             cell.includes('-') && cell.replace(/\D/g, '').length === 13) {
      record.cnic = formatCNIC(cell);
    }
    // Address (longer text)
    else if (i >= 3 && cell.length > 20 && /[a-zA-Z]/.test(cell)) {
      record.address = cell;
    }
    // Status (short word)
    else if (i >= 4 && ['Active', 'Inactive', 'Blocked', 'Suspended'].some(s => 
             cell.toLowerCase().includes(s.toLowerCase()))) {
      record.status = cell;
    }
    // Brand/Operator
    else if (i >= 5 && ['Jazz', 'Zong', 'Telenor', 'Ufone', 'SCO'].some(b => 
             cell.toLowerCase().includes(b.toLowerCase()))) {
      record.brand = cell;
    }
    // Assign remaining cells
    else {
      if (!record.mobile && /^\d+$/.test(cell) && cell.length >= 10) {
        record.mobile = cleanPhoneNumber(cell);
      } else if (!record.name && /[a-zA-Z\s\.]+$/.test(cell) && cell.length > 2) {
        record.name = cell;
      } else if (!record.address && cell.length > 10) {
        record.address = cell;
      }
    }
  }

  // If mobile not found in cells, use the queried phone
  if (!record.mobile) {
    record.mobile = phoneNumber;
  }

  return record;
}

// ========== FORMAT CNIC ==========
function formatCNIC(cnic) {
  if (!cnic) return '';
  
  // Remove all non-digits
  let cleaned = cnic.replace(/\D/g, '');
  
  // Must be 13 digits
  if (cleaned.length !== 13) return cnic;
  
  // Format: XXXXX-XXXXXXX-X
  return cleaned.substring(0, 5) + '-' + 
         cleaned.substring(5, 12) + '-' + 
         cleaned.substring(12);
}