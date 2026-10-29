# Servidor web local para la presentación (no necesita Python ni instalar nada).
# Sirve solo los archivos de esta carpeta y solo en localhost. Cerrar la ventana lo detiene.
param([int]$Puerto = 8200, [switch]$SinAbrir)

$raiz = [IO.Path]::GetFullPath($PSScriptRoot + [IO.Path]::DirectorySeparatorChar)
$tipos = @{
    '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
    '.json' = 'application/json; charset=utf-8'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.svg' = 'image/svg+xml'
    '.glb' = 'model/gltf-binary'; '.ico' = 'image/x-icon'
}

# primer puerto libre entre $Puerto y $Puerto+10
$listener = $null
foreach ($p in $Puerto..($Puerto + 10)) {
    $l = New-Object System.Net.HttpListener
    $l.Prefixes.Add("http://localhost:$p/")
    try { $l.Start(); $listener = $l; $Puerto = $p; break } catch { $l.Close() }
}
if (-not $listener) { Write-Host "No hay un puerto libre entre $Puerto y $($Puerto + 10)."; Read-Host 'Enter para salir'; exit 1 }

$url = "http://localhost:$Puerto/index.html"
Write-Host ''
Write-Host '  Control de calidad de etiquetas - presentacion FACULTAD (importacion)' -ForegroundColor Cyan
Write-Host "  Abierta en $url"
Write-Host '  Deja esta ventana abierta mientras presentas; cerrala para terminar.'
Write-Host ''
if (-not $SinAbrir) { Start-Process $url }

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
        $ruta = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
        if ($ruta -eq '') { $ruta = 'index.html' }
        $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
        # nada fuera de esta carpeta (evita rutas con ..)
        if (-not $archivo.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $archivo -PathType Leaf)) {
            $res.StatusCode = 404
        } else {
            $bytes = [IO.File]::ReadAllBytes($archivo)
            $ext = [IO.Path]::GetExtension($archivo).ToLower()
            $res.ContentType = $(if ($tipos.ContainsKey($ext)) { $tipos[$ext] } else { 'application/octet-stream' })
            $res.Headers.Add('Cache-Control', 'no-cache')
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
        }
    } catch {
        $res.StatusCode = 500
    } finally {
        $res.Close()
    }
}
