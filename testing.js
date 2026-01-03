addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
}
async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS })
  }
  if (request.method !== 'POST') {
    return jsonResponse({ success: false, message: 'Only POST requests are allowed' }, 405)
  }
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/pdf')) {
    return jsonResponse({ success: false, message: 'Endpoint not found. Use /pdf' }, 404)
  }
  try {
    const formData = await request.formData()
    const pdfFile = formData.get('pdf')
    if (!pdfFile) {
      return jsonResponse({ success: false, message: 'PDF file required' }, 400)
    }
    const timestamp = Date.now()
    const filename = `pdf_${timestamp}.pdf`
    const uploadedUrl = await uploadToTmpFiles(pdfFile, filename)
    const text = await extractTextFromPDF(uploadedUrl)
    return jsonResponse({ success: true, text }, 200)
  } catch (error) {
    return jsonResponse({ success: false, message: error.message || 'Error processing PDF' }, 400)
  }
}
async function uploadToTmpFiles(file, filename) {
  const formData = new FormData()
  formData.append('file', file, filename)
  const response = await fetch('https://tmpfiles.org/api/v1/upload', {
    method: 'POST',
    body: formData
  })
  if (!response.ok) {
    throw new Error('Failed to upload PDF')
  }
  const data = await response.json()
  if (!data.data?.url) {
    throw new Error('No upload URL received')
  }
  const normalUrl = data.data.url
  const parts = normalUrl.split('/')
  let fileId = ''
  for (const part of parts) {
    if (/^\d+$/.test(part)) {
      fileId = part
      break
    }
  }
  return `https://tmpfiles.org/dl/${fileId}/${filename}`
}
async function extractTextFromPDF(pdfUrl) {
  const response = await fetch('https://api.kome.ai/api/tools/pdf-to-text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ url: pdfUrl }),
    signal: AbortSignal.timeout(60000)
  })
  if (!response.ok) {
    throw new Error('Failed to extract text from PDF')
  }
  const data = await response.json()
  if (!data.text) {
    throw new Error('No text extracted from PDF')
  }
  return data.text
}
function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extraHeaders }
  })
}
