addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
  'Cache-Control': 'public, max-age=300',
  'X-Content-Type-Options': 'nosniff'
}

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: HEADERS
  })
}

function normalizeNumber(input) {
  let num = input.replace(/[^\d+]/g, '')

  // Pakistan special case
  if (/^0[3]\d{9}$/.test(num)) {
    // 03xxxxxxxxx -> 923xxxxxxxxx
    num = '92' + num.slice(1)
  } else if (/^\+92[3]\d{9}$/.test(num)) {
    // +923xxxxxxxxx -> 923xxxxxxxxx
    num = num.slice(1)
  } else if (/^3\d{9}$/.test(num)) {
    // 3xxxxxxxxx -> 923xxxxxxxxx
    num = '92' + num
  } else if (num.startsWith('+')) {
    // Remove starting + for all other countries
    num = num.slice(1)
  }

  // Minimum & maximum length (E.164 standard)
  if (num.length < 8 || num.length > 15) return null

  return num
}

async function handleRequest(request) {
  // Show documentation when accessed directly in browser
  const url = new URL(request.url)
  if (url.pathname === '/' && !url.searchParams.has('accountNumber')) {
    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mobile Number Provider Lookup API</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            line-height: 1.6;
            color: #333;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            overflow: hidden;
        }
        
        .header {
            background: linear-gradient(135deg, #2c3e50 0%, #4a6491 100%);
            color: white;
            padding: 30px 40px;
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 10px;
            font-weight: 700;
        }
        
        .header .subtitle {
            font-size: 1.2rem;
            opacity: 0.9;
            margin-bottom: 20px;
        }
        
        .developer {
            background: rgba(255,255,255,0.1);
            padding: 10px 15px;
            border-radius: 6px;
            display: inline-block;
            font-weight: 600;
            margin-top: 10px;
        }
        
        .content {
            padding: 40px;
        }
        
        .section {
            margin-bottom: 40px;
        }
        
        .section h2 {
            color: #2c3e50;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
            margin-bottom: 20px;
            font-size: 1.8rem;
        }
        
        .endpoint {
            background: #f8f9fa;
            border-left: 4px solid #667eea;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        
        .endpoint code {
            background: #2c3e50;
            color: white;
            padding: 10px 15px;
            border-radius: 6px;
            display: block;
            margin: 10px 0;
            font-size: 1.1rem;
            overflow-x: auto;
        }
        
        .example {
            background: #e8f4f8;
            border: 1px solid #b3e0f2;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        
        .example h3 {
            color: #2c3e50;
            margin-bottom: 10px;
        }
        
        .parameters table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        
        .parameters th {
            background: #2c3e50;
            color: white;
            padding: 12px;
            text-align: left;
        }
        
        .parameters td {
            padding: 12px;
            border-bottom: 1px solid #ddd;
        }
        
        .parameters tr:nth-child(even) {
            background: #f9f9f9;
        }
        
        .note {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            padding: 15px;
            border-radius: 6px;
            margin: 20px 0;
        }
        
        .note strong {
            color: #856404;
        }
        
        .try-button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 30px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 600;
            transition: transform 0.2s, box-shadow 0.2s;
            margin-top: 10px;
        }
        
        .try-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(0,0,0,0.2);
        }
        
        .footer {
            text-align: center;
            padding: 20px;
            background: #f8f9fa;
            color: #666;
            border-top: 1px solid #ddd;
        }
        
        @media (max-width: 768px) {
            .container {
                margin: 10px;
            }
            
            .header, .content {
                padding: 20px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📱 Mobile Number Provider Lookup API</h1>
            <div class="subtitle">Get mobile network provider information by phone number</div>
            <div class="developer">Developed by: Haseeb Sahil</div>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>📖 API Overview</h2>
                <p>This API allows you to identify the mobile network provider for any valid phone number worldwide. It supports multiple number formats and returns provider information including name, logo, country, and available payment types.</p>
            </div>
            
            <div class="section">
                <h2>🔧 API Endpoint</h2>
                <div class="endpoint">
                    <strong>GET Request:</strong>
                    <code>${url.origin}/?accountNumber=YOUR_PHONE_NUMBER</code>
                    <strong>Example:</strong>
                    <code>${url.origin}/?accountNumber=03451234567</code>
                </div>
                
                <a href="${url.origin}/?accountNumber=03451234567" class="try-button">Try Live Example →</a>
            </div>
            
            <div class="section">
                <h2>📋 Request Parameters</h2>
                <div class="parameters">
                    <table>
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>Required</th>
                                <th>Description</th>
                                <th>Format</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><code>accountNumber</code></td>
                                <td>Yes</td>
                                <td>The phone number to lookup</td>
                                <td>Any valid phone number format</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div class="section">
                <h2>🌍 Supported Number Formats</h2>
                <div class="note">
                    <strong>Pakistan Numbers:</strong>
                    <ul>
                        <li>03451234567 → Auto-converts to 923451234567</li>
                        <li>+923451234567 → Auto-converts to 923451234567</li>
                        <li>3451234567 → Auto-converts to 923451234567</li>
                    </ul>
                    <strong>International Numbers:</strong>
                    <ul>
                        <li>+441234567890 → Auto-converts to 441234567890</li>
                        <li>0012345678 → Remains as 12345678</li>
                    </ul>
                </div>
            </div>
            
            <div class="section">
                <h2>📊 Response Format</h2>
                <div class="example">
                    <h3>Success Response:</h3>
                    <pre><code>{
  "ResultCode": 1,
  "Items": [
    {
      "Name": "Provider Name",
      "Logo": "logo_url",
      "Country": "PK",
      "ProviderCode": "PROVIDER_CODE",
      "PaymentTypes": ["TopUp", "BillPayment"]
    }
  ],
  "OriginalInput": "03451234567",
  "NormalizedNumber": "923451234567"
}</code></pre>
                    
                    <h3>Error Response:</h3>
                    <pre><code>{
  "ResultCode": 0,
  "ErrorCodes": ["Error message"],
  "OriginalInput": "invalid_number",
  "NormalizedNumber": null
}</code></pre>
                </div>
            </div>
            
            <div class="section">
                <h2>🚀 Quick Start Examples</h2>
                <div class="example">
                    <h3>JavaScript Fetch Example:</h3>
                    <pre><code>fetch('${url.origin}/?accountNumber=03451234567')
  .then(response => response.json())
  .then(data => {
    if (data.ResultCode === 1) {
      console.log('Provider:', data.Items[0].Name);
    } else {
      console.error('Error:', data.ErrorCodes[0]);
    }
  });</code></pre>
                    
                    <h3>cURL Example:</h3>
                    <pre><code>curl "${url.origin}/?accountNumber=03451234567"</code></pre>
                </div>
            </div>
            
            <div class="note">
                <strong>💡 Important Notes:</strong>
                <ul>
                    <li>API supports CORS for cross-domain requests</li>
                    <li>Responses are cached for 5 minutes (300 seconds)</li>
                    <li>Maximum timeout: 8 seconds</li>
                    <li>Phone numbers must be 8-15 digits (E.164 standard)</li>
                    <li>OPTIONS method is supported for CORS preflight</li>
                </ul>
            </div>
        </div>
        
        <div class="footer">
            <p>API Documentation | Version 1.0 | Developed by Haseeb Sahil</p>
        </div>
    </div>
</body>
</html>
    `, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    })
  }

  if (request.method === 'OPTIONS') return new Response(null, { headers: HEADERS })
  if (request.method !== 'GET') return respond({ ResultCode: 0, ErrorCodes: ['Only GET method allowed'] }, 405)

  const originalInput = url.searchParams.get('accountNumber')

  if (!originalInput) return respond({ ResultCode: 0, ErrorCodes: ['accountNumber parameter is required'] }, 400)

  const normalized = normalizeNumber(originalInput)
  if (!normalized) return respond({ ResultCode: 0, ErrorCodes: ['Invalid account number format'], OriginalInput: originalInput }, 400)

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    const apiUrl = `https://www.easyload.com.pk/dingconnect.php?action=GetProviders&accountNumber=${normalized}`
    const res = await fetch(apiUrl, { signal: controller.signal })
    clearTimeout(timeout)

    if (!res.ok) throw new Error('Upstream API error')
    const data = await res.json()

    if (data.ResultCode === 1 && Array.isArray(data.Items)) {
      return respond({
        ResultCode: 1,
        Items: data.Items.map(p => ({
          Name: p.Name,
          Logo: p.LogoUrl,
          Country: p.CountryIso,
          ProviderCode: p.ProviderCode,
          PaymentTypes: p.PaymentTypes || []
        })),
        OriginalInput: originalInput,
        NormalizedNumber: normalized
      })
    }

    return respond({
      ResultCode: 0,
      ErrorCodes: data.ErrorCodes || ['No providers found'],
      Items: [],
      OriginalInput: originalInput,
      NormalizedNumber: normalized
    })

  } catch (err) {
    return respond({
      ResultCode: 0,
      ErrorCodes: [err.name === 'AbortError' ? 'Request timeout' : 'Internal server error']
    }, 500)
  }
}