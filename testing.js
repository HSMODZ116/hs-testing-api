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
          message: 'Use Pakistani mobile number starting with 03'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch data from wnerdetails.com (Telenor specific)
      const data = await fetchTelenorData(phoneNumber);
      
      // Return response
      return Response.json({
        success: data.success,
        phone: phoneNumber,
        data: data.record || null,
        message: data.message
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

// ========== FETCH TELENOR DATA FUNCTION ==========
async function fetchTelenorData(phoneNumber) {
  // Use wnerdetails.com for Telenor
  const url = 'https://wnerdetails.com/';
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://wnerdetails.com',
        'Referer': 'https://wnerdetails.com/',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Upgrade-Insecure-Requests': '1'
      },
      body: `number=${phoneNumber}&search=search`
    });

    const html = await response.text();
    return parseTelenorHTML(html, phoneNumber);
    
  } catch (error) {
    // Fallback to paksimownerdetails.com
    return await fetchFallbackData(phoneNumber);
  }
}

// ========== FALLBACK TO PAKSIMOWNERDETAILS ==========
async function fetchFallbackData(phoneNumber) {
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
    return parseTelenorHTML(html, phoneNumber);
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch data'
    };
  }
}

// ========== TELENOR HTML PARSER ==========
function parseTelenorHTML(html, phoneNumber) {
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      html.includes('Record Not Found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return {
      success: false,
      message: 'No record found'
    };
  }

  // Initialize result
  const result = {
    success: true,
    record: {
      mobile: phoneNumber,
      name: '',
      address: '',
      cnic: ''
    },
    message: 'Data retrieved successfully'
  };

  // ===== STRATEGY 1: Extract from plain text (removing HTML tags) =====
  const plainText = html
    .replace(/<[^>]+>/g, '\n')  // Replace tags with newlines
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Extract MSISDN to verify we have right number
  const msisdnMatch = plainText.match(/MSISDN\s+(\d+)/i);
  if (msisdnMatch) {
    const msisdn = msisdnMatch[1];
    if (msisdn !== phoneNumber.replace('0', '')) {
      // If MSISDN doesn't match, this might not be the right record
      console.log(`MSISDN mismatch: ${msisdn} vs ${phoneNumber}`);
    }
  }

  // ===== EXTRACT NAME =====
  // Method 1: Look for pattern like "on account of income tax has been deducted/collected from\n\nNASREEN B B"
  const nameRegex1 = /has been deducted\/collected from\s*\n?\s*([A-Z][A-Z\s]+?)(?:\s*\n|$)/i;
  const nameMatch1 = plainText.match(nameRegex1);
  
  if (nameMatch1 && nameMatch1[1]) {
    result.record.name = nameMatch1[1].trim();
  }

  // Method 2: Look for uppercase words after "from" and before address
  if (!result.record.name) {
    const nameRegex2 = /from\s+([A-Z][A-Z\s]{2,50}?)(?:\s+[A-Z]|$)/;
    const nameMatch2 = plainText.match(nameRegex2);
    if (nameMatch2 && nameMatch2[1]) {
      const potentialName = nameMatch2[1].trim();
      // Check if this looks like a name (not too long, doesn't contain common address words)
      if (potentialName.length < 50 && 
          !potentialName.includes('ROAD') && 
          !potentialName.includes('TOWN') && 
          !potentialName.includes('DISTRICT')) {
        result.record.name = potentialName;
      }
    }
  }

  // Method 3: Look for name in HTML structure
  if (!result.record.name) {
    const htmlNameMatch = html.match(/has been[^>]*>([^<]+)</i);
    if (htmlNameMatch && htmlNameMatch[1]) {
      result.record.name = htmlNameMatch[1].trim();
    }
  }

  // ===== EXTRACT ADDRESS =====
  // Method 1: Look for address lines after name
  if (result.record.name) {
    // Create a regex to find everything after the name
    const nameForRegex = result.record.name.replace(/([\[\](){}.*+?^$|\\])/g, '\\$1');
    const addressRegex = new RegExp(`${nameForRegex}\\s+([^\\n]+?\\s+(?:ROAD|STREET|AVENUE|LANE|TOWN|CITY|VILLAGE|DISTRICT|TEHSIL|POST)[^\\n]+)`, 'i');
    const addressMatch = plainText.match(addressRegex);
    
    if (addressMatch && addressMatch[1]) {
      result.record.address = addressMatch[1]
        .replace(/\s+/g, ' ')
        .trim();
    }
  }

  // Method 2: Look for common address patterns
  if (!result.record.address) {
    const addressPatterns = [
      /([A-Z][A-Z\s]+(?:ROAD|STREET|AVENUE|LANE)[^\.]+?DISTRICT[^\.]+)/i,
      /([A-Z][A-Z\s]+(?:TOWN|CITY|VILLAGE)[^\.]+?DISTRICT[^\.]+)/i,
      /([A-Z][A-Z\s]+TEHSIL[^\.]+?DISTRICT[^\.]+)/i,
      /(NANKANA ROAD[^\.]+?DISTRICT[^\.]+)/i,  // Specific to this example
      /(MOHALA[^\.]+?DISTRICT[^\.]+)/i
    ];
    
    for (const pattern of addressPatterns) {
      const match = plainText.match(pattern);
      if (match && match[1]) {
        result.record.address = match[1]
          .replace(/\s+/g, ' ')
          .trim();
        break;
      }
    }
  }

  // Method 3: Extract between name and "having NTN"
  if (!result.record.address && result.record.name) {
    const nameEscaped = result.record.name.replace(/([\[\](){}.*+?^$|\\])/g, '\\$1');
    const betweenRegex = new RegExp(`${nameEscaped}([\\s\\S]+?)having NTN`, 'i');
    const betweenMatch = html.match(betweenRegex);
    
    if (betweenMatch && betweenMatch[1]) {
      let address = betweenMatch[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (address.length > 10) {
        result.record.address = address;
      }
    }
  }

  // ===== EXTRACT CNIC =====
  // Method 1: Look for "holder of CNIC No." pattern
  const cnicRegex1 = /holder of CNIC No\.\s*on\s*\n?\s*(\d{13})/i;
  const cnicMatch1 = plainText.match(cnicRegex1);
  
  if (cnicMatch1 && cnicMatch1[1]) {
    result.record.cnic = cnicMatch1[1];
  }

  // Method 2: Look for 13-digit number
  if (!result.record.cnic) {
    const cnicRegex2 = /(\d{5}[-]?\d{7}[-]?\d{1})/;
    const cnicMatch2 = plainText.match(cnicRegex2);
    if (cnicMatch2) {
      result.record.cnic = cnicMatch2[1].replace(/\D/g, '');
    }
  }

  // Method 3: Look in HTML structure
  if (!result.record.cnic) {
    const cnicRegex3 = /holder of CNIC No\.\s*[^>]*>([^<]+)</i;
    const cnicMatch3 = html.match(cnicRegex3);
    if (cnicMatch3 && cnicMatch3[1]) {
      result.record.cnic = cnicMatch3[1].replace(/\D/g, '');
    }
  }

  // ===== FINAL VALIDATION =====
  // Check if we have at least name or CNIC
  if (!result.record.name && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid data found in response'
    };
  }

  // Clean up the data
  if (result.record.name) {
    result.record.name = result.record.name.toUpperCase();
  }
  
  if (result.record.address) {
    result.record.address = result.record.address.toUpperCase();
  }
  
  if (result.record.cnic && result.record.cnic.length !== 13) {
    result.record.cnic = '';
  }

  return result;
}

// ========== HELPER FUNCTIONS ==========
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

function formatCNIC(cnic) {
  if (!cnic) return '';
  return cnic.replace(/\D/g, '');
}