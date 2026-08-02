' ===========================================================
'  start-pet-hidden.vbs - start the pet with nothing on screen
' ===========================================================
' Double-click this instead of start-pet.bat and no window appears at all: no
' console, no flash, nothing to close. The pet simply shows up, with its tray
' icon by the clock.
'
' All it does is run start-pet.bat with its window hidden. It only interrupts
' you if the launcher fails, and then it shows what went wrong and offers to
' run it again in a visible window.
'
' The first run is the exception: installing Electron takes a few minutes and
' prints its progress, so while the dependencies are missing the launcher is
' given a normal window to print into.
' ===========================================================

Option Explicit

Const HIDDEN  = 0
Const VISIBLE = 1
Const WAIT    = True
Const GO      = False

Dim shell, fso, here, bat, electron, logPath, command, code

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

here = fso.GetParentFolderName(WScript.ScriptFullName)
bat = fso.BuildPath(here, "start-pet.bat")
electron = fso.BuildPath(here, "node_modules\electron\dist\electron.exe")

If Not fso.FileExists(bat) Then
  MsgBox "start-pet.bat is not next to this file." & vbCrLf & vbCrLf & _
         "Keep the two together - this script only starts the launcher " & _
         "sitting beside it.", vbCritical, "Desktop Pet"
  WScript.Quit 1
End If

shell.CurrentDirectory = here

' Nothing installed yet: that run downloads Electron, so let it be seen.
If Not fso.FileExists(electron) Then
  shell.Run Quoted(bat), VISIBLE, GO
  WScript.Quit 0
End If

' /quiet stops the launcher pausing for a keypress into a window nobody can
' see, and stops it handing straight back here in a loop.
logPath = fso.BuildPath(shell.ExpandEnvironmentStrings("%TEMP%"), "desktop-pet-launch.log")
command = "cmd /s /c " & Quoted(Quoted(bat) & " /quiet > " & Quoted(logPath) & " 2>&1")

code = shell.Run(command, HIDDEN, WAIT)

If code <> 0 Then Explain code

' Wraps a value in double quotes, for paths with spaces in them.
Function Quoted(value)
  Quoted = Chr(34) & value & Chr(34)
End Function

' The launcher hid its own output, so show it here instead of failing silently.
' Reads the globals it needs - one script, one job, nothing else calls this.
Sub Explain(exitCode)
  Dim detail, answer

  detail = ""
  If fso.FileExists(logPath) Then
    On Error Resume Next
    ' ReadAll on an empty file raises rather than returning "" - hence this.
    detail = Trim(fso.OpenTextFile(logPath, 1).ReadAll())
    On Error GoTo 0
  End If

  If Len(detail) = 0 Then detail = "The launcher stopped with code " & exitCode & "."

  ' Whatever went wrong said so last, so keep the end of a long log.
  If Len(detail) > 1500 Then detail = "..." & Right(detail, 1500)

  answer = MsgBox("The pet could not be started." & vbCrLf & vbCrLf & _
                  detail & vbCrLf & vbCrLf & _
                  "Run the launcher again in a visible window?", _
                  vbYesNo + vbExclamation, "Desktop Pet")

  If answer = vbYes Then shell.Run Quoted(bat), VISIBLE, GO
End Sub
