Option Explicit
Dim fso, sh, root, nodePath, launchPath, command, result, attempt, diagnostic, detail, reader, saved, ioFailed
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
nodePath = fso.BuildPath(root, "runtime\node\node.exe")
launchPath = fso.BuildPath(root, "launch.mjs")
If Not fso.FileExists(nodePath) Or Not fso.FileExists(launchPath) Then
  MsgBox "DAILY_RUNTIME_MISSING: Restore this deployment directory.", 16, "DSH SEP"
  WScript.Quit 1
End If
sh.CurrentDirectory = root
attempt = Replace(fso.GetTempName, ".", "_")
command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & launchPath & Chr(34) & " --startup-attempt=" & attempt
On Error Resume Next
result = sh.Run(command, 0, True)
If Err.Number <> 0 Then
  Err.Clear
  On Error GoTo 0
  MsgBox "DAILY_NODE_LAUNCH_FAILED: Windows could not start the local runtime.", 16, "DSH SEP"
  WScript.Quit 1
End If
On Error GoTo 0
If result <> 0 Then
  Select Case result
    Case 20: detail = "DAILY_CREDENTIAL_MISSING: Restore the configured credential file or explicitly configure its new location."
    Case 21: detail = "DAILY_CREDENTIAL_UNREADABLE: Check read permissions on the configured credential file."
    Case 22: detail = "DAILY_CREDENTIAL_BUSY: Close the credential file writer and retry."
    Case 23: detail = "DAILY_CREDENTIAL_INVALID: Check the configured credential file format."
    Case 24: detail = "DAILY_CREDENTIAL_UNSAFE: Credential file identity validation failed."
    Case 25: detail = "DAILY_CREDENTIAL_TOO_LARGE: Credential file exceeds 64 KiB."
    Case 26: detail = "DAILY_CREDENTIAL_CHANGED: Finish editing the credential file, then retry."
    Case 27: detail = "DAILY_CREDENTIAL_IO: Check local storage availability."
    Case Else: detail = "DAILY_START_FAILED: Run start.ps1 for the diagnostic code. This does not by itself indicate a missing API key."
  End Select
  diagnostic = fso.BuildPath(root, "state\startup-" & attempt & ".txt")
  saved = ""
  ioFailed = False
  On Error Resume Next
  If fso.FileExists(diagnostic) Then
    Set reader = fso.OpenTextFile(diagnostic, 1)
    If Err.Number = 0 Then
      saved = reader.Read(4096)
      reader.Close
    End If
  End If
  If Err.Number <> 0 Then ioFailed = True
  Err.Clear
  On Error GoTo 0
  If Not ioFailed And InStr(saved, "Attempt: " & attempt & vbCrLf) > 0 Then
    detail = saved
  Else
    detail = detail & vbCrLf & "DAILY_DIAGNOSTIC_UNAVAILABLE: This attempt's diagnostic could not be read."
  End If
  MsgBox detail & vbCrLf & "Diagnostic: " & diagnostic, 16, "DSH SEP"
End If
WScript.Quit result
