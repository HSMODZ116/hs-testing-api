// Single Worker API - All Networks Support
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
          message: 'Use: /?phone=03001234567'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
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
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean and validate phone
      const cleanedPhone = phone.toString().replace(/\D/g, '');
      
      // Add leading zero if needed
      let finalPhone = cleanedPhone;
      if (cleanedPhone.startsWith('92') && cleanedPhone.length === 12) {
        finalPhone = '0' + cleanedPhone.substring(2);
      } else if (cleanedPhone.startsWith('3') && cleanedPhone.length === 10) {
        finalPhone = '0' + cleanedPhone;
      }

      // Validate Pakistani number format
      if (!/^03\d{9}$/.test(finalPhone)) {
        return Response.json({
          success: false,
          error: 'Invalid Pakistani mobile number',
          received: phone,
          expected: '03XXXXXXXXX (11 digits)',
          cleaned: finalPhone
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch data from paksimownerdetails.com
      const data = await fetchData(finalPhone);
      
      // Return response
      return Response.json({
        success: true,
        query: {
          original: phone,
          cleaned: finalPhone,
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
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// ========== FETCH DATA FUNCTION ==========
async function fetchData(phoneNumber) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  // Create form data as per website
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
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Upgrade-Insecure-Requests': '1'
    },
    body: formData.toString()
  });

  const html = await response.text();
  
  // Detect network and use appropriate parser
  const network = detectNetwork(phoneNumber);
  
  if (network === 'Telenor') {
    return parseTelenorHTML(html, phoneNumber);
  } else {
    // Jazz/Ufone/Zong etc. use table parser
    return parseJazzHTML(html, phoneNumber);
  }
}

// ========== NETWORK DETECTION ==========
function detectNetwork(phoneNumber) {
  const prefix = phoneNumber.substring(0, 4);
  
  if (prefix.startsWith('034')) {
    return 'Telenor';
  } else if (prefix.startsWith('030') || prefix.startsWith('031')) {
    return 'Jazz';
  } else if (prefix.startsWith('032')) {
    return 'Warid/Jazz';
  } else if (prefix.startsWith('033')) {
    return 'Ufone';
  } else if (prefix.startsWith('035')) {
    return 'SCO';
  } else if (prefix.startsWith('036')) {
    return 'Zong';
  } else {
    return 'Unknown';
  }
}

// ========== TELENOR HTML PARSER ==========
function parseTelenorHTML(html, phoneNumber) {
  const result = {
    found: false,
    network: 'Telenor',
    records: []
  };

  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      html.includes('Sorry') && html.includes('found')) {
    return result;
  }

  // Extract text from HTML
  const text = html.replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();

  // Check if this is Telenor format (has MSISDN)
  if (!text.includes('MSISDN') && !text.includes('Serial No')) {
    // Not Telenor format, try Jazz parser
    return parseJazzHTML(html, phoneNumber);
  }

  // Parse Telenor format based on screenshot
  const record = {
    mobile: '',
    name: '',
    cnic: '',
    address: '',
    serial_no: '',
    status: 'Active',
    network: 'Telenor',
    country: 'Pakistan',
    timestamp: new Date().toISOString()
  };

  // Extract MSISDN (Phone number)
  const msisdnMatch = text.match(/MSISDN\s+(\d{10,11})/i);
  if (msisdnMatch) {
    record.mobile = formatMobile(msisdnMatch[1]);
  } else {
    record.mobile = phoneNumber;
  }

  // Extract Serial No
  const serialMatch = text.match(/Serial No\s+([A-Z0-9\s]+?)(?=\s+Original)/i);
  if (serialMatch) {
    record.serial_no = serialMatch[1].trim();
  }

  // Extract Name (comes after "been" and before address)
  const nameMatch = text.match(/been\s+([A-Z\s\.]+?)(?=\s+LACHMAN|\s+from|\s+$)/i);
  if (nameMatch) {
    record.name = nameMatch[1].trim();
  }

  // Extract Address (comes after "from" or is the long text)
  // Address pattern: Look for all caps text that looks like address
  const addressMatch = text.match(/(?:from|collected from)\s+([A-Z][A-Z\s\.\,\-0-9]+?(?:POST OFFICE|TEHSIL|DISTRICT)[A-Z\s\.\,\-0-9]+?)(?=\s+having|\s+on|\s+$)/i);
  if (addressMatch) {
    record.address = addressMatch[1].replace(/\s+/g, ' ').trim();
  } else {
    // Alternative: Look for long all-caps text
    const longTextMatch = text.match(/([A-Z][A-Z\s\.\,\-]{20,200})/);
    if (longTextMatch && !longTextMatch[1].includes('MSISDN') && !longTextMatch[1].includes('Serial')) {
      record.address = longTextMatch[1].trim();
    }
  }

  // Extract CNIC
  const cnicMatch = text.match(/CNIC No\.?\s+(\d{5}[-]?\d{7}[-]?\d)/i);
  if (cnicMatch) {
    record.cnic = formatCNIC(cnicMatch[1]);
  } else {
    // Try alternative CNIC pattern
    const altCnicMatch = text.match(/(\d{5}[-]?\d{7}[-]?\d)/);
    if (altCnicMatch) {
      record.cnic = formatCNIC(altCnicMatch[1]);
    }
  }

  // Validate if we found meaningful data
  if (record.name || record.cnic || record.address) {
    result.records.push(record);
    result.found = true;
  }

  return result;
}

// ========== JAZZ/UFONE HTML PARSER ==========
function parseJazzHTML(html, phoneNumber) {
  const result = {
    found: false,
    network: detectNetwork(phoneNumber),
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
        brand: cells[5] || 'Unknown',
        country: 'Pakistan',
        timestamp: new Date().toISOString()
      };

      // Validate record has at least mobile or name
      if (record.mobile || record.name) {
        result.records.push(record);
        result.found = true;
      }
    } else if (cells.length > 0) {
      // Try to parse even with fewer cells
      const record = {
        mobile: phoneNumber,
        name: '',
        cnic: '',
        address: '',
        status: 'Active',
        network: detectNetwork(phoneNumber),
        country: 'Pakistan',
        timestamp: new Date().toISOString()
      };

      // Try to identify what each cell contains
      cells.forEach((cell, index) => {
        if (/^\d{10,11}$/.test(cell)) {
          record.mobile = formatMobile(cell);
        } else if (/^\d{5}-\d{7}-\d$/.test(cell) || cell.replace(/\D/g, '').length === 13) {
          record.cnic = formatCNIC(cell);
        } else if (/[A-Z][A-Z\s\.]+$/.test(cell) && cell.length > 3) {
          record.name = cell;
        } else if (cell.length > 10) {
          record.address = cell;
        }
      });

      if (record.name || record.cnic || record.address) {
        result.records.push(record);
        result.found = true;
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
  
  // Remove all non-digits
  let cleaned = cnic.replace(/\D/g, '');
  
  // Format as XXXXX-XXXXXXX-X if 13 digits
  if (cleaned.length === 13) {
    return cleaned.substring(0, 5) + '-' + 
           cleaned.substring(5, 12) + '-' + 
           cleaned.substring(12);
  }
  
  return cleaned;
}