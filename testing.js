// Telenor Sim Owner Details API - Updated for onlinesimdatabase.xyz
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
      const data = await fetchSimData(phoneNumber);
      
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

// ========== FETCH FROM ONLINESIMDATABASE.XYZ ==========
async function fetchSimData(phoneNumber) {
  try {
    const searchUrl = 'https://onlinesimdatabase.xyz/numberDetails.php';
    
    const formData = new URLSearchParams();
    formData.append('searchBtn', 'search');
    formData.append('number', phoneNumber);

    console.log('Fetching data for:', phoneNumber);
    console.log('URL:', searchUrl);
    
    const response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 14; TECNO KL4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Mobile Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': '42',
        'Origin': 'https://onlinesimdatabase.xyz',
        'Referer': 'https://onlinesimdatabase.xyz/',
        'Cache-Control': 'max-age=0',
        'Sec-Ch-Ua': '"Chromium";v="107", "Not=A?Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'Cookie': '_gcl_au=1.1.182421044.1767304236; _ga=GA1.1.1265403733.1767304236; _ga_PH5F8HXB13=GS2.1.1767304236.1.1.1767304252.0.0.0'
      },
      body: formData.toString()
    });

    const html = await response.text();
    console.log('Response received, length:', html.length);
    
    if (html.length < 100) {
      console.log('Response too short, might be blocked');
      return {
        success: false,
        message: 'Empty response from server'
      };
    }
    
    // Check for Cloudflare protection
    if (html.includes('cloudflare') || html.includes('cf-browser-verification') || html.includes('Please wait')) {
      console.log('Cloudflare protection detected');
      return {
        success: false,
        message: 'Website is protected by Cloudflare. Please try again later.'
      };
    }
    
    return extractSimData(html, phoneNumber);
    
  } catch (error) {
    console.error('Fetch error:', error);
    return {
      success: false,
      message: `Failed to fetch data: ${error.message}`
    };
  }
}

