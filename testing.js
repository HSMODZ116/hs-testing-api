addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Only accept GET requests
  if (request.method !== 'GET') {
    return new Response(JSON.stringify({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Only GET requests are allowed'
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
  
  // Get URL parameter
  const spotifyUrl = url.searchParams.get('url')
  
  // Validate parameter
  if (!spotifyUrl || spotifyUrl.trim() === '') {
    return new Response(JSON.stringify({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'The url parameter is required'
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
  
  // Validate Spotify URL format
  if (!spotifyUrl.includes('open.spotify.com/track/')) {
    return new Response(JSON.stringify({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Invalid Spotify track URL. Please provide a valid Spotify track link'
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
  
  try {
    // Step 1: Get track info
    const trackInfoUrl = `https://api.fabdl.com/spotify/get?url=${encodeURIComponent(spotifyUrl)}`
    
    const trackInfoResponse = await fetch(trackInfoUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(30000)
    })
    
    if (!trackInfoResponse.ok) {
      return new Response(JSON.stringify({
        status_code: 400,
        developer: 'El Impaciente',
        telegram_channel: 'https://t.me/Apisimpacientes',
        message: 'Error getting track information from Spotify'
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    
    const trackInfo = await trackInfoResponse.json()
    
    // Check if result exists (API real response format)
    if (!trackInfo.result || !trackInfo.result.id || !trackInfo.result.gid) {
      return new Response(JSON.stringify({
        status_code: 400,
        developer: 'El Impaciente',
        telegram_channel: 'https://t.me/Apisimpacientes',
        message: 'Track not found or unavailable'
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    
    const { id, gid, name, artists, duration_ms } = trackInfo.result
    
    // Step 2: Get download URL
    const convertUrl = `https://api.fabdl.com/spotify/mp3-convert-task/${gid}/${id}`
    
    const convertResponse = await fetch(convertUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(30000)
    })
    
    if (!convertResponse.ok) {
      return new Response(JSON.stringify({
        status_code: 400,
        developer: 'El Impaciente',
        telegram_channel: 'https://t.me/Apisimpacientes',
        message: 'Error generating download URL'
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    
    const convertInfo = await convertResponse.json()
    
    // Check if download_url exists (API real response format)
    if (!convertInfo.result || !convertInfo.result.download_url) {
      return new Response(JSON.stringify({
        status_code: 400,
        developer: 'El Impaciente',
        telegram_channel: 'https://t.me/Apisimpacientes',
        message: 'Download URL not available for this track'
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }
    
    // Build final download URL
    const downloadUrl = `https://api.fabdl.com${convertInfo.result.download_url}`
    
    // Convert duration_ms to minutes:seconds format
    const totalSeconds = Math.floor(duration_ms / 1000)
    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60
    const durationFormatted = `${minutes}:${seconds.toString().padStart(2, '0')}`
    
    // Successful response
    return new Response(JSON.stringify({
      status_code: 200,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      result: {
        title: name,
        artist: artists,
        duration: durationFormatted,
        download_url: downloadUrl
      }
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*'
      }
    })
    
  } catch (error) {
    const isTimeout = error.name === 'AbortError' || error.message.includes('timeout')
    
    return new Response(JSON.stringify({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: isTimeout ? 'Request timeout. Please try again' : 'Error processing the request. Please try again'
    }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
}
