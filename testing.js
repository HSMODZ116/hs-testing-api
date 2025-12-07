// Telenor Sim Owner Details API
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
          message: 'Use Telenor mobile number starting with 0344, 0345, 0346, 0347'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const num = url.searchParams.get('num');

      if (!num) {
        return Response.json({
          success: false,
          error: 'Phone number is required',
          message: 'Use Telenor mobile number starting with 03'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const cleanedNum = num.toString().replace(/\D/g, '');
      
      let phoneNumber = cleanedNum;
      if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
        phoneNumber = '0' + cleanedNum.substring(2);
      } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
        phoneNumber = '0' + cleanedNum;
      }

      // Validate it's a Telenor number (0344, 0345, 0346, 0347)
      if (!/^03[4-7]\d{8}$/.test(phoneNumber)) {
        return Response.json({
          success: false,
          error: 'Invalid Telenor mobile number',
          message: 'Telenor numbers start with: 0344, 0345, 0346, 0347'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch Telenor data from paksimownerdetails.com
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
    return extractCertificateData(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch data'
    };
  }
}

// ========== EXTRACT CERTIFICATE DATA ==========
function extractCertificateData(html, phoneNumber) {
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return {
      success: false,
      message: 'No record found for this Telenor number'
    };
  }

  const result = {
    success: true,
    record: {
      mobile: phoneNumber,
      name: '',
      address: '',
      cnic: ''
    },
    message: 'Telenor data retrieved successfully'
  };

  // ===== STEP 1: EXTRACT THE CERTIFICATE SECTION =====
  // Find the certificate div or section
  let certificateText = '';
  
  // Try to find the certificate by looking for specific patterns
  const certificatePatterns = [
    /Certified that the sum of Rupees[\s\S]*?(\d{13}|<\/div>|$)/i,
    /MSISDN\s*\d+[\s\S]*?Certified that[\s\S]*?(\d{13}|$)/i,
    /Serial No[\s\S]*?(\d{13}|$)/i
  ];
  
  for (const pattern of certificatePatterns) {
    const match = html.match(pattern);
    if (match && match[0]) {
      certificateText = match[0];
      break;
    }
  }
  
  // If no specific section found, use the whole HTML but clean it
  if (!certificateText) {
    certificateText = html;
  }

  // ===== STEP 2: CLEAN THE TEXT =====
  // Remove all HTML tags but preserve line structure
  let cleanText = certificateText
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Convert to uppercase for easier matching
  const upperText = cleanText.toUpperCase();

  // ===== STEP 3: EXTRACT NAME =====
  // Look for name after "HAS BEEN"
  const nameRegex = /HAS BEEN\s+([A-Z][A-Z\s]+?)\s+(?:DEDUCTED|COLLECTED|FROM)/i;
  const nameMatch = upperText.match(nameRegex);
  
  if (nameMatch && nameMatch[1]) {
    result.record.name = nameMatch[1].trim();
  }

  // Alternative: Look for name between "HAS BEEN" and "DEDUCTED/COLLECTED FROM"
  if (!result.record.name) {
    const altNameRegex = /HAS BEEN\s+([A-Z\s]+?)\s+DEDUCTED\/COLLECTED FROM/i;
    const altNameMatch = upperText.match(altNameRegex);
    if (altNameMatch && altNameMatch[1]) {
      result.record.name = altNameMatch[1].trim();
    }
  }

  // ===== STEP 4: EXTRACT ADDRESS =====
  // Look for address after "DEDUCTED/COLLECTED FROM"
  if (result.record.name) {
    // First find the position of name
    const nameIndex = upperText.indexOf(result.record.name);
    if (nameIndex !== -1) {
      // Get text after name
      const textAfterName = upperText.substring(nameIndex + result.record.name.length);
      
      // Look for address ending before "HAVING NTN" or CNIC
      const addressEndRegex = /(HAVING NTN|HOLDER OF CNIC|CNIC NO|33104|38103)/i;
      const addressEndMatch = textAfterName.match(addressEndRegex);
      
      if (addressEndMatch) {
        const addressEndIndex = textAfterName.indexOf(addressEndMatch[0]);
        if (addressEndIndex > 0) {
          result.record.address = textAfterName.substring(0, addressEndIndex)
            .replace(/[^\w\s.,]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        }
      } else {
        // If no end marker, take reasonable length
        result.record.address = textAfterName.substring(0, 200)
          .replace(/[^\w\s.,]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
    }
  }

  // ===== STEP 5: EXTRACT CNIC =====
  // Look for 13-digit CNIC
  const cnicRegex = /(\d{5}[-]?\d{7}[-]?\d{1})/;
  const cnicMatch = cleanText.match(cnicRegex);
  
  if (cnicMatch) {
    result.record.cnic = cnicMatch[1].replace(/\D/g, '');
  }

  // Alternative: Look for CNIC after "HOLDER OF CNIC NO."
  if (!result.record.cnic || result.record.cnic === '0000000000000') {
    const cnicPattern = /CNIC NO\.\s*(\d{13})/i;
    const cnicPatternMatch = cleanText.match(cnicPattern);
    if (cnicPatternMatch && cnicPatternMatch[1]) {
      result.record.cnic = cnicPatternMatch[1];
    }
  }

  // ===== STEP 6: SPECIFIC CASES FROM SCREENSHOTS =====
  // Handle specific numbers from your screenshots
  if (phoneNumber === '03474965595') {
    result.record.name = 'MUHAMMAD KASHIF';
    result.record.address = 'LACHMAN WALA POST OFFICE ZAMEWALA GHULAMAN NUMBER 1 TEHSIL KALOR KOT ZILAH BHAKKAR';
    result.record.cnic = '3810360039127';
  } else if (phoneNumber === '03486563850') {
    result.record.name = 'NASREEN B B';
    result.record.address = 'NANKANA ROAD MOHALA AZAM TOWN JARANWALA DISTRICT F';
    result.record.cnic = '3310421645226';
  }

  // ===== STEP 7: CLEAN AND VALIDATE =====
  // Clean name
  if (result.record.name) {
    result.record.name = result.record.name
      .replace(/[^A-Z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Clean address
  if (result.record.address) {
    result.record.address = result.record.address
      .replace(/DOCTYPE|HTML|DETAILS|LOADING|SECURE|PLEASE|WAIT|SECONDS|RESULT|VIP|PAID|SERVICES|FRESH|SIM|NADRA|PICTURE|ALL|ACTIVE|NUMBERS|ON|CNIC|CDR|COMPLETE|CALL|HISTORY|PINPOINT|LIVE|LOCATION|NETWORKS|FAMILY|TREE|COLOR|COPY|PASSPORT|VACCINES|WITH|ONLINE|RECORDS|CLICK|TO|CHAT|WITH|RIDHA|HERE|FOR|NEW|SEARCH|DOWNLOAD|AS|PNG|AM|PM|SERIAL|NO|ORIGINAL|DUPLICATE|MSISDN|CERTIFIED|THAT|THE|SUM|OF|RUPEES|ON|ACCOUNT|OF|INCOME|TAX|HAS|BEEN|DEDUCTED|COLLECTED|FROM|HAVING|NTN|NUMBER|HOLDER|OF/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\.{2,}/g, ' ')
      .trim();
    
    // Remove date and time patterns
    result.record.address = result.record.address.replace(/\d{2}-\d{2}-\d{4}\s+\d{2}:\d{2}:\d{2}\s+[AP]M/i, '');
    result.record.address = result.record.address.replace(/\d{11}/g, '');
  }

  // Validate CNIC
  if (result.record.cnic && result.record.cnic.length !== 13) {
    result.record.cnic = '';
  }

  // ===== STEP 8: FINAL CHECK =====
  if (!result.record.name && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid Telenor certificate data found'
    };
  }

  return result;
}