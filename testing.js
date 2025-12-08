// Universal Pakistan SIM Details API
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

      if (path !== '/') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Not found',
          message: 'Use Pakistani mobile number or CNIC number'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const num = url.searchParams.get('num');

      if (!num) {
        return Response.json({
          success: false,
          error: 'Parameter is required',
          message: 'Use Pakistani mobile number or CNIC number'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const cleanedNum = num.toString().replace(/\D/g, '');
      
      let result;
      let type;

      // Auto-detect: 13 digits = CNIC, otherwise = Phone number
      if (cleanedNum.length === 13) {
        // CNIC Search
        type = 'cnic';
        result = await processCNICSearch(cleanedNum);
      } else {
        // Phone Number Search
        type = 'phone';
        const phoneNumber = formatPhoneNumber(cleanedNum);
        
        // Accept any 03XXXXXXXXX format
        if (!/^03\d{9}$/.test(phoneNumber)) {
          return Response.json({
            success: false,
            error: 'Invalid format',
            message: 'Phone number must be in 03XXXXXXXXX format'
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        result = await processPhoneSearch(phoneNumber);
      }

      // Return response
      return Response.json({
        success: result.success,
        type: type,
        input: cleanedNum,
        formatted: type === 'phone' ? formatPhoneNumber(cleanedNum) : cleanedNum,
        data: result.data,
        count: result.count || 0,
        message: result.message
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

// ========== PROCESS CNIC SEARCH ==========
async function processCNICSearch(cnicNumber) {
  try {
    const html = await fetchDataFromSource(cnicNumber);
    const parsed = parseHTML(html, 'cnic', cnicNumber);
    
    return {
      success: parsed.success,
      data: parsed.records,
      count: parsed.records.length,
      message: parsed.message
    };
  } catch (error) {
    return {
      success: false,
      data: [],
      count: 0,
      message: 'Failed to fetch CNIC data'
    };
  }
}

// ========== PROCESS PHONE SEARCH ==========
async function processPhoneSearch(phoneNumber) {
  try {
    const html = await fetchDataFromSource(phoneNumber);
    
    // Try Telenor format first (special parsing)
    const telenorResult = parseTelenorFormat(html, phoneNumber);
    if (telenorResult.success) {
      return {
        success: true,
        data: telenorResult.record,
        count: 1,
        message: telenorResult.message
      };
    }
    
    // If not Telenor, try standard format
    const parsed = parseHTML(html, 'phone', phoneNumber);
    
    if (parsed.success && parsed.records.length > 0) {
      return {
        success: true,
        data: parsed.records,
        count: parsed.records.length,
        message: parsed.message
      };
    }
    
    return {
      success: false,
      data: [],
      count: 0,
      message: parsed.message || 'No data found'
    };
    
  } catch (error) {
    return {
      success: false,
      data: [],
      count: 0,
      message: 'Failed to fetch phone data'
    };
  }
}

// ========== FETCH DATA FROM SOURCE ==========
async function fetchDataFromSource(number) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  const formData = new URLSearchParams();
  formData.append('number', number);
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

  return await response.text();
}

// ========== PARSE TELENOR FORMAT ==========
function parseTelenorFormat(html, phoneNumber) {
  // Check if no records
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found')) {
    return { success: false };
  }

  // Clean HTML
  let cleanText = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const upperText = cleanText.toUpperCase();

  // Look for Telenor certificate pattern
  const telenorPattern = /HAS BEEN\s+([A-Z][A-Z\s]+?)\s+(?:DEDUCTED|COLLECTED|FROM)/i;
  const match = upperText.match(telenorPattern);

  if (match && match[1]) {
    const name = cleanTextContent(match[1]);
    
    // Try to extract address
    let address = '';
    const nameIndex = upperText.indexOf(name.toUpperCase());
    if (nameIndex !== -1) {
      const textAfterName = upperText.substring(nameIndex + name.length);
      const endMarkers = ['HAVING NTN', 'HOLDER OF CNIC', 'CNIC', 'ON 00'];
      let endIndex = -1;
      
      for (const marker of endMarkers) {
        const index = textAfterName.indexOf(marker);
        if (index !== -1 && (endIndex === -1 || index < endIndex)) {
          endIndex = index;
        }
      }
      
      if (endIndex === -1) endIndex = Math.min(200, textAfterName.length);
      if (endIndex > 0) address = cleanTextContent(textAfterName.substring(0, endIndex));
    }

    if (name || address) {
      return {
        success: true,
        record: {
          mobile: phoneNumber,
          name: name,
          address: address
        },
        message: 'Data retrieved successfully'
      };
    }
  }

  return { success: false };
}

// ========== PARSE STANDARD HTML ==========
function parseHTML(html, type, searchNumber) {
  const result = {
    success: true,
    records: [],
    message: 'Data retrieved successfully'
  };

  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found')) {
    result.success = false;
    result.message = 'No records found';
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

    // For CNIC search, filter only matching CNIC rows
    if (type === 'cnic') {
      const rowContainsCNIC = row.includes(searchNumber) || 
                             row.includes(formatCNICWithDashes(searchNumber));
      if (!rowContainsCNIC) continue;
    }

    // Extract cells
    const cells = [];
    const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(row))) {
      let content = cellMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      content = content.replace(/[^\x00-\x7F]/g, '').trim();
      cells.push(content);
    }

    if (cells.length >= 4) {
      const record = {
        mobile: formatPhoneNumber(cells[0] || ''),
        name: cells[1] || '',
        cnic: formatCNIC(cells[2] || ''),
        address: cells[3] || ''
      };

      // For phone search, check if mobile matches
      if (type === 'phone') {
        const formattedSearch = formatPhoneNumber(searchNumber);
        if (record.mobile === formattedSearch) {
          result.records.push(record);
        }
      } else if (type === 'cnic') {
        // For CNIC search, check if CNIC matches
        if (formatCNIC(record.cnic) === searchNumber) {
          result.records.push(record);
        }
      }
    }
  }

  if (result.records.length === 0) {
    result.success = false;
    result.message = type === 'phone' 
      ? 'No data found for this number'
      : 'No data found for this CNIC';
  }

  return result;
}

// ========== HELPER FUNCTIONS ==========
function formatPhoneNumber(mobile) {
  if (!mobile) return '';
  
  let cleaned = mobile.replace(/\D/g, '');
  
  if (cleaned.startsWith('92') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
}

function formatCNIC(cnic) {
  if (!cnic) return '';
  return cnic.replace(/\D/g, '');
}

function formatCNICWithDashes(cnic) {
  if (!cnic || cnic.length !== 13) return cnic;
  return cnic.substring(0, 5) + '-' + cnic.substring(5, 12) + '-' + cnic.substring(12);
}

function cleanTextContent(text) {
  return text
    .replace(/[^A-Za-z\s.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .trim();
}