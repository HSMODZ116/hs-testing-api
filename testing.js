// Simple version using only freshsimdata.net
async function fetchTelenorRecords(phoneNumber) {
  // Directly use your existing fetchRecords function
  const records = await fetchRecords(phoneNumber);
  
  // If no records found in table format, try to parse Telenor format
  if (records.length === 0) {
    const data = await fetchRecordsRaw(phoneNumber);
    if (data && data.includes('has been deducted')) {
      // Parse Telenor format manually
      return [parseTelenorFormat(data, phoneNumber)];
    }
  }
  
  return records;
}

async function fetchRecordsRaw(value) {
  const POST_URL = "https://freshsimdata.net/numberDetails.php";
  const payload = "numberCnic=" + encodeURIComponent(value) + "&searchNumber=search";
  
  const headers = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36",
    "Content-Type": "application/x-www-form-urlencoded",
    "Referer": "https://freshsimdata.net/",
  };

  const res = await fetch(POST_URL, { method: "POST", headers, body: payload });
  return await res.text();
}

function parseTelenorFormat(html, phoneNumber) {
  // Parse Telenor specific format from HTML
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const result = {
    Mobile: phoneNumber,
    Name: '',
    CNIC: '',
    Address: '',
    Network: 'Telenor',
    Country: 'Pakistan'
  };
  
  // Your parsing logic here...
  return result;
}