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

  // Extract network information
  let network = 'Unknown';
  if (html.includes('Jazz') || html.includes('Mobilink')) {
    network = 'Jazz';
  } else if (html.includes('Telenor')) {
    network = 'Telenor';
  } else if (html.includes('Ufone')) {
    network = 'Ufone';
  } else if (html.includes('Zong')) {
    network = 'Zong';
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
        network: network,  // Network added here
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