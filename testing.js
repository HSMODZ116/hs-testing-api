// Telenor Sim Owner Details API
// Optimized for Telenor Pakistan

export default {
  async fetch(request) {
    try {
      // Handle CORS preflight
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
      const phone = url.searchParams.get('phone') || url.searchParams.get('num') || url.searchParams.get('number');

      if (!phone) {
        return Response.json({
          success: false,
          error: 'Phone number is required',
          message: 'Use Telenor mobile number starting with 034'
        }, {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Clean and validate phone number
      let cleanedPhone = phone.toString().replace(/\D/g, '');
      
      // Convert to 11-digit format
      if (cleanedPhone.startsWith('92') && cleanedPhone.length === 12) {
        cleanedPhone = '0' + cleanedPhone.substring(2);
      } else if (cleanedPhone.startsWith('3') && cleanedPhone.length === 10) {
        cleanedPhone = '0' + cleanedPhone;
      }

      // Validate Telenor number
      if (!/^03[4-7]\d{8}$/.test(cleanedPhone)) {
        return Response.json({
          success: false,
          error: 'Invalid Telenor number',
          message: 'Use Telenor numbers starting with 0344, 0345, 0346, or 0347'
        }, {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }

      // Fetch Telenor data
      const telenorData = await fetchTelenorData(cleanedPhone);
      
      return Response.json({
        success: telenorData.success,
        phone: cleanedPhone,
        data: telenorData.data || null,
        message: telenorData.message
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        }
      });

    } catch (error) {
      console.error('API Error:', error);
      return Response.json({
        success: false,
        error: 'Server error',
        message: error.message
      }, {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};

// ========== FETCH TELENOR DATA ==========
async function fetchTelenorData(phoneNumber) {
  const POST_URL = "https://freshsimdata.net/numberDetails.php";
  
  // Prepare payload
  const payload = new URLSearchParams();
  payload.append('numberCnic', phoneNumber);
  payload.append('searchNumber', 'search');

  try {
    const response = await fetch(POST_URL, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://freshsimdata.net",
        "Referer": "https://freshsimdata.net/",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache"
      },
      body: payload.toString(),
      cf: {
        cacheEverything: false,
        cacheTtl: 0
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    return parseTelenorCertificate(html, phoneNumber);
    
  } catch (error) {
    console.error('Fetch error:', error);
    return {
      success: false,
      message: 'Failed to fetch data from Telenor database',
      error: error.message
    };
  }
}

// ========== PARSE TELENOR CERTIFICATE ==========
function parseTelenorCertificate(html, phoneNumber) {
  // Check if no data found
  if (html.includes('No record found') || 
      html.includes('not found') ||
      html.includes('Sorry, no results') ||
      html.toLowerCase().includes('invalid number')) {
    return {
      success: false,
      data: null,
      message: 'No Telenor record found for this number'
    };
  }

  // Initialize result object
  const result = {
    success: true,
    data: {
      mobile: phoneNumber,
      name: null,
      cnic: null,
      address: null,
      network: 'Telenor',
      developer: 'Haseeb Sahil'
    },
    message: 'Data retrieved successfully'
  };

  // ===== CLEAN HTML =====
  // Remove scripts, styles, and unnecessary tags
  let cleanHtml = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<!--.*?-->/gs, '')
    .replace(/<a\b[^>]*>.*?<\/a>/gi, '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<button\b[^>]*>.*?<\/button>/gi, '')
    .replace(/<form\b[^>]*>.*?<\/form>/gi, '')
    .replace(/<input\b[^>]*>/gi, '');

  // ===== EXTRACT DATA USING SPECIFIC PATTERNS =====
  
  // Pattern 1: Extract from table format
  const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let tableMatch;
  let hasTableData = false;
  
  while ((tableMatch = tableRowRegex.exec(cleanHtml))) {
    const row = tableMatch[1];
    const cells = row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi);
    
    if (cells && cells.length >= 3) {
      const rowData = cells.map(cell => {
        return cell.replace(/<[^>]+>/g, '')
                   .replace(/&nbsp;/g, ' ')
                   .trim();
      });
      
      // Check if this row contains valid data (not headers)
      if (rowData[0] && rowData[0].match(/\d/) && rowData[1]) {
        hasTableData = true;
        
        if (rowData[0].includes(phoneNumber) || rowData[0].replace(/\D/g, '').includes(phoneNumber.replace('0', ''))) {
          result.data.name = rowData[1] || null;
          result.data.cnic = rowData[2] || null;
          result.data.address = rowData[3] || null;
          break;
        }
      }
    }
  }
  
  // Pattern 2: Extract from certificate format (if no table data found)
  if (!hasTableData) {
    // Clean HTML for text extraction
    const textContent = cleanHtml
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    
    // Look for Telenor certificate pattern
    const lines = textContent.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Look for "Certified that" followed by name
      if (line.includes('Certified that') && i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        // Next line should be the name
        if (nextLine && nextLine.length > 3 && !nextLine.match(/^\d/)) {
          result.data.name = cleanText(nextLine);
        }
      }
      
      // Look for MSISDN/phone number
      if (line.includes('MSISDN') || line.includes('030') || line.includes('031') || line.includes('032') || line.includes('033') || line.includes('034')) {
        const phoneMatch = line.match(/(03\d{9}|92\d{10}|\d{11})/);
        if (phoneMatch) {
          const foundPhone = phoneMatch[0];
          if (foundPhone.includes(phoneNumber.replace('0', '')) || foundPhone.includes(phoneNumber)) {
            // This is our number
          }
        }
      }
      
      // Look for CNIC
      if (!result.data.cnic && (line.includes('CNIC') || line.includes('38103') || line.match(/\d{5}[\-\s]?\d{7}[\-\s]?\d/))) {
        const cnicMatch = line.match(/(\d{5}[\-\s]?\d{7}[\-\s]?\d)/);
        if (cnicMatch) {
          result.data.cnic = cnicMatch[0].replace(/\D/g, '');
        }
      }
      
      // Look for address pattern
      if (!result.data.address && (line.includes('POST OFFICE') || line.includes('TEHSIL') || line.includes('ZILAH') || line.includes('DISTRICT') || line.includes('ADDRESS'))) {
        // Collect address lines
        let addressLines = [line];
        for (let j = 1; j <= 3; j++) {
          if (i + j < lines.length) {
            const nextLine = lines[i + j];
            if (nextLine && !nextLine.includes('CNIC') && !nextLine.includes('NTN') && !nextLine.includes('MSISDN')) {
              addressLines.push(nextLine);
            } else {
              break;
            }
          }
        }
        result.data.address = cleanText(addressLines.join(' '));
      }
    }
    
    // Pattern 3: Direct regex extraction
    if (!result.data.name) {
      // Look for name after "Certified that"
      const nameRegex = /Certified that[^\n]*\n\s*([^\n<]+)/i;
      const nameMatch = textContent.match(nameRegex);
      if (nameMatch && nameMatch[1]) {
        result.data.name = cleanText(nameMatch[1]);
      }
    }
    
    if (!result.data.cnic) {
      // Look for 13-digit CNIC
      const cnicRegex = /38103[\-\s]?60039127|(\d{13})/;
      const cnicMatch = textContent.match(cnicRegex);
      if (cnicMatch) {
        result.data.cnic = (cnicMatch[1] || cnicMatch[0]).replace(/\D/g, '');
      }
    }
    
    if (!result.data.address) {
      // Look for address between name and CNIC
      if (result.data.name) {
        const nameIndex = textContent.indexOf(result.data.name);
        if (nameIndex !== -1) {
          const afterName = textContent.substring(nameIndex + result.data.name.length);
          const cnicIndex = afterName.search(/(CNIC|38103|\d{13})/);
          
          if (cnicIndex !== -1) {
            const addressText = afterName.substring(0, cnicIndex)
              .replace(/Certified that/gi, '')
              .replace(/has been/gi, '')
              .replace(/deducted/gi, '')
              .replace(/collected/gi, '')
              .trim();
            
            if (addressText.length > 10) {
              result.data.address = cleanText(addressText);
            }
          }
        }
      }
    }
  }
  
  // ===== FINAL VALIDATION AND CLEANUP =====
  
  // Clean and format data
  if (result.data.name) {
    result.data.name = cleanText(result.data.name)
      .replace(/^[^A-Za-z]+/, '')
      .replace(/[^A-Za-z\s\.\-]+$/, '')
      .trim()
      .toUpperCase();
  }
  
  if (result.data.address) {
    result.data.address = cleanText(result.data.address)
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }
  
  if (result.data.cnic) {
    result.data.cnic = result.data.cnic.replace(/\D/g, '');
  }
  
  // Check if we have valid data
  const hasValidData = result.data.name && result.data.name.length > 3;
  
  if (!hasValidData) {
    return {
      success: false,
      data: null,
      message: 'No valid Telenor data found in the response'
    };
  }
  
  return result;
}

// ========== HELPER FUNCTIONS ==========
function cleanText(text) {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}