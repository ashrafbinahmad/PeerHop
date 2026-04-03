peerhop

Fixed in v 2.4.5

- at first, it shows no wifi detected, when restart server it connects
- make heading "Connect device to start sharing files"
- when change theme, it empties activities (when change theme it is sending stopped)
- after sent stopped when sending another acitivity it clears older activities
- sending text not sending activity, send activity like Sent ## characters text
- make logo non draggable

Fixed in v 2.5.1

- Should show download progress in desktop also when downloading to phone - Fixed
- Upload from phone works perfectly
- Showing 0 mbps when downloading in phone, either remove speed, or fix it - Fixed
- even when it is cancelled and then download in mobile it should show progress - Fixed
- some times ws seems to be stopped that I had to reload mobile to reconnect, add a button to reload when ws disconnected, or auto reload, seems to be when iPhone is locked ws disconnects
- when restart server or unrender, previous server should be killed
- scroll issue in both - Fixed
- in multi client the second device shows as download completed for the file uploaded from another mobile - Fixed
- when cancelling download for one device the other device is also stopped downloading, seems like have to create download links for each device differently - Fixed
- make the percentage in desktop more visible
- showing IOS in android device in multi client connection
-
- made filename smaller
- added multiple languages, language sent to activity
- fixed showing white of iframe if loading failed
- add peerhop in windows share list
- Updated ChatPanel to conditionally render the send text button based on text transfer capability.
- Enhanced DesktopView with review action tracking and review prompt triggering.
- Refactored SettingsPanel to include new actions for requesting features and rating the app.
- Improved error handling and user notifications across various components.
- Updated styles and layout for better user experience.
- feat: add referral feedback modal and integrate review tracking

Pending

- in production there is red behind the icon in taskbar only
- make the iframe the whole page, and add notifications
-
- add peerhop to file menu, Share with peerhop
- custom port or random port
- feedback and ask for stars in ms store
- make speed calculation more better, look into each second speed instead of whole, when transfer stops some how then also showing very speed
- text message length

- Showing terminal when clicking rate peerhop -Done,
- make the default width larger -Done
- remove auto downloading -Done
- make minimize icon different -Done
- show windows notification when receive or download completed
- change or remove the video
- try force open in real browser