// ========== EXTRACT DATA FROM ONLINESIMDATABASE ==========
function extractSimData(html, phoneNumber) {
  console.log('Extracting data from HTML...');
  
  // Check if no records found
  const lowerHtml = html.toLowerCase();
  if (lowerHtml.includes('no record found') || 
      lowerHtml.includes('data not found') ||
      lowerHtml.includes('try another') ||
      lowerHtml.includes('invalid number') ||
      lowerHtml.includes('not available') ||
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

  // ===== FIRST TRY: EXTRACT FROM TABLE/CARD =====
  // Look for specific patterns based on screenshot
  
  // Clean HTML for better parsing
  let cleanHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  cleanHtml = cleanHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  cleanHtml = cleanHtml.replace(/<!--[\s\S]*?-->/g, '');
  
  // Try to find the main data container
  const containerPatterns = [
    /<div[^>]*class\s*=\s*["'][^"']*card[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class\s*=\s*["'][^"']*container[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<div[^>]*class\s*=\s*["'][^"']*result[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    /<table[^>]*>([\s\S]*?)<\/table>/i
  ];
  
  let mainContent = '';
  for (const pattern of containerPatterns) {
    const match = cleanHtml.match(pattern);
    if (match && match[1] && match[1].length > 100) {
      mainContent = match[1];
      console.log('Found main content, length:', mainContent.length);
      break;
    }
  }
  
  // If no container found, use entire HTML
  if (!mainContent) {
    mainContent = cleanHtml;
  }
  
  // Convert to text
  const textContent = mainContent
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log('Text content length:', textContent.length);
  
  const upperText = textContent.toUpperCase();
  
  // ===== EXTRACT MSISDN =====
  const msisdnMatch = upperText.match(/MSISDN\s*[:]?\s*(\d{10})/i);
  if (msisdnMatch && msisdnMatch[1]) {
    result.record.mobile = '0' + msisdnMatch[1];
    console.log('Found MSISDN:', result.record.mobile);
  }
  
  // ===== EXTRACT SERIAL NO =====
  const serialMatch = upperText.match(/SERIAL NO\s*[:]?\s*(\d+)/i);
  if (serialMatch) {
    console.log('Serial No:', serialMatch[1]);
  }
  
  // ===== EXTRACT NAME =====
  // Look for patterns like in screenshot
  const namePatterns = [
    /FROM\s+([A-Z][A-Z\s]{2,50}?)(?=\s+(?:LACHMAN|POST|TEHSIL|ZILAH|HAVING|CNIC|$))/i,
    /DEDUCTED\/COLLECTED FROM\s+([A-Z][A-Z\s]{2,50}?)(?=\s+(?:LACHMAN|POST|TEHSIL|ZILAH|$))/i,
    /HAS BEEN[\s\S]+?FROM\s+([A-Z][A-Z\s]{2,50})/i,
    /CERTIFIED THAT[\s\S]+?FROM\s+([A-Z][A-Z\s]{2,50})/i
  ];
  
  for (const pattern of namePatterns) {
    const match = upperText.match(pattern);
    if (match && match[1]) {
      let name = match[1].trim();
      if (name.length > 2 && 
          !name.includes('DEDUCTED') && 
          !name.includes('COLLECTED') &&
          !name.includes('CERTIFIED') &&
          !name.includes('ACCOUNT')) {
        result.record.name = formatName(name);
        console.log('Found name:', result.record.name);
        break;
      }
    }
  }
  
  // ===== EXTRACT ADDRESS =====
  // Based on screenshot pattern: address spans multiple lines
  if (result.record.name) {
    const nameUpper = result.record.name.toUpperCase();
    const nameIndex = upperText.indexOf(nameUpper);
    
    if (nameIndex !== -1) {
      const afterName = upperText.substring(nameIndex + nameUpper.length);
      
      // Address patterns from screenshot
      const addressPatterns = [
        /([A-Z][A-Z\s,.-]+POST OFFICE[\s\S]+?TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+)/i,
        /(LACHMAN WALA[\s\S]+?BHAKKAR)/i,
        /([A-Z][A-Z\s,.-]+TEHSIL[\s\S]+?ZILAH[\s\S]+?[A-Z]+)/i,
        /(POST OFFICE[\s\S]+?TEHSIL[\s\S]+?DISTRICT)/i
      ];
      
      for (const pattern of addressPatterns) {
        const match = afterName.match(pattern);
        if (match && match[0]) {
          let address = match[0].trim();
          
          // Clean address
          address = address.replace(/\s+/g, ' ');
          address = address.replace(/\.{2,}/g, ' ');
          address = address.replace(/[^\w\s,.-]/g, ' ');
          
          if (address.length > 20) {
            result.record.address = formatAddress(address);
            console.log('Found address:', result.record.address);
            break;
          }
        }
      }
    }
  }
  
  // Alternative: Look for specific address line patterns
  if (!result.record.address) {
    const lines = textContent.split(/\n|\r/).map(line => line.trim()).filter(line => line.length > 5);
    
    // Look for address-like lines (longer text, contains location words)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toUpperCase();
      if ((line.includes('POST') && line.includes('OFFICE')) ||
          (line.includes('TEHSIL') && line.includes('ZILAH')) ||
          (line.includes('DISTRICT') && line.length > 30)) {
        
        // Combine with next lines if they look like address continuation
        let fullAddress = lines[i];
        for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
          const nextLine = lines[j].toUpperCase();
          if (nextLine.length > 10 && 
              !nextLine.includes('CNIC') && 
              !nextLine.includes('NTN') &&
              !nextLine.includes('HAVING')) {
            fullAddress += ' ' + lines[j];
          }
        }
        
        if (fullAddress.length > 25) {
          result.record.address = formatAddress(fullAddress);
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
  
  // ===== EXTRACT NTN =====
  const ntnMatch = upperText.match(/NTN\s*(?:NUMBER)?\s*[:]?\s*(\d+)/i);
  if (ntnMatch) {
    console.log('NTN found:', ntnMatch[1]);
  }
  
  // ===== SECOND TRY: PARSE SPECIFIC HTML STRUCTURE =====
  if (!result.record.name || !result.record.address) {
    console.log('Trying alternative parsing method...');
    
    // Look for specific divs or spans with data
    const dataPatterns = [
      /<b[^>]*>Name[^<]*<\/b>\s*[:\-]?\s*([^<]+)/i,
      /<span[^>]*>Name[^<]*<\/span>\s*[:\-]?\s*([^<]+)/i,
      /<td[^>]*>Name[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
      /<div[^>]*>[^<]*Name[^<]*[:\-][^<]*([^<]+)<\/div>/i
    ];
    
    for (const pattern of dataPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim();
        if (value.length > 2 && !result.record.name) {
          result.record.name = formatName(value);
          break;
        }
      }
    }
    
    // Look for address in HTML
    const addressHtmlPatterns = [
      /<b[^>]*>Address[^<]*<\/b>\s*[:\-]?\s*([^<]+)/i,
      /<span[^>]*>Address[^<]*<\/span>\s*[:\-]?\s*([^<]+)/i,
      /<td[^>]*>Address[^<]*<\/td>\s*<td[^>]*>([^<]+)<\/td>/i,
      /<div[^>]*class\s*=\s*["'][^"']*address[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
    ];
    
    for (const pattern of addressHtmlPatterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        const value = match[1].trim()
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        
        if (value.length > 10 && !result.record.address) {
          result.record.address = formatAddress(value);
          break;
        }
      }
    }
  }
  
  // ===== VALIDATE RESULTS =====
  const hasData = result.record.name || result.record.address || result.record.cnic;
  
  if (!hasData) {
    console.log('No data extracted from HTML');
    
    // Save first 500 chars for debugging
    console.log('HTML sample (first 500 chars):', html.substring(0, 500));
    
    return {
      success: false,
      message: 'No valid data found in the response'
    };
  }
  
  console.log('Extraction successful:', {
    name: result.record.name,
    address: result.record.address,
    cnic: result.record.cnic
  });
  
  return result;
}

// ========== HELPER FUNCTIONS ==========
function formatName(name) {
  return name
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map(word => {
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ');
}

function formatAddress(address) {
  return address
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s,.-]/g, ' ')
    .trim()
    .split(' ')
    .map((word, index, arr) => {
      // Keep certain words in uppercase
      const upperWords = [
        'TEHSIL', 'ZILAH', 'POST', 'OFFICE', 'DISTRICT', 
        'BHAKKAR', 'LACHMAN', 'WALA', 'ZAMEWALA', 
        'GHULAMAN', 'KALOR', 'KOT'
      ];
      
      const upperWord = word.toUpperCase();
      if (upperWords.includes(upperWord)) {
        return upperWord;
      }
      
      // Proper case for other words
      if (word.length > 0) {
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      }
      return word;
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}