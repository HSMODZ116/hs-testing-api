addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const API_CONFIG = {
  developer: 'El Impaciente',
  telegram_channel: 'https://t.me/Apisimpacientes',
  suno_api: 'https://anabot.my.id/api/ai/suno',
  api_key: 'freeApikey'
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify({
    status_code: status,
    developer: API_CONFIG.developer,
    telegram_channel: API_CONFIG.telegram_channel,
    ...data
  }), {
    status: status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

async function handleRequest(request) {
  const url = new URL(request.url)
  const path = url.pathname
  
  if (request.method !== 'GET') {
    return jsonResponse({ message: 'Only GET requests are allowed' }, 400)
  }
  
  if (path === '/generate' || path === '/generate/') {
    const lyrics = url.searchParams.get('lyrics')
    const genre = url.searchParams.get('genre')
    
    // Validación de parámetros - detectar cuáles faltan
    const missing = []
    
    if (!lyrics || lyrics.trim() === '') {
      missing.push('lyrics')
    }
    
    if (!genre || genre.trim() === '') {
      missing.push('genre')
    }
    
    // Si falta algún parámetro, indicar cuál(es)
    if (missing.length > 0) {
      const params = missing.join(', ')
      return jsonResponse({ 
        message: `Missing required parameter(s): ${params}`,
        required_parameters: ['lyrics', 'genre']
      }, 400)
    }
    
    try {
      // Construir URL de la API de Suno
      const sunoUrl = new URL(API_CONFIG.suno_api)
      sunoUrl.searchParams.set('lyrics', lyrics.trim())
      sunoUrl.searchParams.set('style', genre.trim())
      sunoUrl.searchParams.set('instrumen', 'no')
      sunoUrl.searchParams.set('apikey', API_CONFIG.api_key)
      
      const response = await fetch(sunoUrl.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })
      
      const data = await response.json()
      
      // Verificar si la respuesta es exitosa
      if (data.success && data.data && data.data.result && data.data.result.length > 0) {
        const song = data.data.result[0]
        
        return jsonResponse({
          message: 'Music generated successfully',
          response: {
            id: song.id || 'unknown',
            genre: genre,
            audio_url: song.audio_url || null
          }
        }, 200)
      } else {
        return jsonResponse({ 
          message: 'Failed to generate music',
          error: data.message || 'Unknown error'
        }, 400)
      }
      
    } catch (error) {
      return jsonResponse({ 
        message: 'Error generating music. Please try again.',
        error: error.message 
      }, 400)
    }
  }
  
  // Endpoint de ayuda
  return jsonResponse({
    message: 'Welcome to Suno Music Generator API',
    usage: 'Use /generate?lyrics=YOUR_LYRICS&genre=YOUR_GENRE',
    example: '/generate?lyrics=Dancing+under+the+stars&genre=Pop'
  }, 200)
}
