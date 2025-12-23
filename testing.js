addEventListener("fetch", event => {
  event.respondWith(handleRequest(event.request))
})

const DEEPSWAP_API = "https://api.deepswapper.com/swap"

const SECURITY_PAYLOAD = {
  token: "0.ufDEMbVMT7mc9_XLsFDSK5CQqdj9Cx_Zjww0DevIvXN5M4fXQr3B9YtPdGkKAHjXBK6UC9rFcEbZbzCfkxxgmdTYV8iPzTby0C03dTKv5V9uXFYfwIVlqwNbIsfOK_rLRHIPB31bQ0ijSTEd-lLbllf3MkEcpkEZFFmmq8HMAuRuliCXFEdCwEB1HoYSJtvJEmDIVsooU3gYdrCm5yOJ8_lZ4DiHCSvy7P8-YxwJKkapJNCMUCFIfJbWDkDzvh8DGPyTRoHbURX8kClfImmPrGcqlfd7kkoNRcudS25IbNf1CGBsh8V96MtEhnTZvOpZfnp5dpV7MfgwOgvx7hUazUaC_wxQE63Aa0uOPuGvJ70BNrmeZIIrY9roD1Koj316L4g2BZ_LLZZF11wcrNNon8UXB0iVudiNCJyDQCxLUmblXUpt4IUvRoiOqXBNtWtLqY0su0ieVB0jjyDf_-zs7wc8WQ_jqp-NsTxgKOgvZYWV6Elz_lf4cNxGHZJ5BdcyLEoRBH3cksvwoncmYOy5Ulco22QT-x2z06xVFBZYZMVulxAcmvQemKfSFKsNaDxwor35p-amn9Vevhyb-GzA_oIoaTmc0fVXSshax2rdFQHQms86fZ_jkTieRpyIuX0mI3C5jLGIiOXzWxNgax9eZeQstYjIh8BIdMiTIUHfyKVTgtoLbK0hjTUTP0xDlCLnOt5qHdwe_iTWedBsswAJWYdtIxw0YUfIU22GMYrJoekOrQErawNlU5yT-LhXquBQY3EBtEup4JMWLendSh68d6HqjN2T3sAfVw0nY5jg7_5LJwj5gqEk57devNN8GGhogJpfdGzYoNGja22IZIuDnPPmWTpGx4VcLOLknSHrzio.tXUN6eooS69z3QtBp-DY1g.d882822dfe05be2b36ed1950554e1bac753abfe304a289adc4289b3f0d517356",
  type: "invisible",
  id: "deepswapper"
}

async function handleRequest(request) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: cors()
    })
  }

  if (request.method === "GET") {
    return json({
      status: "running",
      usage: "POST /swap { source:url , target:url }"
    })
  }

  if (request.method === "POST" && request.url.endsWith("/swap")) {
    try {
      const body = await request.json()
      const sourceUrl = body.source
      const targetUrl = body.target

      if (!sourceUrl || !targetUrl) {
        return json({ error: "source and target required" }, 400)
      }

      const srcRes = await fetch(sourceUrl)
      const tgtRes = await fetch(targetUrl)

      if (!srcRes.ok || !tgtRes.ok) {
        return json({ error: "image fetch failed" }, 400)
      }

      const srcBase64 = toBase64(await srcRes.arrayBuffer())
      const tgtBase64 = toBase64(await tgtRes.arrayBuffer())

      const payload = {
        source: srcBase64,
        target: tgtBase64,
        security: SECURITY_PAYLOAD
      }

      const apiRes = await fetch(DEEPSWAP_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0"
        },
        body: JSON.stringify(payload)
      })

      if (!apiRes.ok) {
        return json({ error: "deepswap failed" }, 500)
      }

      const data = await apiRes.json()
      if (!data.result) {
        return json({ error: "no image result" }, 500)
      }

      const imgData = data.result.split(",")[1] || data.result
      const buffer = fromBase64(imgData)

      return new Response(buffer, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "no-store",
          "Access-Control-Allow-Origin": "*"
        }
      })

    } catch (e) {
      return json({ error: e.message }, 500)
    }
  }

  return json({ error: "not found" }, 404)
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors()
    }
  })
}

function toBase64(buffer) {
  let bin = ""
  let bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i])
  }
  return btoa(bin)
}

function fromBase64(b64) {
  let bin = atob(b64)
  let bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i)
  }
  return bytes.buffer
}