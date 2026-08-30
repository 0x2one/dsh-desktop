; Close-to-tray keeps DeepSeek Harness Desktop.exe running after the window is
; gone. NSIS's default CHECK_APP_RUNNING sends a graceful close (which the app
; swallows as hide) then gives up. Override: wait for quitAndInstall, then
; taskkill /F /T. The installer image is dsh-desktop-*-setup.exe, not the
; app exe, so we do not need a PID exclusion.

!macro customCheckAppRunning
  ${if} ${isUpdated}
    Sleep 2000
  ${endIf}

  StrCpy $R1 0

  customCheckAppRunning_loop:
    nsExec::Exec `"$CmdPath" /C tasklist /FI "IMAGENAME eq ${APP_EXECUTABLE_FILENAME}" /FO CSV /NH | "$SYSDIR\findstr.exe" /B /I /C:"\"${APP_EXECUTABLE_FILENAME}\""`
    Pop $R0
    ${if} $R0 != 0
      Goto customCheckAppRunning_done
    ${endIf}

    DetailPrint "$(appClosing)"
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $R0
    Sleep 1000

    IntOp $R1 $R1 + 1
    ${if} $R1 < 8
      Goto customCheckAppRunning_loop
    ${endIf}

    MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY customCheckAppRunning_loop
    Quit

  customCheckAppRunning_done:
!macroend
