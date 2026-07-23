param(
  [ValidateSet('patch', 'minor', 'major')]
  [string]$Bump = 'patch',
  [string]$Version,
  [string]$Message,
  [switch]$SkipTests,
  [switch]$SkipPush,
  [switch]$SkipBuild,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
  $scriptPath = $MyInvocation.ScriptName
  if (-not $scriptPath) { throw 'Cannot resolve script path.' }
  return Split-Path -Parent $scriptPath
}

function Parse-Semver([string]$value) {
  if ($value -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
    throw "Invalid semantic version: $value"
  }
  return [PSCustomObject]@{
    Major = [int]$Matches[1]
    Minor = [int]$Matches[2]
    Patch = [int]$Matches[3]
  }
}

function Bump-Semver([string]$current, [string]$bumpKind) {
  $v = Parse-Semver $current
  switch ($bumpKind) {
    'major' { $v.Major += 1; $v.Minor = 0; $v.Patch = 0 }
    'minor' { $v.Minor += 1; $v.Patch = 0 }
    default { $v.Patch += 1 }
  }
  return "$($v.Major).$($v.Minor).$($v.Patch)"
}

function Write-Utf8NoBom([string]$path, [string]$content) {
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($path, $content, $enc)
}

function Replace-OrThrow([string]$content, [string]$pattern, [string]$replacement, [string]$label) {
  $newContent = [regex]::Replace($content, $pattern, $replacement)
  if ($newContent -eq $content) {
    throw "Pattern not found for $label"
  }
  return $newContent
}

function Replace-IfFound([string]$content, [string]$pattern, [string]$replacement, [string]$label) {
  if ($content -notmatch $pattern) {
    Write-Host "Warning: skipped optional update for $label"
    return $content
  }
  return [regex]::Replace($content, $pattern, $replacement)
}

$repoRoot = Get-RepoRoot
Set-Location $repoRoot

$appConfigPath = Join-Path $repoRoot 'mobile/app.config.js'
$appJsonPath = Join-Path $repoRoot 'mobile/app.json'
$backendAppRoutePath = Join-Path $repoRoot 'backend/routes/app.js'
$renderYamlPath = Join-Path $repoRoot 'render.yaml'
$aboutScreenPath = Join-Path $repoRoot 'mobile/src/screens/AboutScreen.js'
$loginScreenPath = Join-Path $repoRoot 'mobile/src/screens/LoginScreen.js'

$appConfig = Get-Content -Raw -Path $appConfigPath
if ($appConfig -notmatch 'version:\s*"(\d+\.\d+\.\d+)"') {
  throw 'Could not read version from mobile/app.config.js'
}
$currentVersion = $Matches[1]

if ($appConfig -notmatch 'buildNumber:\s*"(\d+)"') {
  throw 'Could not read iOS buildNumber from mobile/app.config.js'
}
$currentBuildNumber = [int]$Matches[1]

if ($appConfig -notmatch 'versionCode:\s*(\d+)') {
  throw 'Could not read android versionCode from mobile/app.config.js'
}
$currentVersionCode = [int]$Matches[1]

$newVersion = if ($Version) { $Version } else { Bump-Semver -current $currentVersion -bumpKind $Bump }
$newBuildNumber = $currentBuildNumber + 1
$newVersionCode = $currentVersionCode + 1
$todayLabel = (Get-Date).ToString('dd.MM.yyyy')

Write-Host "Current version: $currentVersion ($currentBuildNumber/$currentVersionCode)"
Write-Host "New version:     $newVersion ($newBuildNumber/$newVersionCode)"

$appConfig = Replace-OrThrow $appConfig 'version:\s*"\d+\.\d+\.\d+"' "version: \"$newVersion\"" 'app.config.js version'
$appConfig = Replace-OrThrow $appConfig 'buildNumber:\s*"\d+"' "buildNumber: \"$newBuildNumber\"" 'app.config.js ios buildNumber'
$appConfig = Replace-OrThrow $appConfig 'versionCode:\s*\d+' "versionCode: $newVersionCode" 'app.config.js android versionCode'

$appJson = Get-Content -Raw -Path $appJsonPath
$appJson = Replace-OrThrow $appJson '"version"\s*:\s*"\d+\.\d+\.\d+"' "\"version\": \"$newVersion\"" 'app.json version'
$appJson = Replace-OrThrow $appJson '"buildNumber"\s*:\s*"\d+"' "\"buildNumber\": \"$newBuildNumber\"" 'app.json ios buildNumber'
$appJson = Replace-OrThrow $appJson '"versionCode"\s*:\s*\d+' "\"versionCode\": $newVersionCode" 'app.json android versionCode'

