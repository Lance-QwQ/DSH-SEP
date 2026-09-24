Option Explicit
Dim fso, sh, root, nodePath, launchPath, command, result, started, diagnostic, detail, reader
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
nodePath = fso.BuildPath(root, "runtime\node\node.exe")
launchPath = fso.BuildPath(root, "launch.mjs")
If Not fso.FileExists(nodePath) Or Not fso.FileExists(launchPath) Then
  MsgBox "DSH SEP runtime is missing. Restore this deployment directory.", 16, "DSH SEP"
  WScript.Quit 1
End If
sh.CurrentDirectory = fso.BuildPath(root, "workspace")
command = Chr(34) & nodePath & Chr(34) & " " & Chr(34) & launchPath & Chr(34)
started = Now
result = sh.Run(command, 0, True)
If result <> 0 Then
  diagnostic = fso.BuildPath(root, "state\startup-error.txt")
  detail = "DSH SEP startup failed. Run start.ps1 for the diagnostic code."
  If fso.FileExists(diagnostic) Then
    If fso.GetFile(diagnostic).DateLastModified >= DateAdd("s", -2, started) Then
      Set reader = fso.OpenTextFile(diagnostic, 1)
      detail = reader.Read(4096)
      reader.Close
    End If
  End If
  MsgBox detail & vbCrLf & "Diagnostic: " & diagnostic, 16, "DSH SEP"
End If
WScript.Quit result
