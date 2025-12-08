// ALTERNATIVE: Try direct HTML structure from your screenshot
async function fetchData(searchType, searchValue) {
  // First try the main form
  const url = 'https://paksimownerdetails.com/SecureInfo.php';
  
  // Try different form field names
  const formData = new URLSearchParams();
  
  if (searchType === 'phone') {
    formData.append('number', searchValue);
  } else if (searchType === 'cnic') {
    // Try different possible field names
    formData.append('cnic', searchValue);
    formData.append('nic', searchValue);
    formData.append('id', searchValue);
  }
  
  formData.append('search', 'search');
  formData.append('submit', 'Search');

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
    
    // Debug: Log important parts
    console.log('Response URL:', response.url);
    console.log('HTML contains table:', html.includes('table'));
    console.log('HTML contains 3810360039127:', html.includes('3810360039127'));
    
    // Save HTML for inspection
    // console.log('Full HTML:', html.substring(0, 2000));
    
    return parseHTML(html, searchType);
    
  } catch (error) {
    console.error('Fetch error:', error);
    return { searchType: searchType, records: [] };
  }
}