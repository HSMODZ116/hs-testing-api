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
  if (request.method === 'OPTIONS') return new Response(null, { headers: HEADERS })
  if (request.method !== 'GET') return respond({ ResultCode: 0, ErrorCodes: ['Only GET method allowed'] }, 405)

  const url = new URL(request.url)
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