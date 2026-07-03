$ErrorActionPreference = "Stop"

$ExtId     = "hckdgbdlmlfabjhpgngnogdmnabopbkj"
$UpdateUrl = "https://rafanunesran.github.io/ProfSis3/extensao-profsis/dist/update.xml"
$RegPath   = "HKCU:\Software\Policies\Google\Chrome\ExtensionSettings"

Write-Host ""
Write-Host "=== Instalador da Extensao ProfSis3 ===" -ForegroundColor Cyan
Write-Host ""

$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
$chromeFound = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chromeFound) {
    Write-Host "Nao encontramos o Google Chrome neste computador." -ForegroundColor Red
    Write-Host "Instale o Chrome em https://www.google.com/chrome/ e rode este instalador de novo."
    exit 1
}

Write-Host "Chrome encontrado em: $chromeFound"
Write-Host "Configurando a extensao para instalar e se atualizar sozinha..."

$settingsForExt = @{
    installation_mode    = "force_installed"
    update_url           = $UpdateUrl
    toolbar_pin           = "force_pinned"
    override_update_url  = $true
}
$json = $settingsForExt | ConvertTo-Json -Depth 5 -Compress

try {
    New-Item -Path $RegPath -Force -ErrorAction Stop | Out-Null
    New-ItemProperty -Path $RegPath -Name $ExtId -PropertyType String -Value $json -Force -ErrorAction Stop | Out-Null
} catch {
    Write-Host "Nao foi possivel configurar a politica do Chrome:" -ForegroundColor Red
    Write-Host $_
    Write-Host ""
    Write-Host "Isso pode acontecer se este computador nao permitir elevar para administrador" -ForegroundColor Yellow
    Write-Host "(ex: conta de escola/empresa sem permissao). Nesse caso, use a instalacao manual:"
    Write-Host "1. Peca para o suporte de TI da escola, OU"
    Write-Host "2. Va na tela do ProfSis3 e use o link 'Modo avancado' para instalar sem precisar de administrador."
    exit 1
}

Write-Host ""
Write-Host "Configuracao concluida com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "IMPORTANTE:" -ForegroundColor Yellow
Write-Host "1. Feche TODAS as janelas do Chrome (confira tambem a bandeja do sistema, perto do relogio)."
Write-Host "2. Abra o Chrome novamente. A extensao ProfSis3 vai aparecer sozinha em poucos segundos."
Write-Host "3. Se voce ja usava a extensao instalada manualmente (modo desenvolvedor), va em"
Write-Host "   chrome://extensions e REMOVA a versao antiga para evitar conflito com a nova."
Write-Host ""
Write-Host "Dica: se nao quiser fechar o Chrome agora, va em chrome://policy e clique em 'Recarregar politicas'."
Write-Host ""

$resp = Read-Host "Quer que eu feche o Chrome agora para voce? (S/N)"
if ($resp -match '^[sS]') {
    Get-Process chrome -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Start-Process $chromeFound
    Write-Host "Chrome reiniciado. Aguarde alguns segundos e confira a extensao." -ForegroundColor Green
}
