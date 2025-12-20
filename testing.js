export default {
    async fetch(request, env, ctx) {
        // Sirf GET requests allow karein
        if (request.method !== 'GET') {
            return new Response(JSON.stringify({
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

        // 1. CNIC - 13 digits only
        if (/^\d{13}$/.test(searchNumber)) {
            provider = 'CNIC';
            apiUrl = `https://jazz-cnic-database-api.haseeb-sahil.workers.dev/?num=${searchNumber}`;
        }
        // 2. Jazz (0300-0309, 0320-0329)
        else if (/^03(0[0-9]|2[0-9])\d+$/.test(searchNumber)) {
            const prefix = searchNumber.substring(0, 4);
            provider = 'Jazz';
            apiUrl = `https://jazz-cnic-database-api.haseeb-sahil.workers.dev/?num=${searchNumber}`;
        }
        // 3. Telenor (0340-0349)
        else if (/^034[0-9]\d+$/.test(searchNumber)) {
            provider = 'Telenor';
            apiUrl = `https://telenor-database-api.haseeb-sahil.workers.dev/?num=${searchNumber}`;
        }
        // 4. Zong (0310-0319)
        else if (/^031[0-9]\d+$/.test(searchNumber)) {
            provider = 'Zong';
            apiUrl = `https://ahmadmodstools.online/PublicApis/SimDataBase.php?num=${searchNumber}`;
        }
        // 5. Ufone (0330-0339) - ✅ UPDATED
        else if (/^033[0-9]\d+$/.test(searchNumber)) {
            provider = 'Ufone';
            apiUrl = `https://ahmadmodstools.online/PublicApis/SimDataBase.php?num=${searchNumber}`;
        }
        // Invalid number
        else {
            return new Response(JSON.stringify({
                error: 'Invalid number format',
                number: searchNumber,
                valid_formats: {
                    jazz: '0300-0309, 0320-0329',
                    telenor: '0340-0349',
                    zong: '0310-0319',
                    ufone: '0330-0339', // ✅ UPDATED
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

            // Final response
            return new Response(JSON.stringify({
                success: true,
                provider: provider,
                number: searchNumber,
                timestamp: new Date().toISOString(),
                data: apiData
            }), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'max-age=300'
                }
            });

        } catch (error) {
            // Error handling
            return new Response(JSON.stringify({
                success: false,
                error: 'Failed to fetch data',
                provider: provider,
                number: searchNumber,
                message: error.message
            }), {
                status: 502,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
};