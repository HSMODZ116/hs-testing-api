addEventListener('fetch', e => {
  e.respondWith(handleRequest(e.request))
})

async function handleRequest(req) {
  const url = new URL(req.url)
  
  if (req.method !== 'GET') {
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Only GET requests are allowed'
    }, 400)
  }
  
  if (url.searchParams.get('services') !== null) {
    return res({
      status_code: 200,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      available_services: ['spotify', 'youtube', 'instagram', 'tiktok', 'x']
    })
  }
  
  const u = url.searchParams.get('url')
  const s = url.searchParams.get('service')
  
  if (!u || u.trim() === '') {
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'The url parameter is required'
    }, 400)
  }
  
  const srv = s ? s.toLowerCase() : detect(u)
  
  if (!srv) {
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Could not detect service'
    }, 400)
  }
  
  try {
    if (srv === 'spotify') return await spotify(u)
    if (srv === 'youtube') return await youtube(u)
    if (srv === 'instagram') return await instagram(u)
    if (srv === 'tiktok') return await tiktok(u)
    if (srv === 'x') return await x(u)
    
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Unsupported service'
    }, 400)
  } catch {
    return res({
      status_code: 500,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Error processing request'
    }, 500)
  }
}

function detect(u) {
  if (u.includes('spotify')) return 'spotify'
  if (u.includes('youtu')) return 'youtube'
  if (u.includes('instagram')) return 'instagram'
  if (u.includes('tiktok')) return 'tiktok'
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x'
  return null
}

function res(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  })
}

const API_URL = "https://allvideodownloader.cc/wp-json/aio-dl/video-data/"
const API_TOKEN = "c99f113fab0762d216b4545e5c3d615eefb30f0975fe107caab629d17e51b52d"

async function callAPI(u) {
  const f = new URLSearchParams()
  f.append('url', u)
  f.append('token', API_TOKEN)
  
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0"
    },
    body: f.toString(),
    signal: AbortSignal.timeout(30000)
  })
  
  if (!r.ok) throw new Error()
  return await r.json()
}

async function callArincyAPI(u, type, quality) {
  const arincyUrl = `https://api.arincy.site/api/youtube?url=${encodeURIComponent(u)}&type=${type}&quality=${quality}`
  
  const r = await fetch(arincyUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    },
    signal: AbortSignal.timeout(30000)
  })
  
  if (!r.ok) throw new Error()
  return await r.json()
}

function extractTitleFromUrl(url) {
  try {
    const urlObj = new URL(url)
    const path = urlObj.pathname
    const filename = path.split('/').pop()
    const nameWithoutExt = filename.replace(/\.(mp4|mp3|webm)$/i, '')
    const parts = nameWithoutExt.split('-')
    parts.pop()
    let title = parts.join(' ')
    title = title.replace(/\.(ytshorts|savetube|me|vip).*$/i, '')
    title = title.replace(/\s*(720|1080|480|360|4k)\s*$/i, '')
    title = title.replace(/\./g, ' ')
    title = title.trim()
    title = title.split(' ')
      .filter(word => word.length > 0)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
    return title || "YouTube Video"
  } catch {
    return "YouTube Video"
  }
}

async function spotify(u) {
  try {
    const info = await fetch(`https://api.fabdl.com/spotify/get?url=${encodeURIComponent(u)}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    })
    
    if (!info.ok) throw new Error()
    
    const data = await info.json()
    if (!data.result?.id || !data.result?.gid) throw new Error()
    
    const { id, gid, name, artists, duration_ms } = data.result
    
    const conv = await fetch(`https://api.fabdl.com/spotify/mp3-convert-task/${gid}/${id}`, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(30000)
    })
    
    if (!conv.ok) throw new Error()
    
    const dl = await conv.json()
    if (!dl.result?.download_url) throw new Error()
    
    const sec = Math.floor(duration_ms / 1000)
    const dur = `${Math.floor(sec / 60)}:${(sec % 60).toString().padStart(2, '0')}`
    
    return res({
      status_code: 200,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      platform: 'Spotify',
      result: {
        title: name,
        artist: artists,
        duration: dur,
        download_url: `https://api.fabdl.com${dl.result.download_url}`
      }
    })
  } catch {
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Error processing Spotify request'
    }, 400)
  }
}

