#define MyAppName "Duniter"
#define MyAppPublisher "Duniter team"
#define MyAppURL "http://duniter.org"
#define MyAppExeName "nw.exe"

#if !Defined(ROOT_PATH)
#define ROOT_PATH "."
#endif

#define MyAppSrc ROOT_PATH
#define MyAppExe ROOT_PATH + "\nw\" + MyAppExeName
#pragma message MyAppSrc

#if !FileExists(MyAppExe)
#error "Unable to find MyAppExe"
#endif

#define MyAppVerStr "v0.20.0a18"

[Setup]
AppName={#MyAppName}
AppVersion={#MyAppVerStr}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={pf}\{#MyAppName}
DisableDirPage=yes
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#ROOT_PATH}
OutputBaseFilename={#MyAppName}
Compression=lzma
SolidCompression=yes
UninstallDisplayIcon={app}\nw\{#MyAppExeName}
ArchitecturesInstallIn64BitMode=x64

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "{#MyAppSrc}\nw\*"; DestDir: "{app}\nw\"; Flags: ignoreversion recursesubdirs
Source: "{#MyAppSrc}\sources\*"; DestDir: "{app}\sources\"; Flags: ignoreversion recursesubdirs

[Icons]
Name: "{group}\{#MyAppName}"; IconFilename: "{app}\nw\duniter.ico"; Filename: "{app}\nw\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{commondesktop}\{#MyAppName}"; IconFilename: "{app}\nw\duniter.ico"; Filename: "{app}\nw\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\nw\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[Setup]
; NOTE: The value of AppId uniquely identifies this application.
; Do not use the same AppId value in installers for other applications.
; (To generate a new GUID, click Tools | Generate GUID inside the IDE.)
AppId={{E01B0960-74D2-8ACD-734E-8B3CB033B07F}
LicenseFile="{#MyAppSrc}\sources\LICENSE"

[Code]

//////////
// Code taken from http://stackoverflow.com/a/2099805
//////////

/////////////////////////////////////////////////////////////////////
function GetUninstallString(): String;
var
  sUnInstPath: String;
  sUnInstallString: String;
begin
  sUnInstPath := ExpandConstant('Software\Microsoft\Windows\CurrentVersion\Uninstall\{#emit SetupSetting("AppId")}_is1');
  sUnInstallString := '';
  if not RegQueryStringValue(HKLM, sUnInstPath, 'UninstallString', sUnInstallString) then
    RegQueryStringValue(HKCU, sUnInstPath, 'UninstallString', sUnInstallString);
  Result := sUnInstallString;
end;


/////////////////////////////////////////////////////////////////////
function IsUpgrade(): Boolean;
begin
  Result := (GetUninstallString() <> '');
end;


/////////////////////////////////////////////////////////////////////
function UnInstallOldVersion(): Integer;
var
  sUnInstallString: String;
  iResultCode: Integer;
begin
// Return Values:
// 1 - uninstall string is empty
// 2 - error executing the UnInstallString
// 3 - successfully executed the UnInstallString

  // default return value
  Result := 0;

  // get the uninstall string of the old app
  sUnInstallString := GetUninstallString();
  if sUnInstallString <> '' then begin
    sUnInstallString := RemoveQuotes(sUnInstallString);
    if Exec(sUnInstallString, '/SILENT /NORESTART /SUPPRESSMSGBOXES','', SW_HIDE, ewWaitUntilTerminated, iResultCode) then
      Result := 3
    else
      Result := 2;
  end else
    Result := 1;
end;

/////////////////////////////////////////////////////////////////////
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep=ssInstall) then
  begin
    if (IsUpgrade()) then
    begin
      UnInstallOldVersion();
    end;
  end;
end;