; Inno Setup script -> dist\OfflineFlow-Setup.exe  (build: iscc packaging\installer.iss)
[Setup]
AppName=Offline Flow
AppVersion=0.1.0
DefaultDirName={autopf}\OfflineFlow
DefaultGroupName=Offline Flow
OutputDir=..\dist
OutputBaseFilename=OfflineFlow-Setup
Compression=lzma2
SolidCompression=yes
[Dirs]
Name: "{app}\models\checkpoints"; Permissions: users-modify
Name: "{app}\output"; Permissions: users-modify
Name: "{app}\user_workflows"; Permissions: users-modify
[Files]
Source: "..\dist\OfflineFlow\*"; DestDir: "{app}"; Flags: recursesubdirs
[Icons]
Name: "{group}\Offline Flow"; Filename: "{app}\OfflineFlow.exe"
Name: "{autodesktop}\Offline Flow"; Filename: "{app}\OfflineFlow.exe"
