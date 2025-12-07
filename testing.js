// SIM Data API - Complete Single Worker File
// No wrangler.toml needed
// Deploy with: npx wrangler deploy

export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Only GET method allowed
    if (request.method !== 'GET') {
      return Response.json({
        success: false,
        error: 'Only GET method is allowed',
        example: 'GET /?phone=03001234567'
      }, { 
        status: 405,
        headers: corsHeaders 
      });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;
      
      // API endpoint
      if (path === '/' || path === '/api') {
        return handleAPIRequest(url, corsHeaders);
      }
      
      // Health check
      if (path === '/health') {
        return Response.json({
          status: 'ok',
          service: 'SIM Data API',
          timestamp: new Date().toISOString()
        }, { headers: corsHeaders });
      }
      
      // Help page
      if (path === '/help') {
        return new Response(`
          <!DOCTYPE html>
          <html>
          <head><title>SIM Data API</title></head>
          <body>
            <h1>SIM Data API</h1>
            <p>Usage: GET /?phone=03001234567</p>
            <p>Example: <a href="/?phone=03474965595">/?phone=03474965595</a></p>
            <p>Supported parameters: phone, number, mobile</p>
          </body>
          </html>
        `, {
          headers: { 'Content-Type': 'text/html', ...corsHeaders }
        });
      }
      
      // Not found
      return Response.json({
        success: false,
        error: 'Not found',
        endpoints: ['/', '/api', '/health', '/help'],
        example: '/?phone=03001234567'
      }, { 
        status: 404,
        headers: corsHeaders 
      });

    } catch (error) {
      return Response.json({
        success: false,
        error: 'Server error',
        message: error.message,
        timestamp: new Date().toISOString()
      }, { 
        status: 500,
        headers: corsHeaders 
      });
    }
  }
};

// Handle API requests
async function handleAPIRequest(url, corsHeaders) {
  // Get phone number from query
  const phone = url.searchParams.get('phone') || 
                url.searchParams.get('number') || 
                url.searchParams.get('mobile') ||
                url.searchParams.get('query');

  if (!phone) {
    return Response.json({
      success: false,
      error: 'Phone number is required',
      example: '/?phone=03001234567',
      supported_params: ['phone', 'number', 'mobile', 'query']
    }, { 
      status: 400,
      headers: corsHeaders 
    });
  }

  // Clean and validate phone
  const cleanedPhone = cleanPhone(phone);
  
  if (!/^03\d{9}$/.test(cleanedPhone)) {
    return Response.json({
      success: false,
      error: 'Invalid Pakistani mobile number',
      received: phone,
      expected: '03XXXXXXXXX (11 digits)',
      cleaned: cleanedPhone
    }, { 
      status: 400,
      headers: corsHeaders 
    });
  }

  // Fetch SIM data
  const simData = await fetchSimData(cleanedPhone);
  
  // Return response
  return Response.json({
    success: true,
    query: {
      original: phone,
      cleaned: cleanedPhone,
      timestamp: new Date().toISOString()
    },
    data: simData
  }, { 
    headers: corsHeaders 
  });
}

// ==================== CORE FUNCTIONS ====================

// Clean phone number
function cleanPhone(phone) {
  let num = phone.toString().replace(/\D/g, '');
  if (num.startsWith('92') && num.length === 12) num = '0' + num.substring(2);
  if (num.startsWith('3') && num.length === 10) num = '0' + num;
  return num;
}

// Detect network
function getNetwork(phone) {
  const prefix = phone.substring(0, 4);
  if (prefix.startsWith('034')) return 'Telenor';
  if (prefix.startsWith('030') || prefix.startsWith('031')) return 'Jazz';
  if (prefix.startsWith('032')) return 'Warid';
  if (prefix.startsWith('033')) return 'Ufone';
  if (prefix.startsWith('035')) return 'SCO';
  if (prefix.startsWith('036')) return 'Zong';
  return 'Unknown';
}

// Format CNIC
function formatCNIC(cnic) {
  if (!cnic) return '';
  const cleaned = cnic.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return cleaned.substring(0, 5) + '-' + cleaned.substring(5, 12) + '-' + cleaned.substring(12);
  }
  return cnic;
}

// ==================== FETCH SIM DATA ====================

async function fetchSimData(phone) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  const formData = new URLSearchParams();
  formData.append('number', phone);
  formData.append('search', 'search');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://paksimownerdetails.com',
        'Referer': 'https://paksimownerdetails.com/',
      },
      body: formData.toString(),
      cf: {
        cacheTtl: 300,
        cacheEverything: false,
      }
    });

    const html = await response.text();
    
    // Check for no results
    if (html.includes('No record found') || html.toLowerCase().includes('not found')) {
      return {
        found: false,
        network: getNetwork(phone),
        records: []
      };
    }

    // Try Telenor parser first for Telenor numbers
    const network = getNetwork(phone);
    if (network === 'Telenor') {
      const telenorData = parseTelenorData(html, phone);
      if (telenorData.found) return telenorData;
    }

    // Try table parser for all networks
    const tableData = parseTableData(html, phone);
    if (tableData.found) return tableData;

    // If both fail
    return {
      found: false,
      network: network,
      records: []
    };

  } catch (error) {
    console.error('Fetch error:', error);
    return {
      found: false,
      network: getNetwork(phone),
      error: 'Failed to fetch data',
      records: []
    };
  }
}

// ==================== TELENOR PARSER ====================

