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
      
      // Return response - Updated structure
      return Response.json({
        success: true,
        phone: finalPhone,
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
  return parseHTML(html, phoneNumber);
}

// ========== HTML PARSER ==========
function parseHTML(html, phoneNumber) {
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
      // Determine network based on phone number prefix
      let network = getNetwork(phoneNumber);
      
      const record = {
        mobile: formatMobile(cells[0] || ''),
        name: cells[1] || '',
        cnic: formatCNIC(cells[2] || ''),  // CNIC without hyphens
        address: cells[3] || '',
        status: cells[4] || 'Unknown',
        network: network,  // Proper network detection
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

function getNetwork(phoneNumber) {
  const prefix = phoneNumber.substring(0, 4);
  
  // Jazz/Warid prefixes
  if (['0300', '0301', '0302', '0303', '0304', '0305', '0306', '0307', '0308', '0309'].includes(prefix)) {
    return 'Jazz';
  }
  // Jazz new prefixes
  else if (['0310', '0311', '0312', '0313', '0314', '0315'].includes(prefix)) {
    return 'Jazz';
  }
  // Telenor prefixes
  else if (['0340', '0341', '0342', '0343', '0344', '0345', '0346', '0347'].includes(prefix)) {
    return 'Telenor';
  }
  // Telenor new prefixes
  else if (['0348', '0349'].includes(prefix)) {
    return 'Telenor';
  }
  // Ufone prefixes
  else if (['0330', '0331', '0332', '0333', '0334', '0335', '0336', '0337'].includes(prefix)) {
    return 'Ufone';
  }
  // Ufone new prefixes
  else if (['0338', '0339'].includes(prefix)) {
    return 'Ufone';
  }
  // Zong prefixes
  else if (['0316', '0317', '0318', '0319'].includes(prefix)) {
    return 'Zong';
  }
  // Zong new prefixes
  else if (['0320', '0321', '0322', '0323', '0324', '0325'].includes(prefix)) {
    return 'Zong';
  }
  // Special number ranges
  else if (['0326', '0327', '0328', '0329'].includes(prefix)) {
    return 'Zong';
  }
  else {
    return 'Unknown';
  }
}