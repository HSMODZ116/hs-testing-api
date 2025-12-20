// Combined API - Pak SIM Owner Details (Phone & CNIC Search)
// File: jazz-cnic.js

export default {
  async fetch(request) {
    try {
      // Handle CORS preflight requests
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
          message: 'Use endpoint at / with num parameter'
        }, null, 2), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get the num parameter
      const num = url.searchParams.get('num');

      // If no num parameter
      if (!num) {
        return Response.json({
          success: false,
          error: 'Parameter is required',
          message: 'Add ?num= parameter with phone or CNIC number'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Clean the input - remove all non-digits
      const cleanedNum = num.toString().replace(/\D/g, '');
      
      let result;
      let type;

      // Detect if it's a phone number or CNIC based on length
      if (cleanedNum.length === 13) {
        // It's a CNIC
        type = 'cnic';
        
        // Validate CNIC format
        if (!/^\d{13}$/.test(cleanedNum)) {
          return Response.json({
            success: false,
            error: 'Invalid CNIC format',
            message: 'CNIC must be 13 digits (without dashes)'
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        result = await fetchData(cleanedNum, 'cnic');
        
      } else if (cleanedNum.length >= 10 && cleanedNum.length <= 12) {
        // It's a phone number
        type = 'phone';
        
        // Format phone number
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
            error: 'Invalid Pakistani mobile number',
            message: 'Use Pakistani mobile number starting with 03 (e.g., 03123456789)'
          }, {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        result = await fetchData(phoneNumber, 'phone');
        
      } else {
        return Response.json({
          success: false,
          error: 'Invalid input length',
          message: 'Phone number should be 10-12 digits or CNIC should be 13 digits'
        }, {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Return response
      return Response.json({
        success: result.success,
        type: type,
        input: cleanedNum,
        data: result.records,
        count: result.records ? result.records.length : 0,
        message: result.message
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

// ========== FETCH DATA FUNCTION ==========
async function fetchData(number, type) {
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  // Create form data
  const formData = new URLSearchParams();
  formData.append('number', number);
  formData.append('search', 'search');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://paksimownerdetails.com',
        'Referer': 'https://paksimownerdetails.com/'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    return parseHTML(html, number, type);
    
  } catch (error) {
    return {
      success: false,
      records: [],
      message: 'Failed to fetch data from source'
    };
  }
}

// ========== HTML PARSER ==========
function parseHTML(html, number, type) {
  const result = {
    success: false,
    records: [],
    message: 'No data found'
  };

  // Check if no records found
  if (html.includes('No record found') || html.includes('No Record Found')) {
    result.message = type === 'phone' 
      ? 'No records found for this phone number'
      : 'No records found for this CNIC';
    return result;
  }

  // Simple HTML parsing - looking for table structure
  const rows = [];
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Find tables
  const tables = tempDiv.getElementsByTagName('table');
  
  for (const table of tables) {
    const tableRows = table.getElementsByTagName('tr');
    
    for (let i = 0; i < tableRows.length; i++) {
      const row = tableRows[i];
      const cells = row.getElementsByTagName('td');
      
      // Skip rows with less than 4 cells or header rows
      if (cells.length < 4 || row.getElementsByTagName('th').length > 0) {
        continue;
      }
      
      const record = {
        mobile: formatMobile(cells[0]?.textContent || ''),
        name: (cells[1]?.textContent || '').trim(),
        cnic: formatCNIC(cells[2]?.textContent || ''),
        address: (cells[3]?.textContent || '').trim(),
        status: 'Active',
        country: 'Pakistan'
      };

      // Validate based on search type
      if (type === 'phone' && record.mobile === formatMobile(number)) {
        result.records.push(record);
      } else if (type === 'cnic' && record.cnic === number) {
        result.records.push(record);
      }
    }
  }

  // If we found records, update success status
  if (result.records.length > 0) {
    result.success = true;
    result.message = `Found ${result.records.length} record(s)`;
  }

  return result;
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
  }
  
  return cleaned;
}

function formatCNIC(cnic) {
  if (!cnic) return '';
  
  // Remove all non-digits including hyphens
  return cnic.replace(/\D/g, '');
}