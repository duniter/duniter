$exePath = "$env:USERPROFILE\innosetup-5.5.9-unicode.exe"
Write-Host "Downloading InnoSetup 5.5.9..."
(New-Object Net.WebClient).DownloadFile('http://files.jrsoftware.org/is/5/innosetup-5.5.9-unicode.exe', $exePath)
Write-Host "Installing..."
cmd /c start /wait $exePath /silent
Write-Host "Installed InnoSetup 5.5.9" -ForegroundColor Green