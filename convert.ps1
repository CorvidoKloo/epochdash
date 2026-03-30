Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("C:\Users\ryen15\.gemini\antigravity\brain\b9fcbbcb-917a-43e6-bd81-95d23a3ecc59\media__1774903113321.jpg")
$img.Save("C:\Users\ryen15\.gemini\antigravity\scratch\timetracker-pro\client\assets\icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$img.Save("C:\Users\ryen15\.gemini\antigravity\scratch\timetracker-pro\server\dashboard\assets\logo.png", [System.Drawing.Imaging.ImageFormat]::Png)
$img.Dispose()
echo "Success"
