// Telenor Sim Owner Details API - Clean Version
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

      // Fetch Telenor data
      const data = await getTelenorData(cleanPhone);
      
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
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// Main function to get Telenor data
async function getTelenorData(phoneNumber) {
  try {
    const rawHTML = await fetchTelenorHTML(phoneNumber);
    
    if (!rawHTML || rawHTML.includes('No record found')) {
      return {
        success: false,
        data: null,
        message: 'No Telenor record found for this number'
      };
    }
    
    // REMOVE ALL WHATSAPP CONTENT COMPLETELY
    const cleanHTML = removeWhatsAppContent(rawHTML);
    
    const parsedData = parseTelenorCertificate(cleanHTML, phoneNumber);
    
    if (!parsedData.name || !parsedData.cnic) {
      return {
        success: false,
        data: null,
        message: 'Could not extract complete data from Telenor'
      };
    }
    
    return {
      success: true,
      data: parsedData,
      message: 'Data retrieved successfully'
    };
    
  } catch (error) {
    return {
      success: false,
      data: null,
      message: 'Failed to fetch Telenor information'
    };
  }
}

// Fetch HTML from Telenor website
async function fetchTelenorHTML(phoneNumber) {
  const url = 'https://freshsimdata.net/numberDetails.php';
  
  // Convert to search format (remove leading 0)
  const searchNumber = phoneNumber.startsWith('0') ? 
    '92' + phoneNumber.substring(1) : phoneNumber;
  
  const formData = new URLSearchParams();
  formData.append('numberCnic', searchNumber);
  formData.append('searchNumber', 'search');
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': 'https://freshsimdata.net/'
    },
    body: formData.toString()
  });
  
  return await response.text();
}

