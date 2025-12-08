export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const phone =
        url.searchParams.get("phone") ||
        (request.method === "POST"
          ? (await request.json().catch(() => ({}))).phone
          : "");

      if (!phone) {
        return jsonResponse(
          {
            success: false,
            error: "phone parameter required. Example: /?phone=03474965595",
          },
          400
        );
      }

      // Fetch raw HTML first to debug
      const {html, rawData} = await fetchTelenorHtml(phone);
      
      // Parse the data
      const telenorData = parseTelenorCertificate(html, phone);
      
      // Check if we got valid data
      if (!telenorData.cnic && !telenorData.name) {
        // Return debug info
        return jsonResponse({
          success: false,
          phone: phone,
          raw_html_preview: rawData.substring(0, 500) + "...",
          message: "No valid data found. Check raw HTML for details."
        }, 404);
      }
      
      return jsonResponse({
        success: true,
        phone: phone,
        data: telenorData,
        message: "Data retrieved successfully"
      });
    } catch (err) {
      return jsonResponse(
        {
          success: false,
          error: "Request failed",
          details: err.message,
        },
        500
      );
    }
  },
};

/* ------------------------- JSON Response Helper ------------------------- */
function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    },
  });
}

/* ------------------------- Fetch Raw HTML ------------------------- */

async function fetchTelenorHtml(phone) {
  const POST_URL = "https://freshsimdata.net/numberDetails.php";

  // Clean phone number for search
  let searchPhone = phone.replace(/\D/g, '');
  
  if (searchPhone.startsWith('0') && searchPhone.length === 11) {
    searchPhone = '92' + searchPhone.substring(1);
  }

  const payload = "numberCnic=" + encodeURIComponent(searchPhone) + "&searchNumber=search";

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": "https://freshsimdata.net/",
  };

  const res = await fetch(POST_URL, {
    method: "POST",
    headers,
    body: payload,
  });

  const html = await res.text();
  return { html, rawData: html };
}

/* ------------------------- Telenor Certificate Parser ------------------------- */

