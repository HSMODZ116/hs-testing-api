export default {
    async fetch(request, env, ctx) {
        // Sirf GET requests allow karein
        if (request.method !== 'GET') {
            return new Response(JSON.stringify({
                success: false,
                error: 'Only GET method is allowed',
                status: 405
            }), {
                status: 405,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // URL aur query parameters
        const url = new URL(request.url);
        const searchNumber = url.searchParams.get('num');

        // Number parameter check
        if (!searchNumber) {
            return new Response(JSON.stringify({
                success: false,
                error: 'Number parameter missing',
                usage: 'GET /?num=03001234567',
                examples: [
                    'Jazz: /?num=03051234567',
                    'Telenor: /?num=03451234567',
                    'CNIC: /?num=4220112345678'
                ]
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
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
        // Invalid number
        else {
            return new Response(JSON.stringify({
                success: false,
                error: 'Invalid number format',
                query: searchNumber,
                valid_formats: {
                    jazz: '0300-0309, 0320-0329',
                    telenor: '0340-0349',
                    zong: '0310-0319',
                    ufone: '0330-0339',
                    cnic: '13 digits only'
                }
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
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
                    address: apiData.data.address || '', // ✅ AS-IS
                    network: network
                }];
            } 
            else if (provider === 'Zong' || provider === 'Ufone') {
                // Zong/Ufone format conversion
                standardizedData = (apiData.data || []).map(record => ({
                    number: record.number || searchNumber,
                    name: record.name || '',
                    cnic: record.cnic || '',
                    address: record.address || '', // ✅ AS-IS
                    network: network
                }));
            } 
            else if (provider === 'Jazz' || provider === 'CNIC') {
                // Jazz/CNIC format conversion
                standardizedData = (apiData.data?.records || []).map(record => ({
                    number: record.mobile || searchNumber,
                    name: record.name || '',
                    cnic: record.cnic || '',
                    address: record.address || '', // ✅ AS-IS
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
                            address: record.address, // ✅ AS-IS (no formatting)
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
                            'Cache-Control': 'max-age=300'
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
                            address: mainRecord.address, // ✅ AS-IS (no formatting)
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
                            'Cache-Control': 'max-age=300'
                        }
                    });
                }
            } else {
                // No records found
                return new Response(JSON.stringify({
                    success: true,
                    query: searchNumber,
                    result: null,
                    message: 'No records found for this number',
                    meta: {
                        timestamp: new Date().toISOString(),
                        developer: 'Haseeb Sahil',
                        credit: '@hsmodzofc2'
                    }
                }, null, 2), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Cache-Control': 'max-age=300'
                    }
                });
            }

        } catch (error) {
            // Error handling in same style
            return new Response(JSON.stringify({
                success: false,
                query: searchNumber,
                error: 'Failed to fetch data',
                message: error.message,
                meta: {
                    timestamp: new Date().toISOString(),
                    developer: 'Haseeb Sahil',
                    credit: '@hsmodzofc2'
                }
            }, null, 2), {
                status: 502,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
    // ❌ formatAddress function REMOVED
};