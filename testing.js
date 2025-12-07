// Universal SIM Data API - All Networks Support
// File: worker.js

export default {
  async fetch(request) {
    try {
      // Handle CORS
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }

      // Only GET method allowed
      if (request.method !== 'GET') {
        return Response.json({
          success: false,
          error: 'Only GET method is allowed',
          example: 'GET /?phone=03001234567'
        }, { status: 405 });
      }

      const url = new URL(request.url);
      
      // Get phone number from query
      const phone = url.searchParams.get('phone') || 
                    url.searchParams.get('number') || 
                    url.searchParams.get('mobile');

      if (!phone) {
        return Response.json({
          success: false,
          error: 'Phone number is required',
          example: '/?phone=03001234567',
          supported_params: ['phone', 'number', 'mobile']
        }, { status: 400 });
      }

      // Clean and validate phone
      const cleanedPhone = cleanPhoneNumber(phone);
      
      if (!/^03\d{9}$/.test(cleanedPhone)) {
        return Response.json({
          success: false,
          error: 'Invalid Pakistani mobile number',
          received: phone,
          expected: '03XXXXXXXXX (11 digits)',
          cleaned: cleanedPhone
        }, { status: 400 });
      }

      // Fetch data from website
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
      }, { status: 500 });
    }
  }
};

// ========== PHONE CLEANING ==========
function cleanPhoneNumber(phone) {
  if (!phone) return '';
  
  let cleaned = phone.toString().replace(/\D/g, '');
  
  if (cleaned.startsWith('92') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
}

// ========== FETCH DATA ==========
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
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://paksimownerdetails.com',
      'Referer': 'https://paksimownerdetails.com/',
    },
    body: formData.toString(),
    cf: {
      // Cloudflare cache settings
      cacheTtl: 300,
      cacheEverything: false,
    }
  });

  const html = await response.text();
  return parseAllNetworks(html, phoneNumber);
}

// ========== UNIVERSAL PARSER FOR ALL NETWORKS ==========
function parseAllNetworks(html, phoneNumber) {
  const result = {
    found: false,
    network: detectNetwork(phoneNumber),
    records: [],
    raw_text: extractText(html)
  };

  // Check if no data found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      html.includes('Sorry, no details found')) {
    return result;
  }

  // Try different parsing strategies for different networks
  
  // 1. Jazz/Ufone Format (Table format)
  const jazzData = parseJazzFormat(html, phoneNumber);
  if (jazzData.found) {
    return jazzData;
  }
  
  // 2. Telenor Format (Text blocks)
  const telenorData = parseTelenorFormat(html, phoneNumber);
  if (telenorData.found) {
    return telenorData;
  }
  
  // 3. Zong Format
  const zongData = parseZongFormat(html, phoneNumber);
  if (zongData.found) {
    return zongData;
  }
  
  // 4. Generic parsing as fallback
  const genericData = parseGenericFormat(html, phoneNumber);
  if (genericData.found) {
    return genericData;
  }

  return result;
}

// ========== NETWORK DETECTION ==========
function detectNetwork(phoneNumber) {
  const prefix = phoneNumber.substring(0, 4);
  
  if (prefix.startsWith('030') || prefix.startsWith('031')) {
    return 'Jazz';
  } else if (prefix.startsWith('032')) {
    return 'Warid/Jazz';
  } else if (prefix.startsWith('033')) {
    return 'Ufone';
  } else if (prefix.startsWith('034')) {
    return 'Telenor';
  } else if (prefix.startsWith('035')) {
    return 'SCO';
  } else if (prefix.startsWith('036')) {
    return 'Zong';
  } else {
    return 'Unknown';
  }
}