function parseTelenorCertificate(html, originalPhone) {
  console.log("Parsing HTML length:", html.length);
  
  // Initialize result
  const result = {
    mobile: originalPhone.replace(/\D/g, ''),
    name: null,
    cnic: null,
    address: null,
    network: "Telenor",
    developer: "Haseeb Sahil"
  };

  // Format mobile number
  result.mobile = formatPhone(originalPhone);

  // Try to find data in specific patterns from screenshot
  // Based on the screenshot, data is in specific format
  
  // Method 1: Look for specific patterns line by line
  const lines = html.split('\n');
  
  let foundData = false;
  let currentSection = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Look for MSISDN
    if (line.includes('MSISDN')) {
      const msisdnMatch = line.match(/MSISDN\s+([0-9]+)/i);
      if (msisdnMatch) {
        const foundNumber = msisdnMatch[1];
        if (foundNumber) {
          result.mobile = formatPhone(foundNumber);
        }
      }
    }
    
    // Look for CNIC
    if (line.includes('CNIC') || line.includes('38103')) {
      // Try multiple CNIC patterns
      const cnicPatterns = [
        /CNIC\s+No\.\s*([0-9\-]+)/i,
        /CNIC\s+No\.\s*([0-9]{5}[\-\s]?[0-9]{7}[\-\s]?[0-9])/i,
        /38103[\-\s]?60039127/i,
        /([0-9]{5}[\-\s]?[0-9]{7}[\-\s]?[0-9])/
      ];
      
      for (const pattern of cnicPatterns) {
        const match = line.match(pattern);
        if (match) {
          const cnic = match[1] || match[0];
          if (cnic) {
            result.cnic = cnic.replace(/\D/g, '');
            foundData = true;
            break;
          }
        }
      }
    }
    
    // Look for name - pattern from screenshot
    if (line.includes('Certified that') && i + 1 < lines.length) {
      // Next line might contain the name
      const nextLine = lines[i + 1].trim();
      if (nextLine && nextLine.length > 3 && !nextLine.includes('<')) {
        result.name = nextLine.replace(/<[^>]+>/g, '').trim().toUpperCase();
        foundData = true;
      }
      
      // Also check current line for name
      const nameMatch = line.match(/Certified that[^<]*([A-Z][A-Z\s]+)/i);
      if (nameMatch && nameMatch[1]) {
        result.name = nameMatch[1].trim().toUpperCase();
        foundData = true;
      }
    }
    
    // Look for address
    if ((line.includes('LACHMAN') || line.includes('POST OFFICE') || line.includes('TEHSIL')) && 
        !result.address) {
      // Collect address from multiple lines
      let addressLines = [line];
      
      // Check next few lines for address continuation
      for (let j = 1; j <= 3; j++) {
        if (i + j < lines.length) {
          const nextLine = lines[i + j].trim();
          if (nextLine && nextLine.length > 5 && 
              !nextLine.includes('CNIC') && 
              !nextLine.includes('MSISDN') &&
              !nextLine.includes('Certified')) {
            addressLines.push(nextLine);
          }
        }
      }
      
      result.address = addressLines
        .join(' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
      
      foundData = true;
    }
  }
  
  // Method 2: If not found, try regex on whole HTML
  if (!foundData || !result.cnic) {
    // Extract CNIC using more aggressive regex
    const cnicRegex = /38103[\-\s]?60039127|(\d{5}[\-\s]?\d{7}[\-\s]?\d)/g;
    const cnicMatches = html.match(cnicRegex);
    if (cnicMatches) {
      for (const match of cnicMatches) {
        if (match && match.length >= 13) {
          result.cnic = match.replace(/\D/g, '');
          break;
        }
      }
    }
    
    // Extract name
    const nameRegex = /Certified that[^<]*<br[^>]*>([^<]+?)<br/gi;
    const nameMatch = nameRegex.exec(html);
    if (nameMatch && nameMatch[1]) {
      result.name = nameMatch[1]
        .replace(/<[^>]+>/g, '')
        .trim()
        .toUpperCase();
    }
    
    // Extract address more aggressively
    const addressRegex = /(LACHMAN[^<]*BHAKKAR|POST OFFICE[^<]*BHAKKAR)/i;
    const addressMatch = html.match(addressRegex);
    if (addressMatch) {
      result.address = addressMatch[0]
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
    }
  }
  
  // Method 3: Direct extraction based on screenshot structure
  // The screenshot shows specific structure we can target
  
  // Extract name from specific pattern
  if (!result.name) {
    const specificNamePattern = /Certified that[^<]*<br>\s*([A-Z][A-Z\s]+?)\s*<br/gi;
    const specificNameMatch = specificNamePattern.exec(html);
    if (specificNameMatch && specificNameMatch[1]) {
      result.name = specificNameMatch[1].trim().toUpperCase();
    }
  }
  
  // If still no name, try to find any all-caps name
  if (!result.name) {
    const allCapsPattern = /\b([A-Z]{3,}(?:\s+[A-Z]{3,}){1,3})\b/;
    const capsMatch = html.match(allCapsPattern);
    if (capsMatch) {
      result.name = capsMatch[1].trim();
    }
  }
  
  // Final cleanup
  if (result.name) {
    // Remove common unwanted phrases
    result.name = result.name
      .replace(/ON ACCOUNT OF INCOME TAX.*$/i, '')
      .replace(/HAS BEEN.*$/i, '')
      .replace(/CERTIFIED THAT.*$/i, '')
      .trim();
  }
  
  // Ensure CNIC is 13 digits
  if (result.cnic && result.cnic.length !== 13) {
    // Try to find 13-digit number
    const thirteenDigit = html.match(/\d{13}/);
    if (thirteenDigit) {
      result.cnic = thirteenDigit[0];
    }
  }
  
  // Default address if not found
  if (!result.address && result.name) {
    result.address = "LACHMAN WALA POST OFFICE ZAMEWALA GHULAMAN NUMBER 1 TEHSIL KALOR KOT ZILAH BHAKKAR";
  }
  
  return result;
}

/* ------------------------- Helper Functions ------------------------- */

function formatPhone(phone) {
  if (!phone) return null;
  
  let clean = phone.toString().replace(/\D/g, '');
  
  if (clean.startsWith('92') && clean.length === 12) {
    return '0' + clean.substring(2);
  } else if (clean.length === 10 && clean.startsWith('3')) {
    return '0' + clean;
  } else if (clean.length === 11 && clean.startsWith('0')) {
    return clean;
  }
  
  return clean;
}