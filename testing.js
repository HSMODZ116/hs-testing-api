export default {
    async fetch(request, env, ctx) {
        // CORS headers - For preflight requests
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        };

        // Handle OPTIONS request (preflight)
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: corsHeaders
            });
        }

        // Sirf GET requests allow karein
        if (request.method !== 'GET') {
            return new Response(JSON.stringify({
                "error": true,
                "message": "Only GET method is allowed",
                "fix": "Use GET method instead",
                "developer": "Haseeb Sahil",
                "channel": "@hsmodzofc2"
            }, null, 2), {
                status: 405,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }

        // URL aur query parameters
        const url = new URL(request.url);
        const searchNumber = url.searchParams.get('num');

        // Number parameter check
        if (!searchNumber) {
            return new Response(JSON.stringify({
                "error": true,
                "message": "Phone number parameter is missing",
                "fix": "Use: /?num=03051234567",
                "examples": ["03051234567", "03451234567", "4220112345678"],
                "developer": "Haseeb Sahil",
                "channel": "@hsmodzofc2"
            }, null, 2), {
                status: 400,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }

        // Provider identification logic
        let apiUrl = '';
        let provider = '';
        let network = '';

        // 1. CNIC - 13 digits only
        if (/^\d{13}$/.test(searchNumber)) {
            provider = 'CNIC';
            network = 'Multiple';
            apiUrl = `https://jazz-cnic-database-api.haseeb-sahil.workers.dev/?num=${searchNumber}`;
        }
        // 2. Jazz (0300-0309, 0320-0329)
        else if (/^03(0[0-9]|2[0-9])\d+$/.test(searchNumber)) {
            provider = 'Jazz';
            network = 'Jazz';
            apiUrl = `https://jazz-cnic-database-api.haseeb-sahil.workers.dev/?num=${searchNumber}`;
        }
        // 3. Telenor (0340-0349)
        else if (/^034[0-9]\d+$/.test(searchNumber)) {
            provider = 'Telenor';
            network = 'Telenor';
            apiUrl = `https://telenor-database-api.haseeb-sahil.workers.dev/?num=${searchNumber}`;
        }
        // 4. Zong (0310-0319)
        else if (/^031[0-9]\d+$/.test(searchNumber)) {
            provider = 'Zong';
            network = 'Zong';
            apiUrl = `https://ahmadmodstools.online/PublicApis/SimDataBase.php?num=${searchNumber}`;
        }
        // 5. Ufone (0330-0339)
        else if (/^033[0-9]\d+$/.test(searchNumber)) {
            provider = 'Ufone';
            network = 'Ufone';
            apiUrl = `https://ahmadmodstools.online/PublicApis/SimDataBase.php?num=${searchNumber}`;
        }
        // Invalid number - ✅ UPDATED WITH NEW ERROR RESPONSE
        else {
            return new Response(JSON.stringify({
                "invalid_input": true,
                "description": "Provided input format is incorrect",
                "expected_pattern": "Pakistan standard formats",
                "try_these": "Mobile: 03XXXXXXXXX, CNIC: 13 digits",
                "credits": "Haseeb Sahil - @hsmodzofc2"
            }, null, 2), {
                status: 400,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }

        try {
            // External API call karein
            const apiResponse = await fetch(apiUrl);
            
            if (!apiResponse.ok) {
                throw new Error(`API returned ${apiResponse.status}`);
            }
            
            const apiData = await apiResponse.json();
            
            // 📦 STANDARDIZE RESPONSE BASED ON PROVIDER
            let standardizedData = [];
            
            if (provider === 'Telenor') {
                // Telenor format conversion
                standardizedData = [{
                    number: apiData.data.mobile || searchNumber,
                    name: apiData.data.name || '',
                    cnic: apiData.data.cnic || '',
                    address: apiData.data.address || '',
                    network: network
                }];
            } 
            else if (provider === 'Zong' || provider === 'Ufone') {
                // Zong/Ufone format conversion
                standardizedData = (apiData.data || []).map(record => ({
                    number: record.number || searchNumber,
                    name: record.name || '',
                    cnic: record.cnic || '',
                    address: record.address || '',
                    network: network
                }));
            } 
            else if (provider === 'Jazz' || provider === 'CNIC') {
                // Jazz/CNIC format conversion
                standardizedData = (apiData.data?.records || []).map(record => ({
                    number: record.mobile || searchNumber,
                    name: record.name || '',
                    cnic: record.cnic || '',
                    address: record.address || '',
                    network: provider === 'CNIC' ? 'Multiple' : network
                }));
            }

            // 🎨 "For General Use" STYLE RESPONSE
            if (standardizedData.length > 0) {
                // Multiple records (CNIC case) ke liye array format
                if (provider === 'CNIC' && standardizedData.length > 1) {
                    return new Response(JSON.stringify({
                        success: true,
                        query: searchNumber,
                        type: 'cnic_lookup',
                        results: standardizedData.map(record => ({
                            name: record.name,
                            cnic: record.cnic,
                            address: record.address,
                            network: record.network,
                            number: record.number
                        })),
                        count: standardizedData.length,
                        meta: {
                            timestamp: new Date().toISOString(),
                            developer: 'Haseeb Sahil',
                            credit: '@hsmodzofc2',
                            note: 'CNIC may have multiple mobile numbers'
                        }
                    }, null, 2), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'max-age=300',
                            ...corsHeaders
                        }
                    });
                } 
                else {
                    // Single record (normal mobile number) ke liye
                    const mainRecord = standardizedData[0];
                    
                    return new Response(JSON.stringify({
                        success: true,
                        query: searchNumber,
                        result: {
                            name: mainRecord.name,
                            cnic: mainRecord.cnic,
                            address: mainRecord.address,
                            network: mainRecord.network
                        },
                        meta: {
                            timestamp: new Date().toISOString(),
                            developer: 'Haseeb Sahil',
                            credit: '@hsmodzofc2'
                        }
                    }, null, 2), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Cache-Control': 'max-age=300',
                            ...corsHeaders
                        }
                    });
                }
            } else {
                // No records found
                return new Response(JSON.stringify({
                    "error": true,
                    "message": "No records found for this number",
                    "query": searchNumber,
                    "suggestion": "Try another valid Pakistan number",
                    "developer": "Haseeb Sahil",
                    "channel": "@hsmodzofc2"
                }, null, 2), {
                    status: 404,
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'max-age=300',
                        ...corsHeaders
                    }
                });
            }

        } catch (error) {
            // Error handling
            return new Response(JSON.stringify({
                "error": true,
                "message": "Failed to fetch data from database",
                "query": searchNumber,
                "fix": "Please try again later",
                "developer": "Haseeb Sahil",
                "channel": "@hsmodzofc2"
            }, null, 2), {
                status: 502,
                headers: { 
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
    }
};