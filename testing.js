// Telenor Sim Owner Details API - Updated for freshsimdata.net
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

      // Validate Pakistani number format
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

      // Fetch data for the number
      const data = await fetchFreshSimData(phoneNumber);
      
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
      console.error('Error:', error);
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

// ========== FETCH FROM FRESHSIMDATA.NET ==========
async function fetchFreshSimData(phoneNumber) {
  try {
    // First, get the main page to establish session
    const mainPageResponse = await fetch('https://freshsimdata.net/', {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    // Get cookies from first request
    const cookies = mainPageResponse.headers.get('set-cookie') || '';

    // Now make the search request
    const searchUrl = 'https://freshsimdata.net/numberDetails.php';
    
    const formData = new URLSearchParams();
    formData.append('searchBtn', 'search');
    formData.append('number', phoneNumber);

    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://freshsimdata.net',
        'Referer': 'https://freshsimdata.net/',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Cookie': cookies,
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData.toString()
    });

    const html = await response.text();
    console.log('Response length:', html.length);
    
    if (html.length < 100) {
      return {
        success: false,
        message: 'Empty response from server'
      };
    }
    
    return extractFreshSimData(html, phoneNumber);
    
  } catch (error) {
    console.error('Fetch error:', error);
    return {
      success: false,
      message: `Failed to fetch data: ${error.message}`
    };
  }
}

