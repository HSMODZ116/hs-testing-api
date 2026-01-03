// ====================================================
// SPOTMATE PROFESSIONAL API - CLOUDFLARE WORKER
// Version: 2.0.0 - FIXED & WORKING
// Original Flask Code Converted to Cloudflare Worker
// Developer: Abir Arafat Chawdhury (@ISmartCoder)
// Updates Channel: @abirxdhackz
// ====================================================

// ✅ API Configuration
const BASE_URL = "https://spotmate.online";
let sessionCache = null;
let lastSessionTime = 0;
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// ✅ Mobile Browser Headers Simulation
const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2434) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.35 Mobile Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'sec-ch-ua': '"Android WebView";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'sec-ch-ua-platform': '"Android"',
    'sec-fetch-site': 'none',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-user': '?1',
    'sec-fetch-dest': 'document',
    'upgrade-insecure-requests': '1'
};

const API_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Linux; Android 15; V2434) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.7499.35 Mobile Safari/537.36',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Content-Type': 'application/json',
    'sec-ch-ua-platform': '"Android"',
    'sec-ch-ua': '"Android WebView";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
    'sec-ch-ua-mobile': '?1',
    'origin': BASE_URL,
    'sec-fetch-site': 'same-origin',
    'sec-fetch-mode': 'cors',
    'sec-fetch-dest': 'empty',
    'referer': `${BASE_URL}/en1`,
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'priority': 'u=1, i'
};

// ✅ Main Cloudflare Worker Handler
export default {
    async fetch(request, env, ctx) {
        // ✅ CORS Configuration
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        };

        // ✅ Handle CORS Preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        // ✅ Only GET method allowed
        if (request.method !== 'GET') {
            return errorResponse('Method not allowed. Only GET method is supported.', 405, corsHeaders);
        }

        const url = new URL(request.url);
        const path = url.pathname;

        // ✅ Route Handling
        switch (path) {
            case '/':
                return apiDocumentation(corsHeaders);
            
            case '/health':
                return healthCheck(corsHeaders);
            
            case '/sp/dl':
                return await handleSpotifyDownload(request, url, corsHeaders);
            
            default:
                return notFoundResponse(corsHeaders);
        }
    }
};

// ====================================================
// SPOTMATE API CORE FUNCTIONS
// ====================================================

