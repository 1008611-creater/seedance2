Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

toolsDir = fso.GetParentFolderName(WScript.ScriptFullName)
rootDir = fso.GetParentFolderName(toolsDir)
scriptPath = rootDir & "\tools\playwright-recorder-orb.py"
extraArgs = ""

If WScript.Arguments.Count > 0 Then
  For i = 0 To WScript.Arguments.Count - 1
    extraArgs = extraArgs & " " & WScript.Arguments(i)
  Next
End If

command = "pythonw.exe " & Chr(34) & scriptPath & Chr(34) & extraArgs
shell.Run command, 0, False
