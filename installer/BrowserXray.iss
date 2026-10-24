; Browser Xray installer script for Inno Setup 6.4+ (tested with 6.7.3).
; Build it with scripts\release.ps1. The absolute payload, icon, output, and
; version values are passed on the ISCC command line.

#define AppName "Browser Xray"
#ifndef AppVersion
  #define AppVersion "1.0.1"
#endif
#ifndef VersionInfoVersion
  #define VersionInfoVersion "1.0.1.0"
#endif
#ifndef ExtensionId
  #define ExtensionId "jmopdjjejcocokfkcjjpalhadkdmjklc"
#endif
#ifndef NativeHostName
  #define NativeHostName "com.browserxray.helper"
#endif
#ifndef PayloadDir
  #define PayloadDir "..\dist"
#endif
#ifndef IconFile
  #define IconFile "..\installer\BrowserXray.ico"
#endif
#ifndef OutputDir
  #define OutputDir "..\release"
#endif
#ifndef OutputBaseFilename
  #define OutputBaseFilename "BrowserXray-Setup"
#endif

[Setup]
AppId={{E578032E-AFEE-4025-A9B1-C27AB1417DD9}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Browser Xray contributors
AppCopyright=Copyright (C) 2026 Browser Xray contributors
DefaultDirName={localappdata}\BrowserXray
DefaultGroupName=Browser Xray
; Keep /GROUP overrides effective for isolated install/uninstall regression tests.
DisableProgramGroupPage=no
AllowNoIcons=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir={#OutputDir}
OutputBaseFilename={#OutputBaseFilename}
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\BrowserXray.ico
UninstallDisplayName={#AppName}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
WizardImageFile=WizardImage.png
WizardSmallImageFile=WizardSmallImage.png
LicenseFile={#PayloadDir}\LICENSE
InfoBeforeFile=before-install.txt
InfoAfterFile=after-install.txt
VersionInfoVersion={#VersionInfoVersion}
VersionInfoCompany=Browser Xray contributors
VersionInfoDescription={#AppName} Setup
VersionInfoProductName={#AppName}
VersionInfoProductVersion={#VersionInfoVersion}
CloseApplications=no
RestartApplications=no
DisableWelcomePage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
; Extracted at install time so the old helper can be stopped before its
; binaries are replaced.
Source: "{#PayloadDir}\stop-helper.ps1"; DestDir: "{tmp}"; DestName: "stop-helper.ps1"; Flags: dontcopy noencryption

Source: "{#PayloadDir}\helper\browser-xray-helper.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "{#PayloadDir}\helper\xray.exe"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "{#PayloadDir}\helper\geoip.dat"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "{#PayloadDir}\helper\geosite.dat"; DestDir: "{app}\bin"; Flags: ignoreversion
Source: "{#PayloadDir}\helper\LICENSE-Xray-core.txt"; DestDir: "{app}\licenses"; Flags: ignoreversion

Source: "{#PayloadDir}\extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#PayloadDir}\LICENSE"; DestDir: "{app}\licenses"; DestName: "LICENSE"; Flags: ignoreversion
Source: "{#PayloadDir}\THIRD-PARTY-NOTICES.md"; DestDir: "{app}\licenses"; Flags: ignoreversion
Source: "{#PayloadDir}\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\CHANGELOG.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\RELEASING.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\README.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\extension-id.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\BrowserXray.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#PayloadDir}\open-extension.ps1"; DestDir: "{app}\tools"; Flags: ignoreversion
Source: "{#PayloadDir}\open-extension.cmd"; DestDir: "{app}\tools"; DestName: "Open Browser Xray.cmd"; Flags: ignoreversion
Source: "{#PayloadDir}\stop-helper.ps1"; DestDir: "{app}\tools"; Flags: ignoreversion

[Icons]
Name: "{group}\Browser Xray"; Filename: "{app}\tools\Open Browser Xray.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\BrowserXray.ico"; Comment: "Finish Browser Xray setup in your browser"
Name: "{group}\Browser Xray Help"; Filename: "{app}\README.txt"; WorkingDir: "{app}"; Comment: "Browser Xray quick start"
Name: "{group}\Uninstall Browser Xray"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Browser Xray"; Filename: "{app}\tools\Open Browser Xray.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\BrowserXray.ico"; Tasks: desktopicon

[Run]
Filename: "{app}\tools\Open Browser Xray.cmd"; Description: "Open the browser extension setup page"; WorkingDir: "{app}"; Flags: postinstall shellexec nowait skipifsilent

[UninstallRun]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoLogo -NoProfile -ExecutionPolicy Bypass -File ""{app}\tools\stop-helper.ps1"" -InstallDir ""{app}"""; Flags: runhidden skipifdoesntexist; RunOnceId: "StopBrowserXray"

[UninstallDelete]
Type: files; Name: "{app}\com.browserxray.helper.json"
; Remove application-owned leftovers from earlier portable/source installs,
; including old extension assets and the previously bundled license in bin.
Type: filesandordirs; Name: "{app}\bin"
Type: filesandordirs; Name: "{app}\extension"
Type: filesandordirs; Name: "{app}\licenses"
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{app}\logs"
Type: filesandordirs; Name: "{app}\tools"

[Registry]
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\{#NativeHostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\com.browserxray.helper.json"; Flags: uninsdeletekey; Check: ShouldRegisterNativeHost
Root: HKCU; Subkey: "Software\Google\Chrome Beta\NativeMessagingHosts\{#NativeHostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\com.browserxray.helper.json"; Flags: uninsdeletekey; Check: ShouldRegisterNativeHost
Root: HKCU; Subkey: "Software\Google\Chrome Dev\NativeMessagingHosts\{#NativeHostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\com.browserxray.helper.json"; Flags: uninsdeletekey; Check: ShouldRegisterNativeHost
Root: HKCU; Subkey: "Software\Microsoft\Edge\NativeMessagingHosts\{#NativeHostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\com.browserxray.helper.json"; Flags: uninsdeletekey; Check: ShouldRegisterNativeHost
Root: HKCU; Subkey: "Software\Chromium\NativeMessagingHosts\{#NativeHostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\com.browserxray.helper.json"; Flags: uninsdeletekey; Check: ShouldRegisterNativeHost
Root: HKCU; Subkey: "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\{#NativeHostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\com.browserxray.helper.json"; Flags: uninsdeletekey; Check: ShouldRegisterNativeHost
Root: HKCU; Subkey: "Software\Vivaldi\NativeMessagingHosts\{#NativeHostName}"; ValueType: string; ValueName: ""; ValueData: "{app}\com.browserxray.helper.json"; Flags: uninsdeletekey; Check: ShouldRegisterNativeHost

[Code]
var
  SkipNativeRegistration: Boolean;

function InitializeSetup(): Boolean;
begin
  SkipNativeRegistration :=
    (CompareText(ExpandConstant('{param:SKIPNATIVEREG|0}'), '1') = 0) or
    (CompareText(ExpandConstant('{param:SKIPNATIVEREG|0}'), 'yes') = 0);
  Result := True;
end;

function ShouldRegisterNativeHost(): Boolean;
begin
  Result := not SkipNativeRegistration;
end;

procedure WriteNativeManifest();
var
  ManifestPath: String;
  HelperPath: String;
  Lines: TArrayOfString;
begin
  HelperPath := ExpandConstant('{app}\bin\browser-xray-helper.exe');
  StringChangeEx(HelperPath, '\', '\\', True);
  ManifestPath := ExpandConstant('{app}\com.browserxray.helper.json');

  SetArrayLength(Lines, 9);
  Lines[0] := '{';
  Lines[1] := '  "name": "com.browserxray.helper",';
  Lines[2] := '  "description": "Browser Xray local helper",';
  Lines[3] := '  "path": "' + HelperPath + '",';
  Lines[4] := '  "type": "stdio",';
  Lines[5] := '  "allowed_origins": [';
  Lines[6] := '    "chrome-extension://{#ExtensionId}/"';
  Lines[7] := '  ]';
  Lines[8] := '}';

  if not SaveStringsToUTF8FileWithoutBOM(ManifestPath, Lines, False) then
    MsgBox('Could not write the native messaging manifest:' + #13#10 + ManifestPath, mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    ExtractTemporaryFile('stop-helper.ps1');
    Exec(
      ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
      '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\stop-helper.ps1') + '" -InstallDir "' + ExpandConstant('{app}') + '"',
      '', SW_HIDE, ewWaitUntilTerminated, ResultCode
    );
  end
  else if CurStep = ssPostInstall then
  begin
    WriteNativeManifest();
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    if not UninstallSilent then
      MsgBox(
        'Browser Xray files and native messaging registration were removed.' + #13#10 +
        'Remove the Browser Xray extension separately from chrome://extensions or edge://extensions.',
        mbInformation, MB_OK
      );
  end;
end;