async function youtube(u) {
  try {
    // Llamar a la API original (allvideodownloader)
    let videoData = null
    try {
      const d = await callAPI(u)
      const m = d.medias || []
      const q = m.find(x => x.quality === "mp4 (360p)")
      const dl = q?.url || m[0]?.url || ""
      
      if (dl) {
        videoData = {
          title: d.title || "Unknown",
          duration: d.duration || "Unknown",
          download_url: dl
        }
      }
    } catch {}
    
    // Llamar a la API de Arincy para video 720p
    let arincyVideo = null
    try {
      const arincyData = await callArincyAPI(u, 'video', '720')
      if (arincyData.status === true && arincyData.data?.url) {
        arincyVideo = {
          quality: '720p',
          download_url: arincyData.data.url,
          filename: arincyData.data.filename || 'video_720p.mp4'
        }
      }
    } catch {}
    
    // Llamar a la API de Arincy para audio
    let arincyAudio = null
    try {
      const arincyAudioData = await callArincyAPI(u, 'audio', '720')
      if (arincyAudioData.status === true && arincyAudioData.data?.url) {
        arincyAudio = {
          download_url: arincyAudioData.data.url,
          filename: arincyAudioData.data.filename || 'audio.mp3'
        }
      }
    } catch {}
    
    // Si no hay ningún resultado exitoso
    if (!videoData && !arincyVideo && !arincyAudio) {
      throw new Error('No data available')
    }
    
    // Extraer título: priorizar el de allvideodownloader, pero si no está disponible, extraer de URL de Arincy
    let finalTitle = videoData?.title || "YouTube Video"
    if (finalTitle === "YouTube Video" || finalTitle === "Unknown") {
      if (arincyVideo) {
        finalTitle = extractTitleFromUrl(arincyVideo.download_url)
      } else if (arincyAudio) {
        finalTitle = extractTitleFromUrl(arincyAudio.download_url)
      }
    }
    
    const result = {
      status_code: 200,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      platform: 'YouTube',
      title: finalTitle
    }
    
    if (videoData) {
      result['Video 360p'] = videoData.download_url
    }
    
    if (arincyVideo) {
      result['Video 720p'] = arincyVideo.download_url
    }
    
    if (arincyAudio) {
      result['Audio'] = arincyAudio.download_url
    }
    
    return res(result)
  } catch {
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Error processing YouTube request'
    }, 400)
  }
}

async function instagram(u) {
  try {
    const r = await igPrimary(u)
    if (r) return r
  } catch {}
  
  try {
    return await igFallback(u)
  } catch {
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Error processing Instagram request'
    }, 400)
  }
}

async function igPrimary(u) {
  try {
    const d = await callAPI(u)
    const m = d.medias || []
    const q = m.find(x => x.quality === "mp4 (360p)")
    const dl = q?.url || m[0]?.url || ""
    
    if (!dl) return null
    
    return res({
      status_code: 200,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      platform: 'Instagram',
      result: {
        title: d.title || "Instagram Video",
        duration: d.duration || "Unknown",
        download_url: dl
      }
    })
  } catch {
    return null
  }
}

async function igFallback(u) {
  const r = await fetch(`https://snapdownloader.com/tools/instagram-reels-downloader/download?url=${encodeURIComponent(u)}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Referer': 'https://snapdownloader.com/'
    },
    signal: AbortSignal.timeout(30000)
  })
  
  if (!r.ok) throw new Error()
  
  const h = await r.text()
  const m = h.match(/<a[^>]+href="([^"]*\.mp4[^"]*)"[^>]*>/i)
  const v = m ? decodeURIComponent(m[1].replace(/&amp;/g, '&')) : ''
  
  if (!v) throw new Error()
  
  return res({
    status_code: 200,
    developer: 'El Impaciente',
    telegram_channel: 'https://t.me/Apisimpacientes',
    platform: 'Instagram',
    result: {
      title: 'Instagram Video',
      duration: 'Unknown',
      download_url: v
    }
  })
}

async function tiktok(u) {
  try {
    const d = await callAPI(u)
    const m = d.medias || []
    const q = m.find(x => x.quality === "mp4 (360p)")
    const dl = q?.url || m[0]?.url || ""
    
    return res({
      status_code: 200,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      platform: 'TikTok',
      result: {
        title: d.title || "TikTok Video",
        duration: d.duration || "Unknown",
        download_url: dl
      }
    })
  } catch {
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Error processing TikTok request'
    }, 400)
  }
}

async function x(u) {
  try {
    const d = await callAPI(u)
    const m = d.medias || []
    const q = m.find(x => x.quality === "mp4 (360p)")
    const dl = q?.url || m[0]?.url || ""
    
    return res({
      status_code: 200,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      platform: 'X',
      result: {
        title: d.title || "X Video",
        duration: d.duration || "Unknown",
        download_url: dl
      }
    })
  } catch {
    return res({
      status_code: 400,
      developer: 'El Impaciente',
      telegram_channel: 'https://t.me/Apisimpacientes',
      message: 'Error processing X request'
    }, 400)
  }
}
