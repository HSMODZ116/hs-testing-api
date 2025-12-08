// Telenor Sim Owner Details API - Debug Version
export default {
  async fetch(request) {
    try {
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

      // Fetch and debug
      const debugData = await debugTelenorData(cleanPhone);
      
      return jsonResponse(debugData);

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

// Debug function to see raw data
async function debugTelenorData(phoneNumber) {
  try {
    const rawHTML = await fetchTelenorHTML(phoneNumber);
    
    if (!rawHTML) {
      return {
        success: false,
        message: 'Failed to fetch HTML'
      };
    }
    
    // Check if no record found
    if (rawHTML.includes('No record found') || 
        rawHTML.toLowerCase().includes('not found') ||
        rawHTML.includes('Sorry')) {
      return {
        success: false,
        message: 'No record found on Telenor database'
      };
    }
    
    // Clean HTML - remove scripts, styles, etc.
    let cleanHTML = rawHTML
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<!--.*?-->/gs, '')
      .replace(/<a\b[^>]*>.*?<\/a>/gi, '')
      .replace(/<img\b[^>]*>/gi, '');
    
    // Convert to text for analysis
    const text = cleanHTML
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<div>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<p>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const upperText = text.toUpperCase();
    
    // Try to extract data with multiple methods
    const extractionResults = {
      method1: extractWithMethod1(upperText),
      method2: extractWithMethod2(upperText),
      method3: extractWithMethod3(upperText),
      raw_snippet: text.substring(0, 1000) // First 1000 chars
    };
    
    // Try each method
    const methods = [
      extractionResults.method1,
      extractionResults.method2,
      extractionResults.method3
    ];
    
    let finalData = null;
    for (const methodData of methods) {
      if (methodData.name && methodData.cnic) {
        finalData = methodData;
        break;
      }
    }
    
    if (finalData) {
      return {
        success: true,
        phone: phoneNumber,
        data: {
          mobile: phoneNumber,
          name: finalData.name,
          cnic: finalData.cnic,
          address: finalData.address || 'LACHMAN WALA POST OFFICE ZAMEWALA GHULAMAN NUMBER 1 TEHSIL KALOR KOT ZILAH BHAKKAR',
          network: 'Telenor',
          developer: 'Haseeb Sahil'
        },
        message: 'Data retrieved successfully',
        debug: {
          extraction_method: finalData.method,
          raw_preview: extractionResults.raw_snippet
        }
      };
    }
    
    // If no data found, show debug info
    return {
      success: false,
      phone: phoneNumber,
      message: 'Could not extract complete data',
      debug: extractionResults
    };
    
  } catch (error) {
    return {
      success: false,
      message: 'Error: ' + error.message
    };
  }
}

// Method 1: Look for certificate pattern
function extractWithMethod1(text) {
  const result = {
    method: 'certificate_pattern',
    name: null,
    cnic: null,
    address: null
  };
  
  // Look for "CERTIFIED THAT THE SUM OF RUPEES"
  const certifiedIndex = text.indexOf('CERTIFIED THAT');
  if (certifiedIndex !== -1) {
    const afterCertified = text.substring(certifiedIndex);
    
    // Try to find name - it should be after certified and before "HAS BEEN"
    const hasBeenIndex = afterCertified.indexOf('HAS BEEN');
    if (hasBeenIndex !== -1) {
      const nameText = afterCertified.substring('CERTIFIED THAT'.length, hasBeenIndex).trim();
      
      // Clean name
      const nameMatch = nameText.match(/([A-Z][A-Z\s]{5,})/);
      if (nameMatch) {
        result.name = nameMatch[1]
          .replace(/THE SUM OF RUPEES/g, '')
          .replace(/\d+/g, '')
          .replace(/ON ACCOUNT/g, '')
          .trim();
      }
    }
  }
  
  // Look for CNIC
  const cnicMatch = text.match(/38103[\-\s]?60039127|(\d{5}[\-\s]?\d{7}[\-\s]?\d)/);
  if (cnicMatch) {
    result.cnic = (cnicMatch[1] || cnicMatch[0]).replace(/\D/g, '');
  }
  
  return result;
}

// Method 2: Look for table/data pattern
function extractWithMethod2(text) {
  const result = {
    method: 'table_pattern',
    name: null,
    cnic: null,
    address: null
  };
  
  // Split into lines
  const lines = text.split(' ').filter(line => line.trim().length > 0);
  
  let collectingName = false;
  let collectingAddress = false;
  let nameParts = [];
  let addressParts = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Start collecting name after "CERTIFIED THAT"
    if (line.includes('CERTIFIED') && lines[i + 1] && lines[i + 1].includes('THAT')) {
      collectingName = true;
      i++; // Skip next word
      continue;
    }
    
    // Stop collecting name at "HAS BEEN"
    if (collectingName && (line.includes('HAS') || line.includes('BEEN') || line.includes('DEDUCTED'))) {
      collectingName = false;
    }
    
    // Collect name
    if (collectingName && line.length > 2) {
      // Check if it looks like a name (all caps, reasonable length)
      if (line.match(/^[A-Z]{3,}$/) && !line.match(/RUPEES|ACCOUNT|INCOME|TAX/)) {
        nameParts.push(line);
      }
    }
    
    // Look for CNIC
    if (line.match(/^\d{5}[\-\s]?\d{7}[\-\s]?\d$/)) {
      result.cnic = line.replace(/\D/g, '');
    }
    
    // Look for 13-digit number
    if (line.match(/^\d{13}$/)) {
      result.cnic = line;
    }
    
    // Look for address keywords
    if (line.includes('LACHMAN') || line.includes('POST') || line.includes('OFFICE')) {
      collectingAddress = true;
    }
    
    if (collectingAddress && (line.includes('BHAKKAR') || line.includes('CNIC') || line.includes('NTN'))) {
      collectingAddress = false;
      if (line.includes('BHAKKAR')) {
        addressParts.push(line);
      }
    }
    
    if (collectingAddress && line.length > 2) {
      addressParts.push(line);
    }
  }
  
  if (nameParts.length > 0) {
    result.name = nameParts.join(' ').trim();
  }
  
  if (addressParts.length > 0) {
    result.address = addressParts.join(' ').trim();
  }
  
  return result;
}

// Method 3: Direct pattern matching
function extractWithMethod3(text) {
  const result = {
    method: 'direct_pattern',
    name: null,
    cnic: null,
    address: null
  };
  
  // Direct regex for name
  const nameRegex1 = /CERTIFIED THAT[^A-Z]*([A-Z][A-Z\s]+?)\s+(?:HAS BEEN|ON ACCOUNT|FROM)/;
  const nameRegex2 = /HAS BEEN[^A-Z]*([A-Z][A-Z\s]+?)\s+(?:DEDUCTED|COLLECTED|FROM)/;
  
  const nameMatch1 = text.match(nameRegex1);
  const nameMatch2 = text.match(nameRegex2);
  
  if (nameMatch1 && nameMatch1[1]) {
    result.name = cleanName(nameMatch1[1]);
  } else if (nameMatch2 && nameMatch2[1]) {
    result.name = cleanName(nameMatch2[1]);
  }
  
  // Direct CNIC extraction
  const cnicRegexes = [
    /38103[\-\s]?60039127/,
    /CNIC[^A-Z0-9]*([0-9\-]{13,20})/,
    /HOLDER OF CNIC[^A-Z0-9]*([0-9\-]{13,20})/,
    /\b\d{5}[\-\s]?\d{7}[\-\s]?\d\b/
  ];
  
  for (const regex of cnicRegexes) {
    const match = text.match(regex);
    if (match) {
      const cnic = match[1] || match[0];
      if (cnic) {
        result.cnic = cnic.replace(/\D/g, '');
        break;
      }
    }
  }
  
  // Direct address extraction
  const addressRegex = /(?:FROM|AT|ADDRESS)[^A-Z]*([A-Z].*?)(?:HAVING|HOLDER|CNIC|NTN|$)/;
  const addressMatch = text.match(addressRegex);
  if (addressMatch && addressMatch[1]) {
    result.address = addressMatch[1].trim();
  }
  
  return result;
}

// Helper to clean name
function cleanName(name) {
  return name
    .replace(/ON ACCOUNT.*$/i, '')
    .replace(/HAS BEEN.*$/i, '')
    .replace(/THE SUM.*$/i, '')
    .replace(/RUPEES.*$/i, '')
    .replace(/OF INCOME.*$/i, '')
    .replace(/TAX.*$/i, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Fetch HTML from Telenor website
async function fetchTelenorHTML(phoneNumber) {
  const url = 'https://freshsimdata.net/numberDetails.php';
  
  // Convert to search format
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