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
          message: 'Use mobile number in format: 03451234567 or 923451234567'
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
          message: 'Enter mobile number starting with 03 or 92'
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

      // ALLOW ALL TYPES OF NUMBERS - NO RESTRICTION HERE
      if (!/^03\d{9}$/.test(phoneNumber)) {
        return Response.json({
          success: false,
          error: 'Invalid mobile number format',
          message: 'Please enter valid Pakistani mobile number (03451234567 or 923451234567)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch data for all numbers
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
    return extractTelenorData(html, phoneNumber);
    
  } catch (error) {
    return {
      success: false,
      message: 'Failed to fetch data'
    };
  }
}

// ========== EXTRACT TELENOR DATA ==========
function extractTelenorData(html, phoneNumber) {
  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      (html.includes('Sorry') && html.includes('found')) ||
      html.includes('Click here for New Search')) {
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
      cnic: '',
      address: '',
      network: 'Telenor',
      developer: 'Haseeb Sahil'
    },
    message: 'Data retrieved successfully'
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

  // ===== EXTRACT CNIC =====
  // Better CNIC extraction - look in the "on" row where CNIC is
  const cnicPatterns = [
    /ON\s+(\d{5}-\d{7}-\d{1})/i,
    /ON\s+(\d{13})/i,
    /ON\s+(\d{5}\s*\d{7}\s*\d{1})/i,
    /HOLDER OF CNIC NO\.\s*(\d{5}-\d{7}-\d{1})/i,
    /CNIC NO\.\s*(\d{5}-\d{7}-\d{1})/i,
    /(\d{5}-\d{7}-\d{1})/,
    /(\d{13})/
  ];

  for (const pattern of cnicPatterns) {
    const cnicMatch = upperText.match(pattern);
    if (cnicMatch && cnicMatch[1]) {
      const cnic = cnicMatch[1].replace(/[-\s]/g, '');
      if (cnic.length === 13 && cnic !== '0000000000000') {
        result.record.cnic = cnic;
        break;
      }
    }
  }

  // ===== EXTRACT ADDRESS =====
  if (result.record.name) {
    const nameIndex = upperText.indexOf(result.record.name);
    if (nameIndex !== -1) {
      const textAfterName = upperText.substring(nameIndex + result.record.name.length);
      
      // Remove "DEDUCTED/COLLECTED FROM" from start
      let addressText = textAfterName.replace(/^(?:\s*(?:DEDUCTED|COLLECTED|FROM))+\s*/i, '');
      
      // Find address ending
      const endMarkers = ['HAVING NTN', 'HOLDER OF CNIC', 'CNIC', 'ON'];
      let endIndex = -1;
      
      for (const marker of endMarkers) {
        const index = addressText.indexOf(marker);
        if (index !== -1 && (endIndex === -1 || index < endIndex)) {
          endIndex = index;
        }
      }
      
      if (endIndex === -1) {
        endIndex = Math.min(300, addressText.length);
      }
      
      if (endIndex > 0) {
        const rawAddress = addressText.substring(0, endIndex);
        result.record.address = cleanTextContent(rawAddress);
      }
    }
  }

  // ===== ALTERNATIVE ADDRESS EXTRACTION =====
  if (!result.record.address && result.record.name) {
    // Try more specific pattern
    const addressRegex = /DEDUCTED\/COLLECTED FROM\s+([A-Z\s.,\-]+?)(?=\s+(?:HAVING|HOLDER|CNIC|ON))/i;
    const addressMatch = upperText.match(addressRegex);
    
    if (addressMatch && addressMatch[1]) {
      result.record.address = cleanTextContent(addressMatch[1]);
    }
  }

  // ===== CLEAN ADDRESS =====
  if (result.record.address) {
    // Remove dots and extra spaces
    result.record.address = result.record.address
      .replace(/\.{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ===== FINAL VALIDATION =====
  if (!result.record.name && !result.record.address && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid data found'
    };
  }

  return result;
}

// ========== HELPER FUNCTIONS ==========
function cleanTextContent(text) {
  return text
    .replace(/[^A-Z\s.,\-]/gi, ' ')  // Keep letters, spaces, dots, commas and hyphens
    .replace(/\s+/g, ' ')         // Remove extra spaces
    .replace(/\.{2,}/g, ' ')      // Remove multiple dots
    .trim();
}