// ========== JAZZ/UFONE FORMAT PARSER ==========
function parseJazzFormat(html, phoneNumber) {
  const result = { found: false, network: 'Jazz/Ufone', records: [] };
  
  // Look for table structure
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/i;
  const tableMatch = html.match(tableRegex);
  
  if (!tableMatch) return result;
  
  const tableHTML = tableMatch[1];
  
  // Extract rows
  const rows = [];
  let rowStart = 0;
  
  while ((rowStart = tableHTML.indexOf('<tr', rowStart)) !== -1) {
    const rowEnd = tableHTML.indexOf('</tr>', rowStart);
    if (rowEnd === -1) break;
    
    const rowHTML = tableHTML.substring(rowStart, rowEnd + 5);
    rows.push(rowHTML);
    rowStart = rowEnd + 5;
  }
  
  // Process data rows (skip header)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Skip header
    if (row.includes('<th>') || row.toLowerCase().includes('mobile')) continue;
    
    // Extract cells
    const cells = extractTableCells(row);
    
    if (cells.length >= 4) {
      const record = {
        mobile: extractMobile(cells, phoneNumber),
        name: extractName(cells),
        cnic: extractCNIC(cells),
        address: extractAddress(cells),
        father_name: extractFatherName(cells),
        status: 'Active',
        network: 'Jazz',
        timestamp: new Date().toISOString()
      };
      
      if (record.mobile || record.name || record.cnic) {
        result.records.push(record);
        result.found = true;
      }
    }
  }
  
  return result;
}

// ========== TELENOR FORMAT PARSER ==========
function parseTelenorFormat(html, phoneNumber) {
  const result = { found: false, network: 'Telenor', records: [] };
  
  // Extract all text
  const text = html.replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();
  
  // Telenor format patterns
  const patterns = {
    msisdn: /MSISDN\s*[:]?\s*(\d{10,11})/i,
    name: /(?:Certified that[^,]+,|holder of[^,]+,|from)\s*([A-Z][A-Z\s\.]+?)(?=\s+having|\s+on|\s+holder|\s+NTN|$)/i,
    address: /(?:from|of)\s*([A-Z][A-Z\s\.\,\-0-9]+?(?:POST OFFICE|TEHSIL|DISTRICT|CITY)[A-Z\s\.\,\-0-9]+?)(?=\s+having|\s+on|\s+NTN|$)/i,
    cnic: /CNIC\s*(?:No\.?|Number)?\s*[:]?\s*(\d{5}[-]?\d{7}[-]?\d)/i,
    serial: /Serial\s*No\s*[:]?\s*([A-Z0-9\s]+)/i
  };
  
  const record = {
    mobile: '',
    name: '',
    cnic: '',
    address: '',
    serial_no: '',
    father_name: '',
    status: 'Active',
    network: 'Telenor',
    timestamp: new Date().toISOString()
  };
  
  // Extract using patterns
  for (const [key, pattern] of Object.entries(patterns)) {
    const match = text.match(pattern);
    if (match) {
      const value = match[1].trim();
      if (key === 'msisdn') record.mobile = cleanPhoneNumber(value);
      else if (key === 'name') record.name = value;
      else if (key === 'address') record.address = value.replace(/\s+/g, ' ');
      else if (key === 'cnic') record.cnic = formatCNIC(value);
      else if (key === 'serial') record.serial_no = value;
    }
  }
  
  // If mobile not found, use queried number
  if (!record.mobile) {
    record.mobile = phoneNumber;
  }
  
  // Check if we found meaningful data
  if (record.name || record.cnic || record.address) {
    result.records.push(record);
    result.found = true;
  }
  
  return result;
}

// ========== ZONG FORMAT PARSER ==========
function parseZongFormat(html, phoneNumber) {
  const result = { found: false, network: 'Zong', records: [] };
  
  // Zong usually has simpler format
  const text = html.replace(/<[^>]+>/g, ' ')
                   .replace(/\s+/g, ' ')
                   .trim();
  
  // Look for common Zong patterns
  const record = {
    mobile: phoneNumber,
    name: '',
    cnic: '',
    address: '',
    status: 'Active',
    network: 'Zong',
    timestamp: new Date().toISOString()
  };
  
  // Try to extract name (usually appears after "Name:" or "Subscriber:")
  const nameMatch = text.match(/(?:Name|Subscriber)[:\s]+([A-Z][A-Z\s\.]+?)(?=\s+CNIC|\s+Address|\s+$)/i);
  if (nameMatch) record.name = nameMatch[1].trim();
  
  // Try to extract CNIC
  const cnicMatch = text.match(/(?:CNIC|NIC)[:\s]+(\d{5}[-]?\d{7}[-]?\d)/i);
  if (cnicMatch) record.cnic = formatCNIC(cnicMatch[1]);
  
  // Try to extract address (usually longer text)
  const addressMatch = text.match(/(?:Address|Location)[:\s]+([A-Z][A-Z\s\.\,\-0-9]+?)(?=\s+Status|\s+$)/i);
  if (addressMatch) record.address = addressMatch[1].trim();
  
  if (record.name || record.cnic || record.address) {
    result.records.push(record);
    result.found = true;
  }
  
  return result;
}

