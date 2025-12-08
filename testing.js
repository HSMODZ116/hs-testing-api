// CNIC Search API - Pak Sim Owner Details
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
          message: 'Use CNIC number for search'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the CNIC parameter
      const cnic = url.searchParams.get('cnic');

      // If no cnic parameter
      if (!cnic) {
        return Response.json({
          success: false,
          error: 'CNIC number is required',
          message: 'Please provide CNIC number for search'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean the CNIC - remove all non-digits
      const cleanedCNIC = cnic.toString().replace(/\D/g, '');
      
      // Check CNIC length and give specific error messages
      const cnicLength = cleanedCNIC.length;
      
      if (cnicLength === 0) {
        return Response.json({
          success: false,
          error: 'Empty CNIC',
          message: 'Please enter a valid CNIC number'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (cnicLength < 13) {
        return Response.json({
          success: false,
          error: 'Invalid CNIC length',
          message: `CNIC is too short (${cnicLength} digits). CNIC must be exactly 13 digits.`,
          digits_provided: cnicLength,
          digits_required: 13
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (cnicLength > 13) {
        return Response.json({
          success: false,
          error: 'Invalid CNIC length',
          message: `CNIC is too long (${cnicLength} digits). CNIC must be exactly 13 digits.`,
          digits_provided: cnicLength,
          digits_required: 13
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Validate CNIC format (exactly 13 digits without dashes)
      if (!/^\d{13}$/.test(cleanedCNIC)) {
        return Response.json({
          success: false,
          error: 'Invalid CNIC format',
          message: 'CNIC must be exactly 13 digits (numbers only, without dashes or spaces)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Additional validation: Check first 5 digits (should be 00001-99999)
      const firstFive = parseInt(cleanedCNIC.substring(0, 5));
      if (firstFive < 1 || firstFive > 99999) {
        return Response.json({
          success: false,
          error: 'Invalid CNIC',
          message: 'CNIC first 5 digits are invalid. Must be between 00001 and 99999.'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Additional validation: Check last digit (should be 0-9)
      const lastDigit = cleanedCNIC.charAt(12);
      if (!/^\d$/.test(lastDigit)) {
        return Response.json({
          success: false,
          error: 'Invalid CNIC',
          message: 'CNIC last digit is invalid'
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
        cnic: cleanedCNIC,
        data: data,
        count: data.records.length
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Headers': '*',
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

// ========== FETCH DATA BY CNIC ==========
async function fetchDataByCNIC(cnicNumber) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  // Create form data - using CNIC instead of phone number
  const formData = new URLSearchParams();
  formData.append('number', cnicNumber); // Website accepts CNIC in same field
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
    return extractDataFromHTML(html, cnicNumber);
    
  } catch (error) {
    return {
      success: false,
      records: [],
      message: 'Failed to fetch data from server'
    };
  }
}

// ========== EXTRACT DATA FROM HTML ==========
function extractDataFromHTML(html, cnicNumber) {
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

  // Clean HTML and extract text
  const cleanText = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/td>/gi, ' ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Convert to uppercase for easier matching
  const upperText = cleanText.toUpperCase();
  
  // Find all occurrences of CNIC in the text
  const cnicPositions = [];
  const cnicWithDashes = formatCNICWithDashes(cnicNumber);
  
  let searchIndex = 0;
  while (true) {
    const cnicIndex = upperText.indexOf(cnicNumber, searchIndex);
    if (cnicIndex === -1) break;
    cnicPositions.push(cnicIndex);
    searchIndex = cnicIndex + 1;
  }
  
  // Also search for CNIC with dashes
  searchIndex = 0;
  while (true) {
    const cnicIndex = upperText.indexOf(cnicWithDashes, searchIndex);
    if (cnicIndex === -1) break;
    cnicPositions.push(cnicIndex);
    searchIndex = cnicIndex + 1;
  }

  if (cnicPositions.length === 0) {
    result.success = false;
    result.message = 'CNIC not found in response';
    return result;
  }

  // Extract data for each CNIC occurrence
  for (const cnicPosition of cnicPositions) {
    const record = extractRecordAroundCNIC(cleanText, upperText, cnicPosition, cnicNumber);
    if (record && record.mobile) {
      result.records.push(record);
    }
  }

  // Remove duplicates based on mobile number
  result.records = result.records.filter((record, index, self) =>
    index === self.findIndex(r => r.mobile === record.mobile)
  );

  if (result.records.length === 0) {
    result.success = false;
    result.message = 'No valid mobile records found for this CNIC';
  }

  return result;
}

// ========== EXTRACT RECORD AROUND CNIC ==========
function extractRecordAroundCNIC(cleanText, upperText, cnicPosition, cnicNumber) {
  const record = {
    mobile: '',
    name: '',
    cnic: cnicNumber,
    address: '',
    status: 'Active',
    country: 'Pakistan'
  };

  // Extract context around CNIC (200 characters before and after)
  const start = Math.max(0, cnicPosition - 200);
  const end = Math.min(upperText.length, cnicPosition + 300);
  const context = upperText.substring(start, end);
  
  // Extract mobile number (look for "MOBILE#" or "03" pattern near CNIC)
  const mobileRegex = /MOBILE[#:]?\s*(\d{10,11})/gi;
  const mobileMatch = context.match(mobileRegex);
  
  if (mobileMatch) {
    const mobileNumber = mobileMatch[0].replace(/[^\d]/g, '');
    record.mobile = formatMobile(mobileNumber);
  } else {
    // Alternative: Look for 03xxxxxxxxx pattern near CNIC
    const altMobileMatch = context.match(/(03\d{9})/);
    if (altMobileMatch) {
      record.mobile = formatMobile(altMobileMatch[1]);
    }
  }

  // Extract name (look for "from" or "of" patterns)
  const namePatterns = [
    /FROM\s+([A-Z][A-Z\s]{2,50}?)\s+(?:HAVING|HOLDER|CNIC|ON)/,
    /OF\s+([A-Z][A-Z\s]{2,50}?)\s+(?:HAVING|HOLDER|CNIC|ON)/,
    /RUPEES\s+([A-Z][A-Z\s]{2,50}?)\s+(?:HAVING|HOLDER|CNIC|ON)/,
    /TAX\s+([A-Z][A-Z\s]{2,50}?)\s+(?:HAVING|HOLDER|CNIC|ON)/
  ];
  
  for (const pattern of namePatterns) {
    const nameMatch = context.match(pattern);
    if (nameMatch && nameMatch[1]) {
      record.name = cleanName(nameMatch[1]);
      break;
    }
  }

  // If name not found with patterns, try to extract from before CNIC
  if (!record.name) {
    const beforeCNIC = cleanText.substring(Math.max(0, cnicPosition - 100), cnicPosition);
    const words = beforeCNIC.split(' ').filter(w => w.length > 2);
    if (words.length > 0) {
      // Take the last meaningful word before CNIC as possible name
      for (let i = words.length - 1; i >= 0; i--) {
        const word = words[i].trim();
        if (/^[A-Z][A-Z\s]+$/.test(word.toUpperCase())) {
          record.name = cleanName(word);
          break;
        }
      }
    }
  }

  // Extract address (text after name or CNIC)
  let addressStart = cnicPosition + cnicNumber.length;
  if (record.name && upperText.indexOf(record.name) !== -1) {
    addressStart = upperText.indexOf(record.name) + record.name.length;
  }
  
  const addressText = cleanText.substring(addressStart, Math.min(cleanText.length, addressStart + 200));
  
  // Clean address text
  const address = addressText
    .replace(/HAVING.*|HOLDER.*|CNIC.*|ON.*|DATE.*|PERIOD.*|FROM.*|TO.*/gi, '')
    .replace(/[^A-Z\s.,\-0-9]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  if (address && address.length > 3 && !address.includes('CERTIFIED') && !address.includes('TAX')) {
    record.address = address;
  }

  return record;
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
  
  // Ensure it's a valid Pakistani mobile
  if (!/^03\d{9}$/.test(cleaned)) {
    return '';
  }
  
  return cleaned;
}

function cleanName(name) {
  return name
    .replace(/[^A-Z\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function formatCNICWithDashes(cnic) {
  if (!cnic || cnic.length !== 13) return cnic;
  return cnic.substring(0, 5) + '-' + cnic.substring(5, 12) + '-' + cnic.substring(12);
}