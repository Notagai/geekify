#define MyAppName "Geekify"
#define MyAppVersion "0.5.0"
#define MyAppPublisher "Notagai"
#define VsixFile "geekify-" + MyAppVersion + ".vsix"

[Setup]
AppId={{87B19F7D-9735-4CE1-9658-4272E6D43091}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={localappdata}\Programs\Geekify
DisableDirPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=GeekifySetup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
UninstallDisplayName=Geekify (VS Code Extension)
CloseApplications=no
RestartApplications=no

[Files]
Source: "..\release\{#VsixFile}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\Geekify"; Filename: "{code:GetCodeExecutable}"; Parameters: "--open-url vscode://notagai.geekify/open"; WorkingDir: "{userdocs}"; Comment: "Open Geekify in Visual Studio Code"

[Code]
var
  CodeCLI: String;

function FindCodeCLI(): String;
var
  Paths: array of String;
  I: Integer;
begin
  Result := '';
  SetArrayLength(Paths, 4);
  Paths[0] := ExpandConstant('{localappdata}\Programs\Microsoft VS Code\bin\code.cmd');
  Paths[1] := ExpandConstant('{pf}\Microsoft VS Code\bin\code.cmd');
  Paths[2] := ExpandConstant('{pf32}\Microsoft VS Code\bin\code.cmd');
  Paths[3] := FileSearch('code.cmd', GetEnv('PATH'));
  for I := 0 to GetArrayLength(Paths)-1 do
    if (Paths[I] <> '') and FileExists(Paths[I]) then
    begin
      Result := Paths[I];
      Exit;
    end;
end;

function GetCodeExecutable(Param: String): String;
begin
  // In a regular VS Code installation Code.exe sits beside the bin directory.
  // Keep the shortcut independent of the source checkout or working directory.
  if CodeCLI <> '' then
    Result := ExtractFileDir(ExtractFileDir(CodeCLI)) + '\Code.exe'
  else
    Result := '';
end;

function InitializeSetup(): Boolean;
begin
  CodeCLI := FindCodeCLI();
  Result := CodeCLI <> '';
  if not Result then
    MsgBox('Geekify needs Visual Studio Code installed first. Install VS Code from code.visualstudio.com, then run this installer again.', mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ExitCode: Integer;
  CliArgs: String;
  VsixPath: String;
begin
  if CurStep <> ssPostInstall then Exit;
  VsixPath := ExpandConstant('{app}\{#VsixFile}');
  // Execute the actual VS Code CLI. This installs the extension into the
  // existing VS Code installation, not into the private developer repository.
  CliArgs := '/D /S /C ""' + CodeCLI + '" --install-extension "' + VsixPath + '" --force"';
  if not Exec(ExpandConstant('{cmd}'), CliArgs, '', SW_HIDE, ewWaitUntilTerminated, ExitCode)
     or (ExitCode <> 0) then
  begin
    MsgBox('Geekify files were copied, but VS Code extension installation failed. Open a terminal and run:' + #13#10 +
      '"' + CodeCLI + '" --install-extension "' + VsixPath + '" --force"' + #13#10 +
      'Then reload VS Code.', mbError, MB_OK);
    Exit;
  end;
  MsgBox('Geekify is installed. Open or reload VS Code, select Geekify: Open Player from the Command Palette, then click Connect Spotify.', mbInformation, MB_OK);
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  ExitCode: Integer;
begin
  if CurUninstallStep = usUninstall then
  begin
    CodeCLI := FindCodeCLI();
    if CodeCLI <> '' then
      Exec(ExpandConstant('{cmd}'),
        '/D /S /C ""' + CodeCLI + '" --uninstall-extension notagai.geekify"',
        '', SW_HIDE, ewWaitUntilTerminated, ExitCode);
  end;
end;
