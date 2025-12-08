// Pakistani SIM Owner Details API (Unified)
// File: unified-worker.js
// Supports: Telenor (0344, 0345, 0346, 0347) and Jazz/Warid networks
// Developer: Haseeb Sahil

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
          message: 'Use Pakistani mobile number starting with 03'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the number parameter
      const num = url.searchParams.get('num');

      // If no num parameter
      if (!num) {
        return Response.json({
          success: false,
          error: 'Phone number is required',
          message: 'Use Pakistani mobile number starting with 03'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean the input - remove all non-digits
      const cleanedNum = num.toString().replace(/\D/g, '');
      
      // Add leading zero if needed
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
          message: 'Use Pakistani mobile number starting with 03 (10 digits after 03)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Determine network based on prefix
      const network = determineNetwork(phoneNumber);
      
      // Fetch data based on network
      let data;
      if (network === 'Telenor') {
        data = await fetchTelenorData(phoneNumber);
      } else {
        data = await fetchGenericData(phoneNumber);
      }
      
      // Return unified response
      return Response.json({
        success: data.success !== false,
        phone: phoneNumber,
        network: network,
        data: data.record || data.records || data,
        message: data.message || 'Data retrieved successfully',
        developer: 'Haseeb Sahil'
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
        developer: 'Haseeb Sahil'
      }, {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// ========== NETWORK DETECTION ==========
function determineNetwork(phoneNumber) {
  const prefix = phoneNumber.substring(0, 4);
  
  // Telenor prefixes
  if (['0344', '0345', '0346', '0347'].includes(prefix)) {
    return 'Telenor';
  }
  
  // Jazz/Warid prefixes (common ones)
  if (['0300', '0301', '0302', '0303', '0304', '0305', 
       '0306', '0307', '0308', '0309', '0320', '0321', 
       '0322', '0323', '0324', '0325'].includes(prefix)) {
    return 'Jazz/Warid';
  }
  
  // Default to generic
  return 'Pakistani';
}

// ========== FETCH GENERIC DATA (Jazz/Warid format) ==========
async function fetchGenericData(phoneNumber) {
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
    return parseHTMLData(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch data'
    };
  }
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

// ========== HTML PARSER FOR GENERIC DATA ==========
function parseHTMLData(html, phoneNumber) {
  const result = {
    success: false,
    records: [],
    message: 'No records found'
  };

  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
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
        mobile: formatMobile(cells[0] || '') || phoneNumber,
        name: cells[1] || '',
        cnic: formatCNIC(cells[2] || ''),
        address: cells[3] || '',
        status: cells[4] || 'Active',
        country: 'Pakistan'
      };

      // Validate record has at least mobile or name
      if (record.mobile || record.name) {
        result.records.push(record);
        result.success = true;
        result.message = 'Data retrieved successfully';
      }
    }
  }

  // If no records found but HTML contains Telenor-like certificate format
  if (result.records.length === 0 && html.includes('TELENOR')) {
    // Try Telenor extraction as fallback
    const telenorData = extractTelenorData(html, phoneNumber);
    if (telenorData.success) {
      return telenorData;
    }
  }

  return result;
}

// ========== EXTRACT TELENOR DATA ==========
function extractTelenorData(html, phoneNumber) {
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return {
      success: false,
      message: 'No record found for this number'
    };
  }

  const result = {
    success: true,
    record: {
      mobile: phoneNumber,
      name: '',
      address: '',
      cnic: '',
      network: 'Telenor',
      status: 'Active',
      country: 'Pakistan'
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
  // Look for name in Telenor certificate format
  const nameRegex = /HAS BEEN\s+([A-Z][A-Z\s]+?)\s+(?:DEDUCTED|COLLECTED|FROM)/i;
  const nameMatch = upperText.match(nameRegex);
  
  if (nameMatch && nameMatch[1]) {
    result.record.name = cleanTextContent(nameMatch[1]);
  }

  // ===== EXTRACT CNIC =====
  const cnicRegex = /CNIC\s*[:-\s]*(\d{5}[-]?\d{7}[-]?\d{1})/i;
  const cnicMatch = upperText.match(cnicRegex);
  
  if (cnicMatch && cnicMatch[1]) {
    result.record.cnic = cnicMatch[1].replace(/\D/g, '');
  }

  // ===== EXTRACT ADDRESS =====
  if (result.record.name) {
    const nameIndex = upperText.indexOf(result.record.name.toUpperCase());
    if (nameIndex !== -1) {
      const textAfterName = upperText.substring(nameIndex + result.record.name.length);
      
      // Find address ending
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
  if (!result.record.name && !result.record.address && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid data found for this number'
    };
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

function cleanTextContent(text) {
  return text
    .replace(/[^A-Z\s.,\-]/gi, ' ')  // Keep letters, spaces, dots, commas and hyphens
    .replace(/\s+/g, ' ')            // Remove extra spaces
    .replace(/\.{2,}/g, ' ')         // Remove multiple dots
    .trim();
}