function parseTelenorData(html, phone) {
  const result = { found: false, network: 'Telenor', records: [] };
  
  // Clean HTML
  const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                   .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                   .replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();

  // Check if Telenor format
  if (!text.includes('MSISDN') && !text.includes('Serial')) return result;

  const record = {
    mobile: phone,
    name: '',
    cnic: '',
    address: '',
    father_name: '',
    serial_no: '',
    sim_type: 'Original',
    status: 'Active',
    network: 'Telenor',
    country: 'Pakistan',
    timestamp: new Date().toISOString()
  };

  // Extract MSISDN
  const msisdnMatch = text.match(/MSISDN\s*[:]?\s*(\d{10,11})/i);
  if (msisdnMatch) record.mobile = cleanPhone(msisdnMatch[1]);

  // Extract Serial
  const serialMatch = text.match(/Serial\s*(?:No\.?)?\s*[:]?\s*([A-Z0-9\s]+)/i);
  if (serialMatch) record.serial_no = serialMatch[1].trim().replace(/\s+/g, '');

  // Extract Name
  const nameMatch1 = text.match(/been\s+([A-Z][A-Z\s\.]+?)(?=\s+[A-Z]{3,}|$)/i);
  if (nameMatch1) record.name = nameMatch1[1].trim();
  
  if (!record.name) {
    const nameMatch2 = text.match(/([A-Z][A-Z\s\.]{3,}?)\s+(?:POST|TEHSIL|DISTRICT|ROAD|MOHALA)/i);
    if (nameMatch2) record.name = nameMatch2[1].trim();
  }

  // Extract Father's Name
  const fatherMatch = text.match(/(?:S\/O|D\/O|son of|daughter of)\s+([A-Z][A-Z\s\.]+)/i);
  if (fatherMatch) record.father_name = fatherMatch[1].trim();

  // Extract CNIC
  const cnicMatch = text.match(/(?:CNIC|NIC)\s*(?:No\.?)?\s*[:]?\s*(\d{5}[-]?\d{7}[-]?\d)/i);
  if (cnicMatch) {
    const cnic = cnicMatch[1];
    const cleaned = cnic.replace(/\D/g, '');
    if (cleaned !== '0000000000000') record.cnic = formatCNIC(cnic);
  }

  // Extract Address
  const lines = text.split('.');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 30 && /^[A-Z0-9\s\.,\-]+$/.test(trimmed) &&
        (trimmed.includes('ROAD') || trimmed.includes('MOHALA') || 
         trimmed.includes('TOWN') || trimmed.includes('DISTRICT') ||
         trimmed.includes('TEHSIL') || trimmed.includes('POST'))) {
      record.address = trimmed;
      break;
    }
  }

  if (!record.address) {
    const allCaps = text.match(/([A-Z][A-Z0-9\s\.,\-]{30,200})/g);
    if (allCaps) {
      const candidates = allCaps.filter(s => 
        !s.includes('MSISDN') && !s.includes('Serial')
      );
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.length - a.length);
        record.address = candidates[0].replace(/\s+/g, ' ').trim();
      }
    }
  }

  // Validate
  const isValid = record.name || (record.cnic && record.cnic !== '00000-0000000-0') || record.address;
  
  if (isValid) {
    result.records.push(record);
    result.found = true;
  }

  return result;
}

// ==================== TABLE PARSER ====================

function parseTableData(html, phone) {
  const result = {
    found: false,
    network: getNetwork(phone),
    records: []
  };

  // Find tables
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  
  while ((tableMatch = tableRegex.exec(html))) {
    const tableHTML = tableMatch[1];
    
    // Find rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableHTML))) {
      const row = rowMatch[1];
      
      // Skip headers
      if (row.includes('<th>') || 
          (row.toLowerCase().includes('mobile') && row.toLowerCase().includes('name'))) {
        continue;
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
        if (content) cells.push(content);
      }

      // Process cells
      if (cells.length >= 3) {
        const record = createRecord(cells, phone);
        if (record) {
          result.records.push(record);
          result.found = true;
        }
      }
    }
  }

  return result;
}

// Create record from cells
function createRecord(cells, phone) {
  const record = {
    mobile: phone,
    name: '',
    cnic: '',
    address: '',
    status: 'Active',
    network: getNetwork(phone),
    country: 'Pakistan',
    timestamp: new Date().toISOString()
  };

  // Find mobile
  for (const cell of cells) {
    if (/^\d{10,11}$/.test(cell)) {
      record.mobile = cleanPhone(cell);
      break;
    }
  }

  // Find CNIC
  for (const cell of cells) {
    const cnicDigits = cell.replace(/\D/g, '');
    if (cnicDigits.length === 13 && cnicDigits !== '0000000000000') {
      record.cnic = formatCNIC(cell);
      break;
    }
  }

  // Find name
  for (let i = 0; i < Math.min(cells.length, 3); i++) {
    const cell = cells[i];
    if (/^[A-Z][A-Z\s\.]+$/.test(cell) && cell.length > 3 &&
        !cell.includes('MOBILE') && !cell.includes('CNIC') &&
        !cell.includes('ADDRESS') && !/^\d+$/.test(cell)) {
      record.name = cell;
      break;
    }
  }

  // Find address (longest text)
  let longest = '';
  for (const cell of cells) {
    if (cell.length > longest.length && 
        cell !== record.name && 
        !/^\d+$/.test(cell) &&
        !cell.includes('Active') && !cell.includes('Inactive')) {
      longest = cell;
    }
  }
  
  if (longest.length > 10) record.address = longest;

  // Find status
  for (const cell of cells) {
    if (['Active', 'Inactive', 'Blocked'].includes(cell)) {
      record.status = cell;
      break;
    }
  }

  // Return if valid
  return (record.name || record.cnic || record.address) ? record : null;
}