// ========== GENERIC PARSER ==========
function parseGenericFormat(html, phoneNumber) {
  const result = { found: false, network: 'Generic', records: [] };
  
  // Extract all text and clean it
  const text = extractText(html);
  
  if (!text || text.length < 20) return result;
  
  // Create a record with whatever we can find
  const record = {
    mobile: phoneNumber,
    name: '',
    cnic: '',
    address: '',
    status: 'Active',
    network: 'Unknown',
    timestamp: new Date().toISOString(),
    raw_extracted: text.substring(0, 500) // Include first 500 chars for debugging
  };
  
  // Look for CNIC pattern
  const cnicRegex = /\b\d{5}[-]?\d{7}[-]?\d\b/;
  const cnicMatch = text.match(cnicRegex);
  if (cnicMatch) record.cnic = formatCNIC(cnicMatch[0]);
  
  // Look for phone number variations
  const phoneRegex = /\b\d{10,11}\b/g;
  const phones = text.match(phoneRegex) || [];
  if (phones.length > 0) {
    record.mobile = cleanPhoneNumber(phones[0]);
  }
  
  // Look for name (capitalized words sequence)
  const nameRegex = /\b([A-Z][A-Z\s\.]{2,50}?)(?=\s+\d|$|\.|,)/;
  const nameMatch = text.match(nameRegex);
  if (nameMatch && nameMatch[1].length > 3) {
    record.name = nameMatch[1].trim();
  }
  
  // Look for address (longer text with locations)
  const addressRegex = /(?:at|from|of|address)[:\s]*([A-Z][A-Za-z\s\.\,\-0-9]{10,200})/i;
  const addressMatch = text.match(addressRegex);
  if (addressMatch) {
    record.address = addressMatch[1].trim();
  }
  
  // If we found at least CNIC or Name, consider it a match
  if (record.cnic || record.name) {
    result.records.push(record);
    result.found = true;
  }
  
  return result;
}

// ========== HELPER FUNCTIONS ==========
function extractTableCells(rowHTML) {
  const cells = [];
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g;
  let match;
  
  while ((match = cellRegex.exec(rowHTML))) {
    let content = match[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Remove emojis
    content = content.replace(/[^\x00-\x7F]/g, '').trim();
    cells.push(content);
  }
  
  return cells;
}

function extractMobile(cells, defaultPhone) {
  for (const cell of cells) {
    if (/^\d{10,11}$/.test(cell)) {
      return cleanPhoneNumber(cell);
    }
  }
  return defaultPhone;
}

function extractName(cells) {
  for (const cell of cells) {
    if (/[A-Z][A-Z\s\.]+$/.test(cell) && cell.length > 3 && 
        !cell.toLowerCase().includes('mobile') &&
        !cell.toLowerCase().includes('cnic') &&
        !cell.toLowerCase().includes('address')) {
      return cell.trim();
    }
  }
  return '';
}

function extractCNIC(cells) {
  for (const cell of cells) {
    const cnic = cell.replace(/\D/g, '');
    if (cnic.length === 13) {
      return formatCNIC(cnic);
    }
  }
  return '';
}

function extractAddress(cells) {
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i];
    if (cell.length > 20 && /[A-Z]/.test(cell) && 
        !cell.toLowerCase().includes('active') &&
        !cell.toLowerCase().includes('inactive')) {
      return cell;
    }
  }
  return '';
}

function extractFatherName(cells) {
  for (const cell of cells) {
    if (cell.toLowerCase().includes('s/o') || 
        cell.toLowerCase().includes('son of') ||
        cell.toLowerCase().includes('d/o') ||
        cell.toLowerCase().includes('daughter of')) {
      return cell;
    }
  }
  return '';
}

function formatCNIC(cnic) {
  if (!cnic) return '';
  
  let cleaned = cnic.replace(/\D/g, '');
  if (cleaned.length !== 13) return cnic;
  
  return cleaned.substring(0, 5) + '-' + 
         cleaned.substring(5, 12) + '-' + 
         cleaned.substring(12);
}

function extractText(html) {
  return html.replace(/<[^>]+>/g, ' ')
             .replace(/\s+/g, ' ')
             .trim()
             .substring(0, 1000); // Limit to first 1000 chars
}