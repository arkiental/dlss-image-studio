# Install DLSS Image Studio

## Download

Get the Windows x64 release from [GitHub Releases](https://github.com/arkiental/dlss-image-studio/releases/latest).
Choose **DLSS-Image-Studio-0.2.1-Windows-x64-Setup.exe** for the easiest installation.
The automatic “Source code” archives are for developers, not installers.

1. Run Setup and follow the wizard. Installation is per user.
2. Setup installs Microsoft WebView2 if needed, using its included offline installer.
3. Launch DLSS Image Studio from the Start menu.
4. Open a render. See [the user guide](USER_GUIDE.md) for editing and export.

No Node.js, Python, Rust, build tools or separate Visual C++ redistributable is needed
for Studio itself. The release is currently unsigned: Windows may display an
unknown-publisher warning. Verify the download and its checksum before running it;
do not disable Windows security protections.

## Requirements

- Windows 11 x64 is the tested platform; ARM and other operating systems are not supported.
- A working Direct3D 12 GPU and driver. The verified neural system is an RTX 4090,
  driver 591.86; other GPU models have not been certified by this project.
- At least 1080 × 840 available window space; 1536 × 1024 or larger is recommended.
- Disk space for the app, WebView2 and your renders. Neural runtime size and memory
  requirements are additional; large images can exceed available GPU memory.

## Portable ZIP

Extract **DLSS-Image-Studio-0.2.1-Windows-x64-Portable.zip** to a writable folder
and run `dlss-image-studio.exe`. Keep the included guides and license notices.
The executable embeds the UI and the 50 creative LUTs.

The ZIP needs Microsoft Edge WebView2 already installed (normally present on
Windows 11). Use Setup if it is missing. “Portable” means no Studio installation
is needed; settings and recent projects still use your Windows user profile.

## Neural enhancement: separate runtime required

**The downloads do not contain Visual Enhancer, Neuroframe or NVIDIA neural DLLs.**
The provider prohibits redistribution/repackaging without written permission.
Studio's installer cannot remove that restriction. Ordinary tone/color, masks,
LUTs, projects and exports work without the neural provider: turn off the switch
beside **Neural Adjustments** to use those tools.

To enable the verified neural integration:

1. Obtain the complete [Visual Enhancer v13.2 release](https://github.com/Merserk/dlss5-visual-enhancer/releases/tag/v13.2)
   from its author and review its terms.
2. Extract it into a permanent folder. Keep the whole package together; do not
   copy individual DLLs into Studio or Windows system folders.
3. In Studio, open **Settings → Choose runtime folder** and select the extracted
   folder containing `src`, `bin`, and `VE_CLI.exe`.
4. Enable **Neural Adjustments**, open your image and wait for the preview.
5. Verify the runtime status in Settings. Installed files alone are not proof of
   successful neural evaluation; errors are shown and never replaced by a filter.

The runtime is executable third-party software, not a passive image asset.
Other runtime versions are unsupported until tested. See [integration details](../DLSS_INTEGRATION.md).

## Verify, update and uninstall

Compare a downloaded file against `SHA256SUMS.txt` from the same release:

```powershell
Get-FileHash .\DLSS-Image-Studio-0.2.1-Windows-x64-Setup.exe -Algorithm SHA256
```

Close Studio before updating. Run the newer installer, or extract a newer portable
ZIP to a new folder. Keep projects and source images backed up. There is no automatic
update service. Uninstall Setup via Windows **Settings → Apps → Installed apps**;
delete an extracted portable folder when it is no longer needed. Neither action
should be used to delete your source renders or project files.

See [troubleshooting](TROUBLESHOOTING.md) for startup, runtime and export problems.
