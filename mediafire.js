// Cloudflare Worker for MediaFire Direct Links
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

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
      headers: corsHeaders
    })
  }

  const url = new URL(request.url)
  const mediafireUrl = url.searchParams.get('url')

  // Validate input
  if (!mediafireUrl) {
    return new Response(JSON.stringify({
      "success": false,
      "message": "MediaFire URL missing",
      "credits": "Haseeb Sahil"
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    })
  }

  try {
    // Fetch MediaFire page
    const response = await fetch(mediafireUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!response.ok) {
      throw new Error('Failed to load MediaFire page')
    }

    const html = await response.text()

    // Try multiple patterns for direct link
    const patterns = [
      /href="(https:\/\/download[^"]+)"/,
      /"(https:\/\/download[^"]+)"\s*class="input"/,
      /(https:\/\/download[a-zA-Z0-9\/\.\-\_\?\=\&]+)/
    ]

    let direct = null
    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        direct = match[1]
        break
      }
    }

    if (!direct) {
      return new Response(JSON.stringify({
        "success": false,
        "message": "Direct download link not found",
        "credits": "Haseeb Sahil"
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      })
    }

    // Extract file name
    let fileName = null
    const filenameMatch = html.match(/<div class="filename">([^<]+)<\/div>/)
    if (filenameMatch) {
      fileName = filenameMatch[1].trim()
    } else {
      const metaMatch = html.match(/<meta property="og:title" content="([^"]+)"/)
      if (metaMatch) {
        fileName = metaMatch[1].trim()
      }
    }

    // Fallback: use last segment of direct link
    if (!fileName) {
      const urlPath = new URL(direct).pathname
      fileName = urlPath.split('/').pop()
    }

    // Extract file type
    let fileType = null
    if (fileName && fileName.includes('.')) {
      fileType = fileName.split('.').pop()
    } else {
      const urlPath = new URL(direct).pathname
      fileType = urlPath.split('.').pop()
    }

    // Remove extension from file name
    if (fileName && fileType) {
      fileName = fileName.replace(new RegExp('\\.' + fileType + '$', 'i'), '')
    }

    // Get file size from direct link
    let fileSize = null
    try {
      const headResponse = await fetch(direct, {
        method: 'HEAD',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      const contentLength = headResponse.headers.get('content-length')
      if (contentLength) {
        const bytes = parseInt(contentLength)
        
        if (bytes >= 1073741824) {
          fileSize = (bytes / 1073741824).toFixed(2) + " GB"
        } else if (bytes >= 1048576) {
          fileSize = (bytes / 1048576).toFixed(2) + " MB"
        } else if (bytes >= 1024) {
          fileSize = (bytes / 1024).toFixed(2) + " KB"
        } else {
          fileSize = bytes + " bytes"
        }
      }
    } catch (error) {
      // File size detection failed, but we continue
    }

    // Final response
    return new Response(JSON.stringify({
      "success": true,
      "mediafire_url": mediafireUrl,
      "direct_link": direct,
      "file_name": fileName,
      "file_size": fileSize,
      "file_type": fileType,
      "credits": "Haseeb Sahil"
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    })

  } catch (error) {
    return new Response(JSON.stringify({
      "success": false,
      "message": "Error processing request: " + error.message,
      "credits": "Haseeb Sahil"
    }), {
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    })
  }
}