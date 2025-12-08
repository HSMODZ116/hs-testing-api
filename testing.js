// Combined Phone Number and CNIC Search API
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
          message: 'Use phone number (0344, 0345, 0346, 0347) or CNIC number (13 digits)'
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
          message: 'Use phone number (0344, 0345, 0346, 0347) or CNIC number (13 digits)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const cleanedNum = num.toString().replace(/\D/g, '');
      
      // DETECT INPUT TYPE
      if (cleanedNum.length === 13 && /^\d{13}$/.test(cleanedNum)) {
        // This is CNIC
        return await handleCNICSearch(cleanedNum);
      } else {
        // This is phone number
        return await handlePhoneSearch(cleanedNum);
      }

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

// ========== HANDLE PHONE NUMBER SEARCH ==========
async function handlePhoneSearch(cleanedNum) {
  let phoneNumber = cleanedNum;
  
  // Format phone number
  if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
    phoneNumber = '0' + cleanedNum.substring(2);
  } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
    phoneNumber = '0' + cleanedNum;
  }

  // Validate Telenor number ONLY (0344, 0345, 0346, 0347)
  if (!/^03[4-7]\d{8}$/.test(phoneNumber)) {
    return Response.json({
      success: false,
      error: 'Invalid Telenor mobile number',
      message: 'Only Telenor numbers are supported: 0344, 0345, 0346, 0347'
    }, {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Fetch Telenor data
  const data = await fetchTelenorData(phoneNumber);
  
  // Return response
  return Response.json({
    success: data.success,
    type: 'phone',
    phone: phoneNumber,
    data: data.record || null,
    message: data.message
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ========== HANDLE CNIC SEARCH ==========
async function handleCNICSearch(cleanedCNIC) {
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
    success: data.success,
    type: 'cnic',
    cnic: cleanedCNIC,
    data: data.records,
    count: data.records.length,
    message: data.message
  }, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ========== FETCH TELENOR DATA ==========
async function fetchTelenorData(phoneNumber) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  const formData = new URLSearchParams();
  formData.append('number', phoneNumber);
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
    return extractTelenorData(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch Telenor data'
    };
  }
}

// ========== EXTRACT TELENOR DATA ==========
function extractTelenorData(html, phoneNumber) {
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return {
      success: false,
      message: 'No Telenor record found for this number'
    };
  }

  const result = {
    success: true,
    record: {
      mobile: phoneNumber,
      name: '',
      address: '',
      network: 'Telenor',
      developer: 'Haseeb Sahil'
    },
    message: 'Telenor data retrieved successfully'
  };

  // ===== CLEAN HTML AND CONVERT TO TEXT =====
  let cleanText = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const upperText = cleanText.toUpperCase();

  // ===== EXTRACT NAME =====
  const nameRegex = /HAS BEEN\s+([A-Z][A-Z\s]+?)\s+(?:DEDUCTED|COLLECTED|FROM)/i;
  const nameMatch = upperText.match(nameRegex);
  
  if (nameMatch && nameMatch[1]) {
    result.record.name = cleanTextContent(nameMatch[1]);
  }

  // ===== EXTRACT ADDRESS =====
  if (result.record.name) {
    const nameIndex = upperText.indexOf(result.record.name);
    if (nameIndex !== -1) {
      const textAfterName = upperText.substring(nameIndex + result.record.name.length);
      
      const endMarkers = ['HAVING NTN', 'HOLDER OF CNIC', 'CNIC', 'ON 00'];
      let endIndex = -1;
      
      for (const marker of endMarkers) {
        const index = textAfterName.indexOf(marker);
        if (index !== -1 && (endIndex === -1 || index < endIndex)) {
          endIndex = index;
        }
      }
      
      if (endIndex === -1) {
        endIndex = Math.min(200, textAfterName.length);
      }
      
      if (endIndex > 0) {
        result.record.address = cleanTextContent(textAfterName.substring(0, endIndex));
      }
    }
  }

  // ===== FINAL VALIDATION =====
  if (!result.record.name && !result.record.address) {
    return {
      success: false,
      message: 'No valid Telenor data found'
    };
  }

  return result;
}

// ========== FETCH DATA BY CNIC ==========
async function fetchDataByCNIC(cnicNumber) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  const formData = new URLSearchParams();
  formData.append('number', cnicNumber);
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

// ========== HTML PARSER FOR CNIC ==========
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

    // Check if row contains the CNIC
    const rowContainsCNIC = row.includes(cnicNumber) || 
                           row.includes(formatCNICWithDashes(cnicNumber));
    
    if (!rowContainsCNIC) {
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
function cleanTextContent(text) {
  return text
    .replace(/[^A-Z\s.,]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .trim();
}

function formatMobile(mobile) {
  if (!mobile) return '';
  
  let cleaned = mobile.replace(/\D/g, '');
  
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