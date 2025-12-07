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

      const num = url.searchParams.get('num');

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

      const cleanedNum = num.toString().replace(/\D/g, '');
      
      let phoneNumber = cleanedNum;
      if (cleanedNum.startsWith('92') && cleanedNum.length === 12) {
        phoneNumber = '0' + cleanedNum.substring(2);
      } else if (cleanedNum.startsWith('3') && cleanedNum.length === 10) {
        phoneNumber = '0' + cleanedNum;
      }

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

      const data = await fetchTelenorData(phoneNumber);
      
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
    return await fetchFallbackData(phoneNumber);
  }
}

// ========== FALLBACK ==========
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
  // Check if no records
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      html.includes('Record Not Found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return {
      success: false,
      message: 'No record found'
    };
  }

  // Extract only the printdiv content which has the actual data
  const printDivMatch = html.match(/<div[^>]*id=["']?printdiv["']?[^>]*>([\s\S]*?)<\/div>/i);
  let contentHtml = html;
  
  if (printDivMatch && printDivMatch[1]) {
    contentHtml = printDivMatch[1];
  }

  // Clean HTML - remove scripts, styles, and unnecessary elements
  const cleanHtml = contentHtml
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/onclick=["'][^"']*["']/gi, '')
    .replace(/onload=["'][^"']*["']/gi, '')
    .replace(/javascript:[^"'\s]*/gi, '');

  // Convert to plain text but preserve line breaks
  const plainText = cleanHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .trim();

  // Split into lines
  const lines = plainText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

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

  // ===== EXTRACT DATA FROM LINES =====
  let nameFound = false;
  let addressLines = [];
  let collectingAddress = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip irrelevant lines
    if (line.includes('Click here for New Search') || 
        line.includes('Download as PNG') ||
        line.includes('Serial No') ||
        line.includes('MSISDN') ||
        line.includes('Certified that') ||
        line.includes('function') ||
        line.includes('document.') ||
        line.includes('window.') ||
        line.includes('var ') ||
        line.includes('getElementById')) {
      continue;
    }

    // Find name after "deducted/collected from"
    if (line.toLowerCase().includes('deducted/collected from') && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      if (nextLine && nextLine.length > 2 && !nextLine.includes('having')) {
        result.record.name = cleanName(nextLine);
        nameFound = true;
        i++; // Skip the name line
        
        // Start collecting address from next lines
        collectingAddress = true;
        continue;
      }
    }

    // If we're collecting address lines
    if (collectingAddress) {
      // Stop when we hit "having NTN" or similar
      if (line.toLowerCase().includes('having ntn') || 
          line.toLowerCase().includes('holder of cnic') ||
          line.includes('3310421645226') ||
          line.length < 3) {
        collectingAddress = false;
        
        // Check if CNIC is in this line
        const cnicMatch = line.match(/\d{13}/);
        if (cnicMatch) {
          result.record.cnic = cnicMatch[0];
        }
        break;
      }
      
      // Add to address if it looks like address text (not JavaScript)
      if (isAddressLine(line)) {
        addressLines.push(line);
      }
    }

    // Look for CNIC if not found yet
    if (!result.record.cnic) {
      const cnicMatch = line.match(/(\d{5}[-]?\d{7}[-]?\d{1})/);
      if (cnicMatch) {
        result.record.cnic = cnicMatch[1].replace(/\D/g, '');
      }
    }
  }

  // If name not found with the pattern, try alternative
  if (!nameFound) {
    // Look for uppercase name pattern
    for (const line of lines) {
      if (line.match(/^[A-Z][A-Z\s]{2,30}$/) && 
          !line.includes('ROAD') && 
          !line.includes('TOWN') && 
          !line.includes('DISTRICT') &&
          !line.includes('TEHSIL')) {
        result.record.name = cleanName(line);
        break;
      }
    }
  }

  // Process address lines
  if (addressLines.length > 0) {
    // Join address lines and clean
    let address = addressLines.join(' ');
    
    // Remove any remaining JavaScript or unwanted text
    address = address
      .replace(/function\s*\([^)]*\)\s*{[^}]*}/g, '')
      .replace(/document\.[a-zA-Z]+/g, '')
      .replace(/window\.[a-zA-Z]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Final cleanup
    const unwantedPatterns = [
      /togglePopup\(\)[^}]*}/,
      /html2canvas[^}]*}/,
      /addEventListener[^}]*}/,
      /setTimeout[^}]*}/,
      /getElementById[^)]*\)/,
      /createElement[^)]*\)/,
      /\.src\s*=[^;]*;/,
      /\.innerHTML\s*=[^;]*;/,
      /\.appendChild[^)]*\)/,
      /\.style\.[a-zA-Z]+\s*=[^;]*;/,
      /\.classList\.[a-zA-Z]+[^;]*;/,
      /\.download\s*=[^;]*;/,
      /\.href\s*=[^;]*;/,
      /\.click\(\)[^;]*;/,
      /\.then\([^)]*\)/,
      /var\s+\w+\s*=/,
      /CDN-CGI/,
      /challenge-platform/,
      /visibility:\s*['"]hidden['"]/,
      /position:\s*['"]absolute['"]/
    ];
    
    for (const pattern of unwantedPatterns) {
      address = address.replace(pattern, '');
    }
    
    result.record.address = address.trim();
  }

  // If still no CNIC, search the entire text
  if (!result.record.cnic) {
    const cnicRegex = /(\d{13})/;
    const cnicMatch = plainText.match(cnicRegex);
    if (cnicMatch) {
      result.record.cnic = cnicMatch[1];
    }
  }

  // Final validation
  if (!result.record.name && !result.record.cnic) {
    return {
      success: false,
      message: 'No valid data found'
    };
  }

  // Clean up
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
function cleanName(name) {
  return name
    .replace(/[^a-zA-Z\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isAddressLine(line) {
  // Check if line looks like address (not JavaScript)
  if (line.length < 5) return false;
  
  const jsKeywords = [
    'function', 'document', 'window', 'var ', 'let ', 'const ',
    'getElementById', 'addEventListener', 'setTimeout', 'createElement',
    'appendChild', 'classList', 'style.', 'innerHTML', 'then(',
    'href=', 'download=', 'click()', 'src=', 'onload', 'onclick'
  ];
  
  // If contains JavaScript keywords, it's not address
  for (const keyword of jsKeywords) {
    if (line.toLowerCase().includes(keyword)) {
      return false;
    }
  }
  
  // Check if looks like address (contains address-related words or uppercase)
  const addressIndicators = [
    'ROAD', 'STREET', 'AVENUE', 'LANE', 'TOWN', 'CITY', 'VILLAGE',
    'DISTRICT', 'TEHSIL', 'POST', 'OFFICE', 'MOHALLA', 'MOHALA',
    'AREA', 'SECTOR', 'BLOCK', 'COLONY'
  ];
  
  const upperLine = line.toUpperCase();
  for (const indicator of addressIndicators) {
    if (upperLine.includes(indicator)) {
      return true;
    }
  }
  
  // If line is mostly uppercase and reasonable length, it might be address
  const upperCount = (line.match(/[A-Z]/g) || []).length;
  const upperRatio = upperCount / line.length;
  
  return upperRatio > 0.6 && line.length > 10;
}

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