Output __GIF_PATH__
Set Width __WIDTH__
Set Height __HEIGHT__
Set FontSize __FONT_SIZE__
Set CursorBlink false
Set TypingSpeed 0
Env UI_HEADLESS "false"
Env UI_CAPTURE_MODE "true"

Type "__START_COMMAND__"
Enter

Wait+Screen@__WAIT_TIMEOUT__ /Current Report \/ New Analysis/
Sleep __SETTLE_SLEEP__
Screenshot __PNG_PATH__
Sleep 500 ms
Ctrl+C
Sleep 500 ms
