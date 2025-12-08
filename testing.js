// Single Worker API - Pak Sim Owner Details
// Using freshsimdata.net API for both phone and CNIC search

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

      // Only handle root path
      if (path !== '/') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Not found',
          message: 'Use Pakistani mobile number starting with 03 or CNIC'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the search parameter
      const num = url.searchParams.get('num') || 
                 url.searchParams.get('phone') || 
                 url.searchParams.get('value');

      // If no search parameter
      if (!num) {
        return Response.json({
          success: false,
          error: 'Search parameter is required',
          message: 'Use Pakistani mobile number starting with 03 or CNIC number'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean and validate input
      const cleanedInput = num.toString().replace(/\D/g, '');
      
      let searchType = '';
      let searchValue = '';

      // Determine if input is phone or CNIC
      if (cleanedInput.length === 11 && cleanedInput.startsWith('03')) {
        searchType = 'phone';
        searchValue = cleanedInput;
      } else if (cleanedInput.length === 13) {
        searchType = 'cnic';
        searchValue = cleanedInput;
      } else if (cleanedInput.length === 12 && cleanedInput.startsWith('92')) {
        // Convert 92xxxxxxxxxx to 0xxxxxxxxxx
        searchType = 'phone';
        searchValue = '0' + cleanedInput.substring(2);
      } else if (cleanedInput.length === 10 && cleanedInput.startsWith('3')) {
        // Convert 3xxxxxxxxx to 03xxxxxxxxx
        searchType = 'phone';
        searchValue = '0' + cleanedInput;
      } else {
        return Response.json({
          success: false,
          error: 'Invalid input',
          message: 'Must be Pakistani mobile (11 digits starting with 03) or CNIC (13 digits)'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Fetch data from freshsimdata.net
      const data = await fetchData(searchValue);
      
      // If we searched by phone and found CNIC, also fetch CNIC records
      let allRecords = data.records || [];
      
      if (searchType === 'phone' && allRecords.length > 0) {
        // Extract CNIC from first record
        const firstRecord = allRecords[0];
        if (firstRecord.cnic && firstRecord.cnic.length === 13) {
          const cnicData = await fetchData(firstRecord.cnic);
          if (cnicData.records && cnicData.records.length > 0) {
            // Merge and deduplicate
            const seen = new Set();
            const mergedRecords = [];
            
            // Add all records
            [...allRecords, ...cnicData.records].forEach(record => {
              const key = `${record.mobile}-${record.cnic}-${record.name}`;
              if (!seen.has(key)) {
                seen.add(key);
                mergedRecords.push(record);
              }
            });
            
            allRecords = mergedRecords;
          }
        }
      }

      // Return response
      return Response.json({
        success: true,
        searchType: searchType,
        searchValue: searchValue,
        count: allRecords.length,
        data: {
          searchType: searchType,
          records: allRecords
        }
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

// ========== FETCH DATA FUNCTION ==========
async function fetchData(value) {
  const POST_URL = "https://freshsimdata.net/numberDetails.php";
  
  // Create payload as per the working example
  const payload = "numberCnic=" + encodeURIComponent(value) + "&searchNumber=search";

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept":
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/x-www-form-urlencoded",
    "Origin": "https://freshsimdata.net",
    "Referer": "https://freshsimdata.net/",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "same-origin",
    "Upgrade-Insecure-Requests": "1"
  };

  try {
    const response = await fetch(POST_URL, {
      method: "POST",
      headers,
      body: payload,
    });

    const html = await response.text();
    
    // Parse the HTML
    const records = parseTableHtml(html);
    
    // Add network detection to each record
    const enhancedRecords = records.map(record => ({
      ...record,
      network: detectNetwork(record.mobile || ''),
      status: 'Active',
      country: 'Pakistan'
    }));

    return {
      searchValue: value,
      records: enhancedRecords
    };
    
  } catch (error) {
    console.error('Fetch error:', error);
    return {
      searchValue: value,
      records: []
    };
  }
}

// ========== HTML PARSER ==========
function parseTableHtml(html) {
  const rows = [];

  // Check if no records found
  if (html.includes('No record found') || 
      html.toLowerCase().includes('not found') ||
      html.includes('Record Not Found') ||
      html.includes('Sorry, no record found') ||
      (html.includes('Sorry') && html.includes('found'))) {
    return rows;
  }

  // Parse table rows
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = rowRegex.exec(html))) {
    const rowHtml = match[1];
    
    // Skip header rows
    if (rowHtml.includes('<th>') || 
        (rowHtml.toLowerCase().includes('mobile') && rowHtml.toLowerCase().includes('name')) ||
        (rowHtml.includes('Number') && rowHtml.includes('Name') && rowHtml.includes('CNIC'))) {
      continue;
    }

    // Extract cells
    const cols = [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
      (m) =>
        m[1]
          .replace(/<[^>]+>/g, "")  // Remove HTML tags
          .replace(/&nbsp;/g, " ")  // Replace &nbsp;
          .replace(/\s+/g, " ")     // Collapse multiple spaces
          .trim()
    );

    if (cols.length >= 4) {
      const record = {
        mobile: formatMobile(cols[0] || ''),
        name: (cols[1] || '').replace(/\.$/g, '').trim(), // Remove trailing dots
        cnic: formatCNIC(cols[2] || ''),
        address: cols[3] || '',
        network: detectNetwork(cols[0] || ''),
        status: 'Active',
        country: 'Pakistan'
      };
      
      // Only add if we have valid data
      if (record.mobile || record.name || record.cnic) {
        rows.push(record);
      }
    }
  }

  return rows;
}

// ========== HELPER FUNCTIONS ==========
function formatMobile(mobile) {
  if (!mobile) return '';
  
  // Remove all non-digits
  let cleaned = mobile.replace(/\D/g, '');
  
  // Ensure proper format
  if (cleaned.startsWith('92') && cleaned.length === 12) {
    cleaned = '0' + cleaned.substring(2);
  } else if (cleaned.startsWith('3') && cleaned.length === 10) {
    cleaned = '0' + cleaned;
  } else if (cleaned.length === 11 && cleaned.startsWith('0')) {
    // Already in correct format
    return cleaned;
  }
  
  return cleaned;
}

function formatCNIC(cnic) {
  if (!cnic) return '';
  
  // Remove all non-digits including hyphens
  let cleaned = cnic.replace(/\D/g, '');
  
  // Return only digits without any formatting
  return cleaned;
}

function detectNetwork(mobile) {
  const num = formatMobile(mobile);
  
  if (!num) return 'Unknown';
  
  // Network prefixes in Pakistan
  const networkPrefixes = {
    '0300': 'Jazz', '0301': 'Zong', '0302': 'Warid', '0303': 'Ufone',
    '0304': 'Telenor', '0305': 'Jazz', '0306': 'Telenor', '0307': 'Jazz',
    '0308': 'Warid', '0309': 'Mobilink', '0310': 'Zong', '0311': 'Jazz',
    '0312': 'Warid', '0313': 'Ufone', '0314': 'Telenor', '0315': 'Jazz',
    '0316': 'Zong', '0317': 'Warid', '0318': 'Ufone', '0319': 'Telenor',
    '0320': 'Jazz', '0321': 'Zong', '0322': 'Warid', '0323': 'Ufone',
    '0324': 'Telenor', '0325': 'Jazz', '0326': 'Zong', '0327': 'Warid',
    '0328': 'Ufone', '0329': 'Telenor', '0330': 'Jazz', '0331': 'Zong',
    '0332': 'Warid', '0333': 'Ufone', '0334': 'Telenor', '0335': 'Jazz',
    '0336': 'Zong', '0337': 'Warid', '0338': 'Ufone', '0339': 'Telenor',
    '0340': 'Jazz', '0341': 'Zong', '0342': 'Warid', '0343': 'Ufone',
    '0344': 'Telenor', '0345': 'Jazz', '0346': 'Zong', '0347': 'Warid',
    '0348': 'Ufone', '0349': 'Telenor'
  };
  
  const prefix = num.substring(0, 4);
  return networkPrefixes[prefix] || 'Unknown';
}