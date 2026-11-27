param(
    [string]$KeyPath = (Join-Path $env:USERPROFILE '.android\moneytracker-release.pfx'),
    [string]$PasswordPath = (Join-Path $env:USERPROFILE '.android\moneytracker-release-passwords.txt')
)

$ErrorActionPreference = 'Stop'
$parent = Split-Path -Parent $KeyPath
New-Item -ItemType Directory -Path $parent -Force | Out-Null
if ((Test-Path -LiteralPath $KeyPath) -or (Test-Path -LiteralPath $PasswordPath)) {
    throw 'Ключ или файл паролей уже существует. Скрипт не перезаписывает постоянный ключ подписи.'
}

$randomBytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($randomBytes)
$password = [Convert]::ToBase64String($randomBytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$securePassword = ConvertTo-SecureString $password -AsPlainText -Force
$certificate = $null

try {
    $certificate = New-SelfSignedCertificate `
        -Type CodeSigningCert `
        -Subject 'CN=MoneyTracker Android Release' `
        -FriendlyName 'moneytracker-release' `
        -CertStoreLocation 'Cert:\CurrentUser\My' `
        -KeyAlgorithm RSA `
        -KeyLength 4096 `
        -HashAlgorithm SHA256 `
        -KeyExportPolicy Exportable `
        -NotAfter (Get-Date).AddYears(20)

    Export-PfxCertificate `
        -Cert $certificate `
        -FilePath $KeyPath `
        -Password $securePassword `
        -ChainOption EndEntityCertOnly | Out-Null

    @(
        'Alias: moneytracker-release'
        "Store password: $password"
        "Key password: $password"
    ) | Set-Content -LiteralPath $PasswordPath -Encoding UTF8

    $encoded = [Convert]::ToBase64String([IO.File]::ReadAllBytes($KeyPath))
    Set-Clipboard -Value $encoded
    Write-Host "Keystore сохранён вне репозитория: $KeyPath"
    Write-Host "Пароли сохранены вне репозитория: $PasswordPath"
    Write-Host 'Base64 keystore скопирован в буфер обмена для секрета ANDROID_KEYSTORE_BASE64.'
    Write-Host 'Добавьте секреты ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS и ANDROID_KEY_PASSWORD.'
    Write-Host 'Для alias и обоих паролей значения записаны в файл паролей.'
    Write-Host 'GitHub Settings: https://github.com/Rydnichanin/MoneyTracker/settings/secrets/actions'
} catch {
    Remove-Item -LiteralPath $KeyPath -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $PasswordPath -ErrorAction SilentlyContinue
    throw
} finally {
    if ($certificate) {
        Remove-Item -LiteralPath "Cert:\CurrentUser\My\$($certificate.Thumbprint)" -ErrorAction SilentlyContinue
    }
}
