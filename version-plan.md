# PeerHop Version Plan

## Fixed in v2.4.5

- At first, it shows no wifi detected, when restart server it connects
- Make heading "Connect device to start sharing files"
- When change theme, it empties activities (when change theme it is sending stopped)
- After sent stopped when sending another acitivity it clears older activities
- Sending text not sending activity, send activity like Sent ## characters text
- Make logo non draggable

## Fixed in v2.5.1

- Should show download progress in desktop also when downloading to phone - Fixed
- Upload from phone works perfectly
- Showing 0 mbps when downloading in phone, either remove speed, or fix it - Fixed
- Even when it is cancelled and then download in mobile it should show progress - Fixed
- Some times ws seems to be stopped that I had to reload mobile to reconnect, add a button to reload when ws disconnected, or auto reload, seems to be when iPhone is locked ws disconnects
- When restart server or unrender, previous server should be killed
- Scroll issue in both - Fixed
- In multi client the second device shows as download completed for the file uploaded from another mobile - Fixed
- When cancelling download for one device the other device is also stopped downloading, seems like have to create download links for each device differently - Fixed
- Make the percentage in desktop more visible
- Showing IOS in android device in multi client connection
- Made filename smaller
- Added multiple languages, language sent to activity
- Fixed showing white of iframe if loading failed
- Add peerhop in windows share list
- Updated ChatPanel to conditionally render the send text button based on text transfer capability
- Enhanced DesktopView with review action tracking and review prompt triggering
- Refactored SettingsPanel to include new actions for requesting features and rating the app
- Improved error handling and user notifications across various components
- Updated styles and layout for better user experience
- feat: add referral feedback modal and integrate review tracking

## Fixed in v2.5.7

- Fixed show in folder not working
- Made the desktop width more adaptive, fixed open file location
- Made recieving transaction better ui
- Added delete transaction
- Add ConfirmDialog component and integrate transaction deletion flow in ChatPanel
- Removed - 0.5 px from desktop app width
- Added static port feature
- Fixed client list view and client blocking setup
- Added authentication failed screen
- Made client list better
- Made qr panel better, made always multi client
- Added deviceName to log
- Added email logging also
- Made scrolling and chat view perfect
- Fixed minor issues
- Showing terminal when clicking rate peerhop
- Make the default width larger
- Remove auto downloading
- Make minimize icon different

## Pending Features & Bugs

- In production there is red behind the icon in taskbar only
- Make the iframe the whole page, and add notifications
- Add peerhop to file menu, Share with peerhop
- Custom port or random port
- Feedback and ask for stars in ms store
- Make speed calculation more better, look into each second speed instead of whole, when transfer stops some how then also showing very speed
- Text message length limits
- Show windows notification when receive or download completed
- Change or remove the video
- Try force open in real browser