// ========== EXTRACT DATA FROM FRESHSIMDATA ==========
function extractFreshSimData(html, phoneNumber) {
  console.log('Extracting data from HTML...');
  
  // Check if no records found
  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes('no record found') || 
      lowerHtml.includes('data not found') ||
      lowerHtml.includes('try another') ||
      lowerHtml.includes('invalid number') ||
      (lowerHtml.includes('sorry') && lowerHtml.includes('not found'))) {
    console.log('No record found in HTML');
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

  // ===== IMPROVED HTML PARSING =====
  // Remove scripts and styles
  let cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleanHtml = cleanHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Convert to text for pattern matching
  const textContent = cleanHtml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

  console.log('Text content length:', textContent.length);
  
  const upperText = textContent.toUpperCase();
  
  // ===== EXTRACT MSISDN =====
  const msisdnMatch = upperText.match(/MSISDN\s*[:]?\s*(\d{10})/i);
  if (msisdnMatch && msisdnMatch[1]) {
    result.record.mobile = '0' + msisdnMatch[1];
  }

  // ===== EXTRACT NAME =====
  // Multiple patterns to try
  const namePatterns = [
    /DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]{2,50}?)(?=\s+(?:LACHMAN|POST|TEHSIL|ZILAH|HAVING|CNIC|$))/i,
    /FROM\s+([A-Z][A-Z\s]{2,50}?)(?=\s+(?:LACHMAN|POST|TEHSIL|ZILAH|HAVING|CNIC|$))/i,
    /HAS BEEN\s+[A-Z\s]+\s+FROM\s+([A-Z][A-Z\s]{2,50}?)(?=\s+(?:LACHMAN|POST|TEHSIL|ZILAH|$))/i
  ];

  for (const pattern of namePatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      if (name.length > 2 && !name.includes('DEDUCTED') && !name.includes('COLLECTED')) {
        result.record.name = cleanName(name);
        console.log('Found name:', result.record.name);
        break;
      }
    }
  }

  // ===== EXTRACT ADDRESS =====
  if (result.record.name) {
    // Find the section after name
    const searchName = result.record.name.toUpperCase();
    const nameIndex = upperText.indexOf(searchName);
    
    if (nameIndex !== -1) {
      const afterName = upperText.substring(nameIndex + searchName.length);
      
      // Address patterns based on screenshot
      const addressPatterns = [
        /([A-Z][A-Z\s,.-]+TEHSIL\s+[A-Z\s]+ZILAH\s+[A-Z\s]+)/i,
        /(POST OFFICE\s+[A-Z\s]+TEHSIL\s+[A-Z\s]+ZILAH\s+[A-Z\s]+)/i,
        /([A-Z][A-Z\s,.-]+?(?:TEHSIL|DISTRICT)\s+[A-Z\s,.-]+)/i,
        /(LACHMAN WALA[\s\S]+?BHAKKAR)/i
      ];

      for (const pattern of addressPatterns) {
        const match = afterName.match(pattern);
        if (match && match[0]) {
          let address = match[0].trim();
          
          // Clean up address
          address = address.replace(/\s+/g, ' ');
          address = address.replace(/\.{2,}/g, ' ');
          address = address.replace(/^\s*,\s*|\s*,\s*$/g, '');
          
          if (address.length > 20) {
            result.record.address = formatAddress(address);
            console.log('Found address:', result.record.address);
            break;
          }
        }
      }
    }
  }

  // Try direct address patterns
  if (!result.record.address) {
    const directAddressPatterns = [
      /LACHMAN WALA POST OFFICE[\s\S]+?BHAKKAR/i,
      /POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH/i,
      /TEHSIL KALOR KOT[\s\S]+?BHAKKAR/i
    ];

    for (const pattern of directAddressPatterns) {
      const match = upperText.match(pattern);
      if (match && match[0]) {
        const address = match[0].trim();
        if (address.length > 10) {
          result.record.address = formatAddress(address);
          break;
        }
      }
    }
  }

  // ===== EXTRACT CNIC =====
  const cnicPatterns = [
    /CNIC NO[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i,
    /HOLDER OF CNIC[.\s:]*(\d{5}[-\s]?\d{7}[-\s]?\d{1})/i,
    /(\d{5}-\d{7}-\d{1})/,
    /(\d{13})/
  ];

  for (const pattern of cnicPatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      let cnic = match[1].replace(/[^\d]/g, '');
      if (cnic.length === 13 && cnic !== '0000000000000') {
        result.record.cnic = cnic;
        console.log('Found CNIC:', result.record.cnic);
        break;
      }
    }
  }

  // ===== FALLBACK: TABLE PARSING =====
  if (!result.record.name || !result.record.address) {
    // Try to find and parse tables
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
    let tableMatch;
    
    while ((tableMatch = tableRegex.exec(html)) !== null) {
      const tableContent = tableMatch[1];
      const tableText = tableContent
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (tableText.length > 50) {
        const upperTable = tableText.toUpperCase();
        
        // Extract name from table
        if (!result.record.name) {
          const nameMatch = upperTable.match(/FROM\s+([A-Z][A-Z\s]+?)(?=\s+(?:POST|TEHSIL|$))/);
          if (nameMatch && nameMatch[1]) {
            result.record.name = cleanName(nameMatch[1]);
          }
        }
        
        // Extract address from table
        if (!result.record.address) {
          const addressMatch = upperTable.match(/(POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+)/);
          if (addressMatch && addressMatch[1]) {
            result.record.address = formatAddress(addressMatch[1]);
          }
        }
      }
    }
  }

  // ===== VALIDATE RESULTS =====
  if (!result.record.name && !result.record.address && !result.record.cnic) {
    console.log('No data extracted from HTML');
    
    // Debug: Save first 2000 chars of HTML for inspection
    console.log('HTML sample:', html.substring(0, 2000));
    
    return {
      success: false,
      message: 'No valid data found in the response'
    };
  }

  // Final cleanup
  if (result.record.address) {
    result.record.address = result.record.address
      .replace(/^[,\s]+|[,\s]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  console.log('Extraction result:', result);
  return result;
}

// ========== HELPER FUNCTIONS ==========
function cleanName(name) {
  return name
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function formatAddress(address) {
  return address
    .replace(/\s+/g, ' ')
    .replace(/,/g, ', ')
    .trim()
    .split(' ')
    .map((word, index, arr) => {
      // Keep certain words in uppercase
      const upperWords = ['TEHSIL', 'ZILAH', 'POST', 'OFFICE', 'DISTRICT', 'BHAKKAR'];
      if (upperWords.includes(word.toUpperCase())) {
        return word.toUpperCase();
      }
      // Proper case for other words
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}