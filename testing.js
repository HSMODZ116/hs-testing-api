// Cloudflare Worker for Face Swap API
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

// DeepSwap API configuration
const DEEPSWAP_API = "https://api.deepswapper.com/swap"
const SECURITY_PAYLOAD = {
  "token": "0.ufDEMbVMT7mc9_XLsFDSK5CQqdj9Cx_Zjww0DevIvXN5M4fXQr3B9YtPdGkKAHjXBK6UC9rFcEbZbzCfkxxgmdTYV8iPzTby0C03dTKv5V9uXFYfwIVlqwNbIsfOK_rLRHIPB31bQ0ijSTEd-lLbllf3MkEcpkEZFFmmq8HMAuRuliCXFEdCwEB1HoYSJtvJEmDIVsooU3gYdrCm5yOJ8_lZ4DiHCSvy7P8-YxwJKkapJNCMUCFIfJbWDkDzvh8DGPyTRoHbURX8kClfImmPrGcqlfd7kkoNRcudS25IbNf1CGBsh8V96MtEhnTZvOpZfnp5dpV7MfgwOgvx7hUazUaC_wxQE63Aa0uOPuGvJ70BNrmeZIIrY9roD1Koj316L4g2BZ_LLZZF11wcrNNon8UXB0iVudiNCJyDQCxLUmblXUpt4IUvRoiOqXBNtWtLqY0su0ieVB0jjyDf_-zs7wc8WQ_jqp-NsTxgKOgvZYWV6Elz_lf4cNxGHZJ5BdcyLEoRBH3cksvwoncmYOy5Ulco22QT-x2z06xVFBZYZMVulxAcmvQemKfSFKsNaDxwor35p-amn9Vevhyb-GzA_oIoaTmc0fVXSshax2rdFQHQms86fZ_jkTieRpyIuX0mI3C5jLGIiOXzWxNgax9eZeQstYjIh8BIdMiTIUHfyKVTgtoLbK0hjTUTP0xDlCLnOt5qHdwe_iTWedBsswAJWYdtIxw0YUfIU22GMYrJoekOrQErawNlU5yT-LhXquBQY3EBtEup4JMWLendSh68d6HqjN2T3sAfVw0nY5jg7_5LJwj5gqEk57devNN8GGhogJpfdGzYoNGja22IZIuDnPPmWTpGx4VcLOLknSHrzio.tXUN6eooS69z3QtBp-DY1g.d882822dfe05be2b36ed1950554e1bac753abfe304a289adc4289b3f0d517356",
  "type": "invisible",
  "id": "deepswapper"
}

async function handleRequest(request) {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  // Handle OPTIONS request for CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    })
  }

  // Handle GET request for API info
  if (request.method === 'GET') {
    const url = new URL(request.url)
    
    if (url.pathname === '/api' || url.pathname === '/') {
      return new Response(JSON.stringify({
        "status": "running",
        "name": "Face Swap API",
        "version": "1.0",
        "usage": "POST /swap with source & target images in multipart/form-data",
        "endpoints": {
          "api_info": "GET /",
          "swap_api": "POST /swap"
        },
        "documentation": "Send POST request with 'source' and 'target' image files"
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }
  }

  // Handle POST request for face swap
  if (request.method === 'POST' && request.url.endsWith('/swap')) {
    try {
      const formData = await request.formData()
      
      const sourceFile = formData.get('source')
      const targetFile = formData.get('target')
      
      if (!sourceFile || !targetFile) {
        return new Response(JSON.stringify({
          "success": false,
          "message": "Both source and target images are required"
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        })
      }

      // Convert files to base64
      const sourceBuffer = await sourceFile.arrayBuffer()
      const targetBuffer = await targetFile.arrayBuffer()
      
      const sourceBase64 = arrayBufferToBase64(sourceBuffer)
      const targetBase64 = arrayBufferToBase64(targetBuffer)

      // Prepare payload for DeepSwap API
      const payload = {
        "source": sourceBase64,
        "target": targetBase64,
        "security": SECURITY_PAYLOAD
      }

      // Call DeepSwap API
      const response = await fetch(DEEPSWAP_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        return new Response(JSON.stringify({
          "success": false,
          "message": "DeepSwap API failed",
          "status": response.status
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        })
      }

      const data = await response.json()

      if (!data.result) {
        return new Response(JSON.stringify({
          "success": false,
          "message": "No result received from API"
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        })
      }

      // Convert base64 result to image
      const imageData = data.result.split(',')[1] || data.result
      const imageBuffer = base64ToArrayBuffer(imageData)
      
      return new Response(imageBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        }
      })

    } catch (error) {
      return new Response(JSON.stringify({
        "success": false,
        "error": error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }
  }

  // 404 for other routes
  return new Response(JSON.stringify({
    "success": false,
    "message": "Endpoint not found"
  }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  })
}

// Helper function to convert ArrayBuffer to base64
function arrayBufferToBase64(buffer) {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

// Helper function to convert base64 to ArrayBuffer
function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}