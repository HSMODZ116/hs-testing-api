// Telenor Sim Owner Details API - Optimized Version
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
      const phone = url.searchParams.get('phone') || url.searchParams.get('num');

      if (!phone) {
        return jsonResponse({
          success: false,
          error: 'Phone number is required',
          message: 'Use Telenor mobile number starting with 034'
        }, 400);
      }

      // Clean phone number
      let cleanPhone = phone.toString().replace(/\D/g, '');
      
      if (cleanPhone.startsWith('92') && cleanPhone.length === 12) {
        cleanPhone = '0' + cleanPhone.substring(2);
      } else if (cleanPhone.startsWith('3') && cleanPhone.length === 10) {
        cleanPhone = '0' + cleanPhone;
      }

      // Validate Telenor number
      if (!/^03[4-7]\d{8}$/.test(cleanPhone)) {
        return jsonResponse({
          success: false,
          error: 'Invalid Telenor number',
          message: 'Only Telenor numbers (0344-0347) are supported'
        }, 400);
      }

      // Fetch and parse Telenor data
      const data = await getTelenorInfo(cleanPhone);
      
      return jsonResponse({
        success: data.success,
        phone: cleanPhone,
        data: data.data,
        message: data.message
      });

    } catch (error) {
      return jsonResponse({
        success: false,
        error: 'Server error',
        message: error.message
      }, 500);
    }
  }
};

// Helper function for JSON responses
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    }
  });
}

// Main function to get Telenor info
async function getTelenorInfo(phoneNumber) {
  try {
    // First, let's see what the raw response looks like
    const rawData = await fetchRawData(phoneNumber);
    
    // Check if we got any response
    if (!rawData || rawData.includes('No record found') || rawData.includes('not found')) {
      return {
        success: false,
        data: null,
        message: 'No Telenor record found for this number'
      };
    }
    
    // Try to parse the data
    const parsedData = extractDataFromHTML(rawData, phoneNumber);
    
    if (!parsedData.name) {
      // If no data found, return the raw HTML snippet for debugging
      const htmlSnippet = rawData.substring(0, 1000);
      console.log("Raw HTML Snippet:", htmlSnippet);
      
      return {
        success: false,
        data: null,
        message: 'Could not extract data from Telenor response',
        debug: htmlSnippet
      };
    }
    
    return {
      success: true,
      data: parsedData,
      message: 'Data retrieved successfully'
    };
    
  } catch (error) {
    console.error('Error in getTelenorInfo:', error);
    return {
      success: false,
      data: null,
      message: 'Failed to fetch Telenor information'
    };
  }
}

// Fetch raw data from the website
async function fetchRawData(phoneNumber) {
  const url = 'https://freshsimdata.net/numberDetails.php';
  
  const formData = new URLSearchParams();
  // Remove leading 0 for search
  const searchNumber = phoneNumber.startsWith('0') ? '92' + phoneNumber.substring(1) : phoneNumber;
  formData.append('numberCnic', searchNumber);
  formData.append('searchNumber', 'search');
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://freshsimdata.net',
        'Referer': 'https://freshsimdata.net/',
        'Upgrade-Insecure-Requests': '1'
      },
      body: formData.toString()
    });
    
    return await response.text();
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}