// ✅ Initialize Session with spotmate.online
async function initSession() {
    // Check if session is still valid (5 minutes cache)
    const now = Date.now();
    if (sessionCache && (now - lastSessionTime) < SESSION_TIMEOUT) {
        return sessionCache;
    }

    try {
        console.log('Initializing new session with spotmate.online...');
        
        const response = await fetch(`${BASE_URL}/en1`, {
            headers: BROWSER_HEADERS,
            redirect: 'follow'
        });

        if (response.status === 200) {
            const html = await response.text();
            
            // Extract CSRF token from HTML
            const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
            const csrfToken = csrfMatch ? csrfMatch[1] : null;
            
            // Extract cookies from response headers
            const cookies = extractCookies(response.headers);
            
            // Extract XSRF token if available
            const xsrfToken = cookies['XSRF-TOKEN'] || null;
            
            sessionCache = {
                success: true,
                cookies: cookies,
                csrf_token: csrfToken,
                xsrf_token: xsrfToken,
                timestamp: now
            };
            
            lastSessionTime = now;
            
            console.log('Session initialized successfully');
            return sessionCache;
        } else {
            return {
                success: false,
                error: `HTTP ${response.status}: Failed to initialize session`
            };
        }
    } catch (error) {
        console.error('Session init error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ✅ Get Track Data from Spotify URL
async function getTrackData(spotifyUrl, csrfToken, cookies) {
    try {
        const cookieString = formatCookies(cookies);
        
        const headers = {
            ...API_HEADERS,
            'x-csrf-token': csrfToken || '',
            'x-xsrf-token': cookies['XSRF-TOKEN'] || '',
            'cookie': cookieString
        };

        const payload = {
            spotify_url: spotifyUrl
        };

        console.log('Getting track data for:', spotifyUrl);
        
        const response = await fetch(`${BASE_URL}/getTrackData`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            redirect: 'follow'
        });

        if (response.status === 200) {
            const data = await response.json();
            console.log('Track data received successfully');
            return {
                success: true,
                data: data
            };
        } else {
            console.error('Track data error:', response.status);
            return {
                success: false,
                error: `HTTP ${response.status}: Failed to get track data`
            };
        }
    } catch (error) {
        console.error('Track data fetch error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ✅ Convert Track to Downloadable Format
async function convertTrack(spotifyUrl, csrfToken, cookies) {
    try {
        const cookieString = formatCookies(cookies);
        
        const headers = {
            ...API_HEADERS,
            'x-csrf-token': csrfToken || '',
            'x-xsrf-token': cookies['XSRF-TOKEN'] || '',
            'x-requested-with': 'XMLHttpRequest',
            'cookie': cookieString
        };

        const payload = {
            urls: spotifyUrl
        };

        console.log('Converting track:', spotifyUrl);
        
        const response = await fetch(`${BASE_URL}/convert`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
            redirect: 'follow'
        });

        if (response.status === 200) {
            const data = await response.json();
            console.log('Track converted successfully');
            return {
                success: true,
                data: data
            };
        } else {
            console.error('Convert error:', response.status);
            return {
                success: false,
                error: `HTTP ${response.status}: Failed to convert track`
            };
        }
    } catch (error) {
        console.error('Convert fetch error:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

// ✅ Main Track Processing Function
async function processTrack(spotifyUrl) {
    console.log('Processing track:', spotifyUrl);
    
    // Step 1: Initialize session
    const sessionResult = await initSession();
    if (!sessionResult.success) {
        return {
            success: false,
            error: 'Failed to initialize session',
            details: sessionResult.error
        };
    }
    
    const csrfToken = sessionResult.csrf_token;
    const cookies = sessionResult.cookies;
    
    // Step 2: Wait 1 second (simulating original behavior)
    await sleep(1000);
    
    // Step 3: Get track data
    const trackResult = await getTrackData(spotifyUrl, csrfToken, cookies);
    if (!trackResult.success) {
        // Try with new session if failed
        sessionCache = null;
        const retrySession = await initSession();
        
        if (retrySession.success) {
            await sleep(1000);
            const retryTrackResult = await getTrackData(spotifyUrl, retrySession.csrf_token, retrySession.cookies);
            
            if (!retryTrackResult.success) {
                return {
                    success: false,
                    error: 'Failed to get track data',
                    details: retryTrackResult.error
                };
            }
            
            trackResult.success = true;
            trackResult.data = retryTrackResult.data;
        } else {
            return {
                success: false,
                error: 'Failed to get track data',
                details: trackResult.error
            };
        }
    }
    
    // Step 4: Wait 2 seconds
    await sleep(2000);
    
    // Step 5: Convert track
    const convertResult = await convertTrack(spotifyUrl, csrfToken, cookies);
    if (!convertResult.success) {
        return {
            success: false,
            error: 'Failed to convert track',
            details: convertResult.error
        };
    }
    
    const convertData = convertResult.data;
    const trackData = trackResult.data;
    
    // Step 6: Extract download URL
    let downloadUrl = null;
    
    if (convertData.download_url) {
        downloadUrl = convertData.download_url;
    } else if (convertData.url) {
        downloadUrl = convertData.url;
    } else if (convertData.data && convertData.data.download_url) {
        downloadUrl = convertData.data.download_url;
    } else if (convertData.link) {
        downloadUrl = convertData.link;
    } else if (convertData.result && convertData.result.download_url) {
        downloadUrl = convertData.result.download_url;
    }
    
    if (!downloadUrl) {
        return {
            success: false,
            error: 'Could not extract download URL from response',
            raw_response: convertData
        };
    }
    
    return {
        success: true,
        track_info: trackData,
        download_url: downloadUrl,
        raw_response: {
            track_data: trackData,
            convert_data: convertData
        }
    };
}

// ====================================================
// HELPER FUNCTIONS
// ====================================================

// ✅ Sleep function for delays
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ✅ Extract cookies from headers
function extractCookies(headers) {
    const cookies = {};
    const cookieHeader = headers.get('set-cookie');
    
    if (cookieHeader) {
        const cookieArray = cookieHeader.split(', ');
        
        for (const cookie of cookieArray) {
            const parts = cookie.split(';')[0].split('=');
            if (parts.length >= 2) {
                cookies[parts[0].trim()] = parts[1].trim();
            }
        }
    }
    
    return cookies;
}

// ✅ Format cookies object to string
function formatCookies(cookies) {
    return Object.entries(cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
}

// ✅ Validate Spotify URL
function validateSpotifyUrl(url) {
    const patterns = [
        /https?:\/\/open\.spotify\.com\/track\/[a-zA-Z0-9]+/,
        /spotify:track:[a-zA-Z0-9]+/
    ];
    
    for (const pattern of patterns) {
        if (pattern.test(url)) {
            return true;
        }
    }
    return false;
}

// ✅ Generate UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// ====================================================
// ROUTE HANDLERS
// ====================================================

// ✅ API Documentation
function apiDocumentation(corsHeaders) {
    const docs = {
        "api_name": "SpotMate Professional API",
        "version": "2.0.0",
        "description": "Professional Spotify Music Downloader API (Cloudflare Worker)",
        "api_dev": "@ISmartCoder",
        "updates_channel": "@abirxdhackz",
        "developer": "Abir Arafat Chawdhury",
        "endpoints": {
            "/": {
                "method": "GET",
                "description": "API Documentation",
                "parameters": "None"
            },
            "/sp/dl": {
                "method": "GET",
                "description": "Download Spotify Track",
                "parameters": {
                    "url": {
                        "type": "string",
                        "required": true,
                        "description": "Spotify track URL",
                        "example": "https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1"
                    }
                },
                "example_request": "/sp/dl?url=https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1",
                "response_format": {
                    "success": "boolean",
                    "request_id": "string (UUID)",
                    "spotify_url": "string",
                    "track_info": {
                        "id": "string",
                        "name": "string",
                        "artists": "array",
                        "album": "object",
                        "duration_ms": "integer"
                    },
                    "download_url": "string",
                    "raw_response": "object",
                    "api_dev": "string",
                    "updates_channel": "string",
                    "timestamp": "integer"
                }
            },
            "/health": {
                "method": "GET",
                "description": "API Health Check",
                "parameters": "None"
            }
        },
        "response_codes": {
            "200": "Success",
            "400": "Bad Request - Missing or invalid parameters",
            "405": "Method Not Allowed",
            "404": "Endpoint Not Found",
            "500": "Internal Server Error"
        },
        "usage_examples": {
            "curl": "curl 'https://your-worker.workers.dev/sp/dl?url=https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1'",
            "javascript": "fetch('https://your-worker.workers.dev/sp/dl?url=https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1').then(res => res.json()).then(data => console.log(data))"
        },
        "notes": [
            "All responses are in JSON format",
            "Session caching is implemented (5 minutes)",
            "Download URLs are temporary and expire after some time",
            "Automatic retry on session failure"
        ],
        "support": {
            "telegram": "@abirxdhackz",
            "developer": "@ISmartCoder"
        },
        "worker_info": {
            "platform": "Cloudflare Workers",
            "original_code": "Flask Python Code Converted",
            "status": "Active & Working"
        }
    };
    
    return new Response(JSON.stringify(docs, null, 2), {
        status: 200,
        headers: corsHeaders
    });
}

// ✅ Health Check
function healthCheck(corsHeaders) {
    return new Response(JSON.stringify({
        "status": "healthy",
        "service": "SpotMate Professional API",
        "api_dev": "@ISmartCoder",
        "updates_channel": "@abirxdhackz",
        "timestamp": Math.floor(Date.now() / 1000),
        "worker_status": "Running on Cloudflare",
        "version": "2.0.0"
    }), {
        status: 200,
        headers: corsHeaders
    });
}

// ✅ Spotify Download Handler
async function handleSpotifyDownload(request, url, corsHeaders) {
    const requestId = generateUUID();
    const timestamp = Math.floor(Date.now() / 1000);
    const spotifyUrl = url.searchParams.get('url');
    
    // Check if URL parameter exists
    if (!spotifyUrl) {
        return new Response(JSON.stringify({
            "success": false,
            "error": "Missing required parameter: url",
            "request_id": requestId,
            "api_dev": "@ISmartCoder",
            "updates_channel": "@abirxdhackz",
            "timestamp": timestamp,
            "usage": "Add ?url=YOUR_SPOTIFY_URL to the request",
            "example": "/sp/dl?url=https://open.spotify.com/track/7e2dvR0ySx1bBJRDxVJiG1"
        }), {
            status: 400,
            headers: corsHeaders
        });
    }
    
    // Validate Spotify URL
    if (!validateSpotifyUrl(spotifyUrl)) {
        return new Response(JSON.stringify({
            "success": false,
            "error": "Invalid Spotify URL format",
            "request_id": requestId,
            "spotify_url": spotifyUrl,
            "api_dev": "@ISmartCoder",
            "updates_channel": "@abirxdhackz",
            "timestamp": timestamp,
            "expected_format": "https://open.spotify.com/track/TRACK_ID or spotify:track:TRACK_ID"
        }), {
            status: 400,
            headers: corsHeaders
        });
    }
    
    try {
        // Process the track
        const result = await processTrack(spotifyUrl);
        
        if (result.success) {
            const responseData = {
                "success": true,
                "request_id": requestId,
                "spotify_url": spotifyUrl,
                "track_info": result.track_info,
                "download_url": result.download_url,
                "raw_response": result.raw_response,
                "api_dev": "@ISmartCoder",
                "updates_channel": "@abirxdhackz",
                "developer": "Abir Arafat Chawdhury",
                "timestamp": timestamp,
                "message": "Track processed successfully",
                "worker_version": "2.0.0"
            };
            
            return new Response(JSON.stringify(responseData, null, 2), {
                status: 200,
                headers: corsHeaders
            });
        } else {
            return new Response(JSON.stringify({
                "success": false,
                "error": result.error || 'Unknown error',
                "details": result.details,
                "request_id": requestId,
                "spotify_url": spotifyUrl,
                "api_dev": "@ISmartCoder",
                "updates_channel": "@abirxdhackz",
                "timestamp": timestamp,
                "worker_note": "If you get 419 error, wait 5 minutes and try again (session timeout)"
            }), {
                status: 500,
                headers: corsHeaders
            });
        }
    } catch (error) {
        return new Response(JSON.stringify({
            "success": false,
            "error": "Internal server error",
            "details": error.message,
            "request_id": requestId,
            "spotify_url": spotifyUrl,
            "api_dev": "@ISmartCoder",
            "updates_channel": "@abirxdhackz",
            "timestamp": timestamp
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// ✅ 404 Not Found
function notFoundResponse(corsHeaders) {
    return new Response(JSON.stringify({
        "success": false,
        "error": "Endpoint not found",
        "available_endpoints": ["/", "/sp/dl", "/health"],
        "api_dev": "@ISmartCoder",
        "updates_channel": "@abirxdhackz",
        "timestamp": Math.floor(Date.now() / 1000)
    }), {
        status: 404,
        headers: corsHeaders
    });
}

// ✅ Error Response Helper
function errorResponse(message, status, corsHeaders) {
    return new Response(JSON.stringify({
        success: false,
        error: message,
        api_dev: "@ISmartCoder",
        updates_channel: "@abirxdhackz",
        timestamp: Math.floor(Date.now() / 1000)
    }), {
        status: status,
        headers: corsHeaders
    });
}