$backendAppRoute = Get-Content -Raw -Path $backendAppRoutePath
$backendAppRoute = Replace-OrThrow $backendAppRoute "LATEST_APP_VERSION \|\| '[^']+'" "LATEST_APP_VERSION || '$newVersion'" 'backend app latest version fallback'
$backendAppRoute = Replace-OrThrow $backendAppRoute "MIN_SUPPORTED_APP_VERSION \|\| '[^']+'" "MIN_SUPPORTED_APP_VERSION || '$newVersion'" 'backend app min version fallback'
$backendAppRoute = Replace-OrThrow $backendAppRoute '(?m)(const latestVersionCode = Number\.isFinite\(Number\(latestVersionCodeRaw\)\)\s*\r?\n\s*\? Number\(latestVersionCodeRaw\)\s*\r?\n\s*:\s*)\d+' "`$1$newVersionCode" 'backend app latest versionCode fallback'

# Ensure minSupportedVersionCode fallback follows latestVersionCode as before.
$backendAppRoute = [regex]::Replace(
  $backendAppRoute,
  "const minSupportedVersionCode = Number\.isFinite\(Number\(minSupportedVersionCodeRaw\)\)\s*\?\s*Number\(minSupportedVersionCodeRaw\)\s*:\s*latestVersionCode;",
  "const minSupportedVersionCode = Number.isFinite(Number(minSupportedVersionCodeRaw))`n    ? Number(minSupportedVersionCodeRaw)`n    : latestVersionCode;"
)

$renderYaml = Get-Content -Raw -Path $renderYamlPath
$renderYaml = Replace-OrThrow $renderYaml '(?m)(- key: LATEST_APP_VERSION\s*\r?\n\s*value:\s*)[^\r\n]+' "`$1$newVersion" 'render latest version env'
$renderYaml = Replace-OrThrow $renderYaml '(?m)(- key: LATEST_APP_VERSION_CODE\s*\r?\n\s*value:\s*)[^\r\n]+' "`$1$newVersionCode" 'render latest versionCode env'
$renderYaml = Replace-OrThrow $renderYaml '(?m)(- key: MIN_SUPPORTED_APP_VERSION\s*\r?\n\s*value:\s*)[^\r\n]+' "`$1$newVersion" 'render min version env'
$renderYaml = Replace-OrThrow $renderYaml '(?m)(- key: MIN_SUPPORTED_APP_VERSION_CODE\s*\r?\n\s*value:\s*)[^\r\n]+' "`$1$newVersionCode" 'render min versionCode env'

$aboutScreen = Get-Content -Raw -Path $aboutScreenPath
$aboutScreen = Replace-OrThrow $aboutScreen "currentVersion = Constants\?\.expoConfig\?\.version \|\| '[^']+'" "currentVersion = Constants?.expoConfig?.version || '$newVersion'" 'About fallback version'
$aboutScreen = Replace-OrThrow $aboutScreen "currentVersionDate = '[^']+'" "currentVersionDate = '$todayLabel'" 'About version date'
$aboutScreen = Replace-IfFound $aboutScreen 'Novosti \([^\)]+\)' "Novosti ($todayLabel)" 'About news date'
$aboutScreen = Replace-IfFound $aboutScreen 'nova verzija aplikacije [0-9]+\.[0-9]+\.[0-9]+' "nova verzija aplikacije $newVersion" 'About news version text'

$loginScreen = Get-Content -Raw -Path $loginScreenPath
if ($loginScreen -notmatch "import Constants from 'expo-constants';") {
  $loginScreen = Replace-OrThrow $loginScreen "import \* as SecureStore from 'expo-secure-store';" "import * as SecureStore from 'expo-secure-store';`nimport Constants from 'expo-constants';" 'Login constants import'
}
$loginScreen = Replace-OrThrow $loginScreen "const APP_VERSION = [^;]+;" "const APP_VERSION = Constants?.expoConfig?.version || '$newVersion';" 'Login version label'

if (-not $DryRun) {
  Write-Utf8NoBom $appConfigPath $appConfig
  Write-Utf8NoBom $appJsonPath $appJson
  Write-Utf8NoBom $backendAppRoutePath $backendAppRoute
  Write-Utf8NoBom $renderYamlPath $renderYaml
  Write-Utf8NoBom $aboutScreenPath $aboutScreen
  Write-Utf8NoBom $loginScreenPath $loginScreen

  if (-not $SkipTests) {
    Write-Host 'Running backend tests...'
    Push-Location (Join-Path $repoRoot 'backend')
    npm test
    Pop-Location

    Write-Host 'Running mobile tests...'
    Push-Location (Join-Path $repoRoot 'mobile')
    npm test
    Pop-Location
  }

  git add .

  if (-not $Message) {
    $Message = "release: v$newVersion (android $newVersionCode, ios $newBuildNumber)"
  }

  git commit -m $Message

  if (-not $SkipPush) {
    git push
  }

  if (-not $SkipBuild) {
    Write-Host 'Starting EAS production Android build...'
    Push-Location (Join-Path $repoRoot 'mobile')
    npx eas build --platform android --profile production
    Pop-Location
  }
}

Write-Host 'Release automation complete.'
Write-Host "Version: $newVersion"
Write-Host "Android versionCode: $newVersionCode"
Write-Host "iOS buildNumber: $newBuildNumber"
Write-Host 'Backend deploy will auto-start on Render after push (if auto-deploy is enabled).'