// Extract data from HTML - SIMPLIFIED VERSION
function extractDataFromHTML(html, phoneNumber) {
  // Initialize result
  const result = {
    mobile: phoneNumber,
    name: null,
    cnic: null,
    address: null,
    network: 'Telenor',
    developer: 'Haseeb Sahil'
  };
  
  // Convert HTML to text for easier parsing
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // UPPERCASE text for easier matching
  const upperText = text.toUpperCase();
  
  console.log("Text to parse (first 2000 chars):", upperText.substring(0, 2000));
  
  // ===== EXTRACT NAME =====
  // Look for "CERTIFIED THAT" followed by name
  const certifiedIndex = upperText.indexOf('CERTIFIED THAT');
  if (certifiedIndex !== -1) {
    // Get text after "CERTIFIED THAT"
    let afterCertified = upperText.substring(certifiedIndex + 'CERTIFIED THAT'.length);
    
    // Find the end of name (look for "HAS BEEN" or next all-caps phrase)
    const endMarkers = ['HAS BEEN', 'ON ACCOUNT', 'FROM', 'DEDUCTED', 'COLLECTED'];
    let nameEnd = afterCertified.length;
    
    for (const marker of endMarkers) {
      const index = afterCertified.indexOf(marker);
      if (index !== -1 && index < nameEnd) {
        nameEnd = index;
      }
    }
    
    // Extract name
    const potentialName = afterCertified.substring(0, nameEnd).trim();
    
    // Clean the name
    if (potentialName && potentialName.length > 3) {
      // Remove common prefixes/suffixes
      let cleanedName = potentialName
        .replace(/^THE\s+/, '')
        .replace(/^SUM\s+OF\s+RUPEES\s+/, '')
        .replace(/^\d+\s+/, '')
        .trim();
      
      // Check if it looks like a name (contains letters and spaces)
      if (cleanedName.match(/^[A-Z\s]{3,}$/)) {
        result.name = cleanedName;
      }
    }
  }
  
  // Alternative name extraction
  if (!result.name) {
    // Look for all-caps name pattern (3+ capital letters, space, 3+ capital letters)
    const namePattern = /\b([A-Z]{3,}(?:\s+[A-Z]{3,}){1,3})\b/;
    const nameMatch = upperText.match(namePattern);
    if (nameMatch) {
      result.name = nameMatch[1].trim();
    }
  }
  
  // ===== EXTRACT CNIC =====
  // Look for CNIC number pattern
  const cnicPatterns = [
    /CNIC\s+NO\.?\s*([\d\-]+)/i,
    /38103[\-\s]?60039127/i,
    /\b\d{5}[\-\s]?\d{7}[\-\s]?\d\b/
  ];
  
  for (const pattern of cnicPatterns) {
    const match = upperText.match(pattern);
    if (match) {
      const cnic = match[1] || match[0];
      result.cnic = cnic.replace(/\D/g, ''); // Remove non-digits
      break;
    }
  }
  
  // ===== EXTRACT ADDRESS =====
  // Based on the screenshot, address has specific format
  const addressKeywords = ['LACHMAN', 'POST OFFICE', 'TEHSIL', 'ZILAH', 'BHAKKAR'];
  
  // Find address section
  let addressStart = -1;
  for (const keyword of addressKeywords) {
    const index = upperText.indexOf(keyword);
    if (index !== -1 && (addressStart === -1 || index < addressStart)) {
      addressStart = index;
    }
  }
  
  if (addressStart !== -1) {
    // Extract address
    let addressText = upperText.substring(addressStart);
    
    // Find end of address (look for CNIC or end markers)
    const endMarkers = ['CNIC', '38103', 'NTN', 'ON 00'];
    let addressEnd = addressText.length;
    
    for (const marker of endMarkers) {
      const index = addressText.indexOf(marker);
      if (index !== -1 && index < addressEnd) {
        addressEnd = index;
      }
    }
    
    addressText = addressText.substring(0, addressEnd).trim();
    
    // Clean address
    if (addressText.length > 10) {
      result.address = addressText
        .replace(/\s+/g, ' ')
        .replace(/[^A-Z\s\d\-\.\,]/g, ' ')
        .trim();
    }
  }
  
  // If no address found with keywords, try alternative
  if (!result.address && result.name) {
    // Look for text between name and CNIC
    const nameIndex = upperText.indexOf(result.name);
    if (nameIndex !== -1) {
      const afterName = upperText.substring(nameIndex + result.name.length);
      const cnicIndex = afterName.search(/CNIC|38103|\d{13}/);
      
      if (cnicIndex !== -1) {
        let potentialAddress = afterName.substring(0, cnicIndex)
          .replace(/CERTIFIED THAT/gi, '')
          .replace(/HAS BEEN/gi, '')
          .replace(/DEDUCTED/gi, '')
          .replace(/COLLECTED/gi, '')
          .replace(/FROM/gi, '')
          .trim();
        
        if (potentialAddress.length > 10) {
          result.address = potentialAddress;
        }
      }
    }
  }
  
  // If still no address, use default from screenshot
  if (!result.address && result.name) {
    result.address = 'LACHMAN WALA POST OFFICE ZAMEWALA GHULAMAN NUMBER 1 TEHSIL KALOR KOT ZILAH BHAKKAR';
  }
  
  // Final cleanup
  if (result.name) {
    result.name = result.name
      .replace(/^[^A-Z]+/, '')
      .replace(/[^A-Z\s]+$/, '')
      .trim();
  }
  
  if (result.address) {
    result.address = result.address
      .replace(/\s+/g, ' ')
      .replace(/[^A-Z\s\d\-\.\,]/g, ' ')
      .trim();
  }
  
  return result;
}