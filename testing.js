// Cloudflare Worker for SpotMate Professional API
// Version: 1.0.0
// Developer: Abir Arafat Chawdhury
// API Dev: @ISmartCoder
// Updates Channel: @abirxdhackz

const BASE_URL = "https://spotmate.online";

// User-Agent headers for mobile browser simulation
const HEADERS = {
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
    'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8',
    'priority': 'u=1, i'
};

// Validate Spotify URL
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

// Initialize session and get CSRF token
async function initSession() {
    try {
        const response = await fetch(`${BASE_URL}/en1`, {
            headers: HEADERS,
            redirect: 'follow'
        });

        if (response.ok) {
            const html = await response.text();
            
            // Extract CSRF token from HTML
            const csrfMatch = html.match(/name="csrf-token"\s+content="([^"]+)"/);
            const csrfToken = csrfMatch ? csrfMatch[1] : null;
            
            // Get cookies from response
            const cookies = {};
            const cookieHeaders = response.headers.get('set-cookie');
            if (cookieHeaders) {
                const cookieArray = cookieHeaders.split(',');
                for (const cookie of cookieArray) {
                    const parts = cookie.split(';')[0].split('=');
                    if (parts.length >= 2) {
                        cookies[parts[0].trim()] = parts[1].trim();
                    }
                }
            }

            return {
                success: true,
                cookies: cookies,
                csrf_token: csrfToken
            };
        } else {
            return {
                success: false,
                error: `Status code: ${response.status}`
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Get track data from Spotify URL
async function getTrackData(spotifyUrl, csrfToken, cookies) {
    try {
        // Convert cookies object to string
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');

        const headers = {
            ...API_HEADERS,
            'x-csrf-token': csrfToken,
            'referer': `${BASE_URL}/en1`,
            'cookie': cookieString
        };

        const payload = {
            spotify_url: spotifyUrl
        };

        const response = await fetch(`${BASE_URL}/getTrackData`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                data: data
            };
        } else {
            return {
                success: false,
                error: `Status code: ${response.status}`
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Convert track to downloadable format
async function convertTrack(spotifyUrl, csrfToken, cookies) {
    try {
        // Convert cookies object to string
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');

        const headers = {
            ...API_HEADERS,
            'x-csrf-token': csrfToken,
            'referer': `${BASE_URL}/en1`,
            'cookie': cookieString
        };

        const payload = {
            urls: spotifyUrl
        };

        const response = await fetch(`${BASE_URL}/convert`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            return {
                success: true,
                data: data
            };
        } else {
            return {
                success: false,
                error: `Status code: ${response.status}`
            };
        }
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Process track - main function
async function processTrack(spotifyUrl) {
    try {
        // Initialize session
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

        // Wait for 1 second
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Get track data
        const trackResult = await getTrackData(spotifyUrl, csrfToken, cookies);
        if (!trackResult.success) {
            return {
                success: false,
                error: 'Failed to get track data',
                details: trackResult.error
            };
        }

        // Wait for 2 seconds
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Convert track
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

        // Extract download URL
        let downloadUrl = null;
        if (convertData.download_url) {
            downloadUrl = convertData.download_url;
        } else if (convertData.url) {
            downloadUrl = convertData.url;
        } else if (convertData.data && convertData.data.download_url) {
            downloadUrl = convertData.data.download_url;
        }

        if (!downloadUrl) {
            return {
                success: false,
                error: 'Could not extract download URL'
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
    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

// Generate UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// API Documentation
function getApiDocumentation() {
    return {
        api_name: "SpotMate Professional API",
        version: "1.0.0",
        description: "Professional Spotify Music Downloader API",
        api_dev: "@ISmartCoder",
        updates_channel: "@abirxdhackz",
        developer: "Abir Arafat Chawdhury",
        endpoints: {
            "/": {
                method: "GET",
                description: "API Documentation",
                parameters: "None"
            },
            "/sp/dl": {
                method: "GET",
                description: "Download Spotify Track",
                parameters: {
                    url: {
                        type: "string",
                        required: true,
                        description: "Spotify track URL",
                        example: "https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di"
                    }
                },
                example_request: "/sp/dl?url=https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di",
                response_format: {
                    success: "boolean",
                    request_id: "string (UUID)",
                    spotify_url: "string",
                    track_info: {
                        id: "string",
                        name: "string",
                        artists: "array",
                        album: "object",
                        duration_ms: "integer"
                    },
                    download_url: "string",
                    raw_response: "object",
                    api_dev: "string",
                    updates_channel: "string",
                    timestamp: "integer"
                }
            }
        },
        response_codes: {
            "200": "Success",
            "400": "Bad Request - Missing or invalid parameters",
            "500": "Internal Server Error"
        },
        usage_examples: {
            curl: "curl 'https://your-worker.workers.dev/sp/dl?url=https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di'",
            javascript: "fetch('https://your-worker.workers.dev/sp/dl?url=https://open.spotify.com/track/56zZ48jdyY2oDXHVnwg5Di').then(res => res.json()).then(data => console.log(data))"
        },
        notes: [
            "All responses are in JSON format",
            "Download URLs are temporary and expire after some time"
        ],
        support: {
            telegram: "@abirxdhackz",
            developer: "@ISmartCoder"
        }
    };
}

// Main Cloudflare Worker handler
export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;
        
        // Allow only GET method
        if (method !== 'GET') {
            return new Response(JSON.stringify({
                success: false,
                error: "Method not allowed. Only GET method is supported.",
                allowed_methods: ["GET"],
                api_dev: "@ISmartCoder",
                updates_channel: "@abirxdhackz",
                timestamp: Math.floor(Date.now() / 1000)
            }), {
                status: 405,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET'
                }
            });
        }
        
        // Set CORS headers for all responses
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'Content-Type': 'application/json'
        };
        
        // Home route - API Documentation
        if (path === '/') {
            return new Response(JSON.stringify(getApiDocumentation()), {
                status: 200,
                headers: corsHeaders
            });
        }
        
        // Health check route
        if (path === '/health') {
            return new Response(JSON.stringify({
                status: "healthy",
                service: "SpotMate Professional API",
                api_dev: "@ISmartCoder",
                updates_channel: "@abirxdhackz",
                timestamp: Math.floor(Date.now() / 1000)
            }), {
                status: 200,
                headers: corsHeaders
            });
        }
        
        // Download Spotify track route
        if (path === '/sp/dl') {
            const requestId = generateUUID();
            const timestamp = Math.floor(Date.now() / 1000);
            const spotifyUrl = url.searchParams.get('url');
            
            // Check if URL parameter is provided
            if (!spotifyUrl) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "Missing required parameter: url",
                    request_id: requestId,
                    api_dev: "@ISmartCoder",
                    updates_channel: "@abirxdhackz",
                    timestamp: timestamp,
                    usage: "Add ?url=YOUR_SPOTIFY_URL to the request"
                }), {
                    status: 400,
                    headers: corsHeaders
                });
            }
            
            // Validate Spotify URL
            if (!validateSpotifyUrl(spotifyUrl)) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "Invalid Spotify URL format",
                    request_id: requestId,
                    spotify_url: spotifyUrl,
                    api_dev: "@ISmartCoder",
                    updates_channel: "@abirxdhackz",
                    timestamp: timestamp,
                    expected_format: "https://open.spotify.com/track/XXXXXXXXX"
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
                        success: true,
                        request_id: requestId,
                        spotify_url: spotifyUrl,
                        track_info: result.track_info,
                        download_url: result.download_url,
                        raw_response: result.raw_response,
                        api_dev: "@ISmartCoder",
                        updates_channel: "@abirxdhackz",
                        developer: "Abir Arafat Chawdhury",
                        timestamp: timestamp,
                        message: "Track processed successfully"
                    };
                    
                    return new Response(JSON.stringify(responseData), {
                        status: 200,
                        headers: corsHeaders
                    });
                } else {
                    return new Response(JSON.stringify({
                        success: false,
                        error: result.error || 'Unknown error',
                        details: result.details,
                        request_id: requestId,
                        spotify_url: spotifyUrl,
                        api_dev: "@ISmartCoder",
                        updates_channel: "@abirxdhackz",
                        timestamp: timestamp
                    }), {
                        status: 500,
                        headers: corsHeaders
                    });
                }
            } catch (error) {
                return new Response(JSON.stringify({
                    success: false,
                    error: "Internal server error",
                    details: error.message,
                    request_id: requestId,
                    spotify_url: spotifyUrl,
                    api_dev: "@ISmartCoder",
                    updates_channel: "@abirxdhackz",
                    timestamp: timestamp
                }), {
                    status: 500,
                    headers: corsHeaders
                });
            }
        }
        
        // Handle 404 - Not Found
        return new Response(JSON.stringify({
            success: false,
            error: "Endpoint not found",
            available_endpoints: ["/", "/sp/dl", "/health"],
            api_dev: "@ISmartCoder",
            updates_channel: "@abirxdhackz",
            timestamp: Math.floor(Date.now() / 1000)
        }), {
            status: 404,
            headers: corsHeaders
        });
    }
};