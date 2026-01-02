addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  }

  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Get account number from query parameter
  let accountNumber = url.searchParams.get('accountNumber')
  
  if (!accountNumber) {
    return new Response(
      JSON.stringify({ 
        ResultCode: 0, 
        ErrorCodes: ['accountNumber parameter is required'] 
      }), 
      { 
        status: 400, 
        headers: corsHeaders 
      }
    )
  }

  try {
    // Clean the phone number - remove all non-digit characters
    accountNumber = accountNumber.replace(/\D/g, '')
    
    // For Pakistani numbers, handle special cases
    // Convert 03xxxxxxxxx to 92xxxxxxxxxxx format
    if (accountNumber.startsWith('03') && accountNumber.length === 11) {
      // Replace 03 with 923
      accountNumber = '92' + accountNumber.substring(1)
    } else if (accountNumber.startsWith('3') && accountNumber.length === 10) {
      // Format: 3xxxxxxxxx to 923xxxxxxxxx
      accountNumber = '92' + accountNumber
    }
    // For other countries, the API will handle validation based on their regex patterns

    // Call the original API
    const apiUrl = `https://www.easyload.com.pk/dingconnect.php?action=GetProviders&accountNumber=${accountNumber}`
    const response = await fetch(apiUrl)
    const data = await response.json()

    if (data.ResultCode === 1 && data.Items && data.Items.length > 0) {
      // Extract only Name and LogoUrl for each provider
      const filteredItems = data.Items.map(item => ({
        Name: item.Name,
        Logo: item.LogoUrl,
        Country: item.CountryIso,
        ProviderCode: item.ProviderCode,
        PaymentTypes: item.PaymentTypes || []
      }))

      // Create simplified response
      const simplifiedResponse = {
        ResultCode: data.ResultCode,
        ErrorCodes: data.ErrorCodes,
        Items: filteredItems,
        OriginalInput: url.searchParams.get('accountNumber'),
        NormalizedNumber: accountNumber
      }

      return new Response(JSON.stringify(simplifiedResponse), {
        headers: corsHeaders
      })
    } else {
      // No providers found or error
      return new Response(
        JSON.stringify({
          ResultCode: data.ResultCode || 0,
          ErrorCodes: data.ErrorCodes || ['No providers found for this number'],
          OriginalInput: url.searchParams.get('accountNumber'),
          NormalizedNumber: accountNumber,
          Items: []
        }),
        {
          headers: corsHeaders
        }
      )
    }

  } catch (error) {
    return new Response(
      JSON.stringify({ 
        ResultCode: 0, 
        ErrorCodes: ['Internal server error'] 
      }), 
      { 
        status: 500, 
        headers: corsHeaders 
      }
    )
  }
}