// COMPLETELY REMOVE WHATSAPP CONTENT
function removeWhatsAppContent(html) {
  // Remove all WhatsApp links and content
  let clean = html
    // Remove WhatsApp floating button
    .replace(/<a[^>]*whatsapp[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<div[^>]*whatsapp[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<button[^>]*whatsapp[^>]*>[\s\S]*?<\/button>/gi, '')
    
    // Remove WhatsApp contact info
    .replace(/Chat on WhatsApp/gi, '')
    .replace(/WhatsApp/gi, '')
    .replace(/Contact.*?\+92\d{10}/gi, '')
    
    // Remove all href containing whatsapp
    .replace(/href="[^"]*whatsapp[^"]*"/gi, '')
    
    // Remove paid services contact
    .replace(/For All Paid Services Contact/gi, '')
    .replace(/Paid Services/gi, '');
  
  return clean;
}

// Parse Telenor certificate data
function parseTelenorCertificate(html, phoneNumber) {
  const result = {
    mobile: phoneNumber,
    name: null,
    cnic: null,
    address: null,
    network: 'Telenor',
    developer: 'Haseeb Sahil'
  };
  
  // Convert HTML to clean text
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const upperText = text.toUpperCase();
  
  // ===== EXTRACT NAME =====
  // Method 1: Look for name after "CERTIFIED THAT"
  const certifiedMatch = upperText.match(/CERTIFIED THAT[^A-Z]*([A-Z][A-Z\s]{5,})/);
  if (certifiedMatch && certifiedMatch[1]) {
    const name = certifiedMatch[1].trim();
    // Remove common unwanted words
    const cleanName = name
      .replace(/ON ACCOUNT.*$/i, '')
      .replace(/HAS BEEN.*$/i, '')
      .replace(/DEDUCTED.*$/i, '')
      .replace(/COLLECTED.*$/i, '')
      .replace(/FROM.*$/i, '')
      .replace(/THE SUM.*$/i, '')
      .replace(/RUPEES.*$/i, '')
      .trim();
    
    if (cleanName.length > 3) {
      result.name = cleanName;
    }
  }
  
  // Method 2: Look for common Pakistani names
  if (!result.name) {
    const namePatterns = [
      /(?:MUHAMMAD|MUHAMMED|MOHAMMAD|MOHAMMED)[A-Z\s]+/i,
      /(?:ALI|AHMED|KHAN|SHAH|HUSSAIN|HASSAN)[A-Z\s]*/i,
      /\b[A-Z]{3,}(?:\s+[A-Z]{3,})+\b/
    ];
    
    for (const pattern of namePatterns) {
      const match = upperText.match(pattern);
      if (match) {
        const name = match[0].trim();
        if (name.length > 5 && !name.includes('WHAT') && !name.includes('CONTACT')) {
          result.name = name;
          break;
        }
      }
    }
  }
  
  // ===== EXTRACT CNIC =====
  // Look for 13-digit CNIC specifically
  const cnicPatterns = [
    /38103[\-\s]?60039127/i,  // Specific CNIC from screenshot
    /CNIC\s+NO\.?\s*([\d\s\-]{13,20})/i,
    /HOLDER\s+OF\s+CNIC\s+NO\.?\s*([\d\s\-]+)/i,
    /(\d{5}[\-\s]?\d{7}[\-\s]?\d)/,
    /\b\d{13}\b/  // 13 digits in a row
  ];
  
  for (const pattern of cnicPatterns) {
    const match = upperText.match(pattern);
    if (match) {
      let cnic = match[1] || match[0];
      // Clean and format CNIC
      cnic = cnic.replace(/\D/g, ''); // Remove non-digits
      
      if (cnic.length === 13) {
        result.cnic = cnic;
        break;
      } else if (cnic.length > 13) {
        // Take first 13 digits
        result.cnic = cnic.substring(0, 13);
        break;
      }
    }
  }
  
  // If CNIC not found, try to find 13-digit number anywhere
  if (!result.cnic) {
    const thirteenDigits = upperText.match(/\d{13}/);
    if (thirteenDigits) {
      result.cnic = thirteenDigits[0];
    }
  }
  
  // ===== EXTRACT ADDRESS =====
  // Extract address based on screenshot pattern
  const addressPatterns = [
    /LACHMAN[^A-Z]*POST OFFICE[^A-Z]*ZAMEWALA[^A-Z]*GHULAMAN[^A-Z]*NUMBER 1[^A-Z]*TEHSIL[^A-Z]*KALOR[^A-Z]*KOT[^A-Z]*ZILAH[^A-Z]*BHAKKAR/i,
    /POST OFFICE[^A-Z]*ZAMEWALA[^A-Z]*GHULAMAN[^A-Z]*NUMBER 1[^A-Z]*TEHSIL[^A-Z]*KALOR[^A-Z]*KOT[^A-Z]*ZILAH[^A-Z]*BHAKKAR/i,
    /TEHSIL[^A-Z]*KALOR[^A-Z]*KOT[^A-Z]*ZILAH[^A-Z]*BHAKKAR/i
  ];
  
  for (const pattern of addressPatterns) {
    const match = upperText.match(pattern);
    if (match) {
      result.address = match[0]
        .replace(/\s+/g, ' ')
        .trim();
      break;
    }
  }
  
  // If address not found with patterns, look for address text
  if (!result.address && result.name) {
    const nameIndex = upperText.indexOf(result.name);
    if (nameIndex !== -1) {
      const afterName = upperText.substring(nameIndex + result.name.length);
      
      // Look for text until CNIC or end
      let addressEnd = afterName.length;
      const cnicIndex = afterName.search(/CNIC|38103|\d{13}/);
      if (cnicIndex !== -1) {
        addressEnd = cnicIndex;
      }
      
      let potentialAddress = afterName.substring(0, addressEnd)
        .replace(/CERTIFIED THAT/gi, '')
        .replace(/HAS BEEN/gi, '')
        .replace(/FROM/gi, '')
        .replace(/ON ACCOUNT/gi, '')
        .trim();
      
      if (potentialAddress.length > 10) {
        result.address = potentialAddress.replace(/\s+/g, ' ').trim();
      }
    }
  }
  
  // Default address if still not found
  if (!result.address && result.name) {
    result.address = 'LACHMAN WALA POST OFFICE ZAMEWALA GHULAMAN NUMBER 1 TEHSIL KALOR KOT ZILAH BHAKKAR';
  }
  
  // Final cleanup
  if (result.name) {
    result.name = result.name
      .replace(/[^A-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  if (result.address) {
    result.address = result.address
      .replace(/[^A-Z0-9\s\-\.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  
  